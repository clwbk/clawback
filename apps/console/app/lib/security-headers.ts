export function buildConsoleContentSecurityPolicy(
  nodeEnv: string = process.env.NODE_ENV ?? "development",
) {
  const scriptSrc = ["'self'", "'unsafe-inline'"];
  const connectSrc = ["'self'", "https:"];

  if (nodeEnv !== "production") {
    scriptSrc.push("'unsafe-eval'");
    connectSrc.push("http:", "ws:", "wss:");
  } else {
    connectSrc.push("wss:");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `script-src ${scriptSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
  ].join("; ");
}

export function buildConsoleSecurityHeaders(
  nodeEnv: string = process.env.NODE_ENV ?? "development",
) {
  return [
    {
      key: "Content-Security-Policy",
      value: buildConsoleContentSecurityPolicy(nodeEnv),
    },
    {
      key: "Referrer-Policy",
      value: "strict-origin-when-cross-origin",
    },
    {
      key: "X-Content-Type-Options",
      value: "nosniff",
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
  ];
}
