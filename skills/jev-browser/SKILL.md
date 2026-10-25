---
name: jev-browser
description: Control the user's real Chrome (their logins) in background tabs with the jev MCP tools — test local web apps, debug with console logs and network requests, fill forms, upload files, extract data, work in logged-in apps (Gmail, Notion, Google Docs), record GIFs, save screenshots, and run the ultrafast autonomous jev_run agent. Use whenever a task involves a website or browser, or the user says "jev", "browser", "open", "check the page", "localhost". Not for booking/paying/sending without explicit confirmation.
---

# Jev browser tools

Tools from the `jev` MCP server. Tabs open in the **background**: they never steal the user's focus, keyboard or OS cursor. The page shows an orange agent cursor (instant moves by default: speed mode). If a site reacts to robotic input (bot checks, blocked clicks), or the user asks for human mode, call `set_cursor_mode('natural')`; switch back to `'speed'` afterwards. A CAPTCHA still means stop and hand over to the user.

## Pick the approach

| Task | Use |
| --- | --- |
| One narrow goal on one site ("search flights X→Y", "open the article about Z") | `jev_run` (2-8 s, paid API calls). `keep_open: true` returns a `tab_id` to continue with the tools below. |
| Anything needing inspection, verification, debugging, multi-step judgment | Step-by-step tools below |

## Step-by-step loop

1. `tabs_context` → reuse a session tab, or `tabs_create(url)`. Only tabs from this session are available. `activate: true` only when the user asks to watch.
2. `read_page` → element refs like `[n12] button 'Search'`, visible text, `file_inputs`, `needs_user`.
3. Act: `computer` (left_click / type / key / scroll / hover / wait), `form_input` (text, select, checkbox), `navigate` (url, back, forward, reload), `file_upload`, `javascript_tool`.
4. Verify after each meaningful step with `read_page`, `computer screenshot`, or `get_page_text`. Refs go stale after the page changes; read again.
5. Several known steps in a row → `browser_batch`.

Other tools: `find` (refs by description), `get_page_text` (whole page, paginated), `read_console_messages` (always pass a `pattern` or `only_errors`), `read_network_requests` (`url_pattern`, `only_failed`), `resize_window` (mobile checks: 390x844), `computer zoom` (2x region), `computer screenshot save_path=...` (PNG to disk), `gif_creator` (start_recording → actions → stop_recording → export), `handle_dialog`.

## Stop and hand over

- `needs_user: login` or `captcha` → stop. Ask the user to complete it in Chrome (in the "Jev" tab group), then continue.
- `dialog_open` → decide with `handle_dialog`. Never trigger alert/confirm on purpose.
- Before anything irreversible (submit an order, pay, send, post, delete) → confirm with the user.
- Site blocked by `~/.config/jev/sites.json` → tell the user; don't work around it.

## Report

Say what is now true on the page, with concrete values. GIFs and screenshots show account details: say so when sharing. `jev_run` status `done` is a claim; check `final_url` and `page_text`.

Connection, key or extension problems → `jev-setup` skill.
