/**
 * Re-exports the first-party plugin registry from @clawback/plugin-manifests.
 *
 * The shared package is the source of truth for all first-party manifest
 * definitions. This module re-exports the registry helpers so existing
 * control-plane code continues to work without import path changes.
 */
export {
  connectionProviderPlugins,
  ingressAdapterPlugins,
  actionExecutorPlugins,
  workerPackPlugins,
  firstPartyRegistry,
  listConnectionProviderPlugins,
  listIngressAdapterPlugins,
  listActionExecutorPlugins,
  listWorkerPackPlugins,
  getConnectionProviderPlugin,
  getConnectionProviderByProvider,
  getIngressAdapterPlugin,
  getActionExecutorPlugin,
  getActionExecutorByKind,
  getWorkerPackPlugin,
} from "@clawback/plugin-manifests";
