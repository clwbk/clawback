import { describe, expect, it } from "vitest";

import {
  resolveOptionalProviderSecret,
  validateProductionSecrets,
} from "./production-secrets.js";

describe("production secrets", () => {
  it("keeps optional provider secrets absent in production", () => {
    expect(
      resolveOptionalProviderSecret(
        undefined,
        "clawback-local-inbound-email-token",
        "production",
      ),
    ).toBe("");
  });

  it("uses development defaults outside production", () => {
    expect(
      resolveOptionalProviderSecret(
        undefined,
        "clawback-local-inbound-email-token",
        "development",
      ),
    ).toBe("clawback-local-inbound-email-token");
  });

  it("rejects missing required secrets in production", () => {
    expect(() =>
      validateProductionSecrets(
        {
          NODE_ENV: "production",
          COOKIE_SECRET: undefined,
          CLAWBACK_RUNTIME_API_TOKEN: "runtime-token",
          CLAWBACK_APPROVAL_SURFACE_SECRET: "approval-secret",
        },
        "production",
      ),
    ).toThrow(/COOKIE_SECRET is missing/);
  });

  it("allows optional provider webhook secrets to be omitted in production", () => {
    expect(() =>
      validateProductionSecrets(
        {
          NODE_ENV: "production",
          COOKIE_SECRET: "cookie-secret",
          CLAWBACK_RUNTIME_API_TOKEN: "runtime-token",
          CLAWBACK_APPROVAL_SURFACE_SECRET: "approval-secret",
          CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN: undefined,
          CLAWBACK_GMAIL_WATCH_HOOK_TOKEN: undefined,
          WHATSAPP_VERIFY_TOKEN: undefined,
        },
        "production",
      ),
    ).not.toThrow();
  });

  it("rejects optional provider secrets that reuse local dev defaults", () => {
    expect(() =>
      validateProductionSecrets(
        {
          NODE_ENV: "production",
          COOKIE_SECRET: "cookie-secret",
          CLAWBACK_RUNTIME_API_TOKEN: "runtime-token",
          CLAWBACK_APPROVAL_SURFACE_SECRET: "approval-secret",
          CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN: "clawback-local-inbound-email-token",
        },
        "production",
      ),
    ).toThrow(/CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN is still set to its local development default/);
  });
});
