/**
 * R5 Rehearsal: Relationship Memory and Worker Routing
 *
 * Proves the system behaves differently for:
 *   1. Known customer follow-up stays in Follow-Up (shadow_draft)
 *   2. Proposal request from known prospect suggests Proposal
 *   3. Support issue suggests Incident/Bugfix
 *   4. Blocked or do-not-auto-reply sender does not silently draft
 *   5. Missing route target degrades to review, not guessing
 *
 * These tests wire the full pipeline: sender resolution -> triage -> output mapping.
 * They use in-memory stores to verify end-to-end behavior.
 */
import { describe, expect, it } from "vitest";
import type { WorkerKind } from "@clawback/contracts";

import { WatchedInboxService } from "./service.js";
import { WorkItemService } from "../../work-items/service.js";
import { InboxItemService } from "../../inbox/service.js";
import { ActivityService } from "../../activity/service.js";
import { SenderResolutionService } from "../../sender-resolution/service.js";
import type {
  ContactForResolution,
  AccountForResolution,
  ContactLookup,
  AccountLookup,
} from "../../sender-resolution/service.js";

import type {
  WatchedInboxPayload,
  SourceEventStore,
  StoredSourceEvent,
  WatchedInboxRouteLookup,
  InputRouteForWatchedInbox,
  ConnectionLookup,
  ConnectionForValidation,
  WorkerLookup,
  RouteTargetLookup,
  WorkerSummary,
} from "./types.js";
import type { StoredWorkItem, WorkItemStore } from "../../work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "../../inbox/types.js";
import type { StoredActivityEvent, ActivityEventStore } from "../../activity/types.js";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class MemorySourceEventStore implements SourceEventStore {
  readonly events: StoredSourceEvent[] = [];

  async findByExternalMessageId(workspaceId: string, externalMessageId: string) {
    return (
      this.events.find(
        (e) => e.workspaceId === workspaceId && e.externalMessageId === externalMessageId,
      ) ?? null
    );
  }

  async create(input: StoredSourceEvent) {
    this.events.push(input);
    return input;
  }
}

class MemoryWatchedInboxRouteLookup implements WatchedInboxRouteLookup {
  readonly routes: InputRouteForWatchedInbox[] = [];

  async findWatchedInboxRoute(workspaceId: string, workerId: string) {
    return (
      this.routes.find(
        (r) => r.workspaceId === workspaceId && r.workerId === workerId && r.kind === "watched_inbox",
      ) ?? null
    );
  }
}

class MemoryConnectionLookup implements ConnectionLookup {
  connections: ConnectionForValidation[] = [];

  async findGmailReadOnly(_workspaceId: string) {
    return (
      this.connections.find(
        (c) => c.provider === "gmail" && c.accessMode === "read_only",
      ) ?? null
    );
  }
}

type MemoryWorker = WorkerSummary & { kind: WorkerKind; status: "draft" | "active" | "paused" };

class MemoryWorkerLookup implements WorkerLookup, RouteTargetLookup {
  readonly workers: MemoryWorker[] = [];

  async findById(workspaceId: string, id: string) {
    return (
      this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null
    );
  }

  async listActiveByKind(workspaceId: string, kind: WorkerKind) {
    return this.workers.filter(
      (worker) => worker.workspaceId === workspaceId && worker.kind === kind && worker.status === "active",
    );
  }
}

