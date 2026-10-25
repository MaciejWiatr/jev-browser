"""MCP server exposing Jev Ultrafast plus Claude-in-Chrome style browser tools.

Runs inside the jev-ultrafast uv project (see .mcp.json), so `jev_ultrafast` is importable.
"""

import atexit
import contextlib
import functools
import json
import os
import signal
import socket
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any, Literal

import anyio
import browser_tools as bt
from mcp.server.fastmcp import FastMCP, Image

JEV_HOME = Path(os.environ.get("JEV_HOME", Path.home() / "Apps" / "jev-ultrafast")).expanduser()
INSPECTOR_PORT = int(os.environ.get("TYPESAFE_DEMO_PORT", "8766"))
PAGE_TEXT_LIMIT = 4000
RUN_LOCK = threading.Lock()

mcp = FastMCP(
    "jev",
    instructions=(
        "Browser control in the user's real Chrome (their logins). Start with tabs_context, then tabs_create; "
        "work only in tabs this session created. read_page gives element refs (n12) for computer/form_input. "
        "If read_page returns needs_user (login or CAPTCHA), stop and ask the user to handle it in Chrome. "
        "Never trigger alert/confirm dialogs on purpose; if one opens, use handle_dialog. "
        "For one narrow goal on one site, jev_run is much faster than step-by-step tools."
    ),
)


def browser_tool(fn):
    """Run a sync browser primitive in a worker thread, serialized, with errors returned as text."""

    @functools.wraps(fn)
    async def wrapper(**kwargs):
        def call():
            with bt.LOCK:
                try:
                    return fn(**kwargs)
                except bt.ToolError as exc:
                    return {"error": str(exc)}
                except Exception as exc:
                    return {"error": f"{type(exc).__name__}: {exc}",
                            "hint": "If this is a connection error, call jev_status with reconnect=true."}

        return await anyio.to_thread.run_sync(call)

    return mcp.tool()(wrapper)


def _with_image(result):
    summary, image = result
    return [json.dumps(summary), Image(data=image, format="jpeg")] if image else summary


# ---------- tabs ----------

@browser_tool
def tabs_context(create_if_empty: bool = False) -> dict:
    """List the tabs this session owns (its tab group). create_if_empty=true opens a blank tab if there are none."""
    return bt.tabs_context(create_if_empty)


@browser_tool
def tabs_create(url: str = "about:blank", activate: bool = False) -> dict:
    """Open a new tab in the user's Chrome, optionally at url. Returns its tab_id.
    The tab opens in the background so the agent's input never mixes with the user's keyboard and cursor.
    activate=true brings it to the front (steals focus); use only when the user asks to watch."""
    return bt.tabs_create(url, activate)


@browser_tool
def tabs_close(tab_id: str) -> dict:
    """Close a tab this session opened."""
    return bt.tabs_close(tab_id)


@browser_tool
def navigate(tab_id: str, url: str) -> dict:
    """Go to url in the tab. url can also be 'back', 'forward' or 'reload'. Waits for load."""
    tab = bt.get_tab(tab_id)
    tab.navigate(url)
    return {**tab.info(), **({"dialog_open": tab.dialog} if tab.dialog else {})}


# ---------- reading ----------

@browser_tool
def read_page(tab_id: str, include_text: bool = True) -> dict:
    """Read the visible page: interactive elements with refs (e.g. [n12] button 'Search'), visible text,
    file inputs, and needs_user when a login or CAPTCHA is showing. Refs work with computer and form_input."""
    return bt.read_page(tab_id, include_text)


@browser_tool
def get_page_text(tab_id: str, offset: int = 0, limit: int = 20000) -> dict:
    """Full text of the page (including offscreen), paginated with offset. Use for extracting data."""
    return bt.get_page_text(tab_id, offset, limit)


@browser_tool
def find(tab_id: str, query: str) -> dict:
    """Find on-screen elements by natural description words, e.g. 'search box' or 'add to cart'. Returns refs."""
    return bt.find(tab_id, query)


# ---------- acting ----------

@browser_tool
def computer(
    tab_id: str,
    action: Literal["screenshot", "left_click", "double_click", "triple_click", "right_click", "hover",
                    "type", "key", "scroll", "wait", "zoom"],
    ref: str | None = None,
    coordinate: list[float] | None = None,
    text: str | None = None,
    direction: Literal["up", "down", "left", "right"] = "down",
    amount: int = 3,
    duration: float = 1.0,
    region: list[float] | None = None,
    save_path: str | None = None,
) -> Any:
    """Mouse, keyboard and screenshots in a tab.
    - screenshot: returns the image; save_path also writes a PNG to disk.
    - left_click/double_click/triple_click/right_click/hover: target a ref from read_page, or coordinate [x, y].
    - type: insert text into ref (clicked first) or the focused element.
    - key: text like 'Enter', 'cmd+a', 'shift+Tab'; space-separated for a sequence.
    - scroll: direction + amount (notches) at coordinate, or ref to scroll it into view.
    - wait: duration seconds (max 10). zoom: region [x0, y0, x1, y1] at 2x."""
    return _with_image(bt.computer(tab_id, action, ref, coordinate, text, direction, amount, duration, region, save_path))


