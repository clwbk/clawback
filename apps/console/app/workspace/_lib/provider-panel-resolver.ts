/**
 * Provider panel resolver layer.
 *
 * Moves "which panel? what props?" logic out of connections/page.tsx.
 * The page calls `resolvePanelProps()` once with workspace data, and gets
 * back a Map<manifestId, panelProps> that ProviderSetupCard can consume.
 *
 * Each resolver is keyed by manifest ID. If a manifest has no resolver,
 * the Map simply won't contain an entry for that ID, and ProviderSetupCard
 * renders the generic fallback.
 */

import type { WorkspaceConnectionRecord } from "@/lib/control-plane";

// biome-ignore lint/suspicious/noExplicitAny: panel props vary per provider
type PanelPropsResolver = (ctx: ResolverContext) => Record<string, any> | null;

export type ResolverContext = {
  connections: WorkspaceConnectionRecord[];
  inputRoutes: { id: string; kind: string; worker_id: string; status: string }[];
  workers: { id: string; name: string }[];
  usingFixtureFallback: boolean;
};

const resolvers = new Map<string, PanelPropsResolver>();

/**
 * Register a props resolver for a manifest ID.
 * Call at module scope alongside panel registrations.
 */
export function registerPanelPropsResolver(
  manifestId: string,
  resolver: PanelPropsResolver,
): void {
  resolvers.set(manifestId, resolver);
}

/**
 * Build panel props for all providers that have resolvers.
 * Returns a Map<manifestId, props> ready for ProviderSetupCard.
 */
export function resolvePanelPropsMap(
  ctx: ResolverContext,
  // biome-ignore lint/suspicious/noExplicitAny: panel props vary per provider
): Map<string, Record<string, any>> {
  const result = new Map<string, Record<string, any>>();
  for (const [manifestId, resolver] of resolvers) {
    const props = resolver(ctx);
    if (props) {
      result.set(manifestId, props);
    }
  }
  return result;
}
