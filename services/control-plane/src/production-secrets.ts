const REQUIRED_PRODUCTION_SECRETS = [
  [
    "COOKIE_SECRET",
    "local-dev-cookie-secret-that-is-long-enough-for-signing",
  ],
  [
    "CLAWBACK_RUNTIME_API_TOKEN",
    "clawback-local-runtime-api-token",
  ],
  [
    "CLAWBACK_APPROVAL_SURFACE_SECRET",
    "clawback-local-approval-surface-secret",
  ],
] as const;

const OPTIONAL_PROVIDER_SECRETS = [
  [
    "CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN",
    "clawback-local-inbound-email-token",
  ],
  [
    "CLAWBACK_GMAIL_WATCH_HOOK_TOKEN",
    "clawback-local-gmail-watch-token",
  ],
  [
    "WHATSAPP_VERIFY_TOKEN",
    "clawback-local-whatsapp-verify-token",
  ],
] as const;

export function resolveOptionalProviderSecret(
  value: string | undefined,
  devDefault: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
) {
  return value ?? (nodeEnv === "production" ? "" : devDefault);
}

export function validateProductionSecrets(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = env.NODE_ENV,
) {
  if (nodeEnv !== "production") {
    return;
  }

  const failures: string[] = [];

  for (const [name, defaultValue] of REQUIRED_PRODUCTION_SECRETS) {
    const value = env[name];
    if (!value || value === defaultValue) {
      failures.push(`  - ${name} is ${!value ? "missing" : "still set to its local development default"}`);
    }
  }

  for (const [name, defaultValue] of OPTIONAL_PROVIDER_SECRETS) {
    const value = env[name];
    if (value && value === defaultValue) {
      failures.push(`  - ${name} is still set to its local development default`);
    }
  }

  if (failures.length === 0) {
    return;
  }

  throw new Error(
    `Production secret validation failed:\n${failures.join("\n")}\n\n` +
      "Set strong values for required secrets. Optional provider webhook secrets may be omitted, but if you set them they cannot reuse local development defaults.",
  );
}
