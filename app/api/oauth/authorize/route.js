// OAuth 2.1 authorization endpoint.
//
// GET  → renders a tiny consent page that asks Tom for the MCP_OAUTH_AUTHORIZE_PIN
//        and shows the requesting client name. PKCE params are carried in the
//        page's hidden form fields and re-submitted to POST.
// POST → verifies the PIN, issues an auth code, redirects back to the client's
//        redirect_uri with ?code=...&state=...
//
// Spec: OAuth 2.1 (PKCE required for public clients).

import {
  getClient,
  issueAuthorizationCode,
  verifyConsentPin,
} from "../../../../lib/mcp-oauth.js";

export const dynamic = "force-dynamic";

function renderConsentPage({ clientName, params, error }) {
  const escape = (s) => String(s || "").replace(/[<>"&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "&": "&amp;" })[c]
  );
  const hidden = Object.entries(params)
    .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}" />`)
    .join("\n        ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Authorize MCP connector — Rise &amp; Shine</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
           background: #f7f1e8; margin: 0; padding: 40px 20px; color: #2c2c2c; }
    .card { max-width: 420px; margin: 40px auto; background: #fff; border-radius: 12px;
            padding: 28px 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.08); }
    h1 { font-size: 20px; margin: 0 0 12px; }
    p { line-height: 1.5; color: #555; }
    .cap { font-family: ui-monospace, monospace; font-size: 10px; letter-spacing: 0.12em;
           text-transform: uppercase; color: #888; margin: 18px 0 6px; }
    .client { font-weight: 600; color: #2c2c2c; }
    label { display: block; margin-top: 14px; font-size: 13px; font-weight: 500; }
    input[type=password] { width: 100%; padding: 10px 12px; font-size: 16px;
                            border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; }
    button { margin-top: 18px; padding: 12px 16px; font-size: 14px; font-weight: 600;
             background: #2c5e8a; color: #fff; border: none; border-radius: 8px;
             cursor: pointer; width: 100%; }
    button:hover { background: #234a6e; }
    .error { color: #b3261e; font-size: 13px; margin-top: 12px; }
    .meta { font-size: 11px; color: #999; margin-top: 20px; font-family: ui-monospace, monospace; }
  </style>
</head>
<body>
  <div class="card">
    <div class="cap">Rise &amp; Shine MCP</div>
    <h1>Authorize this connector?</h1>
    <p><span class="client">${escape(clientName)}</span> is requesting access to your Rise &amp; Shine tools and data.</p>
    <p>Enter your MCP authorization PIN to approve. The PIN is the value you set as <code>MCP_OAUTH_AUTHORIZE_PIN</code>.</p>
    <form method="POST" action="/api/oauth/authorize">
      ${hidden}
      <label>Authorization PIN
        <input type="password" name="pin" autocomplete="off" autofocus required />
      </label>
      ${error ? `<div class="error">${escape(error)}</div>` : ""}
      <button type="submit">Approve &amp; connect</button>
    </form>
    <div class="meta">
      Scope: ${escape(params.scope || "mcp")} ·
      Redirect: ${escape(params.redirect_uri || "")}
    </div>
  </div>
</body>
</html>`;
}

async function loadAndValidate(searchParams) {
  const clientId = searchParams.get("client_id");
  const redirectUri = searchParams.get("redirect_uri");
  const responseType = searchParams.get("response_type") || "code";
  const codeChallenge = searchParams.get("code_challenge");
  const codeChallengeMethod = searchParams.get("code_challenge_method");
  const scope = searchParams.get("scope") || "mcp";
  const state = searchParams.get("state") || "";

  if (!clientId) return { error: "missing client_id" };
  if (!redirectUri) return { error: "missing redirect_uri" };
  if (responseType !== "code") return { error: "unsupported response_type" };

  const client = await getClient(clientId);
  if (!client) return { error: "unknown client_id" };
  if (!client.redirect_uris.includes(redirectUri)) {
    return { error: "redirect_uri not registered for this client" };
  }
  if (codeChallenge && codeChallengeMethod !== "S256") {
    return { error: "only S256 code_challenge_method supported" };
  }

  return {
    client,
    params: {
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: responseType,
      code_challenge: codeChallenge || "",
      code_challenge_method: codeChallengeMethod || "",
      scope,
      state,
    },
  };
}

function redirectWith(redirectUri, params) {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  return Response.redirect(url.toString(), 302);
}

export async function GET(req) {
  const url = new URL(req.url);
  const result = await loadAndValidate(url.searchParams);
  if (result.error) {
    return new Response(`Authorization error: ${result.error}`, {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const html = renderConsentPage({
    clientName: result.client.client_name || result.params.client_id,
    params: result.params,
    error: null,
  });
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(req) {
  const form = await req.formData();
  const searchParams = new URLSearchParams();
  for (const [k, v] of form.entries()) {
    if (k !== "pin") searchParams.set(k, String(v));
  }
  const result = await loadAndValidate(searchParams);
  if (result.error) {
    return new Response(`Authorization error: ${result.error}`, {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }
  const pin = String(form.get("pin") || "");
  if (!verifyConsentPin(pin)) {
    const html = renderConsentPage({
      clientName: result.client.client_name || result.params.client_id,
      params: result.params,
      error: "Wrong PIN — try again.",
    });
    return new Response(html, {
      status: 401,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const code = await issueAuthorizationCode({
    clientId: result.params.client_id,
    redirectUri: result.params.redirect_uri,
    codeChallenge: result.params.code_challenge,
    codeChallengeMethod: result.params.code_challenge_method,
    scope: result.params.scope,
  });
  return redirectWith(result.params.redirect_uri, {
    code,
    state: result.params.state,
  });
}
