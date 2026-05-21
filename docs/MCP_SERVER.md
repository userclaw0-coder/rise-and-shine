# Rise-and-Shine MCP Server

Exposes the same toolset the in-app Jarvis agent uses (`create_task`,
`bulk_triage_tasks`, `write_memory`, `add_isc`, etc.) over the
Model Context Protocol, so external MCP clients can drive Rise-and-Shine
directly.

37 tools available. Claude's MCP bridge already namespaces them as
`mcp__<server-uuid>__<tool>`, so the server emits the bare names
(`get_todays_queue`, `create_task`, …). The Claude API caps the full
prefixed name at 64 chars — leaving ~21 chars for the raw tool name —
so the names in `lib/jarvis-tools.js` are kept short. Set
`RISE_MCP_TOOL_PREFIX=rise_` if you need an extra server-side prefix
(but watch the length budget: it eats 5 chars).

## What you get

Use cases this unlocks today:

- **Claude Code, from the terminal:** "Do a Reorient pass on Mom and Dad —
  read the project state, propose triage decisions, then apply." Claude
  Code chains the right `rise_*` tools and walks you through it.
- **Drive-context-aware sessions** (like the Hawkswood walkthrough): mix
  this server with the Drive MCP and Claude can read PDFs, synthesize KB,
  write memories, and update workspace fields in one session.
- **Quick captures:** "Add three tasks to Vehicles: cutlass bearing
  inspection, Ram alignment quote, Tesla AC diagnostic. All medium
  priority." Claude calls `create_task` three times.

What it doesn't unlock yet:

- **Phone access** (Claude Dispatch / Claude.ai mobile via MCP) requires
  the HTTP/SSE transport, not stdio. Tracked as a Phase-2 follow-up.
- **Multi-user** — this server is single-tenant, pinned to `RISE_USER_ID`.

## Setup (Claude Code on the Mac)

1. **Install dependencies:**
   ```bash
   cd ~/Documents/code/rise-and-shine
   npm install
   ```

2. **Confirm `.env.local` has everything the server needs.** It needs
   `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RISE_USER_ID`,
   plus `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` if you call any tool that
   does AI work. The repo's `.env.local` already has these from earlier PRs.

3. **Smoke the server boots:**
   ```bash
   npm run mcp:list-tools     # prints the 37 tool schemas
   ```

   Should print 37 tools and end with `Supabase: OK`.

4. **Add to Claude Code's MCP config.** Edit `~/.claude.json` (or your
   per-project `.claude/settings.json`) and add this entry:

   ```jsonc
   {
     "mcpServers": {
       "rise-and-shine": {
         "command": "node",
         "args": [
           "--env-file=.env.local",
           "/Users/tomsaunders/Documents/code/rise-and-shine/mcp/server.mjs"
         ],
         "cwd": "/Users/tomsaunders/Documents/code/rise-and-shine"
       }
     }
   }
   ```

5. **Restart Claude Code.** When you start a new session, the tools
   should be available via ToolSearch (the client surfaces them as
   `mcp__<server-uuid>__<tool>`). Try:

   > "Use get_todays_queue to show me my Next-3 for today."

## Tool surface (37 tools)

The list is generated from `lib/jarvis-tools.js` at startup. Categories:

**Read (safe — call freely):**
`get_todays_queue`, `get_backlog`, `get_profile`, `get_task_details`,
`get_analytics`, `get_categories`, `get_weekly_review`, `get_ideas`,
`get_recent_notes`, `get_project_details`, `get_project_kb`,
`recent_imports`, `search_memories`, `analyze_project_plan`,
`check_nudges`, `suggest_next_actions`, `weekly_review_summary`,
`list_recurring`

**Mutating — prefer user approval first:**
`create_task`, `update_task`, `complete_task`, `create_subtasks`,
`create_project`, `create_idea`, `add_daily_note`, `update_project`,
`update_project_kb`, `add_project_resource`,
`update_project_ws`, `update_human_needs_strategy`,
`save_session_summary`, `reorder_project_tasks`, `reorder_subtasks`,
`set_task_dependency`, `bulk_triage_tasks`,
`write_memory`, `add_isc`, `set_isc_met`, `remove_isc`,
`create_recurring`, `update_recurring`, `archive_recurring`

Run `npm run mcp:list-tools` for the exact input schemas.

## Security model

- The server runs as a subprocess Claude Code spawns. It reads Tom's
  Supabase service-role key from `.env.local` and uses it for all DB
  operations.
- Trust boundary: **"you can run this binary on Tom's Mac."** If someone
  has shell access, they have full data access — same as if they ran
  the dev server directly.
- `RISE_USER_ID` pins all operations to Tom. Tools that take a `task_id`
  / `category_id` will only see rows owned by that user (RLS still applies
  for non-service-role queries; service-role implicitly bypasses, so we
  scope-check via WHERE clauses in the tool implementations).
- The server logs a single readiness line to stderr (`[rise-mcp] ready …`)
  and otherwise stays silent. Stdout is reserved for JSON-RPC framing.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `RISE_USER_ID is required` | env not loaded | confirm `--env-file=.env.local` arg + `cwd` set to repo |
| `supabaseUrl is required` | env file missing | `npx vercel env pull .env.local` |
| Tools not visible in Claude Code | client config typo | check `~/.claude.json` JSON syntax; restart |
| Tool calls fail silently | jarvis-tools throwing | check Claude Code's MCP server logs (or run `npm run mcp:server` interactively and watch stderr) |
| Want to test without Claude Code | mcp/list-tools.mjs | shows what the server would expose |

## Phase 2 (deferred)

- **HTTP/SSE transport** for phone / web clients (Claude Dispatch, Claude.ai
  with MCP). Same handler code, different transport class
  (`SSEServerTransport`). Adds auth via Bearer JWT.
- **Per-call user_id override** (drop the env pin) once we have multiple
  users.
- **Output schemas / typed structured returns** — currently everything
  comes back as `{type: "text", text: "<JSON>"}`. MCP supports
  structured content blocks; would let clients render task lists as
  tables, etc.
