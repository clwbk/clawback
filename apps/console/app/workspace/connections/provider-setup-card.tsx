import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RegistryConnectionProvider } from "@/lib/control-plane";
import { getProviderPanel } from "../_lib/provider-panel-registry";

type ProviderSetupCardProps = {
  provider: RegistryConnectionProvider;
  /**
   * Props to pass to the custom panel component, if one is registered
   * for this provider's manifest ID.
   */
  // biome-ignore lint/suspicious/noExplicitAny: panel props vary per provider
  panelProps?: Record<string, any> | undefined;
  /** Connection status used to drive visual styling on the card. */
  connectionStatus?: "connected" | "not_connected" | "suggested" | "error" | null;
};

/**
 * Manifest-driven provider card shell.
 *
 * Contract:
 * - This component owns the outer frame for every provider card.
 * - Custom provider panels render inside the body slot and never replace
 *   the outer shell.
 * - If no custom panel is registered, the manifest metadata still renders a
 *   useful generic fallback.
 */
export function ProviderSetupCard({ provider, panelProps, connectionStatus }: ProviderSetupCardProps) {
  const isComingSoon = provider.stability === "experimental";
  const CustomPanel = getProviderPanel(provider.id);
  const hasCustomPanel = Boolean(CustomPanel && panelProps);
  const ResolvedCustomPanel = hasCustomPanel ? CustomPanel : null;

  const cardClassName = [
    "border-border/50 bg-muted/20",
    connectionStatus === "connected" ? "border-l-4 border-l-emerald-500/50" : "",
    isComingSoon ? "opacity-60" : "",
  ].filter(Boolean).join(" ");

  return (
    <Card className={cardClassName}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {provider.display_name}
            </p>
            <CardTitle className="mt-1 text-lg">{provider.display_name}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            {provider.access_modes.map((mode) => (
              <Badge key={mode} variant="outline" className="border-border bg-muted/30 text-muted-foreground">
                {mode.replace(/_/g, " ")}
              </Badge>
            ))}
            {isComingSoon ? (
              <Badge variant="outline" className="border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400">
                Coming soon
              </Badge>
            ) : (
              <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
                {provider.stability}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{provider.description}</p>

        {provider.capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {provider.capabilities.map((cap) => (
              <Badge key={cap} variant="secondary" className="text-xs">
                {cap.replace(/_/g, " ")}
              </Badge>
            ))}
          </div>
        ) : null}

        {ResolvedCustomPanel ? <ResolvedCustomPanel {...panelProps} /> : null}

        {!hasCustomPanel && isComingSoon && provider.setup_steps.length > 0 ? (
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <p className="text-xs font-medium text-muted-foreground">Setup preview</p>
            <ul className="mt-1 space-y-1">
              {provider.setup_steps.map((step) => (
                <li key={step.id} className="text-xs text-muted-foreground">
                  {step.title}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
