/**
 * Console-side registry mapping manifest IDs to custom provider panel components.
 *
 * This registry is keyed by the plugin manifest `id` field (e.g. "provider.gmail.read-only"),
 * NOT by a UI-specific field. Manifests stay UI-agnostic; the console decides which
 * manifest IDs have custom panels.
 *
 * If a manifest ID has no entry here, ProviderSetupCard renders the generic
 * manifest-driven fallback card.
 *
 * Contract:
 * - registered panels render body content only
 * - ProviderSetupCard owns the outer shell for every provider
 */

/**
 * Marker type for a registered custom provider body component.
 * The actual React component type is intentionally loose because each first-
 * party panel has its own props shape.
 */
// biome-ignore lint/suspicious/noExplicitAny: each panel has its own props
export type CustomPanelEntry = React.ComponentType<any>;

const registry = new Map<string, CustomPanelEntry>();

/**
 * Register a custom panel for a given manifest ID.
 * Call this at module scope (side-effect import) so the panel is available
 * before the connections page renders.
 */
export function registerProviderPanel(manifestId: string, component: CustomPanelEntry): void {
  registry.set(manifestId, component);
}

/**
 * Look up a custom panel for a manifest ID.
 * Returns undefined if no custom panel is registered — the caller should
 * render the generic manifest-driven fallback.
 */
export function getProviderPanel(manifestId: string): CustomPanelEntry | undefined {
  return registry.get(manifestId);
}

/**
 * Check whether a custom panel exists for a manifest ID.
 */
export function hasProviderPanel(manifestId: string): boolean {
  return registry.has(manifestId);
}

/**
 * Returns all registered manifest IDs (useful for tests).
 */
export function listRegisteredPanelIds(): string[] {
  return [...registry.keys()];
}