class MemoryWorkItemStore implements WorkItemStore {
  items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId);
  }

  async listByWorker(workerId: string) {
    return this.items.filter((i) => i.workerId === workerId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }

  async create(input: StoredWorkItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredWorkItem>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class MemoryInboxItemStore implements InboxItemStore {
  items: StoredInboxItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId);
  }

  async listOpen(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId && i.state === "open");
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }

  async findByReviewId(workspaceId: string, reviewId: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.reviewId === reviewId) ?? null;
  }

  async create(input: StoredInboxItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredInboxItem>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class MemoryActivityEventStore implements ActivityEventStore {
  events: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string, limit = 50) {
    return this.events
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async findByReviewResult(_workspaceId: string, _reviewId: string, _resultKind: string) {
    return null;
  }

  async create(input: StoredActivityEvent) {
    this.events.push({ ...input });
    return { ...input };
  }
}

// ---------------------------------------------------------------------------
// Contact/Account fixtures for sender resolution
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_rehearsal_01";
const WORKER_ID = "wkr_followup_01";
const DAVE_ID = "usr_dave_01";
const EMMA_ID = "usr_emma_01";

const CONTACT_SARAH: ContactForResolution = {
  id: "cot_sarah_01",
  accountId: "acc_acme_01",
  relationshipClass: "customer",
  ownerUserId: DAVE_ID,
  handlingNote: "Key account, handle with care",
  doNotAutoReply: false,
};

const CONTACT_BLOCKED_SPAMMER: ContactForResolution = {
  id: "cot_spammer_01",
  accountId: null,
  relationshipClass: "blocked",
  ownerUserId: null,
  handlingNote: null,
  doNotAutoReply: true,
};

const CONTACT_PROSPECT_GLOBEX: ContactForResolution = {
  id: "cot_globex_01",
  accountId: "acc_globex_01",
  relationshipClass: "prospect",
  ownerUserId: EMMA_ID,
  handlingNote: null,
  doNotAutoReply: false,
};

const ACCOUNT_ACME: AccountForResolution = {
  id: "acc_acme_01",
  primaryDomain: "acmecorp.com",
  relationshipClass: "customer",
  ownerUserId: DAVE_ID,
  handlingNote: "Acme Corp - Q3 renewal pending",
};

const ACCOUNT_GLOBEX: AccountForResolution = {
  id: "acc_globex_01",
  primaryDomain: "globex.io",
  relationshipClass: "prospect",
  ownerUserId: EMMA_ID,
  handlingNote: null,
};

function routeWorker(kind: WorkerKind, overrides: Partial<MemoryWorker> = {}): MemoryWorker {
  return {
    id: `wkr_${kind}_01`,
    workspaceId: WORKSPACE_ID,
    slug: kind,
    name: kind === "bugfix" ? "Bugfix" : kind === "incident" ? "Incident" : "Proposal",
    assigneeIds: [EMMA_ID],
    reviewerIds: [DAVE_ID],
    kind,
    status: "active",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fakeContactLookup(contacts: Map<string, ContactForResolution>): ContactLookup {
  return {
    async findByEmail(_workspaceId: string, email: string) {
      return contacts.get(email.toLowerCase()) ?? null;
    },
  };
}

function fakeAccountLookup(
  byId: Map<string, AccountForResolution>,
  byDomain: Map<string, AccountForResolution>,
): AccountLookup {
  return {
    async findById(_workspaceId: string, id: string) {
      return byId.get(id) ?? null;
    },
    async findByDomain(_workspaceId: string, domain: string) {
      return byDomain.get(domain.toLowerCase()) ?? null;
    },
  };
}

function payload(overrides?: Partial<WatchedInboxPayload>): WatchedInboxPayload {
  return {
    external_message_id: `<rehearsal-${Date.now()}-${Math.random().toString(36)}@gmail.com>`,
    worker_id: WORKER_ID,
    workspace_id: WORKSPACE_ID,
    from: "sarah@acmecorp.com",
    subject: "Re: Project update",
    body_text: "Hi, just checking in on the project status.",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

describe("R5 Rehearsal: Relationship Memory and Worker Routing", () => {
  let sourceEventStore: MemorySourceEventStore;
  let workItemStore: MemoryWorkItemStore;
  let inboxItemStore: MemoryInboxItemStore;
  let activityEventStore: MemoryActivityEventStore;
  let watchedInboxService: WatchedInboxService;

  const NOW = new Date("2026-03-23T10:00:00Z");

  function buildService(opts?: {
    contacts?: Map<string, ContactForResolution>;
    accountsById?: Map<string, AccountForResolution>;
    accountsByDomain?: Map<string, AccountForResolution>;
    routeWorkers?: MemoryWorker[];
  }) {
    sourceEventStore = new MemorySourceEventStore();
    workItemStore = new MemoryWorkItemStore();
    inboxItemStore = new MemoryInboxItemStore();
    activityEventStore = new MemoryActivityEventStore();

    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push({
      id: "rte_watched_01",
      workspaceId: WORKSPACE_ID,
      workerId: WORKER_ID,
      kind: "watched_inbox",
      status: "active",
    });

    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connections.push({
      id: "conn_gmail_01",
      provider: "gmail",
      accessMode: "read_only",
      status: "connected",
    });

    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push({
      id: WORKER_ID,
      workspaceId: WORKSPACE_ID,
      slug: "client-follow-up",
      name: "Client Follow-Up",
      assigneeIds: [EMMA_ID],
      reviewerIds: [DAVE_ID],
      kind: "follow_up",
      status: "active",
    });
    workerLookup.workers.push(...(opts?.routeWorkers ?? []));

    const senderResolutionService = new SenderResolutionService({
      contactLookup: fakeContactLookup(opts?.contacts ?? new Map()),
      accountLookup: fakeAccountLookup(
        opts?.accountsById ?? new Map(),
        opts?.accountsByDomain ?? new Map(),
      ),
    });

    const workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
    const inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
    const activityService = new ActivityService({ store: activityEventStore, now: () => NOW });

    watchedInboxService = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      routeTargetLookup: workerLookup,
      workItemService,
      inboxItemService,
      activityService,
      senderResolutionService,
      now: () => NOW,
    });
  }

  // -------------------------------------------------------------------------
  // 1. Known customer follow-up stays in Follow-Up (shadow_draft)
  // -------------------------------------------------------------------------

  it("known customer follow-up stays in Follow-Up with shadow_draft", async () => {
    buildService({
      contacts: new Map([["sarah@acmecorp.com", CONTACT_SARAH]]),
      accountsById: new Map([["acc_acme_01", ACCOUNT_ACME]]),
    });

    const result = await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "sarah@acmecorp.com",
        subject: "Re: Q3 Renewal Discussion",
        body_text: "Hi Dave, wanted to follow up on our renewal discussion. Any updates on timing?",
      }),
    );

    // Should create a shadow draft (not escalate or route elsewhere)
    expect(result.work_item_id).toBeTruthy();
    expect(result.inbox_item_id).toBeTruthy();

    const workItem = workItemStore.items[0]!;
    expect(workItem.kind).toBe("email_draft");
    expect(workItem.status).toBe("draft");

    const inboxItem = inboxItemStore.items[0]!;
    expect(inboxItem.kind).toBe("shadow");

    // Triage should show customer relationship resolved from contact memory
    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.relationship).toBe("customer");
    expect(triage.decision).toBe("shadow_draft");
    expect(triage.reasons).toContain("resolved_via_exact_contact");
  });

  // -------------------------------------------------------------------------
  // 2. Proposal request from known prospect suggests Proposal worker
  // -------------------------------------------------------------------------

  it("proposal request from known prospect suggests the Proposal worker", async () => {
    buildService({
      contacts: new Map([["buyer@globex.io", CONTACT_PROSPECT_GLOBEX]]),
      accountsById: new Map([["acc_globex_01", ACCOUNT_GLOBEX]]),
      routeWorkers: [routeWorker("proposal")],
    });

    const result = await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "buyer@globex.io",
        subject: "Request for proposal - consulting engagement",
        body_text: "We would like to discuss a potential consulting engagement. Can you share a proposal for the scope of work?",
      }),
    );

    // Triage identifies prospect + proposal intent
    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.relationship).toBe("prospect");
    expect(triage.intent).toBe("proposal");
    expect(triage.reasons).toContain("resolved_via_exact_contact");
    expect(triage.decision).toBe("route_to_worker");
    expect(triage.route_target_worker_id).toBe("wkr_proposal_01");
    expect(triage.reasons).toContain("proposal_worker_recommended");

    // Suggestion-first: review inbox item only, no destination work yet
    expect(result.work_item_id).toBe("");
    const inboxItem = inboxItemStore.items[0]!;
    expect(inboxItem.kind).toBe("review");
    expect(inboxItem.title).toContain("Route suggested");
  });

  // -------------------------------------------------------------------------
  // 3. Support issue suggests Incident/Bugfix worker
  // -------------------------------------------------------------------------

  it("support issue from known customer suggests the Bugfix worker", async () => {
    buildService({
      contacts: new Map([["sarah@acmecorp.com", CONTACT_SARAH]]),
      accountsById: new Map([["acc_acme_01", ACCOUNT_ACME]]),
      routeWorkers: [routeWorker("bugfix")],
    });

    const result = await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "sarah@acmecorp.com",
        subject: "Bug in the dashboard",
        body_text: "The export feature is broken and not working since yesterday's update. This is blocking our team.",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.relationship).toBe("customer");
    expect(triage.intent).toBe("support_issue");
    expect(triage.decision).toBe("route_to_worker");
    expect(triage.route_target_worker_id).toBe("wkr_bugfix_01");
    expect(triage.reasons).toContain("resolved_via_exact_contact");
    expect(triage.reasons).toContain("bugfix_worker_recommended");

    // Suggestion-first: review inbox item only, no destination work yet
    const inboxItem = inboxItemStore.items[0]!;
    expect(inboxItem.kind).toBe("review");
    expect(inboxItem.title).toContain("Route suggested");

    // No work item created before operator confirmation
    expect(result.work_item_id).toBe("");
  });

  // -------------------------------------------------------------------------
  // 4. Blocked or do-not-auto-reply sender does not silently draft
  // -------------------------------------------------------------------------

  it("blocked sender with do_not_auto_reply does not get a draft", async () => {
    buildService({
      contacts: new Map([["spammer@bad.com", CONTACT_BLOCKED_SPAMMER]]),
    });

    const result = await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "spammer@bad.com",
        subject: "Re: Follow up on our discussion",
        body_text: "Hi, just following up on our earlier conversation. Any update on the timeline?",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.relationship).toBe("blocked");

    // do_not_auto_reply forces request_review, never shadow_draft
    expect(triage.decision).toBe("request_review");
    expect(triage.reasons).toContain("do_not_auto_reply_flag_set");

    // Must NOT create a shadow draft work item
    expect(result.work_item_id).toBe("");

    // Inbox item is review, not shadow
    const inboxItem = inboxItemStore.items[0]!;
    expect(inboxItem.kind).toBe("review");
  });

  it("do_not_auto_reply contact never gets a shadow draft even with follow-up intent", async () => {
    const contactNoAutoReply: ContactForResolution = {
      ...CONTACT_SARAH,
      doNotAutoReply: true,
    };

    buildService({
      contacts: new Map([["sarah@acmecorp.com", contactNoAutoReply]]),
      accountsById: new Map([["acc_acme_01", ACCOUNT_ACME]]),
    });

    await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "sarah@acmecorp.com",
        subject: "Re: Project update",
        body_text: "Hi, just checking in on the project status. Any updates?",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;
    // Even though the intent is follow-up, do_not_auto_reply overrides
    expect(triage.decision).toBe("request_review");
    expect(triage.reasons).toContain("do_not_auto_reply_flag_set");

    // No draft created
    expect(workItemStore.items).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. Missing route target degrades to review, not guessing
  // -------------------------------------------------------------------------

  it("unknown sender falls back to heuristic triage without guessing", async () => {
    // No contacts, no accounts - sender is completely unknown
    buildService();

    const result = await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "mystery@unknown-company.com",
        subject: "Hello",
        body_text: "Hi there, I wanted to reach out to discuss something.",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;

    // Unknown relationship stays unknown
    expect(triage.relationship).toBe("unknown");

    // Ambiguous intent gets conservative handling
    expect(["request_review", "ignore"]).toContain(triage.decision);

    // The system MUST NOT route to a worker it cannot resolve
    expect(triage.decision).not.toBe("route_to_worker");

    // If route_target_worker_id exists, it must be null
    if (triage.route_target_worker_id !== undefined) {
      expect(triage.route_target_worker_id).toBeNull();
    }
  });

  it("proposal routing falls back to review when no active Proposal worker is installed", async () => {
    buildService({
      contacts: new Map([["buyer@globex.io", CONTACT_PROSPECT_GLOBEX]]),
      accountsById: new Map([["acc_globex_01", ACCOUNT_GLOBEX]]),
    });

    const result = await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "buyer@globex.io",
        subject: "Request for proposal - consulting engagement",
        body_text: "We would like to discuss a potential consulting engagement. Can you share a proposal for the scope of work?",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.intent).toBe("proposal");
    expect(triage.decision).toBe("request_review");
    expect(triage.route_target_worker_id).toBeNull();
    expect(triage.reasons).toContain("proposal_worker_recommended");
    expect(triage.reasons).toContain("route_missing");

    expect(result.work_item_id).toBe("");
    const inboxItem = inboxItemStore.items[0]!;
    expect(inboxItem.kind).toBe("review");
    expect(inboxItem.title).toContain("Route review needed");
  });

  // -------------------------------------------------------------------------
  // Bonus: Verify sender resolution reasons appear in triage output
  // -------------------------------------------------------------------------

  it("account domain match includes resolution method in triage reasons", async () => {
    buildService({
      accountsByDomain: new Map([["acmecorp.com", ACCOUNT_ACME]]),
    });

    await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "newperson@acmecorp.com",
        subject: "Re: Introduction",
        body_text: "Hi, following up on our earlier conversation.",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.relationship).toBe("customer");
    expect(triage.reasons).toContain("resolved_via_account_domain");
  });

  it("internal domain sender is classified as internal", async () => {
    // Build with internal domains
    sourceEventStore = new MemorySourceEventStore();
    workItemStore = new MemoryWorkItemStore();
    inboxItemStore = new MemoryInboxItemStore();
    activityEventStore = new MemoryActivityEventStore();

    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push({
      id: "rte_watched_01",
      workspaceId: WORKSPACE_ID,
      workerId: WORKER_ID,
      kind: "watched_inbox",
      status: "active",
    });

    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connections.push({
      id: "conn_gmail_01",
      provider: "gmail",
      accessMode: "read_only",
      status: "connected",
    });

    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push({
      id: WORKER_ID,
      workspaceId: WORKSPACE_ID,
      slug: "client-follow-up",
      name: "Client Follow-Up",
      assigneeIds: [EMMA_ID],
      reviewerIds: [DAVE_ID],
      kind: "follow_up",
      status: "active",
    });

    const senderResolutionService = new SenderResolutionService({
      contactLookup: fakeContactLookup(new Map()),
      accountLookup: fakeAccountLookup(new Map(), new Map()),
      internalDomains: ["mycompany.com"],
    });

    watchedInboxService = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      routeTargetLookup: workerLookup,
      workItemService: new WorkItemService({ store: workItemStore, now: () => NOW }),
      inboxItemService: new InboxItemService({ store: inboxItemStore, now: () => NOW }),
      activityService: new ActivityService({ store: activityEventStore, now: () => NOW }),
      senderResolutionService,
      now: () => NOW,
    });

    await watchedInboxService.processWatchedInboxEvent(
      payload({
        from: "coworker@mycompany.com",
        subject: "Re: Team sync",
        body_text: "Following up on the team sync meeting notes.",
      }),
    );

    const triage = sourceEventStore.events[0]!.triageJson as any;
    expect(triage.relationship).toBe("internal");
    expect(triage.reasons).toContain("resolved_via_internal_domain");
  });
});
