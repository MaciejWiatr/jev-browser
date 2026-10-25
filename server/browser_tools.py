"""Claude-in-Chrome style browser primitives over Browser Harness (Chrome DevTools Protocol).

Tabs are owned by this server process (the session's "tab group"). Elements are addressed by refs
from read_page, which come from Jev's atomic DOM snapshot; refs never become selectors or code.
"""

import base64
import fcntl
import fnmatch
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from pathlib import Path
from urllib.parse import quote, urlparse

from browser_harness.admin import ensure_daemon
from browser_harness.helpers import cdp, drain_events

from jev_ultrafast.browser import Browser, StalePage

import memory as mem

CURSOR_HELPER = Path(__file__).with_name("cursor") / "cursor.bundle.js"
SESSION = os.urandom(4).hex()
GROUP_TITLE = os.environ.get("JEV_GROUP_TITLE") or f"Jev · {Path.cwd().name}".replace("|", "/")
SITES_FILE = Path(os.environ.get("JEV_SITES_FILE", "~/.config/jev/sites.json")).expanduser()
UPLOAD_LIMIT = 10 * 1024 * 1024
CREDENTIAL_NAME = re.compile(r"(^\.env(\..*)?$|\.(pem|key|p12|pfx|keystore|jks)$|^id_(rsa|dsa|ecdsa|ed25519)|^\.netrc$|^\.npmrc$|^credentials(\.json)?$)", re.I)
CREDENTIAL_DIRS = {".ssh", ".gnupg", ".aws", ".kube", ".docker"}
LOG_LIMIT = 1000
GIF_FPS = 2

LOCK = threading.RLock()
TABS = {}  # tab id -> Tab
COUNTER = [0]


class ToolError(Exception):
    pass


# ---------- site permissions ----------

def site_rules():
    try:
        data = json.loads(SITES_FILE.read_text())
    except (OSError, ValueError):
        data = {}
    return {"allow": list(data.get("allow", [])), "deny": list(data.get("deny", []))}


def check_site(url):
    host = urlparse(url).hostname or ""
    if not host:
        return
    rules = site_rules()
    if any(fnmatch.fnmatch(host, p) for p in rules["deny"]):
        raise ToolError(f"{host} is blocked by {SITES_FILE} (deny list). Ask the user to change it.")
    if rules["allow"] and not any(fnmatch.fnmatch(host, p) for p in rules["allow"]):
        raise ToolError(f"{host} is not on the allow list in {SITES_FILE}. Ask the user to add it.")


# ---------- tabs ----------

