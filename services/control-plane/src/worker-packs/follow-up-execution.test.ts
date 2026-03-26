import { describe, expect, it } from "vitest";
import type { SenderResolution, WorkerKind } from "@clawback/contracts";

import {
  runFollowUpExecution,
  type FollowUpExecutionStep,
  type FollowUpRouteTargetLookup,
  type FollowUpRouteTargetWorker,
} from "./follow-up-execution.js";

function executionInput(
  overrides: Partial<Parameters<typeof runFollowUpExecution>[0]> = {},
): Parameters<typeof runFollowUpExecution>[0] {
  return {
    workspaceId: "ws_test_01",
    from: "client@acmecorp.com",
    subject: "Re: Project update",
    bodyText: "Hi, just checking in on the project status. Any updates?",
    bodyHtml: "<p>Hi, just checking in on the project status. Any updates?</p>",
    threadSummary: "Ongoing project thread",
    ...overrides,
  };
}

function senderResolution(
  overrides: Partial<SenderResolution> = {},
): SenderResolution {
  return {
    contact_id: "cot_test_01",
    account_id: "acc_test_01",
    relationship_class: "customer",
    owner_user_id: "usr_owner_01",
    handling_note: null,
    do_not_auto_reply: false,
    resolution_method: "exact_contact",
    ...overrides,
  };
}

function createRouteTargetWorker(
  kind: WorkerKind,
  overrides: Partial<FollowUpRouteTargetWorker> = {},
): FollowUpRouteTargetWorker {
  return {
    id: `wkr_${kind}_01`,
    name: kind === "proposal" ? "Proposal" : kind === "incident" ? "Incident" : "Bugfix",
    assigneeIds: ["usr_target_assignee"],
    reviewerIds: ["usr_target_reviewer"],
    ...overrides,
  };
}

class FakeRouteTargetLookup implements FollowUpRouteTargetLookup {
  constructor(
    private readonly workersByKind: Partial<Record<WorkerKind, FollowUpRouteTargetWorker[]>>,
  ) {}

  async listActiveByKind(_workspaceId: string, kind: Exclude<WorkerKind, "follow_up">) {
    return this.workersByKind[kind] ?? [];
  }
}

function stepKinds(steps: FollowUpExecutionStep[]): string[] {
  return steps.map((step) => step.kind);
}

describe("runFollowUpExecution", () => {
  it("models the shadow-draft branch as an explicit native execution progression", async () => {
    const execution = await runFollowUpExecution(executionInput());

    expect(stepKinds(execution.steps)).toEqual([
      "gather_context",
      "resolve_relationship",
      "classify",
      "decide",
      "create_artifact",
    ]);
    expect(execution.execution_state).toBe("waiting_review");
    expect(execution.triage.intent).toBe("follow_up");
    expect(execution.triage.decision).toBe("shadow_draft");
    expect(execution.artifact).toMatchObject({
      kind: "shadow_draft",
      posture: "answer",
    });
  });

  it("models the request-review branch explicitly for billing/admin mail", async () => {
    const execution = await runFollowUpExecution(executionInput({
      subject: "Invoice question",
      bodyText: "Hi, can you clarify this invoice and payment timing for the renewal?",
    }));

    expect(execution.execution_state).toBe("waiting_review");
    expect(execution.triage.intent).toBe("billing_admin");
    expect(execution.triage.decision).toBe("request_review");
    expect(execution.artifact).toEqual({ kind: "request_review" });
    expect(execution.steps[3]).toMatchObject({
      kind: "decide",
      output: {
        decision: "request_review",
        route_target_worker_id: null,
      },
    });
  });

  it("models the escalation branch explicitly for legal complaint mail", async () => {
    const execution = await runFollowUpExecution(executionInput({
      subject: "Formal complaint",
      bodyText: "This is unacceptable. We are consulting our attorney regarding this matter.",
    }));

    expect(execution.execution_state).toBe("waiting_review");
    expect(execution.triage.intent).toBe("escalation");
    expect(execution.triage.decision).toBe("escalate");
    expect(execution.artifact).toEqual({ kind: "escalation" });
  });

  it("models the route-suggestion branch explicitly when a safe target exists", async () => {
    const execution = await runFollowUpExecution(executionInput({
      from: "buyer@globex.io",
      subject: "Request for proposal - consulting engagement",
      bodyText: "We would like to discuss a potential consulting engagement. Can you share a proposal for the scope of work?",
      senderResolution: senderResolution({
        relationship_class: "prospect",
      }),
      routeTargetLookup: new FakeRouteTargetLookup({
        proposal: [createRouteTargetWorker("proposal")],
      }),
    }));

    expect(execution.execution_state).toBe("waiting_review");
    expect(execution.triage.intent).toBe("proposal");
    expect(execution.triage.decision).toBe("route_to_worker");
    expect(execution.triage.route_target_worker_id).toBe("wkr_proposal_01");
    expect(execution.artifact).toMatchObject({
      kind: "route_suggestion",
      targetWorker: {
        id: "wkr_proposal_01",
        name: "Proposal",
      },
    });
    expect(execution.steps[4]).toMatchObject({
      kind: "create_artifact",
      output: {
        artifact_kind: "route_suggestion",
        target_worker_id: "wkr_proposal_01",
      },
    });
  });
});
