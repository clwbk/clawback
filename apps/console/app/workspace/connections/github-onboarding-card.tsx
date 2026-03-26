"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  bootstrapWorkspaceConnection,
  disconnectWorkspaceConnection,
  getGitHubStatus,
  setupGitHub,
  probeGitHub,
  type GitHubStatusResponse,
  type WorkspaceConnectionRecord,
} from "@/lib/control-plane";

type GitHubOnboardingCardProps = {
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

export function GitHubOnboardingCard({
  connection,
  usingFixtureFallback,
}: GitHubOnboardingCardProps) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [isPending, startTransition] = useTransition();
  const [githubStatus, setGithubStatus] = useState<GitHubStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(connection?.status ?? null);
  const [patInput, setPatInput] = useState("");
  const [orgInput, setOrgInput] = useState("");
  const [showPatForm, setShowPatForm] = useState(false);

  const effectiveStatus = localStatus ?? connection?.status ?? "not_connected";
  const isAdmin = session?.membership.role === "admin";
  const operationalState = githubStatus?.operational.state ?? "setup_required";

  useEffect(() => {
    if (!connection) {
      setGithubStatus(null);
      return;
    }

    let cancelled = false;
    setLoadingStatus(true);
    void (async () => {
      try {
        const response = await getGitHubStatus(connection.id);
        if (!cancelled) {
          setGithubStatus(response);
        }
      } catch (err) {
        if (!cancelled) {
          // May not be configured yet, that is fine
          setGithubStatus(null);
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

  async function handleSetup() {
    if (!connection || !session?.csrf_token || !patInput.trim()) {
      return;
    }

    setError(null);
    try {
      const result = await setupGitHub(connection.id, {
        personalAccessToken: patInput.trim(),
        csrfToken: session.csrf_token,
        ...(orgInput.trim() ? { org: orgInput.trim() } : {}),
      });
      setGithubStatus(result);
      setLocalStatus(result.connection_status as any);
      setPatInput("");
      setShowPatForm(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup GitHub connection.");
    }
  }

  async function handleProbe() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setError(null);
    try {
      await probeGitHub(connection.id, { csrfToken: session.csrf_token });
      // Refresh status after probe
      const updated = await getGitHubStatus(connection.id);
      setGithubStatus(updated);
      setLocalStatus(updated.connection_status as any);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to probe GitHub connection.");
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
      setGithubStatus(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect GitHub.");
    }
  }

  async function handleBootstrap() {
    if (!session?.csrf_token) return;
    setError(null);
    try {
      await bootstrapWorkspaceConnection({
        provider: "github",
        accessMode: "read_only",
        csrfToken: session.csrf_token,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create GitHub connection.");
    }
  }

  if (!connection) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create the workspace GitHub connection first, then add a read-only personal access token.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!isAdmin || !session?.csrf_token || loading || usingFixtureFallback || isPending}
            onClick={() => void handleBootstrap()}
          >
            {isPending ? "Creating..." : "Set up GitHub"}
          </Button>
          {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
          {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">GitHub connection error</p>
            <p className="mt-1 text-sm text-destructive/90">{error}</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <HelpTooltip content="GitHub provides technical context from repositories, issues, and pull requests. Read-only access only." />
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          read-only
        </Badge>
        <Badge
          variant="outline"
          className={stateColorClass(operationalState)}
        >
          {humanizeStatus(operationalState)}
        </Badge>
      </div>

      {githubStatus?.operational.summary ? (
        <p className="text-sm text-muted-foreground">
          {githubStatus.operational.summary}
        </p>
      ) : null}

      {/* Setup form */}
      {(operationalState === "setup_required" || operationalState === "error" || showPatForm) ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Personal Access Token
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create a{" "}
              <a
                href="https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                fine-grained personal access token
              </a>{" "}
              with read-only permissions: Contents, Issues, Pull requests, and Metadata.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="github-pat" className="text-xs font-medium text-muted-foreground">
                Token
              </label>
              <input
                id="github-pat"
                type="password"
                placeholder="github_pat_..."
                value={patInput}
                onChange={(e) => setPatInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label htmlFor="github-org" className="text-xs font-medium text-muted-foreground">
                Organization (optional)
              </label>
              <input
                id="github-org"
                type="text"
                placeholder="my-org"
                value={orgInput}
                onChange={(e) => setOrgInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Leave empty to access all repositories available to the token.
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
                || !patInput.trim()
              }
              onClick={() => void handleSetup()}
            >
              {isPending ? "Connecting..." : "Connect GitHub"}
            </Button>
            {showPatForm && operationalState === "ready" ? (
              <Button
                variant="outline"
                onClick={() => setShowPatForm(false)}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Connected state info */}
      {operationalState === "ready" && githubStatus?.probe ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {githubStatus.probe.user ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Authenticated as</span>
                <span className="font-mono text-sm text-foreground">
                  {githubStatus.probe.user.login}
                </span>
              </div>
            ) : null}
            {githubStatus.probe.scopes && githubStatus.probe.scopes.length > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Token scopes</span>
                <div className="flex flex-wrap gap-1">
                  {githubStatus.probe.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-[10px]">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {githubStatus.probe.checkedAt ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Last verified</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(githubStatus.probe.checkedAt).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Recovery hints */}
      {githubStatus?.recovery_hints && githubStatus.recovery_hints.length > 0 ? (
        <div className="space-y-2">
          {githubStatus.recovery_hints.map((hint) => (
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

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {operationalState === "ready" ? (
          <>
            <Button
              variant="outline"
              disabled={!isAdmin || !session?.csrf_token || isPending || loading || usingFixtureFallback}
              onClick={() => void handleProbe()}
            >
              {isPending ? "Verifying..." : "Re-verify token"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowPatForm(true)}
              disabled={showPatForm}
            >
              Update token
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

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">GitHub connection error</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      ) : null}

      {operationalState === "ready" && !error ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">GitHub connected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            GitHub is connected and providing read-only technical context from repositories,
            issues, and pull requests.
          </p>
        </div>
      ) : null}
    </div>
  );
}