@browser_tool
def form_input(tab_id: str, ref: str, value: str | bool) -> dict:
    """Set a form field by ref: text inputs (replaces content), selects (option label or value), checkboxes/radios (true/false)."""
    return bt.form_input(tab_id, ref, value)[0]


@browser_tool
def javascript_tool(tab_id: str, code: str) -> dict:
    """Run JavaScript in the page and return the result. An expression or a body with `return`; await is allowed.
    Do not call alert/confirm/prompt."""
    return bt.javascript_tool(tab_id, code)


@browser_tool
def file_upload(tab_id: str, paths: list[str], input_index: int = 0) -> dict:
    """Attach local files to a file input on the page (input_index from read_page file_inputs). 10 MB total.
    Refuses credential files (.env, keys, .ssh) and hard-linked files."""
    return bt.file_upload(tab_id, paths, input_index)


@browser_tool
def handle_dialog(tab_id: str, accept: bool = True, prompt_text: str | None = None) -> dict:
    """Accept or dismiss an open alert/confirm/prompt/beforeunload dialog that is blocking the tab."""
    return bt.handle_dialog(tab_id, accept, prompt_text)


@browser_tool
def resize_window(tab_id: str, width: int, height: int) -> dict:
    """Set the tab's viewport size in CSS pixels, e.g. 390x844 to check a mobile layout."""
    return bt.resize_window(tab_id, width, height)


@browser_tool
def set_cursor_mode(mode: Literal["speed", "natural"] | None = None) -> dict:
    """Switch how the agent cursor moves for this session: 'speed' (default, instant moves, fastest) or
    'natural' (human mode: ghost-cursor paths, ~0.7 s per move, for sites that react to robotic input).
    CAPTCHAs still go to the user. Omit mode to read the current setting."""
    if mode:
        bt.CURSOR.enabled = mode == "natural"
    return {"cursor_mode": "natural" if bt.CURSOR.enabled else "speed",
            "note": "Applies to this Claude session. Default for new sessions: JEV_CURSOR_MODE env var."}


# ---------- debugging ----------

@browser_tool
def read_console_messages(tab_id: str, pattern: str | None = None, only_errors: bool = False,
                          limit: int = 100, clear: bool = False) -> dict:
    """Console output, exceptions and browser log entries captured since the tab opened.
    Pass a regex pattern to filter; logs can be verbose."""
    return bt.read_console_messages(tab_id, pattern, only_errors, limit, clear)


@browser_tool
def read_network_requests(tab_id: str, url_pattern: str | None = None, only_failed: bool = False,
                          limit: int = 100, clear: bool = False) -> dict:
    """Network requests (method, url, type, status) captured since the tab opened. Filter by regex url_pattern."""
    return bt.read_network_requests(tab_id, url_pattern, only_failed, limit, clear)


@browser_tool
def gif_creator(tab_id: str, action: Literal["start_recording", "stop_recording", "export"],
                filename: str | None = None) -> dict:
    """Record the tab as a GIF: start_recording, do the actions, stop_recording, then export (saves the file).
    The GIF shows account details on logged-in pages; review before sharing."""
    return bt.gif_creator(tab_id, action, filename)


@browser_tool
def browser_batch(tab_id: str, actions: list[dict]) -> dict:
    """Run several steps in one call, stopping at the first error. Each step is
    {"tool": "computer" | "form_input" | "navigate" | "javascript_tool", ...that tool's arguments except tab_id}.
    Screenshots inside a batch are skipped; take one after."""
    results = []
    for i, step in enumerate(actions):
        step = dict(step)
        name = step.pop("tool", None)
        try:
            if name == "computer":
                if step.get("action") == "screenshot":
                    results.append({"step": i, "skipped": "screenshot"})
                    continue
                out = bt.computer(tab_id, **step)[0]
            elif name == "form_input":
                out = bt.form_input(tab_id, **step)[0]
            elif name == "navigate":
                tab = bt.get_tab(tab_id)
                tab.navigate(step["url"])
                out = tab.info()
            elif name == "javascript_tool":
                out = bt.javascript_tool(tab_id, step["code"])
            else:
                raise bt.ToolError(f"Unsupported tool {name!r} in batch.")
        except (bt.ToolError, TypeError, KeyError) as exc:
            results.append({"step": i, "tool": name, "error": str(exc)})
            return {"completed": i, "results": results}
        results.append({"step": i, "tool": name, **out})
    return {"completed": len(actions), "results": results}


# ---------- Jev agent ----------

