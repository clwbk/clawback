import { describe, expect, it, beforeEach } from "vitest";

import { followUpWorkerPack } from "./follow-up-pack.js";
import { proposalWorkerPack } from "./proposal-pack.js";
import { WorkerPackInstallService, generateForwardingAddress } from "./install-service.js";

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

type CreatedWorker = {
  id: string;
  slug: string;
  workspaceId: string;
  name: string;
  kind: string;
  scope?: string | undefined;
  summary?: string | null | undefined;
  status?: string;
  inputRouteIds?: string[];
  actionIds?: string[];
};

class FakeWorkerService {
  readonly workers: CreatedWorker[] = [];
  private counter = 0;

  async create(
    workspaceId: string,
    input: {
      name: string;
      kind: string;
      scope?: string;
      summary?: string | null;
    },
  ) {
    this.counter += 1;
    const slug = input.name.toLowerCase().replace(/\s+/g, "-");
    const worker: CreatedWorker = {
      id: `wkr_test_${this.counter}`,
      slug,
      workspaceId,
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      summary: input.summary,
    };
    this.workers.push(worker);
    return worker;
  }

  async update(workspaceId: string, id: string, input: { status?: string; inputRouteIds?: string[]; actionIds?: string[] }) {
    const worker = this.workers.find((w) => w.id === id && w.workspaceId === workspaceId);
    if (worker) {
      if (input.status) worker.status = input.status;
      if (input.inputRouteIds) worker.inputRouteIds = input.inputRouteIds;
      if (input.actionIds) worker.actionIds = input.actionIds;
    }
    return worker;
  }
}

type CreatedRoute = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: string;
  status: string;
  label: string;
  description?: string | null | undefined;
  capabilityNote?: string | null | undefined;
  address: string | null;
};

class FakeInputRouteStore {
  readonly routes: CreatedRoute[] = [];

  async create(input: {
    id: string;
    workspaceId: string;
    workerId: string;
    kind: string;
    status: string;
    label: string;
    description?: string | null;
    capabilityNote?: string | null;
    address: string | null;
  }) {
    const route = { ...input };
    this.routes.push(route);
    return route;
  }
}

type CreatedAction = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: string;
  boundaryMode: string;
};

class FakeActionCapabilityStore {
  readonly actions: CreatedAction[] = [];

  async create(input: { id: string; workspaceId: string; workerId: string; kind: string; boundaryMode: string }) {
    const action = { ...input };
    this.actions.push(action);
    return action;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateForwardingAddress", () => {
  it("generates deterministic forwarding address", () => {
    const address = generateForwardingAddress("client-follow-up", "hartwell", "inbound.clawback.dev");
    expect(address).toBe("client-follow-up-hartwell@inbound.clawback.dev");
  });
});

