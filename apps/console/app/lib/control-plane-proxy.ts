const LOOPBACK_ORIGINS = ["http://127.0.0.1:3001", "http://127.0.0.1:3011"] as const;

function normalizeOrigin(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getControlPlaneProxyOrigins(
  env: Record<string, string | undefined> = process.env,
) {
  const explicitOrigin = env.CONTROL_PLANE_INTERNAL_URL ?? env.NEXT_PUBLIC_CONTROL_PLANE_URL;
  if (explicitOrigin) {
    return [normalizeOrigin(explicitOrigin)];
  }

  if (env.CONTROL_PLANE_PORT) {
    return [`http://127.0.0.1:${env.CONTROL_PLANE_PORT}`];
  }

  return [...LOOPBACK_ORIGINS];
}

export function buildControlPlaneProxyUrl(
  origin: string,
  pathSegments: string[],
  search: string,
) {
  const path = pathSegments.join("/");
  return new URL(`/api/${path}${search}`, origin);
}
