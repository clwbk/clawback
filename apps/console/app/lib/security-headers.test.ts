import { describe, expect, it } from "vitest";

import {
  buildConsoleContentSecurityPolicy,
  buildConsoleSecurityHeaders,
} from "./security-headers";

describe("console security headers", () => {
  it("builds a development CSP that allows local HMR connections", () => {
    const csp = buildConsoleContentSecurityPolicy("development");

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' https: http: ws: wss:");
  });

  it("builds a production CSP without development-only script allowances", () => {
    const csp = buildConsoleContentSecurityPolicy("production");

    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' https: wss:");
  });

  it("publishes the expected security header set", () => {
    const headers = buildConsoleSecurityHeaders("production");

    expect(headers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "Content-Security-Policy" }),
        expect.objectContaining({
          key: "Referrer-Policy",
          value: "strict-origin-when-cross-origin",
        }),
        expect.objectContaining({
          key: "X-Content-Type-Options",
          value: "nosniff",
        }),
        expect.objectContaining({
          key: "X-Frame-Options",
          value: "DENY",
        }),
        expect.objectContaining({
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=()",
        }),
      ]),
    );
  });
});
