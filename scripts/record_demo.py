"""Record docs/demo-v3.gif: jev_run speed, step-by-step speed mode, then human mode. Needs ffmpeg.

    uv run --project "$JEV_HOME" --env-file "$JEV_HOME/.env" --with pillow python scripts/record_demo.py

Part 1 makes one paid jev_run (TypeSafe + text model). Review every frame before publishing:
password-manager and autofill pop-ups render inside the page.
"""

import base64
import io
import json
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))
import browser_tools as bt  # noqa: E402
from browser_harness.helpers import cdp  # noqa: E402

FPS = 10
VIEWPORT = (1120, 780)  # Jev's own viewport, so every part has the same frame size
OUT_WIDTH = 960
bt.GIF_FPS = FPS
SPEED_COLOR, HUMAN_COLOR, ACCENT = "#f5b942", "#7fd1a8", "#d97757"
FONT = "/System/Library/Fonts/SFNS.ttf"


def font(size):
    return ImageFont.truetype(FONT, size)


# ---------- frames drawn in Python (title cards, jev_run overlay) ----------

def title_card(title, sub, color, seconds=1.6):
    img = Image.new("RGB", VIEWPORT, "#111111")
    d = ImageDraw.Draw(img)
    d.text((VIEWPORT[0] / 2, VIEWPORT[1] / 2 - 40), title, font=font(72), fill=color, anchor="mm")
    for i, line in enumerate(sub.split("\n")):
        d.text((VIEWPORT[0] / 2, VIEWPORT[1] / 2 + 40 + i * 36), line, font=font(26), fill="#dddddd", anchor="mm")
    return [img] * int(seconds * FPS)


def stamp(img, seconds, caption, sub, color):
    """Live stopwatch top-right, caption bottom-left."""
    img = img.convert("RGB").resize(VIEWPORT)
    d = ImageDraw.Draw(img, "RGBA")
    clock = f"{seconds:4.1f} s"
    d.rounded_rectangle((VIEWPORT[0] - 250, 16, VIEWPORT[0] - 16, 104), 18, fill=(17, 17, 17, 235))
    d.text((VIEWPORT[0] - 133, 60), clock, font=font(58), fill=color, anchor="mm")
    w = max(d.textlength(caption, font=font(24)), d.textlength(sub, font=font(17))) + 36
    d.rounded_rectangle((16, VIEWPORT[1] - 96, 16 + w, VIEWPORT[1] - 16), 14, fill=(17, 17, 17, 235))
    d.text((34, VIEWPORT[1] - 70), caption, font=font(24), fill="white", anchor="lm")
    d.text((34, VIEWPORT[1] - 38), sub, font=font(17), fill="#bbbbbb", anchor="lm")
    return img


def jev_run_part():
    """Record jev_run's own tab by polling screenshots while the agent works."""
    from jev_ultrafast import Agent

    goal = "Find and open the Wikipedia article about Ada Lovelace."
    shots, done = [], threading.Event()
    with bt._quiet():
        agent = Agent("https://en.wikipedia.org/wiki/Main_Page", goal)
    session = agent.browser.session

    def capture():
        while not done.is_set():
            data = cdp("Page.captureScreenshot", session_id=session, format="jpeg", quality=80)["data"]
            shots.append((time.monotonic(), Image.open(io.BytesIO(base64.b64decode(data)))))
            time.sleep(1 / FPS)

    thread = threading.Thread(target=capture, daemon=True)
    started = time.monotonic()
    thread.start()
    with bt._quiet():
        for state in agent.run():
            pass
    elapsed = time.monotonic() - started
    time.sleep(0.6)
    done.set()
    thread.join()
    with bt._quiet():
        agent.close()

    ok = state["status"] == "done" and "Lovelace" in state["page"]["url"]
    sub = f'goal: "{goal}"'
    frames = []
    for at, img in shots:
        t = min(at - started, elapsed)
        if at - started < elapsed:
            frames.append(stamp(img, t, "jev_run: one goal, the agent does the rest", sub, SPEED_COLOR))
        else:
            label = f"Done in {elapsed:.1f} s · {len(state['history'])} actions" if ok else "Stopped"
            frames.append(stamp(img, elapsed, label, sub, SPEED_COLOR))
    frames += frames[-1:] * int(0.6 * FPS)
    return frames, elapsed, ok


