"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  configureN8n,
  disconnectWorkspaceConnection,
  getN8nStatus,
  verifyN8n,
  type N8nStatusResponse,
  type N8nVerifyResponse,
  type WorkspaceConnectionRecord,
} from "@/lib/control-plane";

type N8nOnboardingCardProps = {
  connection: WorkspaceConnectionRecord | null;
  usingFixtureFallback: boolean;
};

function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stateColorClass(status: string) {
  if (status === "connected") {
    return "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
  }
  return "border-border bg-muted/30 text-muted-foreground";
}

const SAMPLE_WORKFLOW_PAYLOAD = `{
  "clawback": {
    "workspace_id": "ws_...",
    "review_id": "rev_...",
    "work_item_id": "wi_..."
  },
  "workflow_identifier": "your-workflow-id",
  "payload": {
    "action": "post_approval_crm_update",
    "customer_email": "client@example.com",
    "subject": "Proposal follow-up"
  }
}`;

export function N8nOnboardingCard({
  connection,
  usingFixtureFallback,
}: N8nOnboardingCardProps) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [isPending, startTransition] = useTransition();
  const [n8nStatus, setN8nStatus] = useState<N8nStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(connection?.status ?? null);
  const [verifyResult, setVerifyResult] = useState<N8nVerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Form fields
  const [baseUrl, setBaseUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [webhookPathPrefix, setWebhookPathPrefix] = useState("webhook");
  const [showSetupForm, setShowSetupForm] = useState(false);

  const effectiveStatus = localStatus ?? connection?.status ?? "not_connected";
  const isAdmin = session?.membership.role === "admin";

  useEffect(() => {
    if (!connection) {
      setN8nStatus(null);
      return;
    }

    let cancelled = false;
    setLoadingStatus(true);
    void (async () => {
      try {
        const response = await getN8nStatus(connection.id);
        if (!cancelled) {
          setN8nStatus(response);
          if (response.base_url) {
            setBaseUrl(response.base_url);
          }
          if (response.webhook_path_prefix) {
            setWebhookPathPrefix(response.webhook_path_prefix);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load n8n status.");
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

    if (!baseUrl.trim() || !authToken.trim()) {
      setError("Base URL and API key are required.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await configureN8n(connection.id, {
        baseUrl: baseUrl.trim(),
        authToken: authToken.trim(),
        webhookPathPrefix: webhookPathPrefix.trim() || undefined,
        csrfToken: session.csrf_token,
      });
      setLocalStatus(updated.status);
      setAuthToken("");
      setShowSetupForm(false);
      setSuccessMessage("n8n configured. Backend URL and credentials saved.");
      const response = await getN8nStatus(connection.id);
      setN8nStatus(response);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to configure n8n backend.");
    }
  }

  async function handleVerify() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setVerifyResult(null);
    setVerifying(true);
    try {
      const result = await verifyN8n(connection.id, {
        csrfToken: session.csrf_token,
      });
      setVerifyResult(result);
    } catch (err) {
      setVerifyResult({
        reachable: false,
        authenticated: false,
        error: err instanceof Error ? err.message : "Verification failed.",
      });
    } finally {
      setVerifying(false);
    }
  }

  async function handleDisconnect() {
    if (!connection) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await disconnectWorkspaceConnection(connection.id, {
        csrfToken: session?.csrf_token ?? null,
      });
      setLocalStatus(updated.status);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect n8n.");
    }
  }

  if (!connection) {
    return null;
  }

  const showSetup = effectiveStatus !== "connected" || showSetupForm;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <HelpTooltip content="n8n is an external automation backend. Clawback hands reviewed deterministic workflow segments to n8n after approval. n8n executes the downstream work; Clawback remains the system of record." />
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          automation backend
        </Badge>
        <Badge variant="outline" className={stateColorClass(effectiveStatus)}>
          {humanizeStatus(effectiveStatus)}
        </Badge>
        {loadingStatus ? (
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
            loading...
          </Badge>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Configure an n8n backend for reviewed outbound workflow handoffs. After a reviewer approves
        an external workflow action, Clawback sends the payload to the configured n8n webhook endpoint.
        Approval truth and audit stay in Clawback.
      </p>

      {showSetup ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              n8n backend configuration
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Enter the base URL and API key for your n8n instance. The webhook path prefix
              defaults to &quot;webhook&quot; and is combined with the workflow identifier at execution time.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground" htmlFor="n8n-base-url">
                Base URL
              </label>
              <input
                id="n8n-base-url"
                type="url"
                placeholder="https://your-n8n.example.com"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground" htmlFor="n8n-auth-token">
                API key
              </label>
              <input
                id="n8n-auth-token"
                type="password"
                placeholder="n8n API key or Bearer token"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground" htmlFor="n8n-webhook-prefix">
                Webhook path prefix
              </label>
              <input
                id="n8n-webhook-prefix"
                type="text"
                placeholder="webhook"
                value={webhookPathPrefix}
                onChange={(e) => setWebhookPathPrefix(e.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Combined as: <code className="rounded bg-muted px-1 py-0.5">{`{base_url}/{prefix}/{workflow_id}`}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback || !baseUrl.trim() || !authToken.trim()}
              onClick={() => void handleConfigure()}
            >
              {isPending ? "Saving..." : "Save and connect"}
            </Button>
            {effectiveStatus === "connected" ? (
              <Button variant="outline" onClick={() => setShowSetupForm(false)}>
                Cancel
              </Button>
            ) : null}
            {!isAdmin ? (
              <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Status panel when connected */}
      {effectiveStatus === "connected" && !showSetup ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Connection details
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Base URL</span>
                <span className="text-right font-mono text-xs text-foreground truncate max-w-48">
                  {n8nStatus?.base_url ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">API key</span>
                <Badge variant={n8nStatus?.has_auth_token ? "default" : "outline"}>
                  {n8nStatus?.has_auth_token ? "Saved" : "Missing"}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Webhook prefix</span>
                <span className="text-right font-mono text-xs text-foreground">
                  {n8nStatus?.webhook_path_prefix ?? "webhook"}
                </span>
              </div>
              {n8nStatus?.configured_at ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Configured at</span>
                  <span className="text-right text-xs text-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(n8nStatus.configured_at))}
                  </span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              How it works
            </p>
            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
              <li>A worker creates an action plan work item.</li>
              <li>An operator requests an external workflow review.</li>
              <li>A reviewer approves the handoff from the inbox.</li>
              <li>Clawback POSTs the payload to n8n via the configured webhook.</li>
              <li>The execution outcome is recorded back on the work item.</li>
            </ol>
          </div>
        </div>
      ) : null}

      {/* Verify result */}
      {verifyResult ? (
        <div className={`rounded-md border p-3 ${
          verifyResult.reachable && verifyResult.authenticated
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-destructive/30 bg-destructive/5"
        }`}>
          <div className="flex items-center gap-2">
            <p className={`text-sm font-medium ${
              verifyResult.reachable && verifyResult.authenticated
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-destructive"
            }`}>
              {verifyResult.reachable && verifyResult.authenticated
                ? "n8n is reachable and authenticated"
                : verifyResult.reachable
                  ? "n8n is reachable but authentication failed"
                  : "Cannot reach n8n"}
            </p>
            {verifyResult.status_code ? (
              <Badge variant="outline">{verifyResult.status_code}</Badge>
            ) : null}
          </div>
          {verifyResult.error ? (
            <p className="mt-1 text-xs text-muted-foreground">{verifyResult.error}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {effectiveStatus === "connected" && !showSetup ? (
          <>
            <Button
              disabled={!isAdmin || !session?.csrf_token || verifying || loading}
              onClick={() => void handleVerify()}
            >
              {verifying ? "Verifying..." : "Verify connection"}
            </Button>
            <Button variant="outline" onClick={() => setShowSetupForm(true)}>
              Update configuration
            </Button>
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading}
              onClick={() => void handleDisconnect()}
            >
              {isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
          </>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">n8n configuration error</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{successMessage}</p>
        </div>
      ) : null}

      {/* Sample workflow template */}
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer p-3 text-xs font-medium uppercase tracking-widest text-muted-foreground hover:bg-muted/30">
          Sample outbound workflow payload
        </summary>
        <div className="border-t border-border p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            When a reviewer approves an external workflow action, Clawback sends a POST request
            to <code className="rounded bg-muted px-1 py-0.5">{`{base_url}/{prefix}/{workflow_id}`}</code> with
            a Bearer token. The request body follows this structure:
          </p>
          <pre className="overflow-x-auto rounded-md border border-border bg-muted/30 p-3 text-xs text-foreground">
            {SAMPLE_WORKFLOW_PAYLOAD}
          </pre>
          <p className="text-xs text-muted-foreground">
            Create an n8n workflow with a Webhook trigger node. Set the webhook path to match the
            <code className="rounded bg-muted px-1 py-0.5">workflow_identifier</code> you use when
            requesting the review in Clawback. The <code className="rounded bg-muted px-1 py-0.5">clawback</code> object
            provides traceability back to the originating workspace, review, and work item.
          </p>
        </div>
      </details>

      {/* Webhook guidance — honest about current state */}
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer p-3 text-xs font-medium uppercase tracking-widest text-muted-foreground hover:bg-muted/30">
          Inbound webhook setup guidance
        </summary>
        <div className="border-t border-border p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Inbound webhook callbacks from n8n back to Clawback are planned but not yet implemented.
            The outbound reviewed handoff path (Clawback → n8n) is live. The inbound path
            (n8n → Clawback) will allow n8n to report execution results and feed normalized events
            back into the workspace.
          </p>
          <p className="text-xs text-muted-foreground">
            When the inbound path lands, this section will include the exact webhook URL and
            authentication instructions for configuring n8n&apos;s HTTP Request or Webhook Response nodes.
          </p>
        </div>
      </details>
    </div>
  );
}