describe("WorkerPackInstallService", () => {
  let workerService: FakeWorkerService;
  let inputRouteStore: FakeInputRouteStore;
  let actionCapabilityStore: FakeActionCapabilityStore;
  let installService: WorkerPackInstallService;

  beforeEach(() => {
    workerService = new FakeWorkerService();
    inputRouteStore = new FakeInputRouteStore();
    actionCapabilityStore = new FakeActionCapabilityStore();

    installService = new WorkerPackInstallService({
      workerService,
      inputRouteStore,
      actionCapabilityStore,
      now: () => new Date("2026-03-18T10:00:00Z"),
    });
  });

  it("installs the follow-up worker pack into a workspace", async () => {
    const result = await installService.install(followUpWorkerPack, {
      workspaceId: "ws_test",
      workspaceSlug: "acme",
      memberIds: ["usr_dave", "usr_emma"],
      assigneeIds: ["usr_emma"],
      reviewerIds: ["usr_dave"],
    });

    // Worker was created
    expect(result.workerId).toMatch(/^wkr_test_/);
    expect(workerService.workers).toHaveLength(1);
    expect(workerService.workers[0]!.name).toBe("Client Follow-Up");
    expect(workerService.workers[0]!.kind).toBe("follow_up");
    expect(workerService.workers[0]!.scope).toBe("shared");
    expect(workerService.workers[0]!.summary).toBe(followUpWorkerPack.summary);
    expect(workerService.workers[0]).not.toHaveProperty("systemPrompt");
    expect(workerService.workers[0]).not.toHaveProperty("outputKinds");

    // Input routes were created (chat, forward_email, watched_inbox)
    expect(result.inputRouteIds).toHaveLength(3);
    expect(inputRouteStore.routes).toHaveLength(3);

    // Chat route
    const chatRoute = inputRouteStore.routes.find((r) => r.kind === "chat");
    expect(chatRoute).toBeDefined();
    expect(chatRoute!.status).toBe("active");
    expect(chatRoute!.address).toBeNull();
    expect(chatRoute!.capabilityNote).toBeNull();

    // Forward email route has a generated address
    const emailRoute = inputRouteStore.routes.find((r) => r.kind === "forward_email");
    expect(emailRoute).toBeDefined();
    expect(emailRoute!.status).toBe("active");
    expect(emailRoute!.address).toBe("client-follow-up-acme@inbound.clawback.dev");
    expect(emailRoute!.capabilityNote).toBe("Parses forwarded threads and extracts action items.");

    // Watched inbox starts as suggested
    const watchedRoute = inputRouteStore.routes.find((r) => r.kind === "watched_inbox");
    expect(watchedRoute).toBeDefined();
    expect(watchedRoute!.status).toBe("suggested");
    expect(watchedRoute!.capabilityNote).toBe("Read-only monitoring via Gmail connection.");

    // Action capabilities were created
    expect(result.actionCapabilityIds).toHaveLength(2);
    expect(actionCapabilityStore.actions).toHaveLength(2);

    const sendAction = actionCapabilityStore.actions.find((a) => a.kind === "send_email");
    expect(sendAction!.boundaryMode).toBe("ask_me");

    const saveAction = actionCapabilityStore.actions.find((a) => a.kind === "save_work");
    expect(saveAction!.boundaryMode).toBe("auto");

    // Worker was updated with route/action IDs and activated
    const updatedWorker = workerService.workers[0]!;
    expect(updatedWorker.status).toBe("active");
    expect(updatedWorker.inputRouteIds).toHaveLength(3);
    expect(updatedWorker.actionIds).toHaveLength(2);
  });

  it("uses custom inbound domain", async () => {
    await installService.install(followUpWorkerPack, {
      workspaceId: "ws_test",
      workspaceSlug: "hartwell",
      inboundDomain: "mail.hartwell.com",
    });

    const emailRoute = inputRouteStore.routes.find((r) => r.kind === "forward_email");
    expect(emailRoute!.address).toBe("client-follow-up-hartwell@mail.hartwell.com");
  });

  it("keeps systemPrompt and outputKinds as reserved contract metadata", async () => {
    await installService.install(followUpWorkerPack, {
      workspaceId: "ws_test",
      workspaceSlug: "acme",
    });

    expect(followUpWorkerPack.systemPrompt.length).toBeGreaterThan(0);
    expect(followUpWorkerPack.outputKinds).toContain("email_draft");
    expect(workerService.workers[0]).not.toHaveProperty("systemPrompt");
    expect(workerService.workers[0]).not.toHaveProperty("outputKinds");
    for (const route of inputRouteStore.routes) {
      expect(route).not.toHaveProperty("systemPrompt");
      expect(route).not.toHaveProperty("outputKinds");
    }
    for (const action of actionCapabilityStore.actions) {
      expect(action).not.toHaveProperty("systemPrompt");
      expect(action).not.toHaveProperty("outputKinds");
    }
  });
});

describe("followUpWorkerPack definition", () => {
  it("has all required fields", () => {
    expect(followUpWorkerPack.id).toBe("follow_up_v1");
    expect(followUpWorkerPack.kind).toBe("follow_up");
    expect(followUpWorkerPack.supportedInputRoutes).toHaveLength(3);
    expect(followUpWorkerPack.outputKinds).toContain("email_draft");
    expect(followUpWorkerPack.outputKinds).toContain("meeting_recap");
    expect(followUpWorkerPack.actionCapabilities).toHaveLength(2);
    expect(followUpWorkerPack.systemPrompt).toContain("Client Follow-Up");
  });
});

describe("proposalWorkerPack definition", () => {
  it("has all required fields", () => {
    expect(proposalWorkerPack.id).toBe("proposal_v1");
    expect(proposalWorkerPack.kind).toBe("proposal");
    expect(proposalWorkerPack.name).toBe("Proposal");
    expect(proposalWorkerPack.defaultScope).toBe("shared");
    expect(proposalWorkerPack.summary).toBe("Scope drafts, assumptions, risks, and proposal follow-up notes.");
    expect(proposalWorkerPack.systemPrompt).toContain("Proposal worker");
  });

  it("supports chat and upload input routes only", () => {
    expect(proposalWorkerPack.supportedInputRoutes).toHaveLength(2);

    const routeKinds = proposalWorkerPack.supportedInputRoutes.map((r) => r.kind);
    expect(routeKinds).toContain("chat");
    expect(routeKinds).toContain("upload");
    expect(routeKinds).not.toContain("forward_email");
    expect(routeKinds).not.toContain("watched_inbox");
  });

  it("outputs proposal_draft and action_plan", () => {
    expect(proposalWorkerPack.outputKinds).toContain("proposal_draft");
    expect(proposalWorkerPack.outputKinds).toContain("action_plan");
    expect(proposalWorkerPack.outputKinds).toHaveLength(2);
  });

  it("has save_work action with auto boundary", () => {
    expect(proposalWorkerPack.actionCapabilities).toHaveLength(1);
    expect(proposalWorkerPack.actionCapabilities[0]!.kind).toBe("save_work");
    expect(proposalWorkerPack.actionCapabilities[0]!.defaultBoundaryMode).toBe("auto");
  });
});

