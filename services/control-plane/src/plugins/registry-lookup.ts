/**
 * Registry lookup helpers for the control plane.
 *
 * These wrap the shared plugin-manifests registry to provide
 * control-plane-specific validation and lookup patterns.
 * Actual executor dispatch is not handled here (that comes later).
 */
import {
  getConnectionProviderByProvider,
  getActionExecutorByKind,
  getWorkerPackPlugin,
  connectionProviderPlugins,
  actionExecutorPlugins,
  workerPackPlugins,
} from "@clawback/plugin-manifests";
import type {
  ConnectionProviderPluginManifest,
  ActionExecutorPluginManifest,
  WorkerPackPluginManifest,
} from "@clawback/plugin-sdk";

/**
 * Returns true if the given provider string is a known registered provider.
 */
export function isRegisteredProvider(provider: string): boolean {
  return getConnectionProviderByProvider(provider) !== null;
}

/**
 * Returns the manifest for a provider, or null if not found.
 */
export function lookupProvider(provider: string): ConnectionProviderPluginManifest | null {
  return getConnectionProviderByProvider(provider);
}

/**
 * Returns all registered provider identifiers (the provider field, not the manifest id).
 */
export function listRegisteredProviderNames(): string[] {
  return connectionProviderPlugins.map((p) => p.provider);
}

/**
 * Returns true if the given action kind has a registered executor.
 */
export function isRegisteredActionKind(actionKind: string): boolean {
  return getActionExecutorByKind(actionKind) !== null;
}

/**
 * Returns the executor manifest for a given action kind, or null.
 */
export function lookupExecutor(actionKind: string): ActionExecutorPluginManifest | null {
  return getActionExecutorByKind(actionKind);
}

/**
 * Returns all registered action executor kinds.
 */
export function listRegisteredActionKinds(): string[] {
  return actionExecutorPlugins.map((e) => e.actionKind);
}

/**
 * Returns the worker pack manifest for a given pack id, or null.
 */
export function lookupWorkerPack(workerPackId: string): WorkerPackPluginManifest | null {
  return getWorkerPackPlugin(workerPackId);
}

/**
 * Returns all registered worker pack identifiers.
 */
export function listRegisteredWorkerPackIds(): string[] {
  return workerPackPlugins.map((w) => w.workerPackId);
}
