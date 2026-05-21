# Mobile / Cowork / Desktop MCP Setup

Hook the **Rise & Shine MCP server** up to your Claude surfaces (Cowork, Claude
Desktop, claude.ai web, mobile browser) so the same 42 `rise_*` tools that
power Claude Code work everywhere you're signed into Claude.

State (memories, tasks, parts, KB) is shared via Supabase, so each surface
sees the same project state. There is no "session" to carry — every new
conversation reads the latest state.

## What you need (one-time)

Three Vercel env vars on the `rise-and-shine` project:

| Var | What it is | How to generate |
|---|---|---|
| `MCP_JWT_SECRET` | HMAC key used to sign access + refresh tokens | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `MCP_OAUTH_AUTHORIZE_PIN` | The PIN you'll enter once during the consent step in each Claude surface | Pick something memorable. 6–10 chars. Store in your password manager. |
| `MCP_OAUTH_ISSUER` | `https://rise-and-shine-hazel.vercel.app` (or whatever your prod URL is) | Just the URL |

`RISE_USER_ID` is already set (used by the stdio MCP server too).

> All three of these only need to live in **Production** for Cowork/Desktop/web
> to use the remote connector. The local-dev values in `.env.local` are fine
> as-is for curl-testing.

## Adding the connector in each surface

The URL is the same everywhere:

```
https://rise-and-shine-hazel.vercel.app/api/mcp
```

The Claude UI will discover the OAuth endpoints automatically by hitting
`/.well-known/oauth-authorization-server`. You'll be redirected to the
consent page, asked for the PIN, then bounced back to Claude.

### Cowork (Mac)
1. Cowork → Settings → Connectors → Add Custom Connector
2. URL: `https://rise-and-shine-hazel.vercel.app/api/mcp`
3. Click connect → consent page opens in your browser → enter the PIN → "Approve & connect"
4. Back in Cowork, the connector shows "Connected." Tools labeled `rise_*` are now available.

### Claude Desktop (Mac/Windows)
1. Settings → Connectors → Add Custom Connector
2. Same URL + same PIN flow.
3. Tools appear in any conversation.

### claude.ai web (any browser, desktop or mobile)
1. Profile menu → Settings → Connectors → Add Custom Connector
2. Same URL + PIN.
3. Pin claude.ai to your phone's home screen for a quasi-native experience.

### Claude Code (Mac)
Claude Code uses the **stdio** MCP server in `mcp/server.mjs`, not this
remote endpoint. No change needed — it's already configured per
`docs/MCP_SERVER.md`.

## What works (verified locally)

- OAuth 2.1 metadata discovery
- Dynamic Client Registration (RFC 7591)
- PKCE-protected authorization code flow
- Refresh tokens (180-day expiry; access tokens 30-day)
- All 42 `rise_*` tools list + call cleanly
- Unauthenticated requests rejected with proper `WWW-Authenticate` header

## Architecture quick map

```
Claude surface (Cowork/Desktop/web/mobile)
        │
        ▼
GET  /.well-known/oauth-authorization-server   ← server metadata
POST /api/oauth/register                       ← dynamic client registration
GET  /api/oauth/authorize  (consent page)      ← Tom enters PIN
POST /api/oauth/authorize  (form submit)       ← issues auth code
POST /api/oauth/token                          ← exchanges code → JWT access token
POST /api/mcp                                  ← MCP protocol over Streamable HTTP
                                                  Authorization: Bearer <jwt>
```

JWTs are signed with `MCP_JWT_SECRET`. Auth codes live in
`mcp_oauth_codes` (60 s TTL). Registered clients live in
`mcp_oauth_clients`. All single-tenant; every token carries
`sub = RISE_USER_ID`.

## Cost notes

- Conversation tokens: covered by your Claude Pro/Max subscription on each
  surface. Custom Connectors don't add per-message API charges.
- Tool execution: most `rise_*` tools are pure Supabase CRUD — zero cost.
  The few that invoke AI (`analyze_project_plan`, `weekly_review_summary`,
  `check_nudges`) route through `lib/ai-provider.js` — Anthropic by default,
  OpenAI when `AI_PROVIDER=openai`.

## Troubleshooting

- **Consent page says "Wrong PIN":** double-check `MCP_OAUTH_AUTHORIZE_PIN`
  in Vercel env. Matching is case-sensitive.
- **"redirect_uri not registered":** the redirect URI sent by Claude is
  stored at DCR time. If you're testing manually with curl, make sure the
  URL you send to `/authorize` is exactly the one you registered.
- **Token rejected as expired:** access tokens last 30 days. Use the
  refresh token endpoint (Claude does this automatically).
- **`WWW-Authenticate: Bearer error="invalid_token"`:** the token failed
  JWT verification. Most likely the issuer URL doesn't match — confirm
  `MCP_OAUTH_ISSUER` matches the URL the connector is calling.
