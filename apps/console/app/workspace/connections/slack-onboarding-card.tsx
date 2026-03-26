"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  bootstrapWorkspaceConnection,
  createApprovalSurfaceIdentity,
  disconnectWorkspaceConnection,
  getSlackStatus,
  listApprovalSurfaceIdentities,
  listWorkspacePeople,
  probeSlack,
  setupSlack,
  testSlackSend,
  updateApprovalSurfaceIdentity,
  type ApprovalSurfaceIdentityRecord,
  type SlackStatusResponse,
  type WorkspaceConnectionRecord,
  type WorkspacePersonRecord,
} from "@/lib/control-plane";

type SlackOnboardingCardProps = {
  connection: WorkspaceConnectionRecord | null;
  usingFixtureFallback: boolean;
};

function humanizeStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stateColorClass(state: string) {
  switch (state) {
    case "ready":
      return "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
    case "error":
      return "border-destructive/30 bg-destructive/5 text-destructive";
    case "degraded":
      return "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

function ChecklistItem({
  title,
  description,
  complete,
}: {
  title: string;
  description: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/60 p-3">
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <Badge
        variant="outline"
        className={
          complete
            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
            : "border-border bg-muted/30 text-muted-foreground"
        }
      >
        {complete ? "Complete" : "Needs attention"}
      </Badge>
    </div>
  );
}

function SlackIdentityManager({
  csrfToken,
  isAdmin,
  disabled,
  onCountChange,
}: {
  csrfToken: string | null;
  isAdmin: boolean;
  disabled: boolean;
  onCountChange: (count: number) => void;
}) {
  const [people, setPeople] = useState<WorkspacePersonRecord[]>([]);
  const [identities, setIdentities] = useState<ApprovalSurfaceIdentityRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [slackUserId, setSlackUserId] = useState("");
  const [label, setLabel] = useState("");
  const [isSaving, startSaving] = useTransition();

  useEffect(() => {
    let cancelled = false;
    setLoadingData(true);
    void (async () => {
      try {
        const [peopleResult, identitiesResult] = await Promise.all([
          listWorkspacePeople(),
          listApprovalSurfaceIdentities(),
        ]);
        if (cancelled) return;
        setPeople(peopleResult.people);
        const slackIdentities = identitiesResult.identities.filter(
          (identity) => identity.channel === "slack",
        );
        setIdentities(slackIdentities);
        onCountChange(
          slackIdentities.filter((identity) => identity.status === "allowed").length,
        );
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load Slack approver mappings.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [onCountChange]);

  const sortedPeople = useMemo(
    () =>
      [...people].sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === "admin" ? -1 : 1;
        }
        return a.display_name.localeCompare(b.display_name);
      }),
    [people],
  );

  async function refreshIdentities() {
    const identitiesResult = await listApprovalSurfaceIdentities();
    const slackIdentities = identitiesResult.identities.filter(
      (identity) => identity.channel === "slack",
    );
    setIdentities(slackIdentities);
    onCountChange(
      slackIdentities.filter((identity) => identity.status === "allowed").length,
    );
  }

  function resetForm() {
    setSelectedUserId("");
    setSlackUserId("");
    setLabel("");
  }

  async function handleSave() {
    if (!csrfToken || !selectedUserId || !slackUserId.trim()) {
      return;
    }

    setError(null);
    startSaving(() => {
      void (async () => {
        try {
          const selectedPerson = people.find((person) => person.id === selectedUserId);
          await createApprovalSurfaceIdentity({
            channel: "slack",
            userId: selectedUserId,
            externalIdentity: slackUserId.trim(),
            label: label.trim() || selectedPerson?.display_name || "Slack approver",
            csrfToken,
          });
          await refreshIdentities();
          resetForm();
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to save Slack approver mapping.",
          );
        }
      })();
    });
  }

  async function handleToggleStatus(identity: ApprovalSurfaceIdentityRecord) {
    if (!csrfToken) {
      return;
    }

    setError(null);
    startSaving(() => {
      void (async () => {
        try {
          await updateApprovalSurfaceIdentity({
            identityId: identity.id,
            status: identity.status === "allowed" ? "disabled" : "allowed",
            csrfToken,
          });
          await refreshIdentities();
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to update Slack approver mapping.",
          );
        }
      })();
    });
  }

  const mappingCount = identities.filter((identity) => identity.status === "allowed").length;

  return (
    <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Slack Approver Mapping
        </p>
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          {mappingCount} mapped
        </Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        Map each Clawback approver to a Slack member ID. Without this step, Slack can connect successfully but nobody will actually receive approval prompts.
      </p>

      <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
        <p className="text-xs font-medium text-foreground">How to find the Slack member ID</p>
        <ol className="space-y-1 text-xs text-muted-foreground">
          <li>1. Open Slack and click the person&apos;s profile.</li>
          <li>2. Open the overflow menu and choose <span className="font-medium text-foreground">Copy member ID</span>.</li>
          <li>3. Paste the value here. It should look like <code className="rounded bg-muted px-1 py-0.5">U01234ABC</code>.</li>
          <li>4. Selecting the same Clawback user again updates the existing mapping.</li>
        </ol>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div>
          <label htmlFor="slack-approver-person" className="text-xs font-medium text-muted-foreground">
            Clawback user
          </label>
          <select
            id="slack-approver-person"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            disabled={!isAdmin || disabled || loadingData || isSaving}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select a workspace user</option>
            {sortedPeople.map((person) => (
              <option key={person.id} value={person.id}>
                {person.display_name} ({person.role})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="slack-approver-id" className="text-xs font-medium text-muted-foreground">
            Slack member ID
          </label>
          <input
            id="slack-approver-id"
            type="text"
            placeholder="U01234ABC"
            value={slackUserId}
            onChange={(event) => setSlackUserId(event.target.value)}
            disabled={!isAdmin || disabled || loadingData || isSaving}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label htmlFor="slack-approver-label" className="text-xs font-medium text-muted-foreground">
            Label
          </label>
          <input
            id="slack-approver-label"
            type="text"
            placeholder="Optional display label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            disabled={!isAdmin || disabled || loadingData || isSaving}
            className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={
            !isAdmin
            || !csrfToken
            || disabled
            || loadingData
            || isSaving
            || !selectedUserId
            || !slackUserId.trim()
          }
          onClick={() => void handleSave()}
        >
          {isSaving ? "Saving..." : "Save approver mapping"}
        </Button>
        {!isAdmin ? (
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
            admin only
          </Badge>
        ) : null}
      </div>

      <div className="space-y-2">
        {loadingData ? (
          <p className="text-sm text-muted-foreground">Loading workspace people and Slack mappings...</p>
        ) : identities.length === 0 ? (
          <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">No Slack approvers mapped yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Map at least one reviewer before expecting Slack approval prompts to reach a real person.
            </p>
          </div>
        ) : (
          identities.map((identity) => {
            const person = people.find((entry) => entry.id === identity.user_id);
            return (
              <div key={identity.id} className="rounded-md border border-border bg-background/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {person?.display_name ?? identity.label}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Slack member ID: <code className="rounded bg-muted px-1 py-0.5">{identity.external_identity}</code>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Label: {identity.label}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={
                        identity.status === "allowed"
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }
                    >
                      {identity.status}
                    </Badge>
                    <Button
                      variant="outline"
                      disabled={!isAdmin || !csrfToken || isSaving}
                      onClick={() => void handleToggleStatus(identity)}
                    >
                      {identity.status === "allowed" ? "Disable" : "Re-enable"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Slack approver mapping error</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      ) : null}
    </div>
  );
}

export function SlackOnboardingCard({
  connection,
  usingFixtureFallback,
}: SlackOnboardingCardProps) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [isPending, startTransition] = useTransition();
  const [slackStatus, setSlackStatus] = useState<SlackStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setLocalStatus] = useState(connection?.status ?? null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [botTokenInput, setBotTokenInput] = useState("");
  const [signingSecretInput, setSigningSecretInput] = useState("");
  const [defaultChannelInput, setDefaultChannelInput] = useState("");
  const [testSendResult, setTestSendResult] = useState<string | null>(null);
  const [browserOrigin, setBrowserOrigin] = useState("");
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [mappedApproverCount, setMappedApproverCount] = useState(0);

  const isAdmin = session?.membership.role === "admin";
  const operationalState = slackStatus?.operational.state ?? "setup_required";

  useEffect(() => {
    setBrowserOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!connection) {
      setSlackStatus(null);
      return;
    }

    let cancelled = false;
    setLoadingStatus(true);
    void (async () => {
      try {
        const response = await getSlackStatus(connection.id);
        if (!cancelled) {
          setSlackStatus(response);
        }
      } catch {
        if (!cancelled) {
          setSlackStatus(null);
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

  async function copyToClipboard(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedLabel(label);
      window.setTimeout(() => setCopiedLabel((current) => (current === label ? null : current)), 1500);
    } catch {
      setCopiedLabel(null);
    }
  }

  async function handleSetup() {
    if (
      !connection
      || !session?.csrf_token
      || !botTokenInput.trim()
      || !signingSecretInput.trim()
      || !defaultChannelInput.trim()
    ) {
      return;
    }

    setError(null);
    setTestSendResult(null);
    try {
      const result = await setupSlack(connection.id, {
        botToken: botTokenInput.trim(),
        signingSecret: signingSecretInput.trim(),
        defaultChannel: defaultChannelInput.trim(),
        csrfToken: session.csrf_token,
      });
      setSlackStatus(result);
      setLocalStatus(result.connection_status as any);
      setBotTokenInput("");
      setSigningSecretInput("");
      setDefaultChannelInput("");
      setShowSetupForm(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup Slack connection.");
    }
  }

  async function handleProbe() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setError(null);
    try {
      await probeSlack(connection.id, { csrfToken: session.csrf_token });
      const updated = await getSlackStatus(connection.id);
      setSlackStatus(updated);
      setLocalStatus(updated.connection_status as any);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to probe Slack connection.");
    }
  }

  async function handleTestSend() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setTestSendResult(null);
    setError(null);
    try {
      const result = await testSlackSend(connection.id, { csrfToken: session.csrf_token });
      if (result.ok) {
        setTestSendResult("Test message sent successfully.");
      } else {
        setTestSendResult(`Test send failed: ${result.error ?? "unknown error"}`);
      }
    } catch (err) {
      setTestSendResult(err instanceof Error ? err.message : "Failed to send test message.");
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
      setSlackStatus(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect Slack.");
    }
  }

  async function handleBootstrap() {
    if (!session?.csrf_token) return;
    setError(null);
    try {
      await bootstrapWorkspaceConnection({
        provider: "slack",
        accessMode: "write_capable",
        csrfToken: session.csrf_token,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create Slack connection.");
    }
  }

  const requestUrl = browserOrigin
    ? `${browserOrigin}/api/webhooks/slack/interactions`
    : "/api/webhooks/slack/interactions";

  if (!connection) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Set up Slack as an approval surface with interactive Approve/Deny buttons. This page will walk the operator through app creation, credentials, the interactive webhook URL, and approver mapping. Slack approval prompts must be triggered via the notify API once configured.
        </p>
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <ol className="space-y-1 text-xs text-muted-foreground">
            <li>1. Create the Slack approval surface.</li>
            <li>2. Create a Slack app and connect its bot token, signing secret, and channel.</li>
            <li>3. Turn on Slack Interactivity using the exact callback URL shown here.</li>
            <li>4. Map each Clawback approver to a Slack member ID.</li>
          </ol>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!isAdmin || !session?.csrf_token || loading || usingFixtureFallback || isPending}
            onClick={() => void handleBootstrap()}
          >
            {isPending ? "Creating..." : "Set up Slack"}
          </Button>
          <Button
            variant="outline"
            onClick={() => void copyToClipboard("request-url", requestUrl)}
          >
            {copiedLabel === "request-url" ? "Copied URL" : "Copy Slack callback URL"}
          </Button>
          {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
          {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
        </div>
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-xs font-medium text-foreground">Slack Interactivity Request URL</p>
          <code className="mt-2 block rounded bg-background px-2 py-2 text-xs text-foreground">
            {requestUrl}
          </code>
          <p className="mt-2 text-xs text-muted-foreground">
            You will paste this into Slack Interactivity &amp; Shortcuts after the connection record is created.
          </p>
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">Slack connection error</p>
            <p className="mt-1 text-sm text-destructive/90">{error}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const showSetup =
    operationalState === "setup_required" || operationalState === "error" || showSetupForm;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <HelpTooltip content="Slack is an approval surface. When triggered, team members receive approval prompts with Approve/Deny buttons in a Slack channel. Automatic notification on review creation is not yet wired." />
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          approval surface
        </Badge>
        <Badge
          variant="outline"
          className={stateColorClass(operationalState)}
        >
          {humanizeStatus(operationalState)}
        </Badge>
        {loadingStatus ? (
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
            checking status
          </Badge>
        ) : null}
      </div>

      {slackStatus?.operational.summary ? (
        <p className="text-sm text-muted-foreground">
          {slackStatus.operational.summary}
        </p>
      ) : null}

      <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Slack Setup Checklist
          </p>
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
            self-serve
          </Badge>
        </div>

        <ChecklistItem
          title="1. Create a Slack app"
          description="Open api.slack.com/apps and create a new app for the workspace that should receive approval prompts."
          complete={Boolean(slackStatus?.probe?.teamName || botTokenInput || signingSecretInput)}
        />
        <ChecklistItem
          title="2. Add bot scopes and install the app"
          description="Give the bot at least chat:write and channels:read, install it to the workspace, and invite the bot into the approval channel."
          complete={operationalState === "ready"}
        />
        <ChecklistItem
          title="3. Enable Interactivity with the exact callback URL"
          description="Use the callback URL shown below in Slack Interactivity & Shortcuts so button clicks are delivered back to Clawback."
          complete={operationalState === "ready"}
        />
        <ChecklistItem
          title="4. Connect credentials and verify the channel"
          description="Paste the bot token, signing secret, and destination channel ID below, then re-verify and send a test message."
          complete={operationalState === "ready"}
        />
        <ChecklistItem
          title="5. Map each approver to a Slack member ID"
          description="Approval prompts only reach real people after their Clawback user is linked to the matching Slack member ID."
          complete={mappedApproverCount > 0}
        />

        <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">Slack Interactivity Request URL</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded bg-background px-2 py-1 text-xs text-foreground">
              {requestUrl}
            </code>
            <Button
              variant="outline"
              onClick={() => void copyToClipboard("request-url", requestUrl)}
            >
              {copiedLabel === "request-url" ? "Copied" : "Copy URL"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            In Slack, open your app, go to <span className="font-medium text-foreground">Interactivity &amp; Shortcuts</span>, turn it on, and paste this exact URL as the Request URL.
          </p>
        </div>
      </div>

      {showSetup ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Slack App Credentials
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a{" "}
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Slack app
              </a>{" "}
              and install it into the workspace you want to use for approvals.
            </p>
          </div>

          <div className="rounded-md border border-border bg-muted/20 p-3 space-y-1">
            <p className="text-xs font-medium text-foreground">Required Slack app settings</p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              <li>• Bot token scopes: <code className="rounded bg-background px-1 py-0.5">chat:write</code> and <code className="rounded bg-background px-1 py-0.5">channels:read</code></li>
              <li>• Install the app to the target Slack workspace</li>
              <li>• Invite the bot to the approval channel before testing send</li>
              <li>• Enable Interactivity and paste the Request URL shown above</li>
            </ul>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="slack-bot-token" className="text-xs font-medium text-muted-foreground">
                Bot User OAuth Token
              </label>
              <input
                id="slack-bot-token"
                type="password"
                placeholder="xoxb-..."
                value={botTokenInput}
                onChange={(e) => setBotTokenInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Found under <span className="font-medium text-foreground">OAuth &amp; Permissions</span> after you install the app to the workspace.
              </p>
            </div>

            <div>
              <label htmlFor="slack-signing-secret" className="text-xs font-medium text-muted-foreground">
                Signing Secret
              </label>
              <input
                id="slack-signing-secret"
                type="password"
                placeholder="abc123..."
                value={signingSecretInput}
                onChange={(e) => setSigningSecretInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Found under <span className="font-medium text-foreground">Basic Information</span>. Clawback uses it to verify Slack button callbacks.
              </p>
            </div>

            <div>
              <label htmlFor="slack-default-channel" className="text-xs font-medium text-muted-foreground">
                Default Channel ID
              </label>
              <input
                id="slack-default-channel"
                type="text"
                placeholder="C01234ABC"
                value={defaultChannelInput}
                onChange={(e) => setDefaultChannelInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Use the channel ID, not the channel name. Open the Slack channel details and copy the channel ID from Slack.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                !isAdmin
                || !session?.csrf_token
                || loading
                || usingFixtureFallback
                || isPending
                || !botTokenInput.trim()
                || !signingSecretInput.trim()
                || !defaultChannelInput.trim()
              }
              onClick={() => void handleSetup()}
            >
              {isPending ? "Connecting..." : "Connect Slack"}
            </Button>
            {showSetupForm && operationalState === "ready" ? (
              <Button
                variant="outline"
                onClick={() => setShowSetupForm(false)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {operationalState === "ready" && slackStatus?.probe ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {slackStatus.probe.botName ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Bot name</span>
                <span className="font-mono text-sm text-foreground">
                  {slackStatus.probe.botName}
                </span>
              </div>
            ) : null}
            {slackStatus.probe.teamName ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Workspace</span>
                <span className="font-mono text-sm text-foreground">
                  {slackStatus.probe.teamName}
                </span>
              </div>
            ) : null}
            {slackStatus.probe.checkedAt ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Last verified</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(slackStatus.probe.checkedAt).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {slackStatus?.recovery_hints && slackStatus.recovery_hints.length > 0 ? (
        <div className="space-y-2">
          {slackStatus.recovery_hints.map((hint) => (
            <div key={hint.code} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{hint.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{hint.description}</p>
              {hint.docsHref ? (
                <a
                  href={hint.docsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs underline text-muted-foreground hover:text-foreground"
                >
                  Documentation
                </a>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {operationalState === "ready" ? (
          <>
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
              onClick={() => void handleProbe()}
            >
              {isPending ? "Verifying..." : "Re-verify connection"}
            </Button>
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
              onClick={() => void handleTestSend()}
            >
              Test send
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSetupForm(true)}
              disabled={showSetupForm}
            >
              Update credentials
            </Button>
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
              onClick={() => void handleDisconnect()}
            >
              Disconnect
            </Button>
          </>
        ) : null}

        {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
        {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
      </div>

      {testSendResult ? (
        <div className={`rounded-md border p-3 ${
          testSendResult.includes("successfully")
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-amber-500/20 bg-amber-500/5"
        }`}>
          <p className="text-sm text-muted-foreground">{testSendResult}</p>
        </div>
      ) : null}

      {operationalState === "ready" ? (
        <SlackIdentityManager
          csrfToken={session?.csrf_token ?? null}
          isAdmin={Boolean(isAdmin)}
          disabled={usingFixtureFallback || loading}
          onCountChange={setMappedApproverCount}
        />
      ) : (
        <div className="rounded-md border border-border bg-muted/20 p-3">
          <p className="text-sm font-medium text-foreground">Approver mapping comes after connection</p>
          <p className="mt-1 text-xs text-muted-foreground">
            First connect Slack and verify the bot token, signing secret, channel, and interactivity callback. Then this page will unlock the Slack approver mapping step.
          </p>
        </div>
      )}

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">Slack connection error</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      ) : null}

      {operationalState === "ready" && !error ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Slack configured</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Slack is configured as an approval surface. Approval prompts can be sent via the notify API. Automatic notification when reviews are created is not yet wired — prompts must be triggered explicitly for now.
          </p>
        </div>
      ) : null}
    </div>
  );
}
