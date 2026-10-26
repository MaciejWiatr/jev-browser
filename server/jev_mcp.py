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
        "pass task='<3-5 word summary of the request>' on the first tabs_create/act so the tab group is named after "
        "it, and pass a new task to tabs_context when the user's task changes. "
        "work only in tabs this session created. read_page gives element refs (n12) for computer/form_input. "
        "If read_page returns needs_user (login or CAPTCHA), stop and ask the user to handle it in Chrome. "
        "Never trigger alert/confirm dialogs on purpose; if one opens, use handle_dialog. "
        "For one narrow goal on one site, jev_run is much faster than step-by-step tools. To READ or compare "
        "several pages, call get_page_text(urls=[...]) once: they load in parallel, main content only."
        + (" FASTEST PATH: every tool call costs a full model turn, so do as much per call as possible. "
           "Try act(intent, ...) BEFORE read_page: it finds the control from memory or its label, learns it, and "
           "takes url/urls/then, so 'add these 5 products in size M' is ONE call: act('size', value='M', "
           "urls=[...], then=[{'intent': 'add to basket'}]). Check its returned visible_text instead of "
           "re-reading. Use read_page only when act reports a miss; then pass intent= on computer/form_input so "
           "it is learned." if bt.mem.ENABLED else "")
    ),
)


def _memory_hint(url):
    if not bt.mem.ENABLED:
        return {}
    known = bt.mem.known(url)
    if not (known["actions_here"] or known["workflows"] or known["actions_elsewhere_on_site"]):
        return {}
    return {"memory": {"actions_here": known["actions_here"],
                       "actions_elsewhere_on_site": known["actions_elsewhere_on_site"],
                       "workflows": list(known["workflows"]),
                       "use": "act(tab, intent, url=...) directly: no read_page needed"}}


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
                            "hint": "Only if this is a connection error, call jev_status with reconnect=true "
                                    "(it skips the restart when Chrome is still connected)."}

        return await anyio.to_thread.run_sync(call)

    return mcp.tool()(wrapper)


def memory_tool(fn):
    return browser_tool(fn) if bt.mem.ENABLED else fn


def _with_image(result):
    summary, image = result
    return [json.dumps(summary), Image(data=image, format="jpeg")] if image else summary


# ---------- tabs ----------

@browser_tool
def tabs_context(create_if_empty: bool = False, task: str | None = None) -> dict:
    """List the tabs this session owns (its tab group). create_if_empty=true opens a blank tab if there are none.
    task: rename the tab group when the user's task changes (3-5 words)."""
    return {**bt.tabs_context(create_if_empty, task), "group": bt.GROUP_TITLE}


@browser_tool
def tabs_create(url: str = "about:blank", activate: bool = False, task: str | None = None) -> dict:
    """Open a new tab in the user's Chrome, optionally at url. Returns its tab_id.
    The tab opens in the background so the agent's input never mixes with the user's keyboard and cursor.
    activate=true brings it to the front (steals focus); use only when the user asks to watch.
    task: 3-5 word summary of the user's request, e.g. "Add 5 items to cart"; names the tab group."""
    info = bt.tabs_create(url, activate, task)
    return {**info, **_memory_hint(info.get("url"))}


@browser_tool
def tabs_close(tab_id: str) -> dict:
    """Close a tab this session opened."""
    return bt.tabs_close(tab_id)


@browser_tool
def navigate(tab_id: str, url: str) -> dict:
    """Go to url in the tab. url can also be 'back', 'forward' or 'reload'. Waits for load."""
    tab = bt.get_tab(tab_id)
    tab.navigate(url)
    return {**tab.info(), **({"dialog_open": tab.dialog} if tab.dialog else {}), **_memory_hint(tab.info()["url"])}


# ---------- reading ----------

@browser_tool
def read_page(tab_id: str, include_text: bool = True) -> dict:
    """Read the visible page: interactive elements with refs (e.g. [n12] button 'Search'), visible text,
    file inputs, and needs_user when a login or CAPTCHA is showing. Refs work with computer and form_input."""
    return bt.read_page(tab_id, include_text)


@browser_tool
def get_page_text(tab_id: str | None = None, url: str | None = None, urls: list[str] | None = None,
                  main_only: bool = True, offset: int = 0, limit: int = 20000) -> dict:
    """Text of a page for reading or extracting data, including offscreen parts.
    - urls=[...]: read MANY pages in ONE call (loaded in parallel in temporary background tabs, closed after);
      limit applies per page (use ~3000-5000). The fastest way to compare or research several pages.
    - url: open it in the tab first, then read (one call instead of navigate + get_page_text).
    - main_only (default): only the main content, without nav, header, footer, sidebars and dialogs.
    Waits for single-page apps to finish rendering. offset paginates a single long page."""
    if urls:
        return bt.read_pages(urls, limit=min(limit, 20000), main_only=main_only)
    return bt.get_page_text(tab_id, offset, limit, url, main_only)


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
    intent: str | None = None,
) -> Any:
    """Mouse, keyboard and screenshots in a tab.
    - screenshot: returns the image; save_path also writes a PNG to disk.
    - left_click/double_click/triple_click/right_click/hover: target a ref from read_page, or coordinate [x, y].
    - type: insert text into ref (clicked first) or the focused element.
    - key: text like 'Enter', 'cmd+a', 'shift+Tab'; space-separated for a sequence.
    - scroll: direction + amount (notches) at coordinate, or ref to scroll it into view.
    - wait: duration seconds (max 10). zoom: region [x0, y0, x1, y1] at 2x.
    - intent: a short name for what this does ("add to cart", "search box"). With a ref, the target is learned for
      this page type; without a ref, a learned target is reused. Pass it on every meaningful click/type."""
    return _with_image(bt.computer(tab_id, action, ref, coordinate, text, direction, amount, duration, region, save_path,
                                   intent))


