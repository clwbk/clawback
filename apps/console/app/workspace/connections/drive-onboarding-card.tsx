"use client";

import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import {
  completeDriveOAuthCallback,
  getDriveOAuthCredentials,
  getDriveStatus,
  probeDriveConnection,
  saveDriveOAuthCredentials,
  type DriveSetupSummary,
  type WorkspaceConnectionRecord,
} from "@/lib/control-plane";

type DriveOnboardingCardProps = {
  connection: WorkspaceConnectionRecord | null;
  usingFixtureFallback: boolean;
};

function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Drive onboarding card.
 *
 * Renders inside the ProviderSetupCard shell. Follows the plugin path:
 * registered via panel-registrations.ts, not page-specific branching.
 */
export function DriveOnboardingCard({ connection, usingFixtureFallback }: DriveOnboardingCardProps) {
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const [isPending, startTransition] = useTransition();
  const [setup, setSetup] = useState<DriveSetupSummary | null>(null);
  const [oauthConfigured, setOauthConfigured] = useState(false);
  const [oauthClientId, setOauthClientId] = useState("");

  // OAuth app credential inputs
  const [inputClientId, setInputClientId] = useState("");
  const [inputClientSecret, setInputClientSecret] = useState("");
  const [showOAuthForm, setShowOAuthForm] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [probeResult, setProbeResult] = useState<{
    ok: boolean;
    summary: string;
  } | null>(null);

  // Load setup status on mount
  useEffect(() => {
    if (!connection || usingFixtureFallback) return;
    getDriveStatus(connection.id)
      .then((res) => setSetup(res.setup))
      .catch(() => {});
    getDriveOAuthCredentials(connection.id)
      .then((res) => {
        setOauthConfigured(res.configured);
        setOauthClientId(res.client_id ?? "");
      })
      .catch(() => {});
  }, [connection, usingFixtureFallback]);

  if (usingFixtureFallback || !connection) {
    return (
      <div className="rounded-md border border-border bg-muted/30 p-3">
        <p className="text-xs text-muted-foreground">
          Drive setup requires a live control plane connection.
        </p>
      </div>
    );
  }

  const handleSaveOAuthCredentials = () => {
    if (!csrfToken || !inputClientId || !inputClientSecret) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveDriveOAuthCredentials({
          connectionId: connection.id,
          csrfToken,
          clientId: inputClientId,
          clientSecret: inputClientSecret,
        });
        setOauthConfigured(result.configured);
        setOauthClientId(result.client_id ?? "");
        setShowOAuthForm(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save credentials.");
      }
    });
  };

  const handleStartOAuth = () => {
    if (!oauthClientId) return;
    // Build Google OAuth URL for Drive read-only scope
    const redirectUri = `${window.location.origin}/api/auth/google-drive/callback`;
    const params = new URLSearchParams({
      client_id: oauthClientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/drive.readonly",
      access_type: "offline",
      prompt: "consent",
      state: connection.id,
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  };

  const handleProbe = () => {
    if (!csrfToken) return;
    setError(null);
    setProbeResult(null);
    startTransition(async () => {
      try {
        const result = await probeDriveConnection(connection.id, { csrfToken });
        setProbeResult(result.probe);
        // Refresh setup status after probe
        const updated = await getDriveStatus(connection.id);
        setSetup(updated.setup);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Probe failed.");
      }
    });
  };

  const operationalState = setup?.operational_status?.state ?? "setup_required";

  return (
    <div className="space-y-4">
      {/* Status summary */}
      <div className="flex items-center gap-2">
        <Badge
          variant={
            operationalState === "ready"
              ? "default"
              : operationalState === "error"
                ? "destructive"
                : "secondary"
          }
        >
          {humanizeStatus(operationalState)}
        </Badge>
        {setup?.validated_email ? (
          <span className="text-xs text-muted-foreground">{setup.validated_email}</span>
        ) : null}
      </div>

      {setup?.operational_status?.summary ? (
        <p className="text-sm text-muted-foreground">{setup.operational_status.summary}</p>
      ) : null}

      {/* OAuth app configuration */}
      {!oauthConfigured ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Step 1: Configure Google OAuth app</p>
            <p className="text-xs text-muted-foreground">
              Create a Google Cloud project with the Drive API enabled, then add OAuth 2.0 credentials.
            </p>
          </div>
          {showOAuthForm ? (
            <div className="space-y-2">
              <div>
                <Label htmlFor="drive-client-id" className="text-xs">Client ID</Label>
                <Input
                  id="drive-client-id"
                  value={inputClientId}
                  onChange={(e) => setInputClientId(e.target.value)}
                  placeholder="your-client-id.apps.googleusercontent.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="drive-client-secret" className="text-xs">Client Secret</Label>
                <Input
                  id="drive-client-secret"
                  type="password"
                  value={inputClientSecret}
                  onChange={(e) => setInputClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveOAuthCredentials}
                  disabled={isPending || !inputClientId || !inputClientSecret}
                >
                  {isPending ? "Saving..." : "Save credentials"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowOAuthForm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowOAuthForm(true)}>
              Configure OAuth credentials
            </Button>
          )}
        </div>
      ) : null}

      {/* Connect with Google */}
      {oauthConfigured && operationalState !== "ready" ? (
        <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Step 2: Connect Google Drive</p>
            <p className="text-xs text-muted-foreground">
              Authorize Clawback to read your shared Drive documents. No modifications will be made.
            </p>
          </div>
          <Button size="sm" onClick={handleStartOAuth}>
            Connect with Google
          </Button>
        </div>
      ) : null}

      {/* Probe / health check */}
      {operationalState === "ready" || operationalState === "error" || operationalState === "degraded" ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleProbe} disabled={isPending}>
            {isPending ? "Checking..." : "Check connection health"}
          </Button>
          {probeResult ? (
            <span className={`text-xs ${probeResult.ok ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {probeResult.summary}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Error display */}
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      {setup?.last_error ? (
        <p className="text-xs text-red-600 dark:text-red-400">
          Last error: {setup.last_error}
        </p>
      ) : null}

      {setup?.last_probe_at ? (
        <p className="text-xs text-muted-foreground">
          Last checked: {new Date(setup.last_probe_at).toLocaleString()}
        </p>
      ) : null}
    </div>
  );
}
