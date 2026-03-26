"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  connectWorkspaceConnection,
  disconnectWorkspaceConnection,
  getGmailOAuthCredentials,
  getWorkspaceGmailPilotSetup,
  pollWorkspaceGmailInbox,
  saveGmailOAuthCredentials,
  saveWorkspaceGmailPilotSetup,
  saveWorkspaceGmailServiceAccountSetup,
  updateConnectionAttachedWorkers,
  type GmailPilotScopeKind,
  type GmailPilotSetupSummary,
  type WorkspaceConnectionRecord,
} from "@/lib/control-plane";

type WorkerRouteSummary = {
  workerId: string;
  workerName: string;
  routeStatus: string;
  attached: boolean;
};

type GmailOnboardingCardProps = {
  connection: WorkspaceConnectionRecord | null;
  workers: WorkerRouteSummary[];
  usingFixtureFallback: boolean;
};

function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function parseMailboxAddresses(input: string) {
  return input
    .split(/[\n,]/u)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Not yet";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function GmailOnboardingCard({
  connection,
  workers,
  usingFixtureFallback,
}: GmailOnboardingCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cardRef = useRef<HTMLDivElement>(null);
  const { session, loading } = useSession();
  const [isPending, startTransition] = useTransition();
  const [setup, setSetup] = useState<GmailPilotSetupSummary | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(false);
  const [savingSetup, setSavingSetup] = useState(false);
  const [savingAttachments, setSavingAttachments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(connection?.status ?? null);
  const [scopeKind, setScopeKind] = useState<GmailPilotScopeKind>("shared_mailbox");
  const [mailboxInput, setMailboxInput] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [attachedWorkerIds, setAttachedWorkerIds] = useState<string[]>(
    workers.filter((worker) => worker.attached).map((worker) => worker.workerId),
  );

  // OAuth app credentials state (for "Connect with Google" flow)
  const [oauthAppClientId, setOauthAppClientId] = useState("");
  const [oauthAppClientSecret, setOauthAppClientSecret] = useState("");
  const [oauthAppConfigured, setOauthAppConfigured] = useState(false);
  const [oauthAppSavedClientId, setOauthAppSavedClientId] = useState<string | null>(null);
  const [savingOAuthApp, setSavingOAuthApp] = useState(false);

  // Service account state
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [targetMailbox, setTargetMailbox] = useState("");
  const [savingServiceAccount, setSavingServiceAccount] = useState(false);
  const [pollingInbox, setPollingInbox] = useState(false);

  // Section visibility
  const [showOAuthConnect, setShowOAuthConnect] = useState(true);
  const [showServiceAccount, setShowServiceAccount] = useState(false);
  const [showManualCredentials, setShowManualCredentials] = useState(false);
  const [showCredentialEditor, setShowCredentialEditor] = useState(false);

  const effectiveStatus = localStatus ?? connection?.status ?? "not_connected";
  const isAdmin = session?.membership.role === "admin";
  const mailboxAddresses = useMemo(() => parseMailboxAddresses(mailboxInput), [mailboxInput]);
  const activeWorkers = useMemo(
    () => workers.filter((worker) => worker.routeStatus === "active"),
    [workers],
  );
  const attachedActiveWorkers = useMemo(
    () => workers.filter((worker) => worker.attached && worker.routeStatus === "active"),
    [workers],
  );
  const attachmentsChanged = JSON.stringify([...attachedWorkerIds].sort())
    !== JSON.stringify(
      workers.filter((worker) => worker.attached).map((worker) => worker.workerId).sort(),
    );

  const authMethod = setup?.auth_method ?? null;

  // Handle OAuth redirect results from URL params
  useEffect(() => {
    const oauthError = searchParams.get("gmail_oauth_error");
    const oauthSuccess = searchParams.get("gmail_oauth_success");

    if (oauthError) {
      setError(`Google OAuth failed: ${oauthError}`);
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail_oauth_error");
      window.history.replaceState({}, "", url.toString());
    } else if (oauthSuccess) {
      setSuccessMessage("Gmail configured via Google OAuth. Credentials validated. Attach to a worker and run Check inbox now to start monitoring.");
      // Clean up URL params
      const url = new URL(window.location.href);
      url.searchParams.delete("gmail_oauth_success");
      window.history.replaceState({}, "", url.toString());
      // Refresh to pick up the new connection status
      startTransition(() => router.refresh());
    }
  }, [searchParams, router, startTransition]);

  useEffect(() => {
    setAttachedWorkerIds(workers.filter((worker) => worker.attached).map((worker) => worker.workerId));
  }, [workers]);

  useEffect(() => {
    if (!connection) {
      setSetup(null);
      return;
    }

    let cancelled = false;
    setLoadingSetup(true);
    void (async () => {
      try {
        const [setupResponse, oauthCreds] = await Promise.all([
          getWorkspaceGmailPilotSetup(connection.id),
          getGmailOAuthCredentials(connection.id).catch(() => null),
        ]);
        if (cancelled) return;

        setSetup(setupResponse.setup);
        if (setupResponse.setup.scope_kind) {
          setScopeKind(setupResponse.setup.scope_kind);
        }
        if (setupResponse.setup.mailbox_addresses.length > 0 && !mailboxInput) {
          setMailboxInput(setupResponse.setup.mailbox_addresses.join("\n"));
        }

        // Load OAuth app credential status
        if (oauthCreds) {
          setOauthAppConfigured(oauthCreds.configured);
          setOauthAppSavedClientId(oauthCreds.client_id);
        }

        // Also check the new field from setup summary
        if (setupResponse.setup.oauth_app_configured) {
          setOauthAppConfigured(true);
        }

        // Auto-expand the section matching current auth method
        if (setupResponse.setup.auth_method === "service_account") {
          setShowServiceAccount(true);
          setShowOAuthConnect(false);
          setShowManualCredentials(false);
        } else if (setupResponse.setup.auth_method === "oauth") {
          setShowOAuthConnect(true);
          setShowServiceAccount(false);
          setShowManualCredentials(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Gmail setup.");
        }
      } finally {
        if (!cancelled) {
          setLoadingSetup(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connection?.id]);

  async function handleSaveOAuthAppCredentials() {
    if (!connection || !session?.csrf_token) return;

    setSavingOAuthApp(true);
    setError(null);
    try {
      const result = await saveGmailOAuthCredentials({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
        clientId: oauthAppClientId.trim(),
        clientSecret: oauthAppClientSecret.trim(),
      });
      setOauthAppConfigured(result.configured);
      setOauthAppSavedClientId(result.client_id);
      setOauthAppClientSecret("");
      setSuccessMessage("OAuth credentials saved. You can now connect with Google.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save OAuth credentials.");
    } finally {
      setSavingOAuthApp(false);
    }
  }

  function handleConnectWithGoogle() {
    if (!connection) return;
    // Redirect to the OAuth start endpoint
    window.location.href = `/api/auth/google/start?connection_id=${encodeURIComponent(connection.id)}`;
  }

  async function handleSetup() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setSavingSetup(true);
    setError(null);
    try {
      const response = await saveWorkspaceGmailPilotSetup({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
        scopeKind,
        mailboxAddresses,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        refreshToken: refreshToken.trim(),
      });
      setSetup(response.setup);
      setLocalStatus(response.setup.status);
      setClientSecret("");
      setRefreshToken("");
      setShowManualCredentials(false);
      setSuccessMessage("Gmail configured. Credentials validated. Attach to a worker and run Check inbox now to start monitoring.");
      startTransition(() => router.refresh());
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate Gmail setup.");
    } finally {
      setSavingSetup(false);
    }
  }

  async function handleServiceAccountSetup() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setSavingServiceAccount(true);
    setError(null);
    try {
      const response = await saveWorkspaceGmailServiceAccountSetup({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
        serviceAccountJson: serviceAccountJson.trim(),
        targetMailbox: targetMailbox.trim(),
      });
      setSetup(response.setup);
      setLocalStatus(response.setup.status);
      setServiceAccountJson("");
      setShowServiceAccount(false);
      setSuccessMessage("Gmail configured via service account. Credentials validated. Attach to a worker and run Check inbox now to start monitoring.");
      startTransition(() => router.refresh());
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to validate service account setup.");
    } finally {
      setSavingServiceAccount(false);
    }
  }

  async function handlePollInboxNow() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setPollingInbox(true);
    setError(null);
    try {
      const response = await pollWorkspaceGmailInbox({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
      });
      const refreshed = await getWorkspaceGmailPilotSetup(connection.id);
      setSetup(refreshed.setup);

      const poll = response.poll;
      if (poll.bootstrapped) {
        setSuccessMessage("Inbox baseline saved. Send a new email to the connected Gmail address, then click Check inbox now again.");
      } else if (poll.processed_messages > 0 && poll.created_results > 0) {
        const ignored = poll.processed_messages - poll.created_results - poll.deduplicated_results;
        const parts = [
          `${poll.processed_messages} new message${poll.processed_messages === 1 ? "" : "s"} found`,
          `${poll.created_results} suggestion${poll.created_results === 1 ? "" : "s"} created`,
        ];
        if (poll.deduplicated_results > 0) {
          parts.push(`${poll.deduplicated_results} already processed`);
        }
        if (ignored > 0) {
          parts.push(`${ignored} filtered by triage`);
        }
        setSuccessMessage(`Inbox checked. ${parts.join(", ")}.`);
      } else if (poll.processed_messages > 0 && poll.created_results === 0) {
        if (poll.deduplicated_results > 0) {
          setSuccessMessage(
            `Inbox checked. ${poll.processed_messages} message${poll.processed_messages === 1 ? "" : "s"} found, but ${poll.deduplicated_results === poll.processed_messages ? "all were" : `${poll.deduplicated_results} ${poll.deduplicated_results === 1 ? "was" : "were"}`} already processed by background polling.`,
          );
        } else {
          setSuccessMessage(
            `Inbox checked. ${poll.processed_messages} message${poll.processed_messages === 1 ? "" : "s"} found, but triage filtered ${poll.processed_messages === 1 ? "it" : "all of them"} (spam, cold outreach, etc.).`,
          );
        }
      } else {
        setSuccessMessage("Inbox checked. No new messages since the last check.");
      }

      startTransition(() => router.refresh());
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check Gmail inbox.");
    } finally {
      setPollingInbox(false);
    }
  }

  async function handleConnect() {
    if (!connection) {
      return;
    }

    setError(null);
    try {
      const updated = await connectWorkspaceConnection(connection.id, {
        csrfToken: session?.csrf_token ?? null,
      });
      setLocalStatus(updated.status);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable Gmail read-only.");
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
      setError(err instanceof Error ? err.message : "Failed to disconnect Gmail read-only.");
    }
  }

  async function handleSaveAttachments() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setSavingAttachments(true);
    setError(null);
    try {
      const updated = await updateConnectionAttachedWorkers({
        connectionId: connection.id,
        csrfToken: session.csrf_token,
        attachedWorkerIds,
      });
      setLocalStatus(updated.status);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update worker attachments.");
    } finally {
      setSavingAttachments(false);
    }
  }

  function toggleWorker(workerId: string) {
    setAttachedWorkerIds((current) =>
      current.includes(workerId)
        ? current.filter((id) => id !== workerId)
        : [...current, workerId],
    );
  }

  function collapseAll() {
    setShowOAuthConnect(false);
    setShowServiceAccount(false);
    setShowManualCredentials(false);
  }

  return (
    <div ref={cardRef} className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <HelpTooltip content="One admin sets this up once for the workspace. Gmail stays read-only here; reviewed outbound send remains on the separate SMTP relay path." />
        {authMethod ? (
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
            {authMethod === "service_account" ? "service account" : "OAuth"}
          </Badge>
        ) : null}
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          {scopeKind.replace(/_/g, " ")}
        </Badge>
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          read-only
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
        One admin configures Gmail read-only once for the workspace, validates the credentials
        against Google, and then attaches eligible workers. Reviewed sends remain on the separate
        SMTP relay path.
      </p>

      {/* Connect / Disconnect controls */}
      {setup?.configured ? (
        <div className="flex flex-wrap gap-2">
          {effectiveStatus === "connected" ? (
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
              onClick={() => void handleDisconnect()}
            >
              {isPending ? "Disconnecting..." : "Disconnect Gmail"}
            </Button>
          ) : (
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
              onClick={() => void handleConnect()}
            >
              {isPending ? "Reconnecting..." : "Reconnect Gmail"}
            </Button>
          )}
          <Button
            variant="outline"
            disabled={
              !isAdmin
              || !session?.csrf_token
              || pollingInbox
              || loading
              || usingFixtureFallback
              || effectiveStatus !== "connected"
              || attachedActiveWorkers.length === 0
            }
            onClick={() => void handlePollInboxNow()}
          >
            {pollingInbox ? "Checking inbox..." : "Check inbox now"}
          </Button>
          {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
        </div>
      ) : null}

      {/* Success feedback when connected */}
      {effectiveStatus === "connected" && !error ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Gmail configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Credentials validated{authMethod === "service_account" ? " via service account" : ""}. Attach Gmail to a watched-inbox worker, then use Check inbox now to start live monitoring and confirm shadow suggestions are being created.
          </p>
        </div>
      ) : null}

      {/* Success message from OAuth redirect */}
      {successMessage && !error ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{successMessage}</p>
        </div>
      ) : null}

      {/* Reconnect explanation when disconnected but configured */}
      {setup?.configured && effectiveStatus !== "connected" && !error ? (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Gmail disconnected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The Gmail connection was previously configured but is now disconnected.
            Click &quot;Reconnect Gmail&quot; to re-enable read-only monitoring with the existing credentials,
            or configure new credentials below.
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      ) : null}

      {/* ----------------------------------------------------------------- */}
      {/* Setup paths                                                        */}
      {/* ----------------------------------------------------------------- */}

      {effectiveStatus === "connected" ? (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground underline"
          onClick={() => setShowCredentialEditor(!showCredentialEditor)}
        >
          {showCredentialEditor ? "Hide credential settings" : "Change credentials..."}
        </button>
      ) : null}

      {effectiveStatus !== "connected" || showCredentialEditor ? (
      <div className="space-y-3">
          {/* Path 1: Connect with Google (OAuth one-click) — recommended */}
          <div className="rounded-lg border border-border bg-background/70">
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left"
              onClick={() => {
                const next = !showOAuthConnect;
                collapseAll();
                setShowOAuthConnect(next);
              }}
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">Connect Gmail</p>
                  <Badge variant="outline" className="border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-400 text-[10px]">recommended</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sign in with Google to grant read-only access. Best for individual or shared mailboxes.
                </p>
              </div>
              <span className="ml-3 text-muted-foreground">{showOAuthConnect ? "\u25B2" : "\u25BC"}</span>
            </button>

            {showOAuthConnect ? (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                {/* Step 1: Instructions for creating OAuth credentials */}
                <details className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-sky-700 dark:text-sky-400">
                    How to create Google Cloud OAuth credentials
                  </summary>
                  <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.cloud.google.com/apis/credentials"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        console.cloud.google.com/apis/credentials
                      </a>
                    </li>
                    <li>Click &quot;Create Credentials&quot; and select &quot;OAuth client ID&quot;</li>
                    <li>Application type: &quot;Web application&quot;</li>
                    <li>Name: anything (e.g., &quot;Clawback&quot;)</li>
                    <li>
                      Authorized redirect URI: add exactly:
                      <code className="ml-1 rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono text-foreground">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}/api/auth/google/callback`
                          : "http://localhost:3000/api/auth/google/callback"}
                      </code>
                    </li>
                    <li>Click &quot;Create&quot; and copy the Client ID and Client Secret</li>
                  </ol>
                </details>

                {/* Step 2: Enter credentials */}
                <div className="space-y-3">
                  <p className="text-xs font-medium text-foreground">Step 2: Enter your credentials</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="gmail-oauth-app-client-id">Client ID</Label>
                      <Input
                        id="gmail-oauth-app-client-id"
                        value={oauthAppClientId}
                        onChange={(event) => setOauthAppClientId(event.target.value)}
                        disabled={!isAdmin || loading || usingFixtureFallback}
                        placeholder={oauthAppSavedClientId ?? "e.g. 123456789.apps.googleusercontent.com"}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="gmail-oauth-app-client-secret">Client Secret</Label>
                      <Input
                        id="gmail-oauth-app-client-secret"
                        type="password"
                        value={oauthAppClientSecret}
                        onChange={(event) => setOauthAppClientSecret(event.target.value)}
                        disabled={!isAdmin || loading || usingFixtureFallback}
                        placeholder={oauthAppConfigured ? "Configured (enter new value to update)" : "Google client secret"}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleSaveOAuthAppCredentials()}
                      disabled={
                        !isAdmin
                        || !session?.csrf_token
                        || loading
                        || usingFixtureFallback
                        || savingOAuthApp
                        || !oauthAppClientId.trim()
                        || !oauthAppClientSecret.trim()
                      }
                    >
                      {savingOAuthApp ? "Saving..." : "Save credentials"}
                    </Button>
                    {oauthAppConfigured ? (
                      <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                        Credentials saved
                      </Badge>
                    ) : null}
                  </div>
                </div>

                {/* Step 3: Connect button */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground">Step 3: Connect</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handleConnectWithGoogle}
                      disabled={
                        !isAdmin
                        || !connection
                        || loading
                        || usingFixtureFallback
                        || !oauthAppConfigured
                      }
                    >
                      Connect with Google
                    </Button>
                    {!oauthAppConfigured ? (
                      <p className="text-xs text-muted-foreground">
                        Save your credentials above first
                      </p>
                    ) : null}
                    {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    This will redirect you to Google to sign in and grant read-only Gmail access. A refresh token is stored securely so Clawback can continue monitoring.
                  </p>
                </div>
              </div>
            ) : null}
          </div>

          {/* Path 2: Service Account (Google Workspace teams) */}
          <div className="rounded-lg border border-border bg-background/70">
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left"
              onClick={() => {
                const next = !showServiceAccount;
                collapseAll();
                setShowServiceAccount(next);
              }}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Google Workspace setup (for teams)</p>
                <p className="text-xs text-muted-foreground">
                  Uses a service account with domain-wide delegation. Gives Clawback read-only access to a shared team mailbox without each person signing in.
                </p>
              </div>
              <span className="ml-3 text-muted-foreground">{showServiceAccount ? "\u25B2" : "\u25BC"}</span>
            </button>

            {showServiceAccount ? (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                <details className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-sky-700 dark:text-sky-400">Prerequisites</summary>
                  <ul className="mt-2 text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                    <li>Google Workspace admin access</li>
                    <li>A shared team mailbox (e.g., team@company.com)</li>
                  </ul>
                </details>

                <details className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-sky-700 dark:text-sky-400">Step 1: Create a service account in Google Cloud</summary>
                  <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                    <li>
                      Go to{" "}
                      <a
                        href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        console.cloud.google.com/iam-admin/serviceaccounts
                      </a>
                    </li>
                    <li>Click &quot;Create Service Account&quot;</li>
                    <li>Name: &quot;Clawback&quot; -- then click Create</li>
                    <li>Click the new account -- go to Keys -- Add Key -- JSON</li>
                    <li>Download the JSON key file</li>
                  </ol>
                </details>

                <details className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3">
                  <summary className="cursor-pointer text-xs font-medium text-sky-700 dark:text-sky-400">Step 2: Enable domain-wide delegation in Google Workspace</summary>
                  <ol className="mt-2 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                    <li>
                      Go to{" "}
                      <a
                        href="https://admin.google.com/ac/owl/domainwidedelegation"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        admin.google.com -- Security -- API Controls -- Domain-wide Delegation
                      </a>
                    </li>
                    <li>Click &quot;Add new&quot;</li>
                    <li>Client ID: (from the service account details page)</li>
                    <li>
                      Scopes:{" "}
                      <code className="rounded bg-muted/50 px-1.5 py-0.5 text-xs font-mono text-foreground">
                        https://www.googleapis.com/auth/gmail.readonly
                      </code>
                    </li>
                    <li>Click Authorize</li>
                  </ol>
                </details>

                <div className="space-y-3">
                  <p className="text-xs font-medium text-foreground">Step 3: Connect in Clawback</p>

                  <div className="space-y-2">
                    <Label htmlFor="gmail-sa-json">Service Account JSON key</Label>
                    <textarea
                      id="gmail-sa-json"
                      className="min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono"
                      value={serviceAccountJson}
                      onChange={(event) => setServiceAccountJson(event.target.value)}
                      disabled={!isAdmin || loading || usingFixtureFallback}
                      placeholder='Paste the entire contents of your downloaded service account JSON key file...'
                    />
                    <p className="text-[11px] text-muted-foreground">
                      This is the JSON file downloaded from Google Cloud Console. It contains the service account email and private key.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gmail-sa-target">Target mailbox email</Label>
                    <Input
                      id="gmail-sa-target"
                      type="email"
                      value={targetMailbox}
                      onChange={(event) => setTargetMailbox(event.target.value)}
                      disabled={!isAdmin || loading || usingFixtureFallback}
                      placeholder="team@company.com"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      The shared mailbox or user mailbox the service account should access via delegation.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => void handleServiceAccountSetup()}
                      disabled={
                        !isAdmin
                        || !session?.csrf_token
                        || loading
                        || usingFixtureFallback
                        || savingServiceAccount
                        || !serviceAccountJson.trim()
                        || !targetMailbox.trim()
                      }
                    >
                      {savingServiceAccount ? "Validating..." : "Validate and connect"}
                    </Button>
                    {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
                    {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Path 3: Manual OAuth credentials (advanced, collapsed) */}
          <div className="rounded-lg border border-border bg-background/70">
            <button
              type="button"
              className="flex w-full items-center justify-between p-4 text-left"
              onClick={() => {
                const next = !showManualCredentials;
                collapseAll();
                setShowManualCredentials(next);
              }}
            >
              <div>
                <p className="text-sm font-medium text-foreground">Advanced: Manual credentials</p>
                <p className="text-xs text-muted-foreground">
                  For cases where OAuth redirect doesn&apos;t work (e.g., CLI-only environments). You&apos;ll need to generate a refresh token manually.
                </p>
              </div>
              <span className="ml-3 text-muted-foreground">{showManualCredentials ? "\u25B2" : "\u25BC"}</span>
            </button>

            {showManualCredentials ? (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="gmail-scope-kind">Access scope</Label>
                    <HelpTooltip content="Start with shared_mailbox unless your workspace clearly needs more. selected_mailboxes is the next step. broad_read_only should stay exceptional." />
                  </div>
                  <select
                    id="gmail-scope-kind"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={scopeKind}
                    onChange={(event) => setScopeKind(event.target.value as GmailPilotScopeKind)}
                    disabled={!isAdmin || loading || usingFixtureFallback}
                  >
                    <option value="shared_mailbox">Shared mailbox</option>
                    <option value="selected_mailboxes">Selected mailboxes</option>
                    <option value="broad_read_only">Broad read-only</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="gmail-mailboxes">Mailbox addresses</Label>
                    <HelpTooltip content="These are the inboxes Clawback is allowed to observe through this connection. For shared_mailbox, use the same mailbox represented by the validated Google credentials." />
                  </div>
                  <textarea
                    id="gmail-mailboxes"
                    className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={mailboxInput}
                    onChange={(event) => setMailboxInput(event.target.value)}
                    disabled={!isAdmin || loading || usingFixtureFallback}
                    placeholder="sales@example.com&#10;support@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    One per line or comma-separated. For shared mailbox mode, include the mailbox that matches the Google credentials.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="gmail-client-id">Client ID</Label>
                      <HelpTooltip content="The OAuth 2.0 Client ID from Google Cloud Console. Go to APIs & Services > Credentials > OAuth 2.0 Client IDs." />
                    </div>
                    <Input
                      id="gmail-client-id"
                      value={clientId}
                      onChange={(event) => setClientId(event.target.value)}
                      disabled={!isAdmin || loading || usingFixtureFallback}
                      placeholder={setup?.client_id_present ? "Configured" : "e.g. 123456789.apps.googleusercontent.com"}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="gmail-client-secret">Client Secret</Label>
                      <HelpTooltip content="The secret paired with the Client ID above. Found on the same OAuth client detail page in Google Cloud Console." />
                    </div>
                    <Input
                      id="gmail-client-secret"
                      type="password"
                      value={clientSecret}
                      onChange={(event) => setClientSecret(event.target.value)}
                      disabled={!isAdmin || loading || usingFixtureFallback}
                      placeholder={setup?.client_secret_present ? "Configured" : "Google client secret"}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="gmail-refresh-token">Refresh Token</Label>
                      <HelpTooltip content="A long-lived refresh token. Generate via OAuth Playground or your own consent flow. Do not paste a short-lived access token." />
                    </div>
                    <Input
                      id="gmail-refresh-token"
                      type="password"
                      value={refreshToken}
                      onChange={(event) => setRefreshToken(event.target.value)}
                      disabled={!isAdmin || loading || usingFixtureFallback}
                      placeholder={setup?.refresh_token_present ? "Configured" : "Google refresh token"}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Generate via{" "}
                      <a
                        href="https://developers.google.com/oauthplayground/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-foreground"
                      >
                        OAuth Playground
                      </a>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void handleSetup()}
                    disabled={
                      !isAdmin
                      || !session?.csrf_token
                      || loading
                      || usingFixtureFallback
                      || savingSetup
                      || !clientId.trim()
                      || !clientSecret.trim()
                      || !refreshToken.trim()
                    }
                  >
                    {savingSetup ? "Validating..." : "Validate and connect"}
                  </Button>
                  {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
                  {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

        {/* Compact status summary when connected */}
        {effectiveStatus === "connected" && setup ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-background/70 px-4 py-3 text-xs text-muted-foreground">
            <span>Auth: <span className="text-foreground">{setup.auth_method === "service_account" ? "Service Account" : "OAuth"}</span></span>
            <span>Email: <span className="text-foreground">{setup.validated_email ?? "\u2014"}</span></span>
            <span>Watch: <Badge variant={setup.watch_status === "polling" ? "default" : "outline"} className="text-[10px]">{setup.watch_status ? humanizeStatus(setup.watch_status) : "Idle"}</Badge></span>
            {setup.watch_last_checked_at ? <span>Last checked: <span className="text-foreground">{formatTimestamp(setup.watch_last_checked_at)}</span></span> : null}
          </div>
        ) : null}

        {/* Full setup status sidebar when not connected */}
        {effectiveStatus !== "connected" ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.5fr)]">
          <div className="rounded-lg border border-border bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Setup order
              </p>
            </div>
            <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>1. Choose a setup method above (OAuth, service account, or manual).</li>
              <li>2. Provide the credentials and validate against Google.</li>
              <li>3. Attach eligible workers below.</li>
              <li>4. Click Check inbox now once to save the baseline, then send a real email and check again.</li>
            </ol>
          </div>

          <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Setup status
                </p>
                <HelpTooltip content="Configured means Clawback has validated the stored Google credentials. Connected means the workspace-level Gmail watch is enabled for attached workers." />
              </div>
              {loadingSetup ? (
                <p className="mt-2 text-sm text-muted-foreground">Loading Gmail setup...</p>
              ) : (
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Configured</span>
                    <Badge variant={setup?.configured ? "default" : "outline"}>
                      {setup?.configured ? "Yes" : "No"}
                    </Badge>
                  </div>
                  {setup?.auth_method ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Auth method</span>
                      <span className="text-right text-foreground text-xs">
                        {setup.auth_method === "service_account" ? "Service Account" : "OAuth"}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Validated Gmail</span>
                    <span className="text-right text-foreground">
                      {setup?.validated_email ?? "Not yet validated"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-muted-foreground">Mailboxes</span>
                    <div className="text-right text-foreground">
                      {setup?.mailbox_addresses.length ? setup.mailbox_addresses.join(", ") : "None"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Watch status</span>
                    <Badge variant={setup?.watch_status === "polling" || setup?.watch_status === "bootstrapping" ? "default" : "outline"}>
                      {setup?.watch_status ? humanizeStatus(setup.watch_status) : "Idle"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Last checked</span>
                    <span className="text-right text-foreground text-xs">
                      {formatTimestamp(setup?.watch_last_checked_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Last message seen</span>
                    <span className="text-right text-foreground text-xs">
                      {formatTimestamp(setup?.watch_last_message_at)}
                    </span>
                  </div>
                  {setup?.last_error ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                      {setup.last_error}
                    </div>
                  ) : null}
                  {setup?.watch_last_error ? (
                    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                      {setup.watch_last_error}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    Gmail now uses a real read-only inbox poller. The first Check inbox now saves a baseline; the next check after a new incoming email should create a shadow suggestion for each attached watched-inbox worker.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        ) : null}

        <div className="rounded-lg border border-border bg-background/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Attached workers
                </p>
                <HelpTooltip content="Only workers with a watched_inbox route can consume Gmail read-only monitoring. Attaching Gmail here moves that worker's watched inbox route between suggested and active." />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Only workers with a watched inbox route can use Gmail read-only monitoring.
              </p>
            </div>
            {attachmentsChanged && isAdmin ? (
              <Button
                size="sm"
                disabled={!session?.csrf_token || savingAttachments || usingFixtureFallback}
                onClick={() => void handleSaveAttachments()}
              >
                {savingAttachments ? "Saving..." : "Save attachments"}
              </Button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {workers.length > 0 ? (
              workers.map((worker) => {
                const attached = attachedWorkerIds.includes(worker.workerId);
                return (
                  <label
                    key={worker.workerId}
                    className={`flex items-center gap-3 rounded-md px-2 py-2 text-sm ${
                      !isAdmin || usingFixtureFallback ? "cursor-default opacity-60" : "cursor-pointer hover:bg-muted/50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={attached}
                      onChange={() => {
                        if (isAdmin && !usingFixtureFallback) {
                          toggleWorker(worker.workerId);
                        }
                      }}
                      disabled={!isAdmin || usingFixtureFallback}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span className="font-medium text-foreground">{worker.workerName}</span>
                    <Badge variant={worker.routeStatus === "active" ? "default" : "outline"} className="text-[10px]">
                      {humanizeStatus(worker.routeStatus)}
                    </Badge>
                  </label>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">
                No workers in this workspace currently support watched inbox.
              </p>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{activeWorkers.length} active route{activeWorkers.length === 1 ? "" : "s"}</span>
            <span className="text-border">|</span>
            <span>{attachedWorkerIds.length} attached worker{attachedWorkerIds.length === 1 ? "" : "s"}</span>
          </div>
      </div>
    </div>
  );
}
