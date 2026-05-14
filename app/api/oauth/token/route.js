// OAuth 2.1 token endpoint.
// Supports grant_type=authorization_code (with PKCE) and grant_type=refresh_token.

import {
  consumeAuthorizationCode,
  issueAccessToken,
  verifyAccessToken,
} from "../../../../lib/mcp-oauth.js";
import { SignJWT, jwtVerify } from "jose";

export const dynamic = "force-dynamic";

function bad(error, description, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function parseForm(req) {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  if (contentType.includes("application/json")) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    return Object.fromEntries(form.entries());
  }
  return {};
}

export async function POST(req) {
  const params = await parseForm(req);
  const grantType = params.grant_type;
  if (!grantType) return bad("invalid_request", "grant_type required");

  try {
    if (grantType === "authorization_code") {
      const { code, client_id, redirect_uri, code_verifier } = params;
      if (!code || !client_id || !redirect_uri) {
        return bad("invalid_request", "code, client_id, redirect_uri required");
      }
      const consumed = await consumeAuthorizationCode({
        code,
        clientId: client_id,
        redirectUri: redirect_uri,
        codeVerifier: code_verifier,
      });
      const { token, expiresIn } = await issueAccessToken({
        userId: consumed.userId,
        clientId: client_id,
        scope: consumed.scope,
      });
      // Refresh token = a longer-lived JWT with refresh-only scope.
      const refresh = await new SignJWT({
        client_id,
        scope: consumed.scope,
        refresh: true,
      })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer(process.env.MCP_OAUTH_ISSUER || "https://rise-and-shine-hazel.vercel.app")
        .setSubject(consumed.userId)
        .setIssuedAt()
        .setExpirationTime("180d")
        .sign(new TextEncoder().encode(process.env.MCP_JWT_SECRET));
      return Response.json(
        {
          access_token: token,
          token_type: "Bearer",
          expires_in: expiresIn,
          refresh_token: refresh,
          scope: consumed.scope,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (grantType === "refresh_token") {
      const { refresh_token, client_id } = params;
      if (!refresh_token || !client_id) {
        return bad("invalid_request", "refresh_token + client_id required");
      }
      let payload;
      try {
        const verified = await jwtVerify(
          refresh_token,
          new TextEncoder().encode(process.env.MCP_JWT_SECRET),
          { issuer: process.env.MCP_OAUTH_ISSUER || "https://rise-and-shine-hazel.vercel.app" }
        );
        payload = verified.payload;
      } catch (e) {
        return bad("invalid_grant", "refresh token invalid or expired", 401);
      }
      if (!payload.refresh) return bad("invalid_grant", "not a refresh token");
      if (payload.client_id !== client_id) {
        return bad("invalid_grant", "client_id mismatch");
      }
      const { token, expiresIn } = await issueAccessToken({
        userId: payload.sub,
        clientId: client_id,
        scope: payload.scope,
      });
      return Response.json(
        {
          access_token: token,
          token_type: "Bearer",
          expires_in: expiresIn,
          scope: payload.scope,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return bad("unsupported_grant_type", `grant_type=${grantType} not supported`);
  } catch (e) {
    // Codes thrown like "invalid_grant: ..." → split for spec compliance.
    const msg = String(e.message || e);
    const m = msg.match(/^(invalid_grant|invalid_request|invalid_client)\s*:\s*(.*)$/);
    if (m) return bad(m[1], m[2]);
    return bad("server_error", msg, 500);
  }
}
