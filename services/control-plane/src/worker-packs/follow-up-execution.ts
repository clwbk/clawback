import type {
  FollowUpExecutionStateRecord,
  IntentClass,
  RelationshipClass,
  ResolutionMethod,
  SenderResolution,
  WorkerDecision,
  WorkerKind,
} from "@clawback/contracts";
import { buildFollowUpPausedExecutionState } from "@clawback/domain";

import {
  classifyFollowUpIntent,
  decideFollowUpAction,
  getFollowUpRouteTargetKindPreferences,
  resolveFollowUpRelationship,
  type TriageEmailInput,
} from "./follow-up-triage.js";

type RouteTargetKind = Exclude<WorkerKind, "follow_up">;

export type FollowUpRouteTargetWorker = {
  id: string;
  name: string;
  assigneeIds: string[];
  reviewerIds: string[];
};

export interface FollowUpRouteTargetLookup {
  listActiveByKind(
    workspaceId: string,
    kind: RouteTargetKind,
  ): Promise<FollowUpRouteTargetWorker[]>;
}

export type FollowUpExecutionInput = {
  workspaceId: string;
  from: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null | undefined;
  threadSummary?: string | null | undefined;
  senderResolution?: SenderResolution | null | undefined;
  routeTargetLookup?: FollowUpRouteTargetLookup | null | undefined;
};

export type FollowUpProgressionState = "completed" | "waiting_review";

export type FollowUpExecutionArtifact =
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
      targetWorker: FollowUpRouteTargetWorker;
    }
  | {
      kind: "escalation";
    };

export type FollowUpExecutionStep =
  | {
      kind: "gather_context";
      state: "completed";
      output: {
        from: string;
        subject: string;
        has_body_html: boolean;
        has_thread_summary: boolean;
        sender_resolution_method: ResolutionMethod;
      };
    }
  | {
      kind: "resolve_relationship";
      state: "completed";
      output: {
        relationship: RelationshipClass;
        resolution_method: ResolutionMethod | "heuristic";
      };
    }
  | {
      kind: "classify";
      state: "completed";
      output: {
        intent: IntentClass;
        reasons: string[];
      };
    }
  | {
      kind: "decide";
      state: "completed";
      output: {
        decision: WorkerDecision["decision"];
        posture: WorkerDecision["posture"];
        confidence: WorkerDecision["confidence"];
        route_target_worker_id: string | null;
        reasons: string[];
      };
    }
  | {
      kind: "create_artifact";
      state: "completed";
      output: {
        artifact_kind: FollowUpExecutionArtifact["kind"];
        execution_state: FollowUpProgressionState;
        target_worker_id: string | null;
      };
    };

export type FollowUpExecutionProgression = {
  worker_kind: "follow_up";
  execution_state: FollowUpProgressionState;
  steps: FollowUpExecutionStep[];
  triage: WorkerDecision;
  artifact: FollowUpExecutionArtifact;
};

/**
 * Product-owned native execution for Follow-Up inbound email.
 *
 * This is intentionally not a generic workflow engine and not a runtime
 * run record. It is the first explicit worker-execution progression:
 * gather context -> resolve relationship -> classify -> decide ->
 * create the next product artifact.
 */
export async function runFollowUpExecution(
  input: FollowUpExecutionInput,
): Promise<FollowUpExecutionProgression> {
  const triageInput: TriageEmailInput = {
    from: input.from,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    threadSummary: input.threadSummary,
    senderResolution: input.senderResolution,
  };

  const relationship = resolveFollowUpRelationship(triageInput);
  const intent = classifyFollowUpIntent(triageInput);
  let triage = composeFollowUpTriageDecision(triageInput, relationship, intent);
  let routeTargetWorker: FollowUpRouteTargetWorker | null = null;

  if (triage.decision === "route_to_worker") {
    const resolvedRoute = await resolveRouteSuggestion(input.workspaceId, triageInput, triage, input.routeTargetLookup);
    triage = resolvedRoute.triage;
    routeTargetWorker = resolvedRoute.routeTargetWorker;
  }

  const artifact = planArtifact(triage, routeTargetWorker);
  const executionState = artifactRequiresReview(artifact) ? "waiting_review" : "completed";

  return {
    worker_kind: "follow_up",
    execution_state: executionState,
    triage,
    artifact,
    steps: [
      {
        kind: "gather_context",
        state: "completed",
        output: {
          from: triageInput.from,
          subject: triageInput.subject,
          has_body_html: Boolean(triageInput.bodyHtml),
          has_thread_summary: Boolean(triageInput.threadSummary),
          sender_resolution_method: triageInput.senderResolution?.resolution_method ?? "none",
        },
      },
      {
        kind: "resolve_relationship",
        state: "completed",
        output: {
          relationship: relationship.relationship,
          resolution_method: triageInput.senderResolution
            && triageInput.senderResolution.resolution_method !== "none"
            ? triageInput.senderResolution.resolution_method
            : "heuristic",
        },
      },
      {
        kind: "classify",
        state: "completed",
        output: {
          intent: intent.intent,
          reasons: intent.reasons,
        },
      },
      {
        kind: "decide",
        state: "completed",
        output: {
          decision: triage.decision,
          posture: triage.posture,
          confidence: triage.confidence,
          route_target_worker_id: triage.route_target_worker_id ?? null,
          reasons: triage.reasons,
        },
      },
      {
        kind: "create_artifact",
        state: "completed",
        output: {
          artifact_kind: artifact.kind,
          execution_state: executionState,
          target_worker_id: artifact.kind === "route_suggestion" ? artifact.targetWorker.id : null,
        },
      },
    ],
  };
}

