import { NextRequest, NextResponse } from "next/server";
import { buildControlPlaneProxyUrl, getControlPlaneProxyOrigins } from "@/lib/control-plane-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback?code=xxx&state=connection_id
 *
 * Handles the OAuth callback from Google. Sends the auth code to the
 * control plane which exchanges it for tokens and completes the setup.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  // Build the redirect URL for success/failure
  const connectionsUrl = new URL("/workspace/connections", request.url);

  if (error) {
    connectionsUrl.searchParams.set("gmail_oauth_error", error);
    return NextResponse.redirect(connectionsUrl.toString());
  }

  if (!code || !state) {
    connectionsUrl.searchParams.set(
      "gmail_oauth_error",
      "Missing authorization code or state parameter.",
    );
    return NextResponse.redirect(connectionsUrl.toString());
  }

  const connectionId = state;
  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const cookieHeader = request.headers.get("cookie") ?? "";

  // We need a CSRF token. Extract it from the session first.
  let csrfToken: string | null = null;
  const origins = getControlPlaneProxyOrigins();

  for (const origin of origins) {
    try {
      const sessionUrl = buildControlPlaneProxyUrl(origin, ["auth", "session"], "");
      const sessionRes = await fetch(sessionUrl, {
        headers: { cookie: cookieHeader },
      });
      if (sessionRes.ok) {
        const sessionData = (await sessionRes.json()) as {
          csrf_token?: string;
        };
        csrfToken = sessionData.csrf_token ?? null;
        break;
      }
    } catch {
      // Try next origin
    }
  }

  if (!csrfToken) {
    connectionsUrl.searchParams.set(
      "gmail_oauth_error",
      "Session expired. Please sign in and try again.",
    );
    return NextResponse.redirect(connectionsUrl.toString());
  }

  // Send the auth code to the control plane to exchange for tokens
  let success = false;
  let errorMessage = "Failed to complete OAuth flow.";

  for (const origin of origins) {
    try {
      const callbackUrl = buildControlPlaneProxyUrl(
        origin,
        ["workspace", "connections", connectionId, "gmail-oauth-callback"],
        "",
      );
      const res = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrfToken,
          cookie: cookieHeader,
        },
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (res.ok) {
        success = true;
        break;
      }

      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      errorMessage = body.error ?? errorMessage;
      break; // Got a response, don't retry
    } catch {
      // Try next origin
    }
  }

  if (success) {
    connectionsUrl.searchParams.set("gmail_oauth_success", "1");
  } else {
    connectionsUrl.searchParams.set("gmail_oauth_error", errorMessage);
  }

  return NextResponse.redirect(connectionsUrl.toString());
}
