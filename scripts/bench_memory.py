"""Benchmark: does site memory make real Claude Code sessions faster on realistic shop tasks?

Shop fixture (tests/site/shop2) has the traps real shops have: the button says "Add to basket" while tasks say
"cart", every product page has look-alike "Add to basket" decoys under "Recommended", the real button enables
~0.4 s after load and only once a size is chosen, and products are reached via search.

Arms, alternated per round, each a fresh headless `claude -p` with only jev tools (jev_run excluded):
  off   JEV_MEMORY=off: no memory tools at all (the v0.3 baseline)
  cold  memory on, empty
  warm  memory on, starting from what the latest successful cold run of the same task learned
Outcomes are checked strictly in the page (exact items and sizes, no decoys).

    uv run --project "$JEV_HOME" python scripts/bench_memory.py [rounds] [task ...]
"""

import collections
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
from browser_harness.helpers import cdp  # noqa: E402

PORT = 8812
ORIGIN = f"http://127.0.0.1:{PORT}"
SHOP = f"{ORIGIN}/shop2"
FIVE = ["P1001", "P1002", "P1003", "P1005", "P1008"]

TASKS = {
    "batch5": {
        "prompt": f"In the shop at {SHOP}/index.html add these 5 products to the cart, each in size M: "
                  + ", ".join(FIVE) + f". Product pages are {SHOP}/p.html?id=<id>. "
                  "Only these 5 items should end up in the basket. Reply with what is in the basket.",
        "expect": sorted((i, "M") for i in FIVE),
    },
    "search": {
        "prompt": f"In the shop at {SHOP}/index.html search for 'mug', open the first result, choose size L and add "
                  "it to the cart. Only that one item should end up in the basket. Reply with what is in the basket.",
        "expect": [("P1001", "L")],
    },
}
ARMS = ("off", "cold", "warm")


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
            try:
                cdp("Target.closeTarget", targetId=target["targetId"])
            except RuntimeError:
                pass


def basket(reset=False):
    tab = bt.tabs_create(f"{SHOP}/index.html")["tab_id"]
    try:
        if reset:
            bt.javascript_tool(tab, "localStorage.removeItem('jev2-basket')")
        return sorted((i["id"], i["size"]) for i in json.loads(
            bt.javascript_tool(tab, "localStorage.getItem('jev2-basket') || '[]'")["result"]))
    finally:
        bt.tabs_close(tab)


def run_claude(prompt, env, workdir):
    started = time.monotonic()
    proc = subprocess.run(
        ["claude", "-p", prompt, "--output-format", "stream-json", "--verbose",
         "--allowedTools", "mcp__plugin_jev_jev", "--disallowedTools", "mcp__plugin_jev_jev__jev_run",
         "mcp__claude-in-chrome"],
        cwd=workdir, env=env, capture_output=True, text=True, timeout=900)
    wall = time.monotonic() - started
    out, tools = {"is_error": True}, []
    for line in proc.stdout.splitlines():
        try:
            msg = json.loads(line)
        except ValueError:
            continue
        if msg.get("type") == "assistant":
            tools += [c["name"].split("__")[-1] for c in msg["message"].get("content", []) if c.get("type") == "tool_use"]
        elif msg.get("type") == "result":
            out = msg
    usage = out.get("usage", {})
    return {"wall_s": round(wall, 1), "turns": out.get("num_turns"), "tool_calls": len(tools), "tools": tools,
            "tokens": sum(usage.get(k, 0) for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens",
                                                   "cache_read_input_tokens")),
            "cost_usd": out.get("total_cost_usd"), "error": out.get("is_error")}


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    tasks = sys.argv[2:] or list(TASKS)
    serve()
    work = Path(tempfile.mkdtemp(prefix="jev-bench-"))
    learned = {}  # task -> memory dir from its latest successful cold run
    results = []
    for r in range(rounds):
        for task in tasks:
            for arm in ARMS:
                if arm == "warm" and task not in learned:
                    continue
                mem_dir = work / f"{task}-{arm}-{r}"
                if arm == "warm":
                    shutil.copytree(learned[task], mem_dir)
                else:
                    mem_dir.mkdir()
                env = {**os.environ, "JEV_MEMORY_DIR": str(mem_dir), "JEV_MEMORY": "off" if arm == "off" else "on"}
                close_shop_tabs()
                basket(reset=True)
                row = {"task": task, "arm": arm, "round": r, **run_claude(TASKS[task]["prompt"], env, work)}
                got = basket()
                row["success"] = got == TASKS[task]["expect"] and not row["error"]
                row["basket"] = got
                close_shop_tabs()
                if arm == "cold" and row["success"]:
                    learned[task] = mem_dir
                results.append(row)
                print(json.dumps({k: v for k, v in row.items() if k != "tools"} | {"tools": " ".join(row["tools"])}),
                      flush=True)

    (work / "results.json").write_text(json.dumps(results, indent=1))
    print("\nmedian over successful runs")
    for task in tasks:
        print(f"\n{task}")
        base = None
        for arm in ARMS:
            rows = [x for x in results if x["task"] == task and x["arm"] == arm]
            ok = [x for x in rows if x["success"]]
            if not ok:
                print(f"  {arm:5} {len(ok)}/{len(rows)} ok")
                continue
            med = {k: statistics.median(x[k] for x in ok) for k in ("wall_s", "turns", "tool_calls", "tokens")}
            base = base or med
            delta = f"  ({(med['wall_s'] / base['wall_s'] - 1) * 100:+.0f}% wall vs off)" if arm != "off" else ""
            print(f"  {arm:5} {len(ok)}/{len(rows)} ok · wall {med['wall_s']:.1f} s · turns {med['turns']:.0f} · "
                  f"calls {med['tool_calls']:.0f} · tokens {int(med['tokens'])}{delta}")
    print(f"\nraw: {work / 'results.json'}")
    calls = collections.Counter(t for x in results for t in x["tools"])
    print("tool usage:", dict(calls.most_common()))


if __name__ == "__main__":
    main()
