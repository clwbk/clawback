"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  configureSmtp,
  disconnectWorkspaceConnection,
  getSmtpStatus,
  type SmtpStatusResponse,
  type WorkspaceConnectionRecord,
} from "@/lib/control-plane";

type SmtpOnboardingCardProps = {
  connection: WorkspaceConnectionRecord | null;
  usingFixtureFallback: boolean;
};

function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function SmtpOnboardingCard({
  connection,
  usingFixtureFallback,
}: SmtpOnboardingCardProps) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [isPending, startTransition] = useTransition();
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(connection?.status ?? null);

  const effectiveStatus = localStatus ?? connection?.status ?? "not_connected";
  const isAdmin = session?.membership.role === "admin";

  useEffect(() => {
    if (!connection) {
      setSmtpStatus(null);
      return;
    }

    let cancelled = false;
    setLoadingStatus(true);
    void (async () => {
      try {
        const response = await getSmtpStatus(connection.id);
        if (!cancelled) {
          setSmtpStatus(response);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load SMTP status.");
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection?.id]);

  async function handleConfigure() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setError(null);
    try {
      const updated = await configureSmtp(connection.id, {
        csrfToken: session.csrf_token,
      });
      setLocalStatus(updated.status);
      // Refresh SMTP status
      const response = await getSmtpStatus(connection.id);
      setSmtpStatus(response);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to configure SMTP relay.");
    }
  }

  async function handleDisconnect() {
    if (!connection) {
      return;
    }

    setError(null);
    try {
      const updated = await disconnectWorkspaceConnection(connection.id, {
        csrfToken: session?.csrf_token ?? null,
      });
      setLocalStatus(updated.status);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect SMTP relay.");
    }
  }

  if (!connection) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <HelpTooltip content="The SMTP relay enables Clawback to send reviewed emails on behalf of your team. It is configured through server environment variables." />
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          write-capable
        </Badge>
        <Badge
          variant="outline"
          className={
            effectiveStatus === "connected"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-border bg-muted/30 text-muted-foreground"
          }
        >
          {humanizeStatus(effectiveStatus)}
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure an SMTP relay to send reviewed emails. This is the outbound send path
        for approved email drafts. Gmail read-only watch and SMTP send remain separate.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Required environment variables
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Set these on the control-plane server, then click "Check configuration" below.
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <EnvVarRow name="CLAWBACK_SMTP_HOST" present={smtpStatus?.host_present ?? false} value={smtpStatus?.host ?? undefined} description="SMTP server hostname (e.g. smtp.gmail.com)" />
            <EnvVarRow name="CLAWBACK_SMTP_PORT" present={smtpStatus?.port_present ?? false} value={smtpStatus?.port?.toString() ?? undefined} description="SMTP port (typically 587 for TLS)" />
            <EnvVarRow name="CLAWBACK_SMTP_FROM_ADDRESS" present={smtpStatus?.from_address_present ?? false} value={smtpStatus?.from_address ?? undefined} required description="Sender address for outbound emails" />
            <EnvVarRow name="CLAWBACK_SMTP_USERNAME" present={smtpStatus?.username_present ?? false} description="SMTP auth username" />
            <EnvVarRow name="CLAWBACK_SMTP_PASSWORD" present={smtpStatus?.password_present ?? false} description="SMTP auth password or app password" />
          </div>

          <div className="rounded-md border border-border bg-muted/30 p-2">
            <p className="text-[11px] text-muted-foreground">
              <strong>Set vs Missing</strong>: "Set" means the environment variable is present on the control-plane server.
              "Missing" means it needs to be added to the server configuration before connecting.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Configuration status
              </p>
              <HelpTooltip content="When all required env vars are set and verified, you can mark the SMTP relay as connected." />
            </div>
          </div>

          {loadingStatus ? (
            <p className="text-sm text-muted-foreground">Loading SMTP status...</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Environment configured</span>
                <Badge variant={smtpStatus?.env_configured ? "default" : "outline"}>
                  {smtpStatus?.env_configured ? "Yes" : "No"}
                </Badge>
              </div>
              {smtpStatus?.from_address ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">From address</span>
                  <span className="text-right font-mono text-xs text-foreground">
                    {smtpStatus.from_address}
                  </span>
                </div>
              ) : null}
              {smtpStatus?.host ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Host</span>
                  <span className="text-right font-mono text-xs text-foreground">
                    {smtpStatus.host}:{smtpStatus.port}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {effectiveStatus === "connected" ? (
          <Button
            variant="outline"
            disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
            onClick={() => void handleDisconnect()}
          >
            {isPending ? "Disconnecting..." : "Disconnect SMTP"}
          </Button>
        ) : (
          <Button
            disabled={
              !isAdmin
              || !session?.csrf_token
              || loading
              || usingFixtureFallback
              || isPending
              || !smtpStatus?.env_configured
            }
            onClick={() => void handleConfigure()}
          >
            {isPending ? "Configuring..." : "Check configuration and connect"}
          </Button>
        )}

        {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
        {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
      </div>

      {effectiveStatus !== "connected" && !error ? (
        <p className="text-xs text-muted-foreground">
          "Check configuration and connect" reads the SMTP environment variables from the server,
          verifies the required values are present, and marks the relay as connected.
          No test email is sent during this step.
        </p>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">SMTP configuration failed</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Verify that all required environment variables are set on the control-plane server
            and restart the server if you recently changed them.
          </p>
        </div>
      ) : null}

      {effectiveStatus === "connected" && !error ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">SMTP relay connected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The SMTP relay is configured and ready to send reviewed emails.
            When a reviewer approves an email draft, it will be sent via this relay.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        This connection enables the reviewed send path. When a reviewer approves an email draft,
        it will be sent via this SMTP relay. The send boundary mode on the worker&apos;s action
        capabilities controls whether review is required.
      </p>
    </div>
  );
}

function EnvVarRow({
  name,
  present,
  value,
  required,
  description,
}: {
  name: string;
  present: boolean;
  value?: string | undefined;
  required?: boolean | undefined;
  description?: string | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-foreground">{name}</span>
          {required ? <span className="text-[10px] text-muted-foreground">(required)</span> : null}
        </div>
        {description ? (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {present && value ? (
          <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
        ) : null}
        <Badge
          variant="outline"
          className={`text-[10px] ${
            present
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          }`}
        >
          {present ? "Set" : "Missing"}
        </Badge>
      </div>
    </div>
  );
}
