import { beforeEach, describe, expect, it } from "vitest";

import { WorkerService, WorkerNotFoundError } from "./service.js";
import type { StoredWorker, WorkerStore } from "./types.js";

class MemoryWorkerStore implements WorkerStore {
  workers: StoredWorker[] = [];

  async list(workspaceId: string) {
    return this.workers
      .filter((w) => w.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findById(workspaceId: string, id: string) {
    return this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }

  async findBySlug(workspaceId: string, slug: string) {
    return this.workers.find((w) => w.workspaceId === workspaceId && w.slug === slug) ?? null;
  }

  async create(input: StoredWorker) {
    this.workers.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredWorker>) {
    const worker = this.workers.find((w) => w.id === id);
    if (!worker) throw new Error("not found");
    Object.assign(worker, input);
    return { ...worker };
  }

  async remove(id: string) {
    this.workers = this.workers.filter((w) => w.id !== id);
  }
}

describe("WorkerService", () => {
  let store: MemoryWorkerStore;
  let service: WorkerService;
  const WS = "ws_test";
  const NOW = new Date("2026-03-18T10:00:00Z");

  beforeEach(() => {
    store = new MemoryWorkerStore();
    service = new WorkerService({ store, now: () => NOW });
  });

  it("creates a worker with generated id and slug", async () => {
    const result = await service.create(WS, {
      name: "Client Follow-Up",
      kind: "follow_up",
      scope: "shared",
      summary: "Monitors client threads.",
      memberIds: ["usr_dave"],
    });

    expect(result.id).toMatch(/^wkr_/);
    expect(result.slug).toBe("client-follow-up");
    expect(result.name).toBe("Client Follow-Up");
    expect(result.kind).toBe("follow_up");
    expect(result.scope).toBe("shared");
    expect(result.status).toBe("draft");
    expect(result.summary).toBe("Monitors client threads.");
    expect(result.member_ids).toEqual(["usr_dave"]);
    expect(result.workspace_id).toBe(WS);
  });

  it("lists workers for a workspace", async () => {
    await service.create(WS, { name: "Worker A", kind: "follow_up", scope: "shared" });
    await service.create(WS, { name: "Worker B", kind: "proposal", scope: "shared" });
    await service.create("ws_other", { name: "Worker C", kind: "bugfix", scope: "personal" });

    const result = await service.list(WS);
    expect(result.workers).toHaveLength(2);
  });

  it("gets a worker by id", async () => {
    const created = await service.create(WS, { name: "Test", kind: "incident", scope: "shared" });
    const fetched = await service.getById(WS, created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.name).toBe("Test");
  });

  it("throws when getting a nonexistent worker", async () => {
    await expect(service.getById(WS, "wkr_missing")).rejects.toBeInstanceOf(WorkerNotFoundError);
  });

  it("updates a worker", async () => {
    const created = await service.create(WS, { name: "Original", kind: "follow_up", scope: "shared" });
    const updated = await service.update(WS, created.id, {
      name: "Renamed",
      status: "active",
      memberIds: ["usr_a", "usr_b"],
    });

    expect(updated.name).toBe("Renamed");
    expect(updated.status).toBe("active");
    expect(updated.member_ids).toEqual(["usr_a", "usr_b"]);
  });

  it("removes a worker", async () => {
    const created = await service.create(WS, { name: "Deletable", kind: "bugfix", scope: "personal" });
    await service.remove(WS, created.id);
    const list = await service.list(WS);
    expect(list.workers).toHaveLength(0);
  });

  it("throws when removing a nonexistent worker", async () => {
    await expect(service.remove(WS, "wkr_missing")).rejects.toBeInstanceOf(WorkerNotFoundError);
  });

  it("generates unique slugs for duplicate names", async () => {
    const a = await service.create(WS, { name: "Follow-Up", kind: "follow_up", scope: "shared" });
    const b = await service.create(WS, { name: "Follow-Up", kind: "follow_up", scope: "personal" });
    expect(a.slug).not.toBe(b.slug);
  });

  it("output conforms to WorkerRecord contract", async () => {
    const result = await service.create(WS, {
      name: "Test Worker",
      kind: "proposal",
      scope: "shared",
      summary: null,
    });

    // All contract fields are present and correctly typed
    expect(typeof result.id).toBe("string");
    expect(typeof result.workspace_id).toBe("string");
    expect(typeof result.slug).toBe("string");
    expect(typeof result.name).toBe("string");
    expect(typeof result.kind).toBe("string");
    expect(typeof result.scope).toBe("string");
    expect(typeof result.status).toBe("string");
    expect(result.summary).toBeNull();
    expect(Array.isArray(result.member_ids)).toBe(true);
    expect(Array.isArray(result.assignee_ids)).toBe(true);
    expect(Array.isArray(result.reviewer_ids)).toBe(true);
    expect(Array.isArray(result.input_route_ids)).toBe(true);
    expect(Array.isArray(result.connection_ids)).toBe(true);
    expect(Array.isArray(result.action_ids)).toBe(true);
    expect(typeof result.created_at).toBe("string");
    expect(typeof result.updated_at).toBe("string");
  });
});
