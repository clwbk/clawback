import { NextRequest, NextResponse } from "next/server";
import { buildControlPlaneProxyUrl, getControlPlaneProxyOrigins } from "@/lib/control-plane-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/start?connection_id=xxx
 *
 * Initiates the Google OAuth consent flow. Reads OAuth app credentials
 * from the connection's config_json (stored via the UI), falling back
 * to GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET env vars.
 *
 * Redirects the browser to Google's authorization endpoint.
 */
export async function GET(request: NextRequest) {
  const connectionId = request.nextUrl.searchParams.get("connection_id");
  if (!connectionId) {
    return NextResponse.json(
      { error: "connection_id query parameter is required." },
      { status: 400 },
    );
  }

  // Fetch OAuth credentials from the control plane (stored in DB)
  let clientId: string | null = null;

  try {
    const origins = getControlPlaneProxyOrigins();
    const cookieHeader = request.headers.get("cookie") ?? "";

    for (const origin of origins) {
      try {
        const url = buildControlPlaneProxyUrl(
          origin,
          ["workspace", "connections", connectionId, "gmail-oauth-credentials"],
          "",
        );
        const res = await fetch(url, {
          headers: { cookie: cookieHeader },
        });
        if (res.ok) {
          const data = (await res.json()) as {
            configured: boolean;
            client_id: string | null;
          };
          if (data.configured && data.client_id) {
            clientId = data.client_id;
          }
          break;
        }
      } catch {
        // Try next origin
      }
    }
  } catch {
    // Fall through to env var fallback
  }

  // Fall back to env vars
  if (!clientId) {
    clientId = process.env.GOOGLE_CLIENT_ID ?? null;
  }

  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "No Google OAuth Client ID configured. Enter your Client ID and Client Secret in the Gmail setup panel first.",
      },
      { status: 400 },
    );
  }

  const redirectUri = new URL("/api/auth/google/callback", request.url).toString();
  const state = connectionId;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/gmail.readonly");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl.toString());
}