function composeFollowUpTriageDecision(
  input: TriageEmailInput,
  relationship: ReturnType<typeof resolveFollowUpRelationship>,
  intent: ReturnType<typeof classifyFollowUpIntent>,
): WorkerDecision {
  const action = decideFollowUpAction({
    relationship: relationship.relationship,
    intent: intent.intent,
    senderResolution: input.senderResolution,
  });
  const shouldIncludeResolutionReasons = !input.senderResolution?.do_not_auto_reply;

  return {
    source_kind: "inbound_email",
    relationship: relationship.relationship,
    intent: intent.intent,
    decision: action.decision,
    posture: action.posture,
    reasons: [
      ...intent.reasons,
      ...action.reasons,
      ...(shouldIncludeResolutionReasons ? relationship.resolution_reasons : []),
    ],
    confidence: action.confidence,
  };
}

async function resolveRouteSuggestion(
  workspaceId: string,
  triageInput: TriageEmailInput,
  triage: WorkerDecision,
  routeTargetLookup?: FollowUpRouteTargetLookup | null,
): Promise<{
  triage: WorkerDecision;
  routeTargetWorker: FollowUpRouteTargetWorker | null;
}> {
  const preferredKinds = getFollowUpRouteTargetKindPreferences(triageInput, triage);
  if (preferredKinds.length === 0) {
    return {
      triage: degradeRouteSuggestion(triage, null, "route_missing"),
      routeTargetWorker: null,
    };
  }

  for (const kind of preferredKinds) {
    const candidates = routeTargetLookup
      ? await routeTargetLookup.listActiveByKind(workspaceId, kind)
      : [];

    if (candidates.length === 1) {
      return {
        triage: {
          ...triage,
          route_target_worker_id: candidates[0]!.id,
          reasons: appendReason(triage.reasons, routeRecommendationReason(kind)),
        },
        routeTargetWorker: candidates[0]!,
      };
    }

    if (candidates.length > 1) {
      return {
        triage: degradeRouteSuggestion(triage, kind, "route_ambiguous"),
        routeTargetWorker: null,
      };
    }
  }

  return {
    triage: degradeRouteSuggestion(triage, preferredKinds[0]!, "route_missing"),
    routeTargetWorker: null,
  };
}

function degradeRouteSuggestion(
  triage: WorkerDecision,
  kind: RouteTargetKind | null,
  failureReason: "route_missing" | "route_ambiguous",
): WorkerDecision {
  let reasons = triage.reasons;
  if (kind) {
    reasons = appendReason(reasons, routeRecommendationReason(kind));
  }

  return {
    ...triage,
    decision: "request_review",
    posture: null,
    route_target_worker_id: null,
    reasons: appendReason(reasons, failureReason),
  };
}

function planArtifact(
  triage: WorkerDecision,
  routeTargetWorker: FollowUpRouteTargetWorker | null,
): FollowUpExecutionArtifact {
  switch (triage.decision) {
    case "ignore":
      return { kind: "ignore_activity" };
    case "shadow_draft":
      return { kind: "shadow_draft", posture: triage.posture };
    case "request_review":
      return { kind: "request_review" };
    case "escalate":
      return { kind: "escalation" };
    case "route_to_worker":
      if (!routeTargetWorker || !triage.route_target_worker_id) {
        return { kind: "request_review" };
      }
      return {
        kind: "route_suggestion",
        targetWorker: routeTargetWorker,
      };
    default:
      return { kind: "shadow_draft", posture: triage.posture };
  }
}

function artifactRequiresReview(artifact: FollowUpExecutionArtifact): boolean {
  return artifact.kind !== "ignore_activity";
}

export function buildFollowUpExecutionStateForArtifact(
  execution: Pick<FollowUpExecutionProgression, "artifact" | "triage">,
): FollowUpExecutionStateRecord | null {
  switch (execution.artifact.kind) {
    case "ignore_activity":
      return null;
    case "route_suggestion":
      return buildFollowUpPausedExecutionState({
        lastDecision: execution.triage.decision,
        pauseReason: "route_confirmation",
        targetWorkerId: execution.artifact.targetWorker.id,
      });
    case "shadow_draft":
    case "request_review":
    case "escalation":
      return buildFollowUpPausedExecutionState({
        lastDecision: execution.triage.decision,
        pauseReason: "human_review",
      });
  }
}

function appendReason(reasons: string[], reason: string): string[] {
  return reasons.includes(reason) ? reasons : [...reasons, reason];
}

function routeRecommendationReason(kind: RouteTargetKind): string {
  return `${kind}_worker_recommended`;
}
