#!/usr/bin/env bash
# Starts the jev MCP server inside the Jev Ultrafast uv project.
# Finds Jev at $JEV_HOME, ~/.jev/jev-ultrafast, or ~/Apps/jev-ultrafast (first that exists).
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for candidate in "${JEV_HOME:-}" "$HOME/.jev/jev-ultrafast" "$HOME/Apps/jev-ultrafast"; do
  if [[ -n "$candidate" && -f "$candidate/pyproject.toml" ]]; then
    export JEV_HOME="$candidate"
    break
  fi
done
if [[ -z "${JEV_HOME:-}" || ! -f "$JEV_HOME/pyproject.toml" ]]; then
  echo "jev: Jev Ultrafast not found. Run install.sh from the jev-browser repo, or set JEV_HOME." >&2
  exit 1
fi
if ! command -v uv >/dev/null 2>&1; then
  for dir in "$HOME/.local/bin" "$HOME/.cargo/bin" /opt/homebrew/bin /usr/local/bin; do
    [[ -x "$dir/uv" ]] && PATH="$dir:$PATH" && break
  done
fi

env_args=()
[[ -f "$JEV_HOME/.env" ]] && env_args=(--env-file "$JEV_HOME/.env")
exec uv run --quiet --project "$JEV_HOME" "${env_args[@]}" \
  --with "mcp>=1.2,<2" --with "pillow>=11,<13" \
  python "$here/jev_mcp.py"
