/**
 * Console-side registry for setup step completion evaluators.
 *
 * Evaluators are keyed by `${pluginId}:${stepId}` — the compound key
 * ties each evaluator to a specific manifest and step without positional
 * assumptions.
 *
 * Each evaluator receives the full workspace state and returns whether
 * its step is complete.
 */
import type {
  WorkspaceInboxItemRecord,
  WorkspaceActionCapabilityRecord,
  ConnectorRecord,
  ConnectorSyncJobRecord,
  WorkspaceConnectionRecord,
  WorkspaceInputRouteRecord,
  WorkspaceWorkerRecord,
  WorkspaceWorkItemRecord,
} from "@/lib/control-plane";

export type SetupEvaluatorContext = {
  workers: WorkspaceWorkerRecord[];
  connections: WorkspaceConnectionRecord[];
  inputRoutes: WorkspaceInputRouteRecord[];
  actionCapabilities: WorkspaceActionCapabilityRecord[];
  inboxItems: WorkspaceInboxItemRecord[];
  workItems: WorkspaceWorkItemRecord[];
  connectors: ConnectorRecord[];
  syncJobsByConnector: Map<string, ConnectorSyncJobRecord[]>;
};

export type SetupEvaluatorFn = (ctx: SetupEvaluatorContext) => boolean;

const registry = new Map<string, SetupEvaluatorFn>();

/**
 * Build the compound key used to look up evaluators.
 */
export function evaluatorKey(pluginId: string, stepId: string): string {
  return `${pluginId}:${stepId}`;
}

/**
 * Register a completion evaluator for a specific plugin/step pair.
 */
export function registerSetupEvaluator(
  pluginId: string,
  stepId: string,
  evaluator: SetupEvaluatorFn,
): void {
  registry.set(evaluatorKey(pluginId, stepId), evaluator);
}

/**
 * Look up a completion evaluator by compound key.
 * Returns undefined if no evaluator is registered — the caller should
 * treat the step as informational / not yet automated.
 */
export function getSetupEvaluator(
  pluginId: string,
  stepId: string,
): SetupEvaluatorFn | undefined {
  return registry.get(evaluatorKey(pluginId, stepId));
}

/**
 * Check whether an evaluator exists for a given plugin/step pair.
 */
export function hasSetupEvaluator(pluginId: string, stepId: string): boolean {
  return registry.has(evaluatorKey(pluginId, stepId));
}

/**
 * Returns all registered evaluator keys (useful for tests).
 */
export function listRegisteredEvaluatorKeys(): string[] {
  return [...registry.keys()];
}
