import type {
  ConnectorRecord,
  ConnectorSyncJobRecord,
  RegistryConnectionProvider,
  RegistrySetupStep,
  WorkspaceActionCapabilityRecord,
  WorkspaceConnectionRecord,
  WorkspaceInputRouteRecord,
  WorkspaceWorkerRecord,
} from "@/lib/control-plane";
import {
  getSetupEvaluator,
  type SetupEvaluatorContext,
} from "./setup-evaluator-registry";
import "./evaluator-registrations";

export type PilotSetupStep = {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  href: string;
  ctaLabel: string;
  /** Worker ID associated with this step, if any */
  workerId?: string | undefined;
};

type BuildPilotSetupStepsInput = {
  workers: WorkspaceWorkerRecord[];
  connections: WorkspaceConnectionRecord[];
  inputRoutes: WorkspaceInputRouteRecord[];
  actionCapabilities: WorkspaceActionCapabilityRecord[];
  connectors: ConnectorRecord[];
  syncJobsByConnector: Map<string, ConnectorSyncJobRecord[]>;
  /** Optional registry metadata for enriching step labels/descriptions */
  providerMeta?: Map<string, RegistryConnectionProvider>;
};

type RegisteredStepConfig = {
  pluginId: string;
  stepId: string;
  fallbackTitle: string;
  fallbackDescription: string;
  fallbackCtaLabel: string;
  buildHref: (followUpWorkerId: string | undefined) => string;
};

/**
 * Find a setup step by its stable ID within a provider's setup_steps array.
 * This replaces positional lookups like `setup_steps[0]` / `setup_steps[1]`.
 */
function findStepById(
  provider: RegistryConnectionProvider | undefined,
  stepId: string,
): RegistrySetupStep | undefined {
  return provider?.setup_steps.find((s) => s.id === stepId);
}

/**
 * Evaluate step completion using the evaluator registry.
 * If no evaluator is registered for this plugin/step pair, returns false
 * (informational / not yet automated).
 */
function evaluateStep(
  pluginId: string,
  stepId: string,
  ctx: SetupEvaluatorContext,
): boolean {
  const evaluator = getSetupEvaluator(pluginId, stepId);
  if (!evaluator) return false;
  return evaluator(ctx);
}

function buildRegisteredStep(
  config: RegisteredStepConfig,
  provider: RegistryConnectionProvider | undefined,
  evaluatorCtx: SetupEvaluatorContext,
  followUpWorkerId: string | undefined,
): PilotSetupStep {
  const manifestStep = findStepById(provider, config.stepId);

  return {
    id: `${config.pluginId}:${config.stepId}`,
    title: manifestStep?.title ?? config.fallbackTitle,
    description: manifestStep?.description ?? config.fallbackDescription,
    complete: evaluateStep(config.pluginId, config.stepId, evaluatorCtx),
    href: config.buildHref(followUpWorkerId),
    ctaLabel: manifestStep?.ctaLabel ?? config.fallbackCtaLabel,
    workerId: followUpWorkerId,
  };
}

const GMAIL_CONNECT_STEP: RegisteredStepConfig = {
  pluginId: "provider.gmail.read-only",
  stepId: "gmail-credentials",
  fallbackTitle: "Connect Gmail read-only",
  fallbackDescription:
    "Validate the Google credentials, choose the recommended scope, and connect the shared mailbox for read-only watch.",
  fallbackCtaLabel: "Set up Gmail",
  buildHref: () => "/workspace/connections?focus=gmail",
};

const KNOWLEDGE_CONNECTOR_STEP: RegisteredStepConfig = {
  pluginId: "connector.local-directory",
  stepId: "seeded-knowledge-ready",
  fallbackTitle: "Confirm seeded knowledge source",
  fallbackDescription:
    "Open Knowledge, confirm the seeded Company Docs connector exists, and verify that at least one sync has indexed real documents.",
  fallbackCtaLabel: "Open Knowledge",
  buildHref: () => "/workspace/connectors",
};

const SMTP_CONFIGURE_STEP: RegisteredStepConfig = {
  pluginId: "provider.smtp-relay",
  stepId: "smtp-configure",
  fallbackTitle: "Configure SMTP relay",
  fallbackDescription:
    "Set the required SMTP environment variables on the control-plane server, then verify and connect the relay for reviewed sends.",
  fallbackCtaLabel: "Configure SMTP relay",
  buildHref: () => "/workspace/connections?focus=smtp",
};