def _run_agent(url: str, goals: list[str], keep_open: bool) -> dict:
    from jev_ultrafast import Agent

    if not RUN_LOCK.acquire(blocking=False):
        return {"error": "Another jev_run is in progress. Wait for it to finish."}
    agent = None
    try:
        bt.check_site(url)
        # stdout is the MCP channel; anything the browser layer prints must go to stderr.
        with contextlib.redirect_stdout(sys.stderr):
            agent = Agent(url, goals)
            state = agent.snapshot()
            for state in agent.run():
                pass
    except Exception as exc:
        return {"error": f"{type(exc).__name__}: {exc}", "hint": "Call jev_status if this is a connection error."}
    finally:
        tab = None
        if agent and keep_open:
            with bt.LOCK, contextlib.suppress(Exception):
                tab = bt.adopt(agent.browser)
        elif agent:
            with contextlib.suppress(Exception):
                agent.close()
        RUN_LOCK.release()

    page = state["page"]
    return {
        "status": state["status"],
        "elapsed_ms": state["elapsed_ms"],
        "final_url": page["url"],
        "actions": [
            {"step": h["step"], "kind": h["kind"], "target": h["action"], "text": h["text"], "url_after": h["url"]}
            for h in state["history"]
        ],
        "model_calls": {"decisions": len(state["decisions"]), "text": len(state["text_calls"])},
        "page_text": (page.get("text") or "")[:PAGE_TEXT_LIMIT],
        "tab_id": tab and tab["tab_id"],
        "note": "status 'done' is the agent's claim. Verify against final_url and page_text before reporting success.",
    }


@mcp.tool()
async def jev_run(url: str, goals: list[str], keep_open: bool = False) -> dict:
    """Run the Jev Ultrafast agent: opens url and pursues goals autonomously in ~2-8 s.

    goals: one or more narrow natural-language goals, in order; say when to stop ("Stop when results are visible").
    Makes paid API calls (TypeSafe + text LLM). Returns status, final URL, executed actions and page text.
    keep_open=true keeps the tab and returns a tab_id usable with read_page/computer/etc. for follow-up.
    """
    goals = [g for g in (s.strip() for s in goals) if g]
    if not goals:
        return {"error": "Supply at least one non-empty goal."}
    return await anyio.to_thread.run_sync(_run_agent, url, goals, keep_open)


# ---------- setup / status ----------

def _env_status() -> dict:
    env_file = JEV_HOME / ".env"
    keys = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            name, sep, value = line.partition("=")
            if sep and not name.startswith("#"):
                keys[name.strip()] = ("set" if value.strip() else "EMPTY") if "KEY" in name else value.strip()
    return {"jev_home": str(JEV_HOME), "env_file_exists": env_file.exists(), "env": keys}


@mcp.tool()
async def jev_status(reconnect: bool = False) -> dict:
    """Connection status like /chrome: browser connection, .env keys (presence only), site rules, open tabs.
    reconnect=true restarts the browser connection (use after 'daemon' or connection errors)."""
    env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}
    cmd = ["uv", "run", "--project", str(JEV_HOME), "browser-harness"]
    if reconnect:
        await anyio.run_process([*cmd, "--reload"], check=False, stderr=subprocess.STDOUT, env=env)
        with bt.LOCK:
            bt.TABS.clear()
        await anyio.to_thread.run_sync(bt.ensure_daemon)
    result = await anyio.run_process([*cmd, "--doctor"], check=False, stderr=subprocess.STDOUT, env=env)
    with bt.LOCK:
        tabs = [t.info() for t in bt.TABS.values()]
    return {
        **_env_status(),
        "browser_harness_doctor": result.stdout.decode(errors="replace"),
        "site_rules": {"file": str(bt.SITES_FILE), **bt.site_rules()},
        "session_tabs": tabs,
        "cursor_mode": "natural" if bt.CURSOR.enabled else "speed",
        "reconnected": reconnect,
        "fix_hints": [
            "DevToolsActivePort not found -> user enables chrome://inspect/#remote-debugging",
            "'Allow remote debugging?' prompt in Chrome -> user clicks Allow",
            "EMPTY key -> user fills it in the .env file; never search for keys elsewhere",
        ],
    }


def _port_open(port: int) -> bool:
    with socket.socket() as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


@mcp.tool()
async def jev_inspector() -> dict:
    """Start the local Jev inspector web UI (numbered elements, probabilities, step-by-step control) if not running."""
    url = f"http://127.0.0.1:{INSPECTOR_PORT}"
    if _port_open(INSPECTOR_PORT):
        return {"url": url, "started": False, "note": "Already running."}
    log = open(JEV_HOME / "inspector.log", "ab")
    subprocess.Popen(
        ["uv", "run", "--env-file", ".env", "jev"],
        cwd=JEV_HOME,
        stdout=log,
        stderr=log,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    for _ in range(40):
        if _port_open(INSPECTOR_PORT):
            return {"url": url, "started": True}
        await anyio.sleep(0.25)
    return {"error": "Inspector did not come up within 10 s.", "log": str(JEV_HOME / "inspector.log")}


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    bt.start_pump_thread()
    atexit.register(bt.close_session_tabs)
    mcp.run()
