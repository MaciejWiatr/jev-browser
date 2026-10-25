"""End-to-end check of every browser tool through the real MCP server (no paid API calls).

Needs Chrome with remote debugging on. Run from the repo root:
    uv run --with "mcp>=1.2,<2" python tests/e2e.py
"""

import asyncio
import functools
import http.server
import json
import os
import re
import tempfile
import threading
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "tests" / "site"
FAILURES = []


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    handler = functools.partial(Quiet, directory=str(SITE))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}"


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if not ok and detail else ""))
    if not ok:
        FAILURES.append(name)


async def main():
    base = serve()
    out = Path(tempfile.mkdtemp(prefix="jev-e2e-"))
    env = {**os.environ, "JEV_MEMORY_DIR": str(out / "memory")}  # events dir stays shared: other sessions relay into it
    params = StdioServerParameters(command=str(ROOT / "server" / "run.sh"), cwd=str(out), env=env)
    async with stdio_client(params) as (r, w), ClientSession(r, w) as s:
        await s.initialize()

        async def call(tool, **args):
            res = await s.call_tool(tool, args)
            text = next((c.text for c in res.content if c.type == "text"), "{}")
            images = [c for c in res.content if c.type == "image"]
            data = json.loads(text)
            return (data, images) if tool == "computer" else data

        tools = {t.name for t in (await s.list_tools()).tools}
        check("25 tools listed", len(tools) == 25, sorted(tools))
        modes = [(await call("set_cursor_mode", mode=m))["cursor_mode"] for m in ("natural", "speed")]
        check("cursor mode switchable", modes == ["natural", "speed"], modes)

        tab = (await call("tabs_create", url=base + "/"))["tab_id"]
        await call("gif_creator", tab_id=tab, action="start_recording")
        page = await call("read_page", tab_id=tab)
        refs = {m[2]: m[1] for line in page["elements"] if (m := re.match(r"\[(n\d+)\] \S+ '([^']*)'", line))}
        check("read_page refs", {"Name", "Country", "Submit"} <= refs.keys(), refs)
        check("file input detected", bool(page.get("file_inputs")))

        await call("form_input", tab_id=tab, ref=refs["Name"], value="Ada")
        await call("form_input", tab_id=tab, ref=refs["Country"], value="Spain")
        await call("form_input", tab_id=tab, ref=refs["Newsletter"], value=True)
        await call("computer", tab_id=tab, action="left_click", ref=refs["Submit"])
        result = (await call("javascript_tool", tab_id=tab, code="document.getElementById('out').textContent"))["result"]
        check("form filled and submitted", result == "Hello Ada from Spain news=true", result)

        found = await call("find", tab_id=tab, query="submit button")
        check("find", found["matches"] and found["matches"][0]["label"] == "Submit")

        up = await call("file_upload", tab_id=tab, paths=[str(SITE / "note.txt")])
        check("file upload", up.get("uploaded") == ["note.txt"], up)
        (out / ".env").write_text("SECRET=1\n")
        blocked = await call("file_upload", tab_id=tab, paths=[str(out / ".env")])
        check("credential-named file refused", "credentials" in blocked.get("error", ""), blocked)

        logs = await call("read_console_messages", tab_id=tab, pattern="boom")
        check("console error captured", logs["matched"] >= 1, logs)
        net = await call("read_network_requests", tab_id=tab, only_failed=True)
        check("failed request captured", any("missing.json" in r["url"] for r in net["requests"]), net)

        clicked, _ = await call("computer", tab_id=tab, action="left_click", ref=refs["Confirm me"])
        check("dialog reported", "dialog_open" in clicked, clicked)
        handled = await call("handle_dialog", tab_id=tab, accept=False)
        check("dialog handled", handled.get("accepted") is False, handled)

        shot, images = await call("computer", tab_id=tab, action="screenshot", save_path=str(out / "shot.png"))
        check("screenshot returned and saved", images and Path(shot["saved"]).exists())

        batch = await call("browser_batch", tab_id=tab, actions=[
            {"tool": "computer", "action": "scroll", "direction": "down"},
            {"tool": "navigate", "url": base + "/page2.html"},
        ])
        check("batch", batch["completed"] == 2, batch)
        login = await call("read_page", tab_id=tab)
        check("login page flagged needs_user", "needs_user" in login, login)
        back = await call("navigate", tab_id=tab, url="back")
        check("navigate back", back["url"].rstrip("/") == base, back)

        await call("gif_creator", tab_id=tab, action="stop_recording")
        gif = await call("gif_creator", tab_id=tab, action="export", filename=str(out / "run.gif"))
        check("gif exported", Path(gif.get("saved", "")).exists(), gif)

        # Memory: learn "add to cart" on one product, reuse it on others, then as a workflow.
        shop = base + "/shop/product.html?id="
        await call("navigate", tab_id=tab, url=shop + "A1B2C3")
        await call("javascript_tool", tab_id=tab, code="localStorage.setItem('jev-cart', 0); location.reload()")
        await call("navigate", tab_id=tab, url="reload")
        add = (await call("find", tab_id=tab, query="add to cart"))["matches"][0]["ref"]
        taught, _ = await call("computer", tab_id=tab, action="left_click", ref=add, intent="add to cart")
        check("action learned from a click", bool(taught.get("learned")), taught)
        cart = lambda: call("javascript_tool", tab_id=tab, code="document.getElementById('cart').textContent")

        await call("navigate", tab_id=tab, url=shop + "Z9Y8X7")
        page = await call("read_page", tab_id=tab, include_text=False)
        check("read_page shows learned actions", "add to cart" in page.get("memory", {}).get("actions_here", []), page)
        reused = await call("act", tab_id=tab, intent="add to cart")
        check("act reuses it on another product (different label)", reused.get("ok") == 1 and
              reused["results"][0]["steps"][0]["how"] == "memory" and (await cart())["result"] == "2", reused)

        flow = await call("save_workflow", tab_id=tab, name="add product", description="Open a product and add it",
                          steps=[{"navigate": shop + "{{id}}"}, {"intent": "add to cart"}])
        check("workflow saved with params", flow.get("params") == ["id"], flow)
        ran = await call("run_workflow", tab_id=tab, name="add product", params={"id": "Q5W6E7"})
        check("workflow replays in one call", ran.get("completed") == 2 and (await cart())["result"] == "3", ran)

        miss = await call("act", tab_id=tab, intent="checkout")
        check("unknown intent is a clear miss", "Can't place" in miss["results"][0].get("error", ""), miss)
        batch = await call("act", intent="add to cart", urls=[shop + "A1B2C3", shop + "Z9Y8X7"])
        check("batch act: one call, two pages", batch.get("ok") == 2 and (await cart())["result"] == "5", batch)
        memory = await call("site_memory", tab_id=tab)
        check("site_memory shows trail and workflows", memory["recent_actions_this_session"] and
              "add product" in memory["workflows"], memory)
        check("memory persisted to disk", any((out / "memory").glob("*.json")))

        await call("tabs_close", tab_id=tab)
        check("tab closed", not (await call("tabs_context"))["tabs"])

    print(f"\n{'All checks passed' if not FAILURES else f'{len(FAILURES)} failed'}. Artifacts: {out}")
    raise SystemExit(1 if FAILURES else 0)


asyncio.run(main())