const INSTALL_WORKER_STEP: RegisteredStepConfig = {
  pluginId: "worker-pack.follow-up",
  stepId: "install-follow-up",
  fallbackTitle: "Install and configure workers",
  fallbackDescription:
    "Install the worker pack you need, then assign members, assignees, and reviewers on the worker page.",
  fallbackCtaLabel: "Install workers",
  buildHref: () => "/workspace/workers",
};

const GMAIL_ATTACH_STEP: RegisteredStepConfig = {
  pluginId: "provider.gmail.read-only",
  stepId: "gmail-attach-worker",
  fallbackTitle: "Attach Gmail to worker",
  fallbackDescription:
    "Attach the Gmail read-only connection to workers that use watched inbox so proactive monitoring becomes available.",
  fallbackCtaLabel: "Attach Gmail to worker",
  buildHref: (followUpWorkerId) =>
    followUpWorkerId
      ? `/workspace/workers/${followUpWorkerId}?focus=connections`
      : "/workspace/connections?focus=gmail",
};

const WATCHED_INBOX_STEP: RegisteredStepConfig = {
  pluginId: "ingress.gmail.watch-hook",
  stepId: "gmail-watch-hook",
  fallbackTitle: "Activate watched inbox",
  fallbackDescription:
    "Once Gmail is connected and attached, watched inbox should move to active and start creating shadow suggestions.",
  fallbackCtaLabel: "Activate watched inbox",
  buildHref: (followUpWorkerId) =>
    followUpWorkerId
      ? `/workspace/workers/${followUpWorkerId}?focus=routes`
      : "/workspace/connections",
};

const FORWARDED_EMAIL_STEP: RegisteredStepConfig = {
  pluginId: "ingress.forward-email",
  stepId: "forward-email-ready",
  fallbackTitle: "Keep forwarded email intake ready",
  fallbackDescription:
    "Forwarded email is still the simplest zero-trust intake path. Keep at least one forward-email route active for public try and day-one recovery.",
  fallbackCtaLabel: "View routes",
  buildHref: (followUpWorkerId) =>
    followUpWorkerId
      ? `/workspace/workers/${followUpWorkerId}?focus=routes`
      : "/workspace/workers",
};

const REVIEWED_SEND_STEP: RegisteredStepConfig = {
  pluginId: "action.smtp-reviewed-send",
  stepId: "smtp-reviewed-send",
  fallbackTitle: "Configure send approval",
  fallbackDescription:
    "Reviewed send should stay truthful: SMTP relay connected, send_email enabled, and boundary mode not set to never.",
  fallbackCtaLabel: "Configure send approval",
  buildHref: (followUpWorkerId) =>
    followUpWorkerId
      ? `/workspace/workers/${followUpWorkerId}?focus=actions`
      : "/workspace/workers",
};

export function buildPilotSetupSteps({
  workers,
  connections,
  inputRoutes,
  actionCapabilities,
  connectors,
  syncJobsByConnector,
  providerMeta,
}: BuildPilotSetupStepsInput): PilotSetupStep[] {
  const evaluatorCtx: SetupEvaluatorContext = {
    workers,
    connections,
    inputRoutes,
    actionCapabilities,
    connectors,
    syncJobsByConnector,
  };

  // Find the first worker with a watched_inbox route (the follow-up worker)
  const followUpWorker = workers.find((w) =>
    inputRoutes.some((r) => r.kind === "watched_inbox" && r.worker_id === w.id),
  );
  const followUpWorkerId = followUpWorker?.id;

  // Look up registry metadata by provider name
  const gmailMeta = providerMeta?.get("gmail");
  const smtpMeta = providerMeta?.get("smtp_relay");

  return [
    buildRegisteredStep(KNOWLEDGE_CONNECTOR_STEP, undefined, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(INSTALL_WORKER_STEP, undefined, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(FORWARDED_EMAIL_STEP, undefined, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(SMTP_CONFIGURE_STEP, smtpMeta, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(REVIEWED_SEND_STEP, undefined, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(GMAIL_CONNECT_STEP, gmailMeta, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(GMAIL_ATTACH_STEP, gmailMeta, evaluatorCtx, followUpWorkerId),
    buildRegisteredStep(WATCHED_INBOX_STEP, undefined, evaluatorCtx, followUpWorkerId),
  ];
}
