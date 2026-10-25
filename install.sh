#!/usr/bin/env bash
# One-time setup: installs Jev Ultrafast (the browser layer) and registers this plugin with Claude Code.
set -euo pipefail
JEV_HOME="${JEV_HOME:-$HOME/.jev/jev-ultrafast}"
REPO="MaciejWiatr/jev-browser"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing $1. $2" >&2; exit 1; }; }
need git  "Install Xcode command line tools or git."
need uv   "Install: curl -LsSf https://astral.sh/uv/install.sh | sh"
need node "Install Node 18+ (needed for the human-like cursor)."
need claude "Install Claude Code: https://code.claude.com"

if [[ -f "$JEV_HOME/pyproject.toml" ]]; then
  echo "→ Jev Ultrafast already at $JEV_HOME, updating"
  git -C "$JEV_HOME" pull --ff-only --quiet || true
else
  echo "→ Cloning Jev Ultrafast into $JEV_HOME"
  mkdir -p "$(dirname "$JEV_HOME")"
  git clone --quiet https://github.com/browser-use/jev-ultrafast "$JEV_HOME"
fi
(cd "$JEV_HOME" && uv sync --quiet)
[[ -f "$JEV_HOME/.env" ]] || cp "$JEV_HOME/.env.example" "$JEV_HOME/.env"

echo "→ Registering the plugin with Claude Code"
claude plugin marketplace add "$REPO" >/dev/null 2>&1 || claude plugin marketplace update jev-browser >/dev/null
claude plugin install jev@jev-browser --scope user

EXT="$HOME/.jev/tab-groups-extension"
src="$(ls -d "$HOME"/.claude/plugins/cache/jev-browser/jev/*/extension 2>/dev/null | tail -1)"
[[ -n "$src" ]] && mkdir -p "$EXT" && cp "$src"/* "$EXT"/

cat <<MSG

Done. Two things left:
  1. Chrome: open chrome://inspect/#remote-debugging and turn it on (click Allow if Chrome asks).
  2. Optional, for jev_run only: add TYPESAFE_API_KEY and TEXT_MODEL_API_KEY to $JEV_HOME/.env
Optional tab groups: chrome://extensions → Developer mode → Load unpacked → $EXT

Then start a new Claude Code session and ask: "open localhost:3000 and check the console for errors".
MSG
