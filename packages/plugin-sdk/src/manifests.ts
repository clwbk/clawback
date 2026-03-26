import type {
  ActionCapabilityKind,
  BoundaryMode,
  ConnectionAccessMode,
  ConnectionProvider,
  InputRouteKind,
  WorkerKind,
  WorkerScope,
  WorkItemKind,
} from "@clawback/contracts";

export type PluginKind =
  | "connection_provider"
  | "ingress_adapter"
  | "action_executor"
  | "worker_pack";

export type PluginStability = "experimental" | "pilot" | "stable";

export type PluginOwner = "core" | "first_party";

export type SetupSurfaceTarget = {
  surface: "setup" | "connections" | "workers" | "activity";
  focus?: string | undefined;
  workerKind?: WorkerKind | undefined;
};

export type SetupStepManifest = {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  operatorOnly?: boolean | undefined;
  docsHref?: string | undefined;
  target?: SetupSurfaceTarget | undefined;
};

/**
 * Presentation category for grouping plugins on product surfaces.
 * This is manifest metadata (how the plugin should appear), not a UI field.
 */
export type PluginCategory =
  | "email"
  | "knowledge"
  | "project"
  | "crm"
  | "messaging"
  | "other";

export type RecoveryHint = {
  symptom: string;
  fix: string;
};

export type PluginManifestBase<TKind extends PluginKind> = {
  id: string;
  kind: TKind;
  version: string;
  displayName: string;
  description: string;
  owner: PluginOwner;
  stability: PluginStability;
  tags?: string[] | undefined;
  /** Presentation category for grouping on product surfaces. */
  category?: PluginCategory | undefined;
  /** Sort priority within its category (lower = earlier). */
  priority?: number | undefined;
  /** Human-readable setup instructions for the operator. */
  setupHelp?: string | undefined;
  /** Description of what validation checks this plugin performs. */
  validate?: string | undefined;
  /** Description of the probe/health check this plugin supports. */
  probe?: string | undefined;
  /** What status information is available from this plugin. */
  status?: string | undefined;
  /** Common failure modes and how to fix them. */
  recoveryHints?: RecoveryHint[] | undefined;
};

export type ConnectionProviderPluginManifest =
  PluginManifestBase<"connection_provider"> & {
    provider: ConnectionProvider;
    accessModes: ConnectionAccessMode[];
    capabilities: string[];
    compatibleInputRouteKinds: InputRouteKind[];
    setupMode: "operator_driven" | "external_runtime" | "browser_oauth";
    secretKeys: string[];
    setupSteps: SetupStepManifest[];
  };

export type IngressAdapterPluginManifest =
  PluginManifestBase<"ingress_adapter"> & {
    adapterKind: "provider_inbound" | "watch_hook" | "generic_webhook";
    normalizedInputRouteKinds: InputRouteKind[];
    authentication: "shared_token" | "provider_signature" | "oauth_callback";
    provider: string;
    setupSteps: SetupStepManifest[];
  };

export type ActionExecutorPluginManifest =
  PluginManifestBase<"action_executor"> & {
    actionKind: ActionCapabilityKind;
    destinationProviders: ConnectionProvider[];
    defaultBoundaryMode: BoundaryMode;
    executionModel: "governed_async";
    secretKeys: string[];
    setupSteps: SetupStepManifest[];
  };

export type WorkerPackPluginManifest =
  PluginManifestBase<"worker_pack"> & {
    workerPackId: string;
    workerKind: WorkerKind;
    defaultScope: WorkerScope;
    supportedInputRouteKinds: InputRouteKind[];
    outputKinds: WorkItemKind[];
    actionKinds: ActionCapabilityKind[];
    requiredConnectionProviders: ConnectionProvider[];
    optionalConnectionProviders: ConnectionProvider[];
    setupSteps: SetupStepManifest[];
  };

export type AnyPluginManifest =
  | ConnectionProviderPluginManifest
  | IngressAdapterPluginManifest
  | ActionExecutorPluginManifest
  | WorkerPackPluginManifest;
