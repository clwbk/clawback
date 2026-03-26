/**
 * Registers first-party custom panels, props resolvers, and evaluator registrations.
 *
 * Import this module for its side effects before rendering the connections page.
 * Each panel registration maps a manifest ID to a custom React component.
 * Each resolver registration maps a manifest ID to a function that extracts
 * the props that component needs from workspace data.
 */
import { registerProviderPanel } from "../_lib/provider-panel-registry";
import { registerPanelPropsResolver, type ResolverContext } from "../_lib/provider-panel-resolver";
import { GmailOnboardingCard } from "./gmail-onboarding-card";
import { SmtpOnboardingCard } from "./smtp-onboarding-card";
import { DriveOnboardingCard } from "./drive-onboarding-card";
import { GitHubOnboardingCard } from "./github-onboarding-card";
import { WhatsAppOnboardingCard } from "./whatsapp-onboarding-card";
import { SlackOnboardingCard } from "./slack-onboarding-card";
import { N8nOnboardingCard } from "./n8n-onboarding-card";

// Import evaluator registrations as a side effect
import "../_lib/evaluator-registrations";

// ---------------------------------------------------------------------------
// Custom panel registrations (keyed by manifest ID)
// ---------------------------------------------------------------------------

registerProviderPanel("provider.gmail.read-only", GmailOnboardingCard);
registerProviderPanel("provider.smtp-relay", SmtpOnboardingCard);
registerProviderPanel("provider.drive", DriveOnboardingCard);
registerProviderPanel("provider.github", GitHubOnboardingCard);
registerProviderPanel("provider.whatsapp", WhatsAppOnboardingCard);
registerProviderPanel("provider.slack", SlackOnboardingCard);
registerProviderPanel("provider.n8n", N8nOnboardingCard);

// ---------------------------------------------------------------------------
// Props resolver registrations (keyed by manifest ID)
// ---------------------------------------------------------------------------

registerPanelPropsResolver("provider.gmail.read-only", (ctx: ResolverContext) => {
  const workerNames = new Map(ctx.workers.map((w) => [w.id, w.name]));

  const gmailConnection = ctx.connections.find(
    (c) => c.provider === "gmail" && c.access_mode === "read_only",
  ) ?? null;

  const gmailWorkerStatuses = ctx.inputRoutes
    .filter((route) => route.kind === "watched_inbox")
    .map((route) => ({
      workerId: route.worker_id,
      workerName: workerNames.get(route.worker_id) ?? route.worker_id,
      routeStatus: route.status,
      attached: gmailConnection?.attached_worker_ids.includes(route.worker_id) ?? false,
    }));

  return {
    connection: gmailConnection,
    workers: gmailWorkerStatuses,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.github", (ctx: ResolverContext) => {
  const githubConnection = ctx.connections.find(
    (c) => c.provider === "github" && c.access_mode === "read_only",
  ) ?? null;

  return {
    connection: githubConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.drive", (ctx: ResolverContext) => {
  const driveConnection = ctx.connections.find(
    (c) => c.provider === "drive" && c.access_mode === "read_only",
  ) ?? null;

  return {
    connection: driveConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.smtp-relay", (ctx: ResolverContext) => {
  const smtpConnection = ctx.connections.find(
    (c) => c.provider === "smtp_relay" && c.access_mode === "write_capable",
  ) ?? null;

  return {
    connection: smtpConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.whatsapp", (ctx: ResolverContext) => {
  const whatsappConnection = ctx.connections.find(
    (c) => c.provider === "whatsapp" && c.access_mode === "write_capable",
  ) ?? null;

  return {
    connection: whatsappConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.slack", (ctx: ResolverContext) => {
  const slackConnection = ctx.connections.find(
    (c) => c.provider === "slack" && c.access_mode === "write_capable",
  ) ?? null;

  return {
    connection: slackConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.n8n", (ctx: ResolverContext) => {
  const n8nConnection = ctx.connections.find(
    (c) => c.provider === "n8n" && c.access_mode === "write_capable",
  ) ?? null;

  return {
    connection: n8nConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});
