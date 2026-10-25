---
name: enable
description: Turn the jev browser plugin on in Claude Code. Use when the user says "jev enable", "enable jev" or "turn jev on".
disable-model-invocation: true
---

# Enable jev

1. Run `claude plugin enable jev@jev-browser --scope user`.
2. Tell the user the result in one line, and that the jev tools load in the next Claude Code session (start a new one, or run `/reload-plugins`).

If the command says the plugin isn't installed, point them to `install.sh` in https://github.com/MaciejWiatr/jev-browser.
