import { NextRequest } from "next/server";
import {
  buildControlPlaneProxyUrl,
  getControlPlaneProxyOrigins,
} from "@/lib/control-plane-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function methodAllowsBody(method: string) {
  return !["GET", "HEAD"].includes(method.toUpperCase());
}

async function proxyToControlPlane(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> | { path: string[] } },
) {
  const resolvedParams = await context.params;
  const search = new URL(request.url).search;
  const origins = getControlPlaneProxyOrigins();
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");

  const body = methodAllowsBody(request.method)
    ? new Uint8Array(await request.arrayBuffer())
    : undefined;

  let lastError: unknown = null;

  for (const origin of origins) {
    try {
      const requestInit: RequestInit & { duplex?: "half" } = {
        method: request.method,
        headers,
        redirect: "manual",
      };

      if (body) {
        requestInit.body = body;
        requestInit.duplex = "half";
      }

      const upstream = await fetch(
        buildControlPlaneProxyUrl(origin, resolvedParams.path, search),
        requestInit,
      );

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    } catch (error) {
      lastError = error;
    }
  }

  return Response.json(
    {
      error:
        lastError instanceof Error
          ? lastError.message
          : "Failed to reach the control plane.",
    },
    { status: 502 },
  );
}

export const GET = proxyToControlPlane;
export const POST = proxyToControlPlane;
export const PATCH = proxyToControlPlane;
export const PUT = proxyToControlPlane;
export const DELETE = proxyToControlPlane;
export const HEAD = proxyToControlPlane;
export const OPTIONS = proxyToControlPlane;
