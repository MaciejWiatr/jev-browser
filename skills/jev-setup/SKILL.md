---
name: jev-setup
description: Status, reconnect and troubleshooting for the jev browser tools (the /chrome equivalent) — "daemon didn't come up", DevToolsActivePort not found, Chrome remote debugging, browser not responding, missing TYPESAFE_API_KEY or TEXT_MODEL_API_KEY, tab groups not appearing, site allow/deny rules, cursor speed, or the jev MCP server not connecting.
---

# Jev status and setup

Paths: install `$JEV_HOME` (default `~/.jev/jev-ultrafast`, also found at `~/Apps/jev-ultrafast`), keys `$JEV_HOME/.env`, site rules `~/.config/jev/sites.json`.

1. Call `jev_status`. It shows the Chrome connection, key presence (never values), site rules and this session's tabs.
2. Fix by symptom:
   - `DevToolsActivePort not found` / daemon not alive → user turns on `chrome://inspect/#remote-debugging`.
   - Chrome asks "Allow remote debugging?" → user clicks Allow.
   - Tools time out / browser stopped responding → check for an open dialog (`handle_dialog`), else `jev_status reconnect=true`, then `tabs_create` again (old tab ids are dropped).
   - Key `EMPTY` → user fills it in `.env`. Never search for keys elsewhere or print them. `TYPESAFE_API_KEY` is needed only for `jev_run`.
   - No tab groups → the user loads the companion extension once: `chrome://extensions` → Developer mode on → Load unpacked → `~/.jev/tab-groups-extension` (install.sh puts it there; the repo's `extension/` folder also works).
   - `jev` tools missing → user runs `/mcp` to read the server error, `/plugin` to check `jev` is enabled.
3. Site rules: the user edits `~/.config/jev/sites.json`, e.g. `{"allow": [], "deny": ["*.bank.com"]}`. An empty allow list means all sites except denied ones. Don't edit it yourself unless the user asks.
4. Cursor: `set_cursor_mode` switches speed/natural for this session. Defaults (env vars in Claude Code settings `env`): `JEV_CURSOR_MODE=speed` (default, instant moves) or `natural` (ghost-cursor paths), `JEV_CURSOR_MAX_MS` (default 600) natural-mode cap per move, `JEV_GROUP_TITLE` tab group name.
5. Inspector UI for `jev_run`: call `jev_inspector`, give the user the URL.