# ---------- in-page overlays for the step-by-step parts ----------

OVERLAY_JS = """(() => {
  if (window.__jevDemo) return;
  const f = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
  const layer = css => { const d = document.createElement('div');
    d.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;' + css;
    document.documentElement.append(d); return d; };
  const clock = layer('top:16px;right:16px;width:234px;height:88px;border-radius:18px;background:rgba(17,17,17,.92);' +
    'display:none;align-items:center;justify-content:center;font:700 58px ' + f);
  const badge = layer('top:112px;right:16px;padding:7px 14px;border-radius:999px;font:700 15px ' + f + ';color:#111;display:none');
  const cap = layer('left:16px;bottom:16px;max-width:760px;padding:12px 18px;border-radius:14px;' +
    'background:rgba(17,17,17,.92);color:#fff;font:600 24px/1.3 ' + f + ';display:none');
  let trail = false;
  document.addEventListener('mousemove', e => {
    if (!trail) return;
    const dot = layer(`left:${e.clientX - 5}px;top:${e.clientY - 5}px;width:10px;height:10px;border-radius:50%;` +
      'background:#d97757;opacity:.9;transition:opacity 1.6s linear');
    requestAnimationFrame(() => requestAnimationFrame(() => { dot.style.opacity = '0'; }));
    setTimeout(() => dot.remove(), 1700);
  }, true);
  window.__jevDemo = {
    clock(text, color) { clock.textContent = text; clock.style.color = color; clock.style.display = text ? 'flex' : 'none'; },
    badge(text, color) { badge.textContent = text; badge.style.background = color; badge.style.display = text ? 'block' : 'none'; },
    caption(text, sub) {
      cap.innerHTML = text + (sub ? `<div style="font-weight:400;font-size:17px;opacity:.75;margin-top:3px">${sub}</div>` : '');
      cap.style.display = text ? 'block' : 'none';
    },
    trail(on) { trail = on; },
  };
})()"""


class Page:
    def __init__(self, tab, color, badge, trail, clock=True):
        self.tab, self.color, self.badge, self.trail, self.clock = tab, color, badge, trail, clock
        self.started = None

    def js(self, call):
        self.tab.evaluate(OVERLAY_JS)
        self.tab.evaluate(call)

    def setup(self):
        """Overlays live in the page; re-apply after each navigation."""
        if not self.clock:
            self.js("document.querySelectorAll('div').forEach(d => { if (d.style.top === '112px') d.style.top = '16px'; })")
        self.js(f"__jevDemo.badge({json.dumps(self.badge)}, {json.dumps(self.color)})")
        self.js(f"__jevDemo.trail({json.dumps(self.trail)})")
        self.tick()

    def tick(self):
        if not self.clock:
            return
        seconds = 0 if self.started is None else time.monotonic() - self.started
        self.js(f"__jevDemo.clock({json.dumps(f'{seconds:4.1f} s')}, {json.dumps(self.color)})")

    def say(self, text, sub=""):
        self.js(f"__jevDemo.caption({json.dumps(text)}, {json.dumps(sub)})")


def find_ref(tab_id, words, role=None):
    for match in bt.find(tab_id, words)["matches"]:
        if role is None or match["role"] == role:
            return match["ref"]
    raise SystemExit(f"No element for {words!r}")


def first_field(tab):
    return next(e["ref"] for e in bt.elements(tab.observe()).values() if "fill" in e["kinds"])


def recorded(tab_id, body):
    """Run body() while gif_creator records the tab; return its frames."""
    bt.gif_creator(tab_id, "start_recording")
    body()
    bt.gif_creator(tab_id, "stop_recording")
    return [Image.open(io.BytesIO(f)).convert("RGB") for f in bt.TABS[tab_id].last_frames]


