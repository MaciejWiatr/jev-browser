---
name: jev-browser
description: Control the user's real Chrome (their logins) in background tabs with the jev MCP tools — test local web apps, debug with console logs and network requests, fill forms, upload files, extract data, work in logged-in apps (Gmail, Notion, Google Docs), record GIFs, save screenshots, and run the ultrafast autonomous jev_run agent. Use whenever a task involves a website or browser, or the user says "jev", "browser", "open", "check the page", "localhost". Not for booking/paying/sending without explicit confirmation.
---

# Jev browser tools

Tools from the `jev` MCP server. Tabs open in the **background**: they never steal the user's focus, keyboard or OS cursor. The page shows an orange agent cursor (instant moves by default: speed mode). If a site reacts to robotic input (bot checks, blocked clicks), or the user asks for human mode, call `set_cursor_mode('natural')`; switch back to `'speed'` afterwards. A CAPTCHA still means stop and hand over to the user.

## Default: ultra-fast first

Start every web task with **`jev_run`** (2-8 s): give it the start URL and the goal in plain words, with concrete values and a stop condition. Use `keep_open: true` when you need to check or continue, then verify with `read_page`.

Fall back to the step-by-step tools below only when:
- `jev_run` returns `blocked`, errors, or the result doesn't match the goal;
- the task needs judgment across many steps, debugging (console, network), uploads, recordings, or reading/extracting lots of data;
- keys for `jev_run` are missing (`jev_status` shows `EMPTY`), or the user asks for step-by-step.

The step-by-step tools also default to speed mode (instant cursor moves).

## Step-by-step loop

1. `tabs_context` → reuse a session tab, or `tabs_create(url)`. Only tabs from this session are available. `activate: true` only when the user asks to watch.
2. `read_page` → element refs like `[n12] button 'Search'`, visible text, `file_inputs`, `needs_user`.
3. Act: `computer` (left_click / type / key / scroll / hover / wait), `form_input` (text, select, checkbox), `navigate` (url, back, forward, reload), `file_upload`, `javascript_tool`.
4. Verify after each meaningful step with `read_page`, `computer screenshot`, or `get_page_text`. Refs go stale after the page changes; read again.
5. Several known steps in a row → `browser_batch`.

## Memory: get faster on every visit

- **Teach while you work:** pass `intent` ("add to cart", "search box", "next page", "checkout") on every meaningful `computer` click/type and `form_input`. The target is remembered for that page type, so it works on every product page, not just this one.
- **Reuse first, skip reading:** `navigate` and `read_page` show `memory.actions_here`. When the action you need is listed, call `act` straight away: no `read_page`, no `find`. To do it on another page, `act(tab, intent, url=...)` opens the page and acts in one call. Check success from the returned `visible_text`; read the page only if it looks wrong.
- **Workflows:** after a multi-step flow works, `save_workflow` it from intents with `{{param}}` placeholders for anything that changes or is personal (never literal personal data), then `run_workflow` next time. If it stops, finish the remaining steps by hand with `intent=` (that heals memory).
- `site_memory` shows what is known plus this tab's recent actions; `forget_intent` / `forget_workflow` remove bad entries.

Other tools: `find` (refs by description), `get_page_text` (whole page, paginated), `read_console_messages` (always pass a `pattern` or `only_errors`), `read_network_requests` (`url_pattern`, `only_failed`), `resize_window` (mobile checks: 390x844), `computer zoom` (2x region), `computer screenshot save_path=...` (PNG to disk), `gif_creator` (start_recording → actions → stop_recording → export), `handle_dialog`.

## Stop and hand over

- `needs_user: login` or `captcha` → stop. Ask the user to complete it in Chrome (in the "Jev" tab group), then continue.
- `dialog_open` → decide with `handle_dialog`. Never trigger alert/confirm on purpose.
- Before anything irreversible (submit an order, pay, send, post, delete) → confirm with the user.
- Site blocked by `~/.config/jev/sites.json` → tell the user; don't work around it.

## Report

Say what is now true on the page, with concrete values. GIFs and screenshots show account details: say so when sharing. `jev_run` status `done` is a claim; check `final_url` and `page_text`.

Connection, key or extension problems → `jev-setup` skill.