class Tab:
    def __init__(self, url, browser=None):
        check_site(url)
        adopted = browser is not None
        if browser is None:
            with _quiet():
                browser = Browser("about:blank")
        else:
            url = "about:blank"  # adopted from jev_run: already on its page
        self.browser = browser
        COUNTER[0] += 1
        self.id = f"t{COUNTER[0]}"
        self.console = deque(maxlen=LOG_LIMIT)
        self.network = {}
        self.dialog = None
        self.page = None
        self.frames = None
        self.trail = deque(maxlen=100)
        self.pointer = {"x": 560, "y": 390}
        # Register before the first navigation so its console/network events are routed here.
        TABS[self.id] = self
        register_session(self.session)
        for domain in ("Page", "Runtime", "Log", "Network"):
            self.call(f"{domain}.enable")
        apply_viewport(self)
        self.call("Page.addScriptToEvaluateOnNewDocument", source=CURSOR_JS)
        self.call("Runtime.evaluate", expression=CURSOR_JS)
        self.mark_group(adopted)
        # No Target.activateTarget: raising the tab steals OS keyboard focus, and the user's typing would land
        # in the agent's page. Focus emulation (set by Browser) keeps the background tab rendering as focused.
        if url != "about:blank":
            self.navigate(url)

    def mark_group(self, adopted=False):
        """Ask the Jev Tab Groups extension (if loaded) to put this tab in the session's tab group."""
        marker = f"{SESSION}|{GROUP_TITLE}"
        try:
            if adopted:
                self.call("Runtime.evaluate", expression=f"""(m => {{ const old = document.title;
                  document.title = 'jev-group:' + m; setTimeout(() => {{ document.title = old }}, 500); }})({json.dumps(marker)})""")
            else:
                self.call("Page.navigate", url="about:blank#jev-group=" + quote(marker))
        except Exception:
            pass

    @property
    def session(self):
        return self.browser.session

    def call(self, method, **params):
        if self.dialog and not method.startswith(("Page.handleJavaScriptDialog", "Target.")):
            raise ToolError(f"A JavaScript {self.dialog['type']} dialog is open: {self.dialog['message']!r}. "
                            "Call handle_dialog first.")
        return self.browser.call(method, **params)

    def evaluate(self, expression, await_promise=False):
        result = self.call("Runtime.evaluate", expression=expression, returnByValue=True, awaitPromise=await_promise)
        if result.get("exceptionDetails"):
            details = result["exceptionDetails"]
            raise ToolError(details.get("exception", {}).get("description") or details.get("text", "JS error"))
        return result.get("result", {}).get("value")

    def info(self):
        try:
            target = cdp("Target.getTargetInfo", targetId=self.browser.target)["targetInfo"]
            return {"tab_id": self.id, "url": target.get("url"), "title": target.get("title")}
        except Exception:
            return {"tab_id": self.id, "url": None, "title": None, "closed": True}

    def wait_loaded(self, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            pump()
            if self.dialog:
                return
            try:
                if self.browser.evaluate("document.readyState") == "complete":
                    return
            except StalePage:
                pass
            time.sleep(0.05)

    def navigate(self, url):
        if url in {"back", "forward"}:
            history = self.call("Page.getNavigationHistory")
            index = history["currentIndex"] + (-1 if url == "back" else 1)
            if not 0 <= index < len(history["entries"]):
                raise ToolError(f"No page to go {url} to.")
            check_site(history["entries"][index]["url"])
            self.call("Page.navigateToHistoryEntry", entryId=history["entries"][index]["id"])
        elif url == "reload":
            self.call("Page.reload")
        else:
            if not re.match(r"^[a-z][a-z0-9+.-]*:", url):
                url = "https://" + url
            check_site(url)
            self.call("Page.navigate", url=url)
        self.page = None
        time.sleep(0.05)
        self.wait_loaded()
        self.capture()

    def observe(self):
        pump()
        if self.dialog:
            raise ToolError(f"A JavaScript {self.dialog['type']} dialog is open: {self.dialog['message']!r}. "
                            "Call handle_dialog first.")
        with _quiet():
            self.page = self.browser.observe(screenshot=False)
        check_site(self.page["url"])
        return self.page

    def screenshot(self, clip=None, fmt="jpeg"):
        params = {"format": fmt}
        if fmt == "jpeg":
            params["quality"] = 75
        if clip:
            params["clip"] = clip
        return base64.b64decode(self.call("Page.captureScreenshot", **params)["data"])

    def capture(self):
        if self.frames is not None:
            try:
                self.frames.append(self.screenshot())
            except Exception:
                pass

    def close(self):
        self.frames = None
        unregister_session(self.session)
        try:
            self.browser.close()
        except Exception:
            pass


class _quiet:
    """Browser Harness prints to stdout, which is the MCP channel. Send it to stderr."""

    def __enter__(self):
        self.stdout, sys.stdout = sys.stdout, sys.stderr

    def __exit__(self, *_):
        sys.stdout = self.stdout


def get_tab(tab_id):
    pump()
    if tab_id not in TABS:
        raise ToolError(f"Unknown tab {tab_id!r}. Call tabs_context to see this session's tabs.")
    return TABS[tab_id]


def tabs_context(create_if_empty=False):
    if create_if_empty and not TABS:
        tabs_create("about:blank")
    for tab_id in [t for t, tab in TABS.items() if tab.info().get("closed")]:
        TABS.pop(tab_id)
    return {"tabs": [tab.info() for tab in TABS.values()],
            "note": "Only tabs opened in this session are listed. Use tabs_create for a new one."}


def tabs_create(url="about:blank", activate=False):
    with _quiet():
        ensure_daemon()
    try:
        tab = Tab(url)
    except Exception:
        for tab_id in [t for t, tab in TABS.items() if tab.info().get("closed") or tab.info()["url"] == "about:blank"]:
            TABS.pop(tab_id).close()
        raise
    if activate:
        cdp("Target.activateTarget", targetId=tab.browser.target)
    return tab.info()


def adopt(browser):
    """Register a tab opened by jev_run so the primitive tools can continue on it."""
    return Tab("about:blank", browser=browser).info()


def tabs_close(tab_id):
    tab = get_tab(tab_id)
    tab.close()
    TABS.pop(tab_id, None)
    return {"closed": tab_id}


def close_session_tabs():
    """On exit keep pages the user may still read; close only empty tabs."""
    for tab in list(TABS.values()):
        url = tab.info().get("url") or ""
        if url in {"", "about:blank", "chrome://newtab/"}:
            tab.close()
        unregister_session(tab.session)


# ---------- events: console, network, dialogs ----------

# Every jev server (one per Claude session) shares one Browser Harness daemon, and drain_events() empties its
# buffer for everyone. Events for another server's tab are relayed through ~/.jev/events/<session>.jsonl:
# each server registers its sessions by creating that file and reads it back on every pump.
EVENTS_DIR = Path(os.environ.get("JEV_EVENTS_DIR", "~/.jev/events")).expanduser()
RELAYED = ("Runtime.consoleAPICalled", "Runtime.exceptionThrown", "Log.entryAdded", "Network.requestWillBeSent",
           "Network.responseReceived", "Network.loadingFailed", "Page.javascriptDialogOpening",
           "Page.javascriptDialogClosed")


def _spool(session):
    return EVENTS_DIR / f"{re.sub(r'[^A-Za-z0-9]', '', session or '')}.jsonl"


def register_session(session):
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    _spool(session).touch()


def unregister_session(session):
    _spool(session).unlink(missing_ok=True)


def _relay(event):
    path = _spool(event.get("session_id"))
    if event.get("method") not in RELAYED or not path.exists():
        return
    with open(path, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        f.write(json.dumps(event) + "\n")


def _collect(session):
    try:
        with open(_spool(session), "r+") as f:
            fcntl.flock(f, fcntl.LOCK_EX)
            lines = f.read().splitlines()
            f.seek(0)
            f.truncate()
    except FileNotFoundError:
        return []
    return [json.loads(line) for line in lines if line.strip()]


def pump():
    try:
        events = drain_events()
    except Exception:
        events = []
    by_session = {tab.session: tab for tab in TABS.values()}
    for event in events:
        if event.get("session_id") not in by_session:
            _relay(event)
    for session in by_session:
        events.extend(_collect(session))
    for event in events:
        tab = by_session.get(event.get("session_id"))
        if not tab:
            continue
        method, p = event["method"], event.get("params", {})
        if method == "Runtime.consoleAPICalled":
            text = " ".join(_arg_text(a) for a in p.get("args", []))
            frame = (p.get("stackTrace") or {}).get("callFrames") or [{}]
            tab.console.append({"level": p.get("type"), "text": text, "source": _where(frame[0]), "ts": p.get("timestamp")})
        elif method == "Runtime.exceptionThrown":
            d = p.get("exceptionDetails", {})
            text = d.get("exception", {}).get("description") or d.get("text")
            tab.console.append({"level": "exception", "text": text, "source": _where(d), "ts": p.get("timestamp")})
        elif method == "Log.entryAdded":
            e = p.get("entry", {})
            tab.console.append({"level": e.get("level"), "text": e.get("text"), "source": e.get("url"), "ts": e.get("timestamp")})
        elif method == "Network.requestWillBeSent":
            r = p.get("request", {})
            if r.get("url", "").startswith(("chrome-extension://", "data:")):
                continue
            tab.network[p["requestId"]] = {"method": r.get("method"), "url": r.get("url"), "type": p.get("type"),
                                           "status": None, "ts": p.get("timestamp")}
            if len(tab.network) > LOG_LIMIT:
                tab.network.pop(next(iter(tab.network)))
        elif method == "Network.responseReceived" and p.get("requestId") in tab.network:
            res = p.get("response", {})
            tab.network[p["requestId"]].update(status=res.get("status"), mime=res.get("mimeType"))
        elif method == "Network.loadingFailed" and p.get("requestId") in tab.network:
            tab.network[p["requestId"]].update(status="failed", error=p.get("errorText"))
        elif method == "Page.javascriptDialogOpening":
            tab.dialog = {"type": p.get("type"), "message": p.get("message"), "default": p.get("defaultPrompt")}
        elif method == "Page.javascriptDialogClosed":
            tab.dialog = None


def _arg_text(arg):
    if "value" in arg:
        return arg["value"] if isinstance(arg["value"], str) else json.dumps(arg["value"])
    return arg.get("description") or arg.get("type", "")


def _where(frame):
    url = frame.get("url") or ""
    return f"{url}:{frame.get('lineNumber', 0) + 1}" if url else None


def start_pump_thread():
    def loop():
        while True:
            time.sleep(0.5)
            if TABS:
                with LOCK:
                    pump()
    threading.Thread(target=loop, daemon=True).start()


def read_console_messages(tab_id, pattern=None, only_errors=False, limit=100, clear=False):
    tab = get_tab(tab_id)
    rx = re.compile(pattern, re.I) if pattern else None
    items = [m for m in tab.console
             if (not only_errors or m["level"] in {"error", "exception", "assert"})
             and (not rx or rx.search(m["text"] or ""))]
    if clear:
        tab.console.clear()
    return {"messages": items[-limit:], "matched": len(items), "total_buffered": len(tab.console)}


def read_network_requests(tab_id, url_pattern=None, only_failed=False, limit=100, clear=False):
    tab = get_tab(tab_id)
    rx = re.compile(url_pattern, re.I) if url_pattern else None
    items = [r for r in tab.network.values()
             if (not rx or rx.search(r["url"] or ""))
             and (not only_failed or r["status"] == "failed" or (isinstance(r["status"], int) and r["status"] >= 400))]
    if clear:
        tab.network.clear()
    return {"requests": items[-limit:], "matched": len(items)}


def handle_dialog(tab_id, accept=True, prompt_text=None):
    tab = get_tab(tab_id)
    if not tab.dialog:
        return {"note": "No dialog is open."}
    params = {"accept": accept}
    if prompt_text is not None:
        params["promptText"] = prompt_text
    tab.browser.call("Page.handleJavaScriptDialog", **params)
    handled, tab.dialog = tab.dialog, None
    return {"handled": handled, "accepted": accept}


# ---------- reading ----------

GATE_JS = """(() => {
  const vis = e => e && e.checkVisibility && e.checkVisibility({checkOpacity:true, checkVisibilityCSS:true});
  const pw = [...document.querySelectorAll('input[type=password]')].some(vis);
  const cap = [...document.querySelectorAll('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare"],.g-recaptcha,.h-captcha,.cf-turnstile,#captcha')].some(vis);
  const files = [...document.querySelectorAll('input[type=file]')].map((e,i) => ({index:i, name:e.name||e.id||'', accept:e.accept||'', multiple:e.multiple}));
  return {login: pw, captcha: cap, file_inputs: files};
})()"""


def elements(page):
    """Group Jev's per-action entries into one entry per observed element, keyed by ref."""
    out = {}
    for a in page["actions"]:
        if a["kind"] not in {"click", "fill", "select"} or type(a.get("node")) is not int:
            continue
        ref = f"n{a['node']}"
        e = out.setdefault(ref, {"ref": ref, "role": a.get("role"), "label": a["label"], "kinds": [],
                                 "value": a.get("value") or "", "node": a["node"], "options": []})
        if a["kind"] == "select":
            e["label"] = a["label"].split(" → ")[0]
            e["value"] = a.get("current_value", "")
            e["options"].append(a["label"].split(" → ", 1)[-1])
        elif a["kind"] == "click" and a["label"].startswith("Open "):
            continue
        if a["kind"] not in e["kinds"]:
            e["kinds"].append(a["kind"])
    return out


def read_page(tab_id, include_text=True):
    tab = get_tab(tab_id)
    page = tab.observe()
    gate = tab.evaluate(GATE_JS)
    lines = []
    for e in elements(page).values():
        extra = f" = {e['value']!r}" if e["value"] else ""
        opts = f" options: {e['options']}" if e["options"] else ""
        lines.append(f"[{e['ref']}] {e['role']} {e['label']!r}{extra}{opts}")
    result = {"tab_id": tab.id, "url": page["url"], "title": page.get("title"),
              "scroll": page.get("scroll"), "elements": lines,
              "offscreen_or_omitted": page.get("omitted_actions")}
    if include_text:
        result["visible_text"] = page["text"]
    if gate["file_inputs"]:
        result["file_inputs"] = gate["file_inputs"]
    remembered = mem.known(page["url"])
    if remembered["actions_here"] or remembered["workflows"]:
        result["memory"] = {"actions_here": remembered["actions_here"], "workflows": list(remembered["workflows"]),
                            "use": "act(intent) / run_workflow(name) instead of finding these again"}
    if gate["login"] or gate["captcha"]:
        result["needs_user"] = ("captcha" if gate["captcha"] else "login") + \
            ": STOP and ask the user to complete it in Chrome, then continue."
    return result


def get_page_text(tab_id, offset=0, limit=20000):
    tab = get_tab(tab_id)
    text = tab.evaluate("document.body ? document.body.innerText : ''") or ""
    return {"url": tab.info()["url"], "text": text[offset:offset + limit], "total_chars": len(text),
            "next_offset": offset + limit if offset + limit < len(text) else None}


def find(tab_id, query):
    tab = get_tab(tab_id)
    page = tab.observe()
    words = [w for w in re.split(r"\W+", query.lower()) if w]
    scored = []
    for e in elements(page).values():
        hay = f"{e['role']} {e['label']} {e['value']} {' '.join(e['options'])}".lower()
        score = sum(w in hay for w in words)
        if score:
            scored.append((score, e))
    scored.sort(key=lambda s: -s[0])
    return {"matches": [{k: e[k] for k in ("ref", "role", "label", "value", "kinds")} for _, e in scored[:20]],
            "note": "Only on-screen elements are indexed; scroll and retry if nothing matches."}


# ---------- acting ----------

LOCATE_JS = """(node => {
  const e = window.__jevFast?.nodes.get(node);
  if (!e?.isConnected) return {error: 'gone'};
  let r = e.getBoundingClientRect();
  if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
    e.scrollIntoView({block: 'center', inline: 'center'}); r = e.getBoundingClientRect();
  }
  const x = r.x + r.width / 2, y = r.y + r.height / 2;
  if (!r.width || !r.height) return {error: 'hidden'};
  const hit = document.elementFromPoint(x, y);
  if (hit && !e.contains(hit) && !hit.contains(e)) return {error: 'covered', by: (hit.innerText || hit.tagName).slice(0, 60)};
  return {x, y, box: {x: r.x, y: r.y, width: r.width, height: r.height},
          tag: e.tagName, type: e.type || null, checked: e.checked ?? null};
})"""


def resolve(tab, ref):
    """Map a ref to fresh viewport coordinates, re-observing once if the page re-rendered."""
    if not re.fullmatch(r"n\d+", ref or ""):
        raise ToolError(f"Invalid ref {ref!r}. Use a ref like 'n12' from read_page or find.")
    if tab.page is None:
        tab.observe()
    known = elements(tab.page).get(ref)
    spot = tab.evaluate(f"{LOCATE_JS}({int(ref[1:])})")
    if spot.get("error") == "gone" and known:
        same = [e for e in elements(tab.observe()).values() if (e["role"], e["label"]) == (known["role"], known["label"])]
        if len(same) == 1:
            ref, known = same[0]["ref"], same[0]
            spot = tab.evaluate(f"{LOCATE_JS}({int(ref[1:])})")
    if spot.get("error"):
        hint = f" by {spot['by']!r}" if spot.get("by") else ""
        raise ToolError(f"Element {ref} is {spot['error']}{hint}. Call read_page again.")
    return ref, known, spot


CURSOR_JS = """(() => {
  if (window.__jevCursor) return;
  let el, ring;
  window.__jevCursor = (x, y, button) => {
    const root = document.body || document.documentElement;
    if (!root) return;
    if (!el?.isConnected) {
      el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;' +
        'pointer-events:none;transition:transform .05s linear;will-change:transform';
      el.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M2 2l7 18 2.6-7.4L19 10z" ' +
        'fill="#d97757" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
      ring = document.createElement('div');
      ring.style.cssText = 'position:fixed;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;' +
        'border:2px solid #d97757;z-index:2147483647;pointer-events:none;opacity:0';
      root.append(el, ring);
    }
    el.style.transform = `translate(${x - 2}px, ${y - 2}px)`;
    if (button && button !== 'none') {
      ring.style.left = x + 'px'; ring.style.top = y + 'px';
      ring.animate([{opacity: .9, transform: 'scale(.4)'}, {opacity: 0, transform: 'scale(1.4)'}], {duration: 400});
    }
  };
})()"""


class HumanCursor:
    """Human-like mouse paths from ghost-cursor (Node helper in cursor/cursor.js). Falls back to a straight jump."""

    def __init__(self):
        self.proc = None
        # speed (default): one instant move per action. natural: ghost-cursor human-like paths.
        self.enabled = os.environ.get("JEV_CURSOR_MODE", "speed").lower() == "natural"
        self.speed = float(os.environ.get("JEV_CURSOR_SPEED", "0")) or None

    def _node(self):
        found = shutil.which("node")
        if not found:
            candidates = sorted(Path.home().glob(".nvm/versions/node/*/bin/node")) + \
                [Path(p) for p in ("/opt/homebrew/bin/node", "/usr/local/bin/node") if Path(p).exists()]
            found = str(candidates[-1]) if candidates else None
        return found

    def plan(self, start, box):
        if not self.enabled:
            return None
        try:
            if self.proc is None or self.proc.poll() is not None:
                node = self._node()
                if not node:
                    self.enabled = False
                    return None
                self.proc = subprocess.Popen([node, str(CURSOR_HELPER)], stdin=subprocess.PIPE,
                                             stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1)
            self.proc.stdin.write(json.dumps({"from": start, "box": box, "speed": self.speed}) + "\n")
            out = json.loads(self.proc.stdout.readline())
            return None if "error" in out else out
        except Exception:
            self.enabled = False
            return None


CURSOR = HumanCursor()
MAX_MOVE_S = float(os.environ.get("JEV_CURSOR_MAX_MS", "600")) / 1000  # cap one movement


def mouse(tab, x, y, button="left", clicks=1, modifiers=0, box=None):
    """Synthetic CDP input: goes only to this tab and never moves the user's OS cursor.
    Movement follows a ghost-cursor path from the tab's last pointer position; the page draws its own
    agent cursor along it (pointer-events: none, so it never blocks clicks)."""
    box = box or {"x": x - 0.5, "y": y - 0.5, "width": 1, "height": 1}
    route = CURSOR.plan(tab.pointer, box)
    points = route["points"] if route else [[x, y, 0]]
    if route:
        x, y = route["end"]["x"], route["end"]["y"]
    scale = min(1.0, MAX_MOVE_S * 1000 / max(points[-1][2], 1))
    started = time.monotonic()
    for i, (px, py, t) in enumerate(points):
        delay = t * scale / 1000 - (time.monotonic() - started)
        if delay > 0:
            time.sleep(delay)
        tab.call("Input.dispatchMouseEvent", type="mouseMoved", x=px, y=py, modifiers=modifiers)
        if i % 3 == 0 or i == len(points) - 1:
            try:
                tab.call("Runtime.evaluate", expression=f"window.__jevCursor?.({px}, {py})")
            except Exception:
                pass
    tab.pointer = {"x": x, "y": y}
    if button == "none":
        return
    try:
        tab.call("Runtime.evaluate", expression=f"window.__jevCursor?.({x}, {y}, {json.dumps(button)})")
    except Exception:
        pass
    for n in range(1, clicks + 1):
        for kind in ("mousePressed", "mouseReleased"):
            try:
                cdp("Input.dispatchMouseEvent", session_id=tab.session, _response_timeout=2, type=kind, x=x, y=y,
                    button=button, clickCount=n, modifiers=modifiers)
            except Exception:
                # A click that opens alert/confirm blocks until the dialog closes; report it instead of failing.
                # Another jev server may drain the event first and relay it, so give that a moment.
                for _ in range(15):
                    pump()
                    if tab.dialog:
                        return
                    time.sleep(0.1)
                raise


MODS = {"alt": 1, "option": 1, "ctrl": 2, "control": 2, "cmd": 4, "meta": 4, "command": 4, "shift": 8}
NAMED = {"enter": ("Enter", 13, "\r"), "return": ("Enter", 13, "\r"), "tab": ("Tab", 9, "\t"),
         "escape": ("Escape", 27, None), "esc": ("Escape", 27, None), "backspace": ("Backspace", 8, None),
         "delete": ("Delete", 46, None), "space": (" ", 32, " "), "arrowup": ("ArrowUp", 38, None),
         "arrowdown": ("ArrowDown", 40, None), "arrowleft": ("ArrowLeft", 37, None),
         "arrowright": ("ArrowRight", 39, None), "up": ("ArrowUp", 38, None), "down": ("ArrowDown", 40, None),
         "left": ("ArrowLeft", 37, None), "right": ("ArrowRight", 39, None), "home": ("Home", 36, None),
         "end": ("End", 35, None), "pageup": ("PageUp", 33, None), "pagedown": ("PageDown", 34, None)}
EDIT_COMMANDS = {"a": "selectAll", "c": "copy", "x": "cut", "v": "paste", "z": "undo"}


def press(tab, combo):
    parts = combo.replace(" ", "").split("+")
    mods = sum(MODS.get(p.lower(), 0) for p in parts[:-1])
    key = parts[-1]
    if key.lower() in NAMED:
        name, code, text = NAMED[key.lower()]
        dom_code = {" ": "Space"}.get(name, name)
    elif len(key) == 1:
        name, code, text = key, ord(key.upper()), key
        dom_code = f"Key{key.upper()}" if key.isalpha() else f"Digit{key}" if key.isdigit() else ""
    elif re.fullmatch(r"f\d{1,2}", key.lower()):
        name, code, text, dom_code = key.upper(), 111 + int(key[1:]), None, key.upper()
    else:
        raise ToolError(f"Unknown key {key!r}")
    down = {"key": name, "code": dom_code, "windowsVirtualKeyCode": code, "modifiers": mods}
    if text and not mods & 6:
        down.update(type="keyDown", text=text)
    else:
        down["type"] = "rawKeyDown"
        if mods & (4 if sys.platform == "darwin" else 2) and key.lower() in EDIT_COMMANDS:
            down["commands"] = [EDIT_COMMANDS[key.lower()]]
    tab.call("Input.dispatchKeyEvent", **down)
    tab.call("Input.dispatchKeyEvent", type="keyUp", key=name, code=dom_code, windowsVirtualKeyCode=code, modifiers=mods)


def computer(tab_id, action, ref=None, coordinate=None, text=None, direction="down", amount=3,
             duration=1.0, region=None, save_path=None, intent=None):
    """Returns (summary dict, optional image bytes). intent: remember (or recall) the target under this name."""
    tab = get_tab(tab_id)
    pump()
    url_before = tab.info()["url"]
    if intent and not ref and not coordinate and action not in {"screenshot", "zoom", "wait", "key"}:
        ref, _ = recall(tab, intent, text if action == "type" else None)
    if action == "screenshot":
        data = tab.screenshot()
        result = {"tab_id": tab.id, "url": tab.info()["url"]}
        if save_path:
            result["saved"] = _save(save_path, tab.screenshot(fmt="png"))
        return result, data
    if action == "zoom":
        if not region or len(region) != 4:
            raise ToolError("zoom needs region [x0, y0, x1, y1] in viewport pixels.")
        x0, y0, x1, y1 = region
        return {"region": region}, tab.screenshot(clip={"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0, "scale": 2})
    if action == "wait":
        time.sleep(max(0.0, min(float(duration), 10.0)))
        return {"waited_s": min(float(duration), 10.0)}, None
    if action == "key":
        if not text:
            raise ToolError("key needs text, e.g. 'Enter', 'cmd+a', 'shift+Tab'. Separate several with spaces.")
        for combo in text.split():
            press(tab, combo)
        return _after(tab, {"pressed": text})
    if action == "type":
        if text is None:
            raise ToolError("type needs text.")
        known = None
        if ref:
            ref, known, spot = resolve(tab, ref)
            mouse(tab, spot["x"], spot["y"], box=spot["box"])
        tab.call("Input.insertText", text=text)
        learn(tab, url_before, intent, known, "type")
        return _after(tab, {"typed_chars": len(text), "into": ref or "focused element"})
    if action == "scroll":
        if ref:
            ref, _, spot = resolve(tab, ref)
            return _after(tab, {"scrolled_into_view": ref})
        x, y = coordinate or (560, 390)
        step = 120 * int(amount)
        dx, dy = {"down": (0, step), "up": (0, -step), "right": (step, 0), "left": (-step, 0)}[direction]
        tab.call("Input.dispatchMouseEvent", type="mouseWheel", x=x, y=y, deltaX=dx, deltaY=dy)
        time.sleep(0.15)
        return _after(tab, {"scrolled": direction, "amount": amount})
    clicks = {"left_click": ("left", 1), "click": ("left", 1), "double_click": ("left", 2),
              "triple_click": ("left", 3), "right_click": ("right", 1), "hover": ("none", 1)}
    if action not in clicks:
        raise ToolError(f"Unknown action {action!r}.")
    if ref:
        ref, known, spot = resolve(tab, ref)
        x, y, box = spot["x"], spot["y"], spot["box"]
    elif coordinate:
        x, y = coordinate
        known, box = None, None
    else:
        raise ToolError(f"{action} needs a ref (from read_page/find) or a coordinate [x, y].")
    button, count = clicks[action]
    mouse(tab, x, y, button, count, box=box)
    target = known["label"] if known else f"({x:.0f}, {y:.0f})"
    learned = learn(tab, url_before, intent, known, action)
    return _after(tab, {action: target, **({"learned": learned} if learned else {})})


def _after(tab, result):
    time.sleep(0.1)
    pump()
    tab.page = None
    tab.capture()
    result["url"] = tab.info()["url"]
    if tab.dialog:
        result["dialog_open"] = tab.dialog
    return result, None


def form_input(tab_id, ref=None, value=None, intent=None):
    tab = get_tab(tab_id)
    url_before = tab.info()["url"]
    if not ref:
        if not intent:
            raise ToolError("form_input needs a ref from read_page, or an intent it has learned.")
        ref, _ = recall(tab, intent, value)
    ref, known, spot = resolve(tab, ref)
    node = int(ref[1:])
    if spot["tag"] == "SELECT":
        chosen = tab.evaluate(f"""((node, want) => {{
          const e = window.__jevFast.nodes.get(node);
          const o = [...e.options].find(o => o.value === want || o.label.trim() === want || o.text.trim() === want);
          if (!o || o.disabled) return null;
          e.value = o.value;
          e.dispatchEvent(new Event('input', {{bubbles: true}}));
          e.dispatchEvent(new Event('change', {{bubbles: true}}));
          return o.label;
        }})({node}, {json.dumps(str(value))})""")
        if chosen is None:
            raise ToolError(f"No enabled option {value!r} in {ref}. Options: {known and known['options']}")
        learn(tab, url_before, intent, known, "select")
        return _after(tab, {"selected": chosen, "ref": ref})
    if spot["type"] in {"checkbox", "radio"}:
        want = value if isinstance(value, bool) else str(value).lower() in {"true", "1", "yes", "on", "checked"}
        if bool(spot["checked"]) != want:
            mouse(tab, spot["x"], spot["y"], box=spot["box"])
        learn(tab, url_before, intent, known, "check")
        return _after(tab, {"checked": want, "ref": ref})
    mouse(tab, spot["x"], spot["y"], box=spot["box"])
    press(tab, "cmd+a" if sys.platform == "darwin" else "ctrl+a")
    press(tab, "Delete")
    tab.call("Input.insertText", text=str(value))
    learn(tab, url_before, intent, known, "fill")
    return _after(tab, {"filled": ref, "label": known and known["label"], "chars": len(str(value))})


def javascript_tool(tab_id, code):
    tab = get_tab(tab_id)
    body = code if re.search(r"\breturn\b", code) else f"return ({code});"
    value = tab.evaluate(f"(async () => {{ {body} }})()", await_promise=True)
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    tab.page = None
    return {"result": (text or "")[:20000]}


def apply_viewport(tab, size=None):
    """Fill the real Chrome window by default. Jev's Browser pins 1120x780 for jev_run; drop that here.
    JEV_VIEWPORT=WIDTHxHEIGHT (or an explicit size) pins a fixed viewport instead."""
    size = size or os.environ.get("JEV_VIEWPORT", "")
    match = re.fullmatch(r"\s*(\d+)\s*[x×,]\s*(\d+)\s*", size or "")
    if match:
        width, height = map(int, match.groups())
        tab.call("Emulation.setDeviceMetricsOverride", width=width, height=height, deviceScaleFactor=1, mobile=False)
        return [width, height]
    tab.call("Emulation.clearDeviceMetricsOverride")
    return tab.evaluate("[innerWidth, innerHeight]")


def resize_window(tab_id, width=0, height=0):
    tab = get_tab(tab_id)
    viewport = apply_viewport(tab, f"{int(width)}x{int(height)}" if width and height else "window")
    tab.page = None
    return {"viewport": viewport, "fits_window": not (width and height)}


def file_upload(tab_id, paths, input_index=0):
    tab = get_tab(tab_id)
    files, total = [], 0
    for raw in paths:
        p = Path(raw).expanduser().resolve()
        if not p.is_file():
            raise ToolError(f"Not a file: {p}")
        if CREDENTIAL_NAME.search(p.name) or CREDENTIAL_DIRS & set(p.parts):
            raise ToolError(f"Refusing to upload {p.name}: it looks like a credentials file.")
        st = p.stat()
        if st.st_nlink > 1:
            raise ToolError(f"Refusing {p}: it has multiple hard links. Copy it and upload the copy.")
        total += st.st_size
        files.append(str(p))
    if total > UPLOAD_LIMIT:
        raise ToolError(f"Upload is {total / 1e6:.1f} MB; the limit is 10 MB per upload.")
    handle = tab.call("Runtime.evaluate",
                      expression=f"document.querySelectorAll('input[type=file]')[{int(input_index)}] || null")
    object_id = handle.get("result", {}).get("objectId")
    if not object_id:
        raise ToolError(f"No file input #{input_index} on the page. read_page lists file_inputs.")
    tab.call("DOM.setFileInputFiles", files=files, objectId=object_id)
    return _after(tab, {"uploaded": [Path(f).name for f in files], "bytes": total})[0]


# ---------- memory: learned actions and workflows ----------

SYNONYMS = {"cart": {"basket", "bag", "trolley"}, "basket": {"cart", "bag"}, "bag": {"cart", "basket"},
            "buy": {"purchase", "order"}, "search": {"find", "query"}, "sign": {"log"}, "log": {"sign"},
            "next": {"more", "forward"}, "checkout": {"pay", "proceed"}}
CLICKABLE = {"button", "link", "menuitem", "tab", "option", "checkbox", "radio", "switch"}
FILLABLE = {"textbox", "searchbox", "combobox", "spinbutton"}


def _words(text):
    return set(re.findall(r"\w+", (text or "").lower()))


def _expand(words):
    return set(words).union(*(SYNONYMS.get(w, set()) for w in words)) if words else set()


ZONE_JS = """(nodes => nodes.map(n => {
  const e = window.__jevFast?.nodes.get(n);
  if (!e) return 'gone';
  const side = /(^|[-_ ])(rec|recs|recommend\\w*|related|similar|upsell|cross-?sell|carousel|also|sponsored|ads?)([-_ ]|$)/i;
  for (let a = e; a && a !== document.body; a = a.parentElement) {
    if (a.matches('aside, nav, footer, header, [role=complementary], [role=navigation], [role=contentinfo], [role=banner]')) return 'side';
    if (side.test(a.id || '') || side.test(typeof a.className === 'string' ? a.className : '')) return 'side';
    const h = a.querySelector(':scope > h2, :scope > h3');
    if (h && /recommend|related|similar|also (bought|like)|you may/i.test(h.textContent)) return 'side';
  }
  return 'main';
}))"""

TWIN_JS = """(label => [...document.querySelectorAll('button, a, input[type=submit], [role=button]')].some(e =>
  (e.disabled || e.getAttribute('aria-disabled') === 'true') &&
  (e.innerText || e.value || e.getAttribute('aria-label') || '').trim().toLowerCase() === label.toLowerCase() &&
  !e.closest('aside, nav, footer, header, [role=complementary]')))"""


def _zones(tab, found):
    zones = tab.evaluate(f"{ZONE_JS}({json.dumps([e['node'] for e in found])})") or []
    return {e["ref"]: z for e, z in zip(found, zones)}


def _pick(tab, found, entry=None):
    """Among look-alikes prefer the learned zone (else main content), then the learned position in it."""
    if not found:
        return None
    zones = _zones(tab, found)
    want = (entry or {}).get("zone") or "main"
    pool = [e for e in found if zones.get(e["ref"]) == want]
    if not pool:
        return None  # the learned one isn't there (yet, e.g. still disabled): never fall back to a look-alike
    return pool[min((entry or {}).get("nth", 0), len(pool) - 1)]["ref"]


def _nth(page, known):
    """Position among elements with the same role and label, to tell a main button from look-alike decoys."""
    same = [e["ref"] for e in elements(page).values() if (e["role"], e["label"]) == (known["role"], known["label"])]
    return same.index(known["ref"]) if known.get("ref") in same else 0


def learn(tab, url, intent, known, kind):
    """Short-term: append to the tab's trail. Long-term: remember intent -> element for this page type."""
    target = {"role": known["role"], "label": known["label"]} if known else None
    tab.trail.append({"step": len(tab.trail), "do": kind, "target": target, "intent": intent, "url": url})
    if intent and target and mem.ENABLED:
        zone, nth = "main", 0
        if tab.page:
            same = [e for e in elements(tab.page).values() if (e["role"], e["label"]) == (known["role"], known["label"])]
            zones = _zones(tab, same) if len(same) > 1 else {}
            zone = zones.get(known.get("ref"), "main")
            in_zone = [e["ref"] for e in same if zones.get(e["ref"], "main") == zone]
            nth = in_zone.index(known["ref"]) if known.get("ref") in in_zone else 0
        return mem.remember(url, intent, {**target, "kind": kind, "nth": nth, "zone": zone})
    return None


def match_element(tab, page, entry):
    """Find the remembered element again: exact role+label (nth among look-alikes), case-insensitive,
    shared label words, intent words, then word overlap."""
    els = list(elements(page).values())
    role, label = entry.get("role"), entry.get("label", "")
    for test in (lambda e: e["role"] == role and e["label"] == label,
                 lambda e: e["role"] == role and e["label"].lower() == label.lower(),
                 lambda e: e["label"].lower() == label.lower()):
        found = [e for e in els if test(e)]
        if found:
            return _pick(tab, found, entry)
    for words in (set(entry.get("core") or []), _words(entry.get("intent"))):
        if len(words) >= 2:
            found = [e for e in els if e["role"] == role and words <= _expand(_words(e["label"]))]
            if found:
                return _pick(tab, found, entry)
    want = _words(label)
    scored = sorted(((len(want & _words(e["label"])) / max(len(want | _words(e["label"])), 1), e)
                     for e in els if e["role"] == role), key=lambda s: -s[0])
    if scored and scored[0][0] >= 0.6:
        return scored[0][1]["ref"]
    return None


def guess(tab, page, intent, value=None):
    """Cold start: the element whose label contains every word of the intent (synonyms allowed).
    Look-alikes with the same label resolve to the first in page order (main content before recommendations)."""
    words = _words(intent) - {"the", "a", "an", "to", "on", "in", "of", "button", "link", "field", "box"}
    if not words:
        return None
    roles = FILLABLE if value is not None else CLICKABLE
    found = [e for e in elements(page).values() if e["role"] in roles and words <= _expand(_words(e["label"]))]
    if not found:
        return None
    zones = _zones(tab, found)
    main = [e for e in found if zones.get(e["ref"]) == "main"]
    if not main and tab.evaluate(f"{TWIN_JS}({json.dumps(found[0]['label'])})"):
        return None  # the real control is still disabled in main content: wait rather than click a decoy
    pool = main or found
    if len({e["label"] for e in pool}) > 1:
        return {"ambiguous": sorted({e["label"] for e in pool})[:6]}
    pick = pool[0]
    return {"ref": pick["ref"], "role": pick["role"], "label": pick["label"], "nth": 0,
            "zone": zones.get(pick["ref"], "main"), "lookalikes": len(found)}


def _settle(tab, attempt, timeout=2.0):
    """Retry briefly: late-loading or still-disabled controls appear within a moment."""
    deadline = time.monotonic() + timeout
    while True:
        found = attempt(tab.observe())
        if found or time.monotonic() > deadline:
            return found
        time.sleep(0.12)


def recall(tab, intent, value=None):
    """Ref for intent: from memory, or a confident guess that is then remembered."""
    if not mem.ENABLED:
        raise ToolError("Memory is off (JEV_MEMORY=off). Use read_page and refs.")
    url = tab.info()["url"]
    entry = mem.lookup(url, intent)
    if entry:
        ref = _settle(tab, lambda page: match_element(tab, page, entry))
        if ref:
            mem.hit(url, entry["intent"], entry["page"])
            return ref, "memory"
    found = _settle(tab, lambda page: guess(tab, page, intent, value), timeout=3.0)
    if found and found.get("ref"):
        kind = "fill" if found["role"] in FILLABLE else "left_click"
        mem.remember(url, intent, {"role": found["role"], "label": found["label"], "kind": kind, "nth": 0,
                                   "zone": found["zone"]})
        return found["ref"], "guessed"
    known = mem.known(url)
    detail = f" Candidates: {found['ambiguous']}." if found else ""
    raise ToolError(f"Can't place {intent!r} on this page.{detail} Known here: {known['actions_here']}. "
                    "read_page, then computer/form_input with a ref and intent to teach it.")


def _act_here(tab, intent, value):
    ref, how = recall(tab, intent, value)
    known = elements(tab.page).get(ref, {})
    entry = mem.lookup(tab.info()["url"], intent) or {}
    kind = entry.get("kind") or ("fill" if known.get("role") in FILLABLE else "left_click")
    if known.get("options") or kind == "select":
        form_input(tab.id, ref=ref, value=value)
    elif kind in {"fill", "check"} or (value is not None and known.get("role") in FILLABLE):
        form_input(tab.id, ref=ref, value=value)
    elif kind == "type":
        computer(tab.id, "type", ref=ref, text=str(value or ""))
    else:
        action = kind if kind in {"double_click", "right_click", "hover", "triple_click"} else "left_click"
        computer(tab.id, action, ref=ref)
    return {"did": known.get("label"), "role": known.get("role"), "how": how}


def act(intent, tab_id=None, value=None, url=None, urls=None, then=None):
    """Learned (or confidently guessed) actions in one call. urls repeats on each page; then chains more
    steps on each page, e.g. then=[{"intent": "size", "value": "M"}, {"intent": "add to basket"}]."""
    if tab_id is None:
        tab_id = next(reversed(TABS), None) or tabs_create("about:blank")["tab_id"]
    tab = get_tab(tab_id)
    steps = [{"intent": intent, "value": value}] + list(then or [])
    results = []
    for page_url in (urls or [url] if (urls or url) else [None]):
        row = {"url": page_url or tab.info()["url"]}
        try:
            if page_url:
                tab.navigate(page_url)
            row["steps"] = [_act_here(tab, s["intent"], s.get("value")) for s in steps]
            if tab.dialog:
                row["dialog_open"] = tab.dialog
        except ToolError as exc:
            row["error"] = str(exc)
        tab.page = None
        row["visible_text"] = (tab.evaluate("document.body ? document.body.innerText : ''") or "")[:240]
        results.append(row)
    ok = sum("error" not in r for r in results)
    return {"tab_id": tab.id, "ok": ok, "of": len(results), "results": results}


def run_workflow(tab_id, name, params=None):
    tab = get_tab(tab_id)
    flow, site = mem.workflow(tab.info()["url"], name)
    if not flow:
        raise ToolError(f"No workflow {name!r} for {site}. site_memory lists what exists.")
    params = params or {}
    missing = [p for p in flow.get("params", []) if p not in params]
    if missing:
        raise ToolError(f"Workflow {name!r} needs params: {missing}")

    def fill(v):
        return re.sub(r"\{\{(\w+)\}\}", lambda m: str(params[m.group(1)]), v) if isinstance(v, str) else v

    done = []
    for i, step in enumerate(flow["steps"]):
        try:
            if "navigate" in step:
                tab.navigate(fill(step["navigate"]))
                done.append({"step": i, "navigate": tab.info()["url"]})
                continue
            out = act(step["intent"], tab_id=tab_id, value=fill(step.get("value")))
            if out["ok"] != 1:
                raise ToolError(out["results"][0].get("error", "step failed"))
            tab.wait_loaded(timeout=8)
            done.append({"step": i, "intent": step["intent"], "url": tab.info()["url"]})
        except ToolError as exc:
            return {"workflow": name, "completed": i, "of": len(flow["steps"]), "stopped": str(exc),
                    "remaining": flow["steps"][i:], "done": done,
                    "hint": "Finish the remaining steps by hand with intent= so memory heals, then re-save if needed."}
        if tab.dialog:
            return {"workflow": name, "completed": i + 1, "of": len(flow["steps"]), "dialog_open": tab.dialog, "done": done}
    return {"workflow": name, "completed": len(flow["steps"]), "of": len(flow["steps"]), "done": done,
            "url": tab.info()["url"]}


def site_memory(tab_id=None, url=None, trail=True):
    url = url or get_tab(tab_id).info()["url"]
    out = mem.known(url)
    if tab_id and trail:
        out["recent_actions_this_session"] = list(get_tab(tab_id).trail)[-30:]
    return out


# ---------- GIF recording ----------

def gif_creator(tab_id, action, filename=None):
    tab = get_tab(tab_id)
    if action == "start_recording":
        tab.frames = []
        tab.capture()

        def tick(tab=tab):
            while tab.frames is not None:
                time.sleep(1 / GIF_FPS)
                with LOCK:
                    if tab.frames is not None and not tab.dialog:
                        tab.capture()
        threading.Thread(target=tick, daemon=True).start()
        return {"recording": True}
    if action == "stop_recording":
        frames, tab.frames = tab.frames or [], None
        tab.last_frames = frames
        return {"recording": False, "frames": len(frames)}
    if action == "export":
        frames = getattr(tab, "last_frames", None) or tab.frames or []
        if not frames:
            raise ToolError("Nothing recorded. start_recording, act, stop_recording, then export.")
        from PIL import Image
        images = [Image.open(io.BytesIO(f)).convert("RGB") for f in frames]
        images = [im.resize((im.width * 2 // 3, im.height * 2 // 3)) for im in images]
        out = io.BytesIO()
        images[0].save(out, format="GIF", save_all=True, append_images=images[1:],
                       duration=int(1000 / GIF_FPS), loop=0, optimize=True)
        path = _save(filename or f"jev-recording-{time.strftime('%Y%m%d-%H%M%S')}.gif", out.getvalue())
        return {"saved": path, "frames": len(images),
                "warning": "The GIF shows everything visible in the tab, including account details."}
    raise ToolError("action must be start_recording, stop_recording or export.")


def _save(name, data):
    path = Path(name).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return str(path)
