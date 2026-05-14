// lib/mcp-oauth.js
//
// OAuth 2.1 helpers for the remote MCP custom-connector flow.
//
// Single-tenant design: every authorized token carries Tom's RISE_USER_ID.
// The "consent" step is gated by MCP_OAUTH_AUTHORIZE_PIN — Tom enters the
// PIN once when he sets the connector up in Claude (Desktop / Cowork / web).
//
// Auth code storage: Supabase table `mcp_oauth_codes` (60-second TTL).
// Access tokens: JWTs signed with MCP_JWT_SECRET, 30-day expiry, stateless.
// Client registration: stored in `mcp_oauth_clients`, dynamic.
//
// Spec references:
//   - OAuth 2.1: draft-ietf-oauth-v2-1
//   - MCP Authorization: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

import { createClient } from "@supabase/supabase-js";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes } from "crypto";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_ID = process.env.RISE_USER_ID;
const JWT_SECRET = process.env.MCP_JWT_SECRET;
const AUTHORIZE_PIN = process.env.MCP_OAUTH_AUTHORIZE_PIN;

if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
  if (!USER_ID) console.warn("[mcp-oauth] RISE_USER_ID not set");
  if (!JWT_SECRET) console.warn("[mcp-oauth] MCP_JWT_SECRET not set");
  if (!AUTHORIZE_PIN) console.warn("[mcp-oauth] MCP_OAUTH_AUTHORIZE_PIN not set");
}

const ISSUER_URL = process.env.MCP_OAUTH_ISSUER || "https://rise-and-shine-hazel.vercel.app";
const RESOURCE_URL = `${ISSUER_URL}/api/mcp`;

const CODE_TTL_SEC = 60;
const TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const SCOPE = "mcp";

// --- helpers ---

function jwtSecretBytes() {
  if (!JWT_SECRET) throw new Error("MCP_JWT_SECRET not configured");
  return new TextEncoder().encode(JWT_SECRET);
}

function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(input) {
  return createHash("sha256").update(input).digest("base64url");
}

// --- metadata ---

export function authorizationServerMetadata() {
  return {
    issuer: ISSUER_URL,
    authorization_endpoint: `${ISSUER_URL}/api/oauth/authorize`,
    token_endpoint: `${ISSUER_URL}/api/oauth/token`,
    registration_endpoint: `${ISSUER_URL}/api/oauth/register`,
    revocation_endpoint: `${ISSUER_URL}/api/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"], // public clients (PKCE)
    scopes_supported: [SCOPE],
  };
}

export function protectedResourceMetadata() {
  return {
    resource: RESOURCE_URL,
    authorization_servers: [ISSUER_URL],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
  };
}

// --- dynamic client registration ---

export async function registerClient(input) {
  const clientId = `mcp-client-${randomToken(8)}`;
  const redirectUris = Array.isArray(input?.redirect_uris)
    ? input.redirect_uris.filter((u) => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    throw new Error("redirect_uris is required");
  }
  const name = String(input?.client_name || "Unnamed MCP Client").slice(0, 120);
  const { error } = await supabaseAdmin.from("mcp_oauth_clients").insert({
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
    user_id: USER_ID,
  });
  if (error) throw new Error(`Client registration failed: ${error.message}`);
  return {
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

export async function getClient(clientId) {
  const { data } = await supabaseAdmin
    .from("mcp_oauth_clients")
    .select("client_id, client_name, redirect_uris, user_id")
    .eq("client_id", clientId)
    .maybeSingle();
  return data || null;
}

// --- authorization codes ---

export async function issueAuthorizationCode({
  clientId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  scope,
}) {
  const code = randomToken();
  const expiresAt = new Date(Date.now() + CODE_TTL_SEC * 1000).toISOString();
  const { error } = await supabaseAdmin.from("mcp_oauth_codes").insert({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge || null,
    code_challenge_method: codeChallengeMethod || null,
    scope: scope || SCOPE,
    user_id: USER_ID,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`Code issue failed: ${error.message}`);
  return code;
}

export async function consumeAuthorizationCode({ code, clientId, redirectUri, codeVerifier }) {
  const { data, error } = await supabaseAdmin
    .from("mcp_oauth_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`Code lookup failed: ${error.message}`);
  if (!data) throw new Error("invalid_grant: code not found");
  if (data.used_at) throw new Error("invalid_grant: code already used");
  if (new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("invalid_grant: code expired");
  }
  if (data.client_id !== clientId) throw new Error("invalid_grant: client mismatch");
  if (data.redirect_uri !== redirectUri) throw new Error("invalid_grant: redirect_uri mismatch");
  if (data.code_challenge) {
    if (!codeVerifier) throw new Error("invalid_grant: code_verifier required (PKCE)");
    if (data.code_challenge_method !== "S256") {
      throw new Error("invalid_grant: unsupported code_challenge_method");
    }
    const expected = sha256Base64Url(codeVerifier);
    if (expected !== data.code_challenge) {
      throw new Error("invalid_grant: PKCE verification failed");
    }
  }
  // Mark consumed (single-use).
  await supabaseAdmin
    .from("mcp_oauth_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code", code);
  return { userId: data.user_id, scope: data.scope || SCOPE };
}

// --- access tokens (JWT) ---

export async function issueAccessToken({ userId, clientId, scope }) {
  const token = await new SignJWT({
    scope: scope || SCOPE,
    client_id: clientId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER_URL)
    .setAudience(RESOURCE_URL)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SEC}s`)
    .sign(jwtSecretBytes());
  return { token, expiresIn: TOKEN_TTL_SEC };
}

export async function verifyAccessToken(token) {
  if (!token) throw new Error("missing token");
  const { payload } = await jwtVerify(token, jwtSecretBytes(), {
    issuer: ISSUER_URL,
    audience: RESOURCE_URL,
  });
  if (!payload.sub) throw new Error("token has no subject");
  return {
    userId: payload.sub,
    clientId: payload.client_id,
    scope: payload.scope,
  };
}

// --- consent ---

export function verifyConsentPin(input) {
  if (!AUTHORIZE_PIN) throw new Error("MCP_OAUTH_AUTHORIZE_PIN not configured");
  return typeof input === "string" && input.length > 0 && input === AUTHORIZE_PIN;
}

export const constants = {
  ISSUER_URL,
  RESOURCE_URL,
  SCOPE,
  CODE_TTL_SEC,
  TOKEN_TTL_SEC,
};
