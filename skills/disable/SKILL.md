---
name: disable
description: Turn the jev browser plugin off in Claude Code without uninstalling it. Use when the user says "jev disable", "disable jev" or "turn jev off".
disable-model-invocation: true
---

# Disable jev

1. Run `claude plugin disable jev@jev-browser --scope user`.
2. Tell the user the result in one line, and that the jev tools are gone from the next Claude Code session (start a new one, or run `/reload-plugins`).
3. Tell them that `/jev:enable` disappears with the plugin, so to turn it back on they run `/plugin` and enable `jev`, or `claude plugin enable jev@jev-browser` in a terminal.
