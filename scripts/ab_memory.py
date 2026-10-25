"""A/B test: does site memory make a real Claude Code session faster?

Same task, same prompt, headless `claude -p`, only jev tools allowed, jev_run excluded.
  A: empty memory.   B: memory a previous visit would leave ("add to cart" learned on one product page).
Runs alternate A/B, each from an empty cart and a fresh copy of its memory dir. Outcome is checked in the page.

    uv run --project "$JEV_HOME" python scripts/ab_memory.py [runs_per_arm]
"""

import functools
import http.server
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))
import browser_tools as bt  # noqa: E402
import memory as mem  # noqa: E402
from browser_harness.helpers import cdp  # noqa: E402

PORT = 8811
ORIGIN = f"http://127.0.0.1:{PORT}"
SHOP = f"{ORIGIN}/shop"
PRODUCTS = {"Red Shoe": "A1B2C3", "Blue Mug": "Z9Y8X7", "Green Hat": "Q5W6E7"}
PROMPT = (f"Use the jev browser tools (not jev_run, not claude-in-chrome). In the shop at {SHOP}/index.html, "
          "add Red Shoe, Blue Mug and Green Hat to the cart, one of each. Product pages are "
          f"{SHOP}/product.html?id=<id> with ids " + ", ".join(f"{n}={i}" for n, i in PRODUCTS.items()) +
          ". When done, reply with the cart count shown on the page.")


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *_):
            pass

    handler = functools.partial(Quiet, directory=str(ROOT / "tests" / "site"))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def close_shop_tabs():
    for target in cdp("Target.getTargets")["targetInfos"]:
        if target["type"] == "page" and target["url"].startswith(ORIGIN):
            cdp("Target.closeTarget", targetId=target["targetId"])


def cart(reset=False):
    tab = bt.tabs_create(f"{SHOP}/index.html")["tab_id"]
    try:
        if reset:
            bt.javascript_tool(tab, "localStorage.setItem('jev-cart', 0)")
        return int(bt.javascript_tool(tab, "localStorage.getItem('jev-cart') || 0")["result"])
    finally:
        bt.tabs_close(tab)


def warm_memory(folder):
    """What one earlier visit leaves behind: 'add to cart' learned on the Red Shoe page."""
    mem.MEM_DIR = Path(folder)
    mem._SITES.clear()
    tab = bt.tabs_create(f"{SHOP}/product.html?id=A1B2C3")["tab_id"]
    ref = bt.find(tab, "add to cart")["matches"][0]["ref"]
    bt.TABS[tab].observe()
    known = bt.elements(bt.TABS[tab].page)[ref]
    mem.remember(bt.TABS[tab].info()["url"], "add to cart", {"role": known["role"], "label": known["label"], "kind": "left_click"})
    bt.tabs_close(tab)


def run(arm, memory_dir, workdir):
    env = {**os.environ, "JEV_MEMORY_DIR": str(memory_dir)}
    started = time.monotonic()
    proc = subprocess.run(
        ["claude", "-p", PROMPT, "--output-format", "json",
         "--allowedTools", "mcp__plugin_jev_jev", "--disallowedTools", "mcp__plugin_jev_jev__jev_run",
         "mcp__claude-in-chrome"],
        cwd=workdir, env=env, capture_output=True, text=True, timeout=900)
    wall = time.monotonic() - started
    try:
        out = json.loads(proc.stdout)
    except ValueError:
        out = {"is_error": True, "result": (proc.stdout or proc.stderr)[-400:]}
    usage = out.get("usage", {})
    return {"arm": arm, "wall_s": round(wall, 1), "turns": out.get("num_turns"),
            "cost_usd": out.get("total_cost_usd"),
            "tokens": sum(usage.get(k, 0) for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens",
                                                   "cache_read_input_tokens")),
            "error": out.get("is_error"), "reply": (out.get("result") or "")[-160:]}


def main():
    runs = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    serve()
    work = Path(tempfile.mkdtemp(prefix="jev-ab-"))
    warm = work / "warm-memory"
    warm_memory(warm)
    results = []
    for i in range(runs):
        for arm in ("A", "B"):
            memory_dir = work / f"mem-{arm}-{i}"
            if arm == "B":
                shutil.copytree(warm, memory_dir)
            else:
                memory_dir.mkdir()
            close_shop_tabs()
            cart(reset=True)
            result = run(arm, memory_dir, work)
            result["cart"] = cart()
            result["success"] = result["cart"] == 3 and not result["error"]
            close_shop_tabs()
            print(json.dumps(result), flush=True)
            results.append(result)

    print("\nsummary (median over successful runs):")
    for arm, label in (("A", "A empty memory"), ("B", "B learned memory")):
        ok = [r for r in results if r["arm"] == arm and r["success"]]
        if not ok:
            print(f"  {label}: no successful runs")
            continue
        med = lambda k: statistics.median(r[k] for r in ok if r[k] is not None)
        print(f"  {label}: {len(ok)}/{runs} ok · wall {med('wall_s')} s · turns {med('turns')} · "
              f"tokens {int(med('tokens'))} · cost ${med('cost_usd'):.3f}")
    (work / "results.json").write_text(json.dumps(results, indent=1))
    print(f"\nraw: {work / 'results.json'}")


if __name__ == "__main__":
    main()