def speed_part():
    t = bt.tabs_create("https://todomvc.com/examples/react/dist/")["tab_id"]
    tab = bt.TABS[t]
    bt.resize_window(t, *VIEWPORT)
    tab.navigate("reload")
    bt.CURSOR.enabled = False
    page = Page(tab, SPEED_COLOR, "⚡ speed mode (default)", trail=False)
    result = {}

    def body():
        page.setup()
        page.say("Step-by-step tools, speed mode", "4 todos added, 2 completed · computer · type · key · left_click")
        time.sleep(0.8)
        box = find_ref(t, "what needs to be done")
        page.started = time.monotonic()
        for item in ("Ship jev-browser", "Record the demo", "Write the README", "Celebrate"):
            bt.computer(t, "type", ref=box, text=item)
            bt.computer(t, "key", text="Enter")
            page.tick()
        # TodoMVC's toggles are opacity-0 inputs; click them by coordinate.
        spots = json.loads(bt.javascript_tool(t, """return [...document.querySelectorAll('.todo-list li')]
          .filter(li => /Record|README/.test(li.innerText))
          .map(li => { const r = li.querySelector('.toggle').getBoundingClientRect();
                       return [r.x + r.width / 2, r.y + r.height / 2]; })""")["result"])
        for x, y in spots:
            bt.computer(t, "left_click", coordinate=[x, y])
            page.tick()
        result["elapsed"] = time.monotonic() - page.started
        page.say(f"Done in {result['elapsed']:.1f} s", "4 todos added, 2 completed")
        time.sleep(1.4)

    frames = recorded(t, body)
    bt.tabs_close(t)
    return frames, result["elapsed"]


def human_part():
    t = bt.tabs_create("https://en.wikipedia.org/wiki/Main_Page")["tab_id"]
    tab = bt.TABS[t]
    bt.resize_window(t, *VIEWPORT)
    tab.navigate("reload")
    bt.CURSOR.enabled = True
    page = Page(tab, HUMAN_COLOR, "🖐 human mode", trail=True, clock=False)

    def body():
        page.setup()
        page.started = time.monotonic()
        page.say("Human mode: curved paths, overshoot, varied timing", "for sites that flag robotic mouse movement")
        bt.computer(t, "hover", ref=find_ref(t, "donate", role="link"))
        page.tick()
        bt.computer(t, "hover", coordinate=[180, 560])
        page.tick()
        page.say("Same tools, human-like input", "set_cursor_mode('natural') · switch any time")
        bt.computer(t, "type", ref=first_field(tab), text="Ada Lovelace")
        page.tick()
        time.sleep(0.8)
        page.say("Your real Chrome, in the background.", "github.com/MaciejWiatr/jev-browser")
        time.sleep(1.8)

    frames = recorded(t, body)
    bt.tabs_close(t)
    return frames


def encode(frames, out):
    if not shutil.which("ffmpeg"):
        raise SystemExit("ffmpeg is required: brew install ffmpeg")
    with tempfile.TemporaryDirectory() as tmp:
        for i, img in enumerate(frames):
            img.convert("RGB").resize(VIEWPORT).save(f"{tmp}/{i:05d}.png")
        graph = (f"scale={OUT_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];"
                 "[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", f"{tmp}/%05d.png",
                        "-vf", graph, "-loop", "0", str(out)], check=True)


def main():
    out = ROOT / "docs" / "demo-v3.gif"
    run_frames, run_s, ok = jev_run_part()
    if not ok:
        raise SystemExit("jev_run did not reach the article; not saving the demo.")
    speed_frames, speed_s = speed_part()
    human_frames = human_part()
    frames = (title_card("Fast first", f"jev_run: one goal → done in {run_s:.1f} s\nin a background tab of your real Chrome",
                         SPEED_COLOR, 1.4)
              + run_frames
              + title_card("Speed mode", f"The default for step-by-step tools\n4 todos + 2 completed in {speed_s:.1f} s",
                           SPEED_COLOR, 1.0)
              + speed_frames
              + title_card("Human mode", "For sites that flag robotic mouse movement\ncurved ghost-cursor paths · trail shows the path",
                           HUMAN_COLOR, 1.2)
              + human_frames)
    encode(frames, out)
    print({"saved": str(out), "frames": len(frames), "jev_run_s": round(run_s, 2), "speed_s": round(speed_s, 2),
           "mb": round(out.stat().st_size / 1e6, 1)})


if __name__ == "__main__":
    main()
