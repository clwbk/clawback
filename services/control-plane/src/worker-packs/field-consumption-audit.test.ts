import { describe, expect, it } from "vitest";

import { followUpWorkerPack } from "./follow-up-pack.js";
import { proposalWorkerPack } from "./proposal-pack.js";
import { incidentWorkerPack } from "./incident-pack.js";
import { bugfixWorkerPack } from "./bugfix-pack.js";
import { getRuntimeWorkerPackByKind } from "./index.js";

describe("worker-pack field consumption audit", () => {
  it("treats systemPrompt as reserved contract metadata", () => {
    expect(followUpWorkerPack.systemPrompt.trim().length).toBeGreaterThan(0);
    expect(proposalWorkerPack.systemPrompt.trim().length).toBeGreaterThan(0);
    expect(incidentWorkerPack.systemPrompt.trim().length).toBeGreaterThan(0);
    expect(bugfixWorkerPack.systemPrompt.trim().length).toBeGreaterThan(0);
  });

  it("keeps outputKinds as discovery/alignment metadata", () => {
    expect(followUpWorkerPack.outputKinds).toContain("email_draft");
    expect(proposalWorkerPack.outputKinds).toContain("proposal_draft");
    expect(incidentWorkerPack.outputKinds).toContain("ticket_draft");
    expect(bugfixWorkerPack.outputKinds).toContain("ticket_draft");
  });

  it("exposes runtime declarations only on runtime-capable packs", () => {
    expect(followUpWorkerPack.runtime?.continuityFamily).toBe("governed_action");
    expect(followUpWorkerPack.runtime?.persistedStateSchema).toBe("execution_continuity");
    expect(followUpWorkerPack.runtime?.resumesAfterReview).toBe(true);
    expect(followUpWorkerPack.runtime?.resumesAfterRouteConfirmation).toBe(true);

    expect(proposalWorkerPack.runtime).toBeUndefined();
    expect(incidentWorkerPack.runtime).toBeUndefined();
    expect(bugfixWorkerPack.runtime).toBeUndefined();
  });

  it("routes runtime-capable lookup through the registry helper", () => {
    expect(getRuntimeWorkerPackByKind("follow_up")?.id).toBe("follow_up_v1");
    expect(getRuntimeWorkerPackByKind("proposal")).toBeNull();
    expect(getRuntimeWorkerPackByKind("incident")).toBeNull();
    expect(getRuntimeWorkerPackByKind("bugfix")).toBeNull();
  });
});