@browser_tool
def form_input(tab_id: str, value: str | bool, ref: str | None = None, intent: str | None = None) -> dict:
    """Set a form field: text inputs (replaces content), selects (option label or value), checkboxes/radios
    (true/false). Target it by ref from read_page, or by a learned intent ("email field"); passing intent with a
    ref teaches it."""
    return bt.form_input(tab_id, ref, value, intent)[0]


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
def resize_window(tab_id: str, width: int = 0, height: int = 0) -> dict:
    """Set the tab's viewport in CSS pixels, e.g. 390x844 to check a mobile layout.
    Omit width/height to go back to filling the real Chrome window (the default)."""
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


# ---------- memory ----------

@memory_tool
def act(intent: str, tab_id: str | None = None, value: str | bool | None = None, url: str | None = None,
        urls: list[str] | None = None, then: list[dict] | None = None, task: str | None = None) -> dict:
    """The fastest way to do anything: one call, no read_page needed.
    intent: what to do, in a few words ("add to cart", "search box", "size"). Uses memory for this page type,
    or a confident match on the label (the button whose label contains the intent words), which is then learned.
    value: text to type or option to pick. url: open this page first. urls: repeat on each page in ONE call.
    then: more steps per page, e.g. act("size", value="M", urls=[...], then=[{"intent": "add to basket"}]).
    tab_id is optional (reuses this session's tab). Returns what was clicked and visible text per page; on a
    miss it lists candidates, then teach it with read_page + computer/form_input(ref, intent).
    task: 3-5 word summary of the user's request; names the tab group when act opens the first tab."""
    return bt.act(intent, tab_id, value, url, urls, then, task)


@memory_tool
def save_workflow(tab_id: str, name: str, description: str, steps: list[dict]) -> dict:
    """Save a reusable workflow for the current site from learned intents. Each step is {"intent": ..., "value": ...}
    or {"navigate": url}. Use {{param}} placeholders for anything that changes or is personal, e.g.
    [{"navigate": "https://shop.example.com"}, {"intent": "search box", "value": "{{query}}"},
     {"intent": "first result"}, {"intent": "add to cart"}]."""
    return bt.mem.save_workflow(bt.get_tab(tab_id).info()["url"], name, description, steps)


@memory_tool
def run_workflow(tab_id: str, name: str, params: dict | None = None) -> dict:
    """Replay a saved workflow for the current site in one call. Stops at the first step that no longer matches and
    returns the remaining steps, so you can finish them by hand (with intent=, which heals memory)."""
    return bt.run_workflow(tab_id, name, params)


@memory_tool
def site_memory(tab_id: str | None = None, url: str | None = None, forget_intent: str | None = None,
                forget_workflow: str | None = None) -> dict:
    """What jev remembers for a site: learned actions on this page type and elsewhere on the site, saved workflows,
    and this tab's recent actions (short-term memory). forget_intent / forget_workflow remove an entry."""
    target = url or bt.get_tab(tab_id).info()["url"]
    if forget_intent or forget_workflow:
        return bt.mem.forget(target, forget_intent, forget_workflow)
    return bt.site_memory(tab_id, url)


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

def _plugin_version() -> str:
    try:
        return json.loads((Path(__file__).resolve().parent.parent / ".claude-plugin" / "plugin.json").read_text())["version"]
    except (OSError, ValueError, KeyError):
        return "unknown"


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
    """Status like /chrome: jev-browser plugin version, browser connection, .env keys (presence only),
    site rules, open tabs, cursor mode.
    reconnect=true restarts the browser connection, but only if it is actually broken: a new connection makes
    Chrome ask the user 'Allow remote debugging?' again."""
    env = {k: v for k, v in os.environ.items() if k != "VIRTUAL_ENV"}
    cmd = ["uv", "run", "--project", str(JEV_HOME), "browser-harness"]
    if reconnect and await anyio.to_thread.run_sync(bt.browser_connected):
        reconnect = False
    if reconnect:
        await anyio.run_process([*cmd, "--reload"], check=False, stderr=subprocess.STDOUT, env=env)
        with bt.LOCK:
            bt.TABS.clear()
        await anyio.to_thread.run_sync(bt.ensure_daemon)
    result = await anyio.run_process([*cmd, "--doctor"], check=False, stderr=subprocess.STDOUT, env=env)
    with bt.LOCK:
        tabs = [t.info() for t in bt.TABS.values()]
    return {
        "plugin": {"name": "jev-browser", "version": _plugin_version(),
                   "note": "Jev Ultrafast (the engine in jev_home) has its own, separate version."},
        **_env_status(),
        "browser_harness_doctor": result.stdout.decode(errors="replace"),
        "site_rules": {"file": str(bt.SITES_FILE), **bt.site_rules()},
        "session_tabs": tabs,
        "cursor_mode": "natural" if bt.CURSOR.enabled else "speed",
        "reconnected": reconnect,
        "fix_hints": [
            "DevToolsActivePort not found -> user enables chrome://inspect/#remote-debugging",
            "'Allow remote debugging?' prompt in Chrome -> user clicks Allow; Chrome asks once per new connection, "
            "so expect it after each Chrome restart, not each session",
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
