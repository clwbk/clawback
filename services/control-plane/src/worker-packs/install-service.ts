import { createClawbackId } from "@clawback/domain";
import type {
  ActionCapabilityKind,
  BoundaryMode,
  InputRouteKind,
  InputRouteStatus,
  WorkerKind,
  WorkerScope,
} from "@clawback/contracts";

import type { WorkerPackContract, WorkerPackInstallResult } from "./types.js";

// ---------------------------------------------------------------------------
// Dependency contracts
// ---------------------------------------------------------------------------

type WorkerCreator = {
  create(
    workspaceId: string,
    input: {
      name: string;
      kind: WorkerKind;
      scope: WorkerScope;
      summary?: string | null;
      memberIds?: string[];
      assigneeIds?: string[];
      reviewerIds?: string[];
    },
  ): Promise<{ id: string; slug: string }>;
  update(
    workspaceId: string,
    id: string,
    input: {
      status?: "active";
      inputRouteIds?: string[];
      actionIds?: string[];
    },
  ): Promise<unknown>;
};

type InputRouteCreator = {
  create(input: {
    id: string;
    workspaceId: string;
    workerId: string;
    kind: InputRouteKind;
    status: InputRouteStatus;
    label: string;
    description: string | null;
    address: string | null;
    capabilityNote: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<{ id: string }>;
};

type ActionCapabilityCreator = {
  create(input: {
    id: string;
    workspaceId: string;
    workerId: string;
    kind: ActionCapabilityKind;
    boundaryMode: BoundaryMode;
    reviewerIds: string[];
    destinationConnectionId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// Install options
// ---------------------------------------------------------------------------

type InstallOptions = {
  workspaceId: string;
  workspaceSlug: string;
  nameOverride?: string;
  memberIds?: string[];
  assigneeIds?: string[];
  reviewerIds?: string[];
  inboundDomain?: string;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

type WorkerPackInstallServiceOptions = {
  workerService: WorkerCreator;
  inputRouteStore: InputRouteCreator;
  actionCapabilityStore: ActionCapabilityCreator;
  now?: () => Date;
};

/**
 * Generates a deterministic forwarding address for a worker.
 * Format: {workerSlug}-{workspaceSlug}@{inboundDomain}
 */
export function generateForwardingAddress(
  workerSlug: string,
  workspaceSlug: string,
  inboundDomain: string,
): string {
  return `${workerSlug}-${workspaceSlug}@${inboundDomain}`;
}

export class WorkerPackInstallService {
  private readonly now: () => Date;

  constructor(private readonly options: WorkerPackInstallServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async install(
    pack: WorkerPackContract,
    installOptions: InstallOptions,
  ): Promise<WorkerPackInstallResult> {
    const { workspaceId, workspaceSlug } = installOptions;
    const inboundDomain = installOptions.inboundDomain ?? "inbound.clawback.dev";
    const now = this.now();

    // 1. Create the worker
    const worker = await this.options.workerService.create(workspaceId, {
      name: installOptions.nameOverride ?? pack.manifest.displayName,
      kind: pack.manifest.workerKind,
      scope: pack.manifest.defaultScope,
      summary: pack.install.summary,
      memberIds: installOptions.memberIds ?? [],
      assigneeIds: installOptions.assigneeIds ?? [],
      reviewerIds: installOptions.reviewerIds ?? [],
    });

    // 2. Create input routes
    const inputRouteIds: string[] = [];
    for (const routeDef of pack.install.supportedInputRoutes) {
      const routeId = createClawbackId("rte");
      let address: string | null = null;
      if (routeDef.kind === "forward_email") {
        address = generateForwardingAddress(worker.slug, workspaceSlug, inboundDomain);
      }

      await this.options.inputRouteStore.create({
        id: routeId,
        workspaceId,
        workerId: worker.id,
        kind: routeDef.kind,
        status: routeDef.initialStatus ?? (routeDef.kind === "watched_inbox" ? "suggested" : "active"),
        label: routeDef.label,
        description: routeDef.description,
        address,
        capabilityNote: routeDef.capabilityNote ?? null,
        createdAt: now,
        updatedAt: now,
      });
      inputRouteIds.push(routeId);
    }

    // 3. Create action capabilities
    const actionCapabilityIds: string[] = [];
    for (const actionDef of pack.install.actionCapabilities) {
      const actionId = createClawbackId("act");
      await this.options.actionCapabilityStore.create({
        id: actionId,
        workspaceId,
        workerId: worker.id,
        kind: actionDef.kind,
        boundaryMode: actionDef.defaultBoundaryMode,
        reviewerIds: installOptions.reviewerIds ?? [],
        destinationConnectionId: null,
        createdAt: now,
        updatedAt: now,
      });
      actionCapabilityIds.push(actionId);
    }

    // 4. Update worker with route and action IDs, and activate
    await this.options.workerService.update(workspaceId, worker.id, {
      status: "active",
      inputRouteIds,
      actionIds: actionCapabilityIds,
    });

    return {
      workerId: worker.id,
      inputRouteIds,
      actionCapabilityIds,
    };
  }
}
