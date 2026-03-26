/**
 * Shared Zod schemas for plugin registry API responses.
 *
 * Architecture note:
 * - Manifests = metadata, setup, discovery, compatibility, and stability.
 *   They live in @clawback/plugin-manifests and are typed by @clawback/plugin-sdk.
 * - Runtime packs = execution logic, prompts, defaults, tool/runtime behavior.
 *   They live in services/control-plane/src/worker-packs/.
 * - Manifests and runtime packs are linked by worker pack ID (e.g. "follow_up_v1")
 *   and verified by alignment tests.
 */
import { z } from "zod";

import { actionCapabilityKindSchema, boundaryModeSchema } from "./actions.js";
import { connectionProviderSchema, connectionAccessModeSchema } from "./connections.js";
import { inputRouteKindSchema } from "./input-routes.js";
import { workerKindSchema, workerScopeSchema } from "./workers.js";

// ---------------------------------------------------------------------------
// Shared sub-schemas
// ---------------------------------------------------------------------------

export const pluginStabilitySchema = z.enum(["experimental", "pilot", "stable"]);
export type PluginStability = z.infer<typeof pluginStabilitySchema>;

export const pluginCategorySchema = z.enum(["email", "knowledge", "project", "crm", "messaging", "other"]);
export type PluginCategory = z.infer<typeof pluginCategorySchema>;

export const registrySetupStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  ctaLabel: z.string().min(1),
  operatorOnly: z.boolean().optional(),
  docsHref: z.string().optional(),
  target: z.object({
    surface: z.string().min(1),
    focus: z.string().optional(),
    workerKind: z.string().optional(),
  }).optional(),
});
export type RegistrySetupStep = z.infer<typeof registrySetupStepSchema>;

// ---------------------------------------------------------------------------
// GET /api/workspace/registry
// ---------------------------------------------------------------------------

export const registryConnectionProviderSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string(),
  provider: connectionProviderSchema,
  access_modes: z.array(connectionAccessModeSchema),
  capabilities: z.array(z.string()),
  stability: pluginStabilitySchema,
  category: pluginCategorySchema.optional(),
  priority: z.number().optional(),
  setup_steps: z.array(registrySetupStepSchema),
});
export type RegistryConnectionProvider = z.infer<typeof registryConnectionProviderSchema>;

export const registryIngressAdapterSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string(),
  provider: z.string().min(1),
  adapter_kind: z.string().min(1),
  stability: pluginStabilitySchema,
  category: pluginCategorySchema.optional(),
  priority: z.number().optional(),
  setup_steps: z.array(registrySetupStepSchema),
});
export type RegistryIngressAdapter = z.infer<typeof registryIngressAdapterSchema>;

export const registryActionExecutorSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string(),
  action_kind: actionCapabilityKindSchema,
  stability: pluginStabilitySchema,
  category: pluginCategorySchema.optional(),
  priority: z.number().optional(),
  setup_steps: z.array(registrySetupStepSchema),
});
export type RegistryActionExecutor = z.infer<typeof registryActionExecutorSchema>;

export const registryWorkerPackSchema = z.object({
  id: z.string().min(1),
  display_name: z.string().min(1),
  description: z.string(),
  worker_pack_id: z.string().min(1),
  worker_kind: workerKindSchema,
  stability: pluginStabilitySchema,
  category: pluginCategorySchema.optional(),
  priority: z.number().optional(),
  supported_input_route_kinds: z.array(inputRouteKindSchema),
  action_kinds: z.array(actionCapabilityKindSchema),
  setup_steps: z.array(registrySetupStepSchema),
});
export type RegistryWorkerPack = z.infer<typeof registryWorkerPackSchema>;

export const registryResponseSchema = z.object({
  connection_providers: z.array(registryConnectionProviderSchema),
  ingress_adapters: z.array(registryIngressAdapterSchema),
  action_executors: z.array(registryActionExecutorSchema),
  worker_packs: z.array(registryWorkerPackSchema),
});
export type RegistryResponse = z.infer<typeof registryResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/workspace/worker-packs
// ---------------------------------------------------------------------------

export const workerPackListItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: workerKindSchema,
  summary: z.string(),
  default_scope: workerScopeSchema,
  stability: pluginStabilitySchema,
  category: pluginCategorySchema.optional(),
  priority: z.number().optional(),
  supported_input_routes: z.array(z.object({
    kind: inputRouteKindSchema,
    label: z.string().min(1),
    description: z.string(),
    capability_note: z.string().nullable(),
  })),
  action_capabilities: z.array(z.object({
    kind: actionCapabilityKindSchema,
    default_boundary_mode: boundaryModeSchema,
  })),
});
export type WorkerPackListItem = z.infer<typeof workerPackListItemSchema>;

export const workerPackListResponseSchema = z.object({
  packs: z.array(workerPackListItemSchema),
});
export type WorkerPackListResponse = z.infer<typeof workerPackListResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/workspace/workers/install
// ---------------------------------------------------------------------------

export const workerPackInstallResultSchema = z.object({
  worker_id: z.string().min(1),
  input_route_ids: z.array(z.string().min(1)),
  action_capability_ids: z.array(z.string().min(1)),
});
export type WorkerPackInstallResult = z.infer<typeof workerPackInstallResultSchema>;
