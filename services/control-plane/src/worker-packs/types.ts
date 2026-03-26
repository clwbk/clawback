import type {
  ExecutionContinuityPauseReason,
  ExecutionContinuityResumeReason,
  ExecutionContinuityStateRecord,
  WorkerKind,
  WorkerScope,
  InputRouteKind,
  InputRouteStatus,
  WorkItemKind,
  ActionCapabilityKind,
  BoundaryMode,
  SenderResolution,
  WorkerDecision,
} from "@clawback/contracts";
import type { WorkerPackPluginManifest } from "@clawback/plugin-sdk";

/**
 * Install-time route declaration for a worker pack.
 */
export type WorkerPackInstallInputRoute = {
  kind: InputRouteKind;
  label: string;
  description: string;
  capabilityNote?: string;
  initialStatus?: InputRouteStatus;
};

/**
 * Install-time action capability declaration for a worker pack.
 */
export type WorkerPackInstallActionCapability = {
  kind: ActionCapabilityKind;
  defaultBoundaryMode: BoundaryMode;
};

/**
 * Install-time spec for materializing a worker pack into a workspace.
 */
export type WorkerPackInstallSpec = {
  summary: string;
  systemPrompt: string;
  supportedInputRoutes: WorkerPackInstallInputRoute[];
  actionCapabilities: WorkerPackInstallActionCapability[];
};

export type WorkerPackRouteTargetWorker = {
  id: string;
  name: string;
  assigneeIds: string[];
  reviewerIds: string[];
};

export interface WorkerPackRouteTargetLookup {
  listActiveByKind(
    workspaceId: string,
    kind: WorkerKind,
  ): Promise<WorkerPackRouteTargetWorker[]>;
}

export type WorkerPackRuntimeArtifact =
  | {
      kind: "ignore_activity";
    }
  | {
      kind: "shadow_draft";
      posture: WorkerDecision["posture"];
    }
  | {
      kind: "request_review";
    }
  | {
      kind: "route_suggestion";
      targetWorker: WorkerPackRouteTargetWorker;
    }
  | {
      kind: "escalation";
    };

export type WorkerPackWatchedInboxExecutionInput = {
  workspaceId: string;
  from: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null | undefined;
  threadSummary?: string | null | undefined;
  senderResolution?: SenderResolution | null | undefined;
  routeTargetLookup?: WorkerPackRouteTargetLookup | null | undefined;
};

export type WorkerPackWatchedInboxExecutionResult = {
  triage: WorkerDecision;
  artifact: WorkerPackRuntimeArtifact;
  executionState: ExecutionContinuityStateRecord | null;
};

export type WorkerPackRuntimeHooks = {
  parseExecutionState(value: unknown): ExecutionContinuityStateRecord | null;
  buildPausedExecutionState(input: {
    lastDecision: WorkerDecision["decision"];
    pauseReason: ExecutionContinuityPauseReason;
    targetWorkerId?: string | null;
  }): ExecutionContinuityStateRecord;
  resumeAfterReviewDecision(
    state: ExecutionContinuityStateRecord,
    decision: "approved" | "denied",
  ): ExecutionContinuityStateRecord;
  markActionRunning(
    state: ExecutionContinuityStateRecord,
  ): ExecutionContinuityStateRecord;
  markCompleted(
    state: ExecutionContinuityStateRecord,
    resumeReason?: ExecutionContinuityResumeReason | null,
  ): ExecutionContinuityStateRecord;
  markFailed(
    state: ExecutionContinuityStateRecord,
  ): ExecutionContinuityStateRecord;
  resumeAfterRouteConfirmation(
    state: ExecutionContinuityStateRecord,
    input: {
      targetWorkerId: string | null;
      downstreamWorkItemId: string;
    },
  ): ExecutionContinuityStateRecord;
  runWatchedInboxExecution?(
    input: WorkerPackWatchedInboxExecutionInput,
  ): Promise<WorkerPackWatchedInboxExecutionResult>;
};

/**
 * Optional runtime declaration. Only Follow-Up fills this today; other packs
 * can stay install-only until they acquire real governed execution behavior.
 */
export type WorkerPackRuntimeDeclaration = {
  continuityFamily: "governed_action";
  persistedStateSchema: "execution_continuity";
  resumesAfterReview: boolean;
  resumesAfterRouteConfirmation: boolean;
  hooks: WorkerPackRuntimeHooks;
};

/**
 * Unified control-plane worker-pack contract.
 *
 * The manifest remains the source of truth for platform discovery and
 * compatibility metadata. The install block owns control-plane defaults used
 * when a pack is materialized into a workspace. Runtime is optional and only
 * present for packs with real governed execution hooks.
 */
export type WorkerPackContract = {
  manifest: WorkerPackPluginManifest;
  install: WorkerPackInstallSpec;
  runtime?: WorkerPackRuntimeDeclaration;

  // Compatibility projection for existing call sites and tests while the new
  // nested contract becomes the canonical access path.
  id: string;
  name: string;
  kind: WorkerKind;
  defaultScope: WorkerScope;
  summary: string;
  systemPrompt: string;
  supportedInputRoutes: WorkerPackInstallInputRoute[];
  outputKinds: WorkItemKind[];
  actionCapabilities: WorkerPackInstallActionCapability[];
};

export type WorkerPackDefinition = WorkerPackContract;
export type RuntimeCapableWorkerPackContract = WorkerPackContract & {
  runtime: WorkerPackRuntimeDeclaration;
};

function sorted(values: string[]) {
  return [...values].sort();
}

function assertAlignedKinds(label: string, actual: string[], expected: readonly string[]) {
  if (JSON.stringify(sorted(actual)) !== JSON.stringify(sorted([...expected]))) {
    throw new Error(
      `${label} mismatch: install declares [${sorted(actual).join(", ")}] but manifest declares [${sorted([...expected]).join(", ")}]`,
    );
  }
}

export function defineWorkerPackContract(input: {
  manifest: WorkerPackPluginManifest;
  install: WorkerPackInstallSpec;
  runtime?: WorkerPackRuntimeDeclaration;
}): WorkerPackContract {
  assertAlignedKinds(
    `Worker pack ${input.manifest.workerPackId} input routes`,
    input.install.supportedInputRoutes.map((route) => route.kind),
    input.manifest.supportedInputRouteKinds,
  );
  assertAlignedKinds(
    `Worker pack ${input.manifest.workerPackId} action kinds`,
    input.install.actionCapabilities.map((action) => action.kind),
    input.manifest.actionKinds,
  );

  return {
    manifest: input.manifest,
    install: input.install,
    ...(input.runtime ? { runtime: input.runtime } : {}),

    id: input.manifest.workerPackId,
    name: input.manifest.displayName,
    kind: input.manifest.workerKind,
    defaultScope: input.manifest.defaultScope,
    summary: input.install.summary,
    systemPrompt: input.install.systemPrompt,
    supportedInputRoutes: input.install.supportedInputRoutes,
    outputKinds: [...input.manifest.outputKinds],
    actionCapabilities: input.install.actionCapabilities,
  };
}

export function isRuntimeCapableWorkerPack(
  pack: WorkerPackContract,
): pack is RuntimeCapableWorkerPackContract {
  return Boolean(pack.runtime);
}

/**
 * Result of installing a worker pack into a workspace.
 */
export type WorkerPackInstallResult = {
  workerId: string;
  inputRouteIds: string[];
  actionCapabilityIds: string[];
};
