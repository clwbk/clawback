import type {
  AnyPluginManifest,
  ConnectionProviderPluginManifest,
  IngressAdapterPluginManifest,
  ActionExecutorPluginManifest,
  WorkerPackPluginManifest,
} from "@clawback/plugin-sdk";

// ---------------------------------------------------------------------------
// Connection providers
// ---------------------------------------------------------------------------

export { gmailReadOnlyProvider } from "./connection-providers/gmail-read-only.js";
export { n8nProvider } from "./connection-providers/n8n.js";
export { smtpRelayProvider } from "./connection-providers/smtp-relay.js";
export { calendarProvider } from "./connection-providers/calendar.js";
export { driveProvider } from "./connection-providers/drive.js";
export { githubProvider } from "./connection-providers/github.js";
export { notionProvider } from "./connection-providers/notion.js";
export { slackProvider } from "./connection-providers/slack.js";
export { whatsappProvider } from "./connection-providers/whatsapp.js";

// ---------------------------------------------------------------------------
// Ingress adapters
// ---------------------------------------------------------------------------

export { postmarkInboundAdapter } from "./ingress-adapters/postmark-inbound.js";
export { gmailWatchHookAdapter } from "./ingress-adapters/gmail-watch.js";

// ---------------------------------------------------------------------------
// Action executors
// ---------------------------------------------------------------------------

export { smtpReviewedSendExecutor } from "./action-executors/smtp-send.js";
export { n8nWorkflowExecutor } from "./action-executors/n8n-workflow.js";

// ---------------------------------------------------------------------------
// Worker packs
// ---------------------------------------------------------------------------

export { followUpWorkerPackManifest } from "./worker-packs/follow-up.js";
export { proposalWorkerPackManifest } from "./worker-packs/proposal.js";
export { incidentWorkerPackManifest } from "./worker-packs/incident.js";
export { bugfixWorkerPackManifest } from "./worker-packs/bugfix.js";
export { syntheticValidationWorkerPackManifest } from "./worker-packs/synthetic-validation.js";

// ---------------------------------------------------------------------------
// Aggregate arrays (typed const arrays for compile-time safety)
// ---------------------------------------------------------------------------

import { gmailReadOnlyProvider } from "./connection-providers/gmail-read-only.js";
import { n8nProvider } from "./connection-providers/n8n.js";
import { smtpRelayProvider } from "./connection-providers/smtp-relay.js";
import { calendarProvider } from "./connection-providers/calendar.js";
import { driveProvider } from "./connection-providers/drive.js";
import { githubProvider } from "./connection-providers/github.js";
import { notionProvider } from "./connection-providers/notion.js";
import { slackProvider } from "./connection-providers/slack.js";
import { whatsappProvider } from "./connection-providers/whatsapp.js";
import { postmarkInboundAdapter } from "./ingress-adapters/postmark-inbound.js";
import { gmailWatchHookAdapter } from "./ingress-adapters/gmail-watch.js";
import { smtpReviewedSendExecutor } from "./action-executors/smtp-send.js";
import { n8nWorkflowExecutor } from "./action-executors/n8n-workflow.js";
import { followUpWorkerPackManifest } from "./worker-packs/follow-up.js";
import { proposalWorkerPackManifest } from "./worker-packs/proposal.js";
import { incidentWorkerPackManifest } from "./worker-packs/incident.js";
import { bugfixWorkerPackManifest } from "./worker-packs/bugfix.js";

export const connectionProviderPlugins: readonly ConnectionProviderPluginManifest[] = [
  gmailReadOnlyProvider,
  n8nProvider,
  smtpRelayProvider,
  calendarProvider,
  driveProvider,
  githubProvider,
  notionProvider,
  slackProvider,
  whatsappProvider,
];

export const ingressAdapterPlugins: readonly IngressAdapterPluginManifest[] = [
  postmarkInboundAdapter,
  gmailWatchHookAdapter,
];

export const actionExecutorPlugins: readonly ActionExecutorPluginManifest[] = [
  smtpReviewedSendExecutor,
  n8nWorkflowExecutor,
];

export const workerPackPlugins: readonly WorkerPackPluginManifest[] = [
  followUpWorkerPackManifest,
  proposalWorkerPackManifest,
  incidentWorkerPackManifest,
  bugfixWorkerPackManifest,
];

// ---------------------------------------------------------------------------
// Registry type and firstPartyRegistry instance
// ---------------------------------------------------------------------------

export type FirstPartyRegistry = {
  connectionProviders: readonly ConnectionProviderPluginManifest[];
  ingressAdapters: readonly IngressAdapterPluginManifest[];
  actionExecutors: readonly ActionExecutorPluginManifest[];
  workerPacks: readonly WorkerPackPluginManifest[];
  all: readonly AnyPluginManifest[];
};

function assertUniqueIds(values: readonly { id: string }[]) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      throw new Error(`Duplicate plugin manifest id: ${value.id}`);
    }
    seen.add(value.id);
  }
}

assertUniqueIds(connectionProviderPlugins);
assertUniqueIds(ingressAdapterPlugins);
assertUniqueIds(actionExecutorPlugins);
assertUniqueIds(workerPackPlugins);

export const firstPartyRegistry: FirstPartyRegistry = {
  connectionProviders: connectionProviderPlugins,
  ingressAdapters: ingressAdapterPlugins,
  actionExecutors: actionExecutorPlugins,
  workerPacks: workerPackPlugins,
  all: [
    ...connectionProviderPlugins,
    ...ingressAdapterPlugins,
    ...actionExecutorPlugins,
    ...workerPackPlugins,
  ],
};

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getConnectionProviderPlugin(pluginId: string) {
  return connectionProviderPlugins.find((p) => p.id === pluginId) ?? null;
}

export function getConnectionProviderByProvider(provider: string) {
  return connectionProviderPlugins.find((p) => p.provider === provider) ?? null;
}

export function getIngressAdapterPlugin(pluginId: string) {
  return ingressAdapterPlugins.find((p) => p.id === pluginId) ?? null;
}

export function getActionExecutorPlugin(pluginId: string) {
  return actionExecutorPlugins.find((p) => p.id === pluginId) ?? null;
}

export function getActionExecutorByKind(actionKind: string) {
  return actionExecutorPlugins.find((p) => p.actionKind === actionKind) ?? null;
}

export function getWorkerPackPlugin(workerPackId: string) {
  return workerPackPlugins.find((p) => p.workerPackId === workerPackId) ?? null;
}

export function listConnectionProviderPlugins() {
  return [...connectionProviderPlugins];
}

export function listIngressAdapterPlugins() {
  return [...ingressAdapterPlugins];
}

export function listActionExecutorPlugins() {
  return [...actionExecutorPlugins];
}

export function listWorkerPackPlugins() {
  return [...workerPackPlugins];
}