describe("WorkerPackInstallService with proposal pack", () => {
  let workerService: FakeWorkerService;
  let inputRouteStore: FakeInputRouteStore;
  let actionCapabilityStore: FakeActionCapabilityStore;
  let installService: WorkerPackInstallService;

  beforeEach(() => {
    workerService = new FakeWorkerService();
    inputRouteStore = new FakeInputRouteStore();
    actionCapabilityStore = new FakeActionCapabilityStore();

    installService = new WorkerPackInstallService({
      workerService,
      inputRouteStore,
      actionCapabilityStore,
      now: () => new Date("2026-03-18T10:00:00Z"),
    });
  });

  it("installs the proposal worker pack into a workspace", async () => {
    const result = await installService.install(proposalWorkerPack, {
      workspaceId: "ws_test",
      workspaceSlug: "hartwell",
      memberIds: ["usr_dave", "usr_emma"],
      assigneeIds: ["usr_dave", "usr_emma"],
      reviewerIds: ["usr_dave"],
    });

    // Worker was created
    expect(result.workerId).toMatch(/^wkr_test_/);
    expect(workerService.workers).toHaveLength(1);
    expect(workerService.workers[0]!.name).toBe("Proposal");
    expect(workerService.workers[0]!.kind).toBe("proposal");

    // Input routes were created (chat, upload)
    expect(result.inputRouteIds).toHaveLength(2);
    expect(inputRouteStore.routes).toHaveLength(2);

    // Chat route
    const chatRoute = inputRouteStore.routes.find((r) => r.kind === "chat");
    expect(chatRoute).toBeDefined();
    expect(chatRoute!.status).toBe("active");
    expect(chatRoute!.address).toBeNull();

    // Upload route
    const uploadRoute = inputRouteStore.routes.find((r) => r.kind === "upload");
    expect(uploadRoute).toBeDefined();
    expect(uploadRoute!.status).toBe("active");
    expect(uploadRoute!.address).toBeNull();

    // No forward_email or watched_inbox routes
    expect(inputRouteStore.routes.find((r) => r.kind === "forward_email")).toBeUndefined();
    expect(inputRouteStore.routes.find((r) => r.kind === "watched_inbox")).toBeUndefined();

    // Action capabilities were created (only save_work)
    expect(result.actionCapabilityIds).toHaveLength(1);
    expect(actionCapabilityStore.actions).toHaveLength(1);

    const saveAction = actionCapabilityStore.actions[0]!;
    expect(saveAction.kind).toBe("save_work");
    expect(saveAction.boundaryMode).toBe("auto");

    // Worker was updated with route/action IDs and activated
    const updatedWorker = workerService.workers[0]!;
    expect(updatedWorker.status).toBe("active");
    expect(updatedWorker.inputRouteIds).toHaveLength(2);
    expect(updatedWorker.actionIds).toHaveLength(1);
  });

  it("installs both packs into the same workspace without conflict", async () => {
    const followUpResult = await installService.install(followUpWorkerPack, {
      workspaceId: "ws_test",
      workspaceSlug: "hartwell",
      memberIds: ["usr_dave", "usr_emma"],
      reviewerIds: ["usr_dave"],
    });

    const proposalResult = await installService.install(proposalWorkerPack, {
      workspaceId: "ws_test",
      workspaceSlug: "hartwell",
      memberIds: ["usr_dave", "usr_emma"],
      reviewerIds: ["usr_dave"],
    });

    // Both workers created
    expect(workerService.workers).toHaveLength(2);
    expect(followUpResult.workerId).not.toBe(proposalResult.workerId);

    // Follow-Up has 3 routes, Proposal has 2
    expect(followUpResult.inputRouteIds).toHaveLength(3);
    expect(proposalResult.inputRouteIds).toHaveLength(2);

    // Follow-Up has 2 actions, Proposal has 1
    expect(followUpResult.actionCapabilityIds).toHaveLength(2);
    expect(proposalResult.actionCapabilityIds).toHaveLength(1);

    // All 5 routes exist
    expect(inputRouteStore.routes).toHaveLength(5);

    // All 3 actions exist
    expect(actionCapabilityStore.actions).toHaveLength(3);
  });
});
