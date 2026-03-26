"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  bootstrapWorkspaceConnection,
  ControlPlaneRequestError,
  disconnectWorkspaceConnection,
  getWhatsAppStatus,
  setupWhatsApp,
  probeWhatsApp,
  setWhatsAppTransportMode,
  startWhatsAppPairing,
  waitForWhatsAppPairing,
  type WhatsAppStatusResponse,
  type WhatsAppTransportMode,
  type WorkspaceConnectionRecord,
} from "@/lib/control-plane";

type WhatsAppOnboardingCardProps = {
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

// ---------------------------------------------------------------------------
// Transport mode selector
// ---------------------------------------------------------------------------

function TransportModeSelector({
  currentMode,
  onSelect,
  disabled,
}: {
  currentMode: WhatsAppTransportMode | null;
  onSelect: (mode: WhatsAppTransportMode) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Transport Mode
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect("openclaw_pairing")}
          className={`rounded-lg border p-4 text-left transition-colors ${
            currentMode === "openclaw_pairing"
              ? "border-primary bg-primary/5"
              : "border-border bg-background/70 hover:border-primary/40"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">OpenClaw Pairing</span>
            <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400 text-[10px]">
              recommended
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pair a dedicated work WhatsApp identity via QR code. Fast setup, ideal for operators.
          </p>
        </button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onSelect("meta_cloud_api")}
          className={`rounded-lg border p-4 text-left transition-colors ${
            currentMode === "meta_cloud_api"
              ? "border-primary bg-primary/5"
              : "border-border bg-background/70 hover:border-primary/40"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <span className="text-sm font-medium text-foreground">Meta Cloud API</span>
          <p className="mt-1 text-xs text-muted-foreground">
            Use Meta Business API credentials and webhooks. More involved setup for broader deployment.
          </p>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OpenClaw Pairing panel
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Error classification helpers for OpenClaw pairing
// ---------------------------------------------------------------------------

type PairingErrorInfo = {
  message: string;
  code: string | null;
  hint: string | null;
  docsHref: string | null;
  isPrerequisiteError: boolean;
};

function classifyPairingError(err: unknown): PairingErrorInfo {
  const code = err instanceof ControlPlaneRequestError ? err.code : null;
  const message = err instanceof Error ? err.message : "An unexpected error occurred.";

  if (code === "gateway_unreachable") {
    return {
      message: "OpenClaw gateway is unreachable.",
      code,
      hint: "Make sure the OpenClaw runtime is running and accessible from the server.",
      docsHref: "/docs/whatsapp-openclaw-pairing-guide",
      isPrerequisiteError: true,
    };
  }

  if (code === "channel_not_configured") {
    return {
      message: "OpenClaw WhatsApp channel is not configured.",
      code,
      hint: "Add a WhatsApp account in the OpenClaw runtime configuration before pairing.",
      docsHref: "/docs/whatsapp-openclaw-pairing-guide",
      isPrerequisiteError: true,
    };
  }

  if (code === "session_expired") {
    return {
      message: "WhatsApp session has expired. Re-pair to continue.",
      code,
      hint: "Generate a new QR code and scan it with your WhatsApp device.",
      docsHref: "/docs/whatsapp-openclaw-pairing-guide",
      isPrerequisiteError: false,
    };
  }

  return {
    message,
    code,
    hint: null,
    docsHref: null,
    isPrerequisiteError: false,
  };
}

function OpenClawPairingPanel({
  whatsappStatus,
  isAdmin,
  isPending,
  loading,
  usingFixtureFallback,
  csrfToken,
  connectionId,
  onStatusUpdate,
}: {
  whatsappStatus: WhatsAppStatusResponse | null;
  isAdmin: boolean;
  isPending: boolean;
  loading: boolean;
  usingFixtureFallback: boolean;
  csrfToken: string | null;
  connectionId: string;
  onStatusUpdate: (status: WhatsAppStatusResponse) => void;
}) {
  const [probing, setProbing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [pairingMessage, setPairingMessage] = useState<string | null>(null);
  const [probeError, setProbeError] = useState<PairingErrorInfo | null>(null);

  const operationalState = whatsappStatus?.operational.state ?? "setup_required";
  const pairingStatus = whatsappStatus?.pairing_status ?? "unpaired";

  // A prerequisite error means the OpenClaw channel/gateway isn't ready,
  // so QR generation cannot work yet.
  const hasPrerequisiteError = probeError?.isPrerequisiteError === true;

  async function handleStartPairing() {
    if (!csrfToken) return;
    setProbeError(null);
    setStarting(true);
    try {
      const result = await startWhatsAppPairing(connectionId, {
        csrfToken,
        force: pairingStatus !== "unpaired",
      });
      setQrDataUrl(result.pairing.qr_data_url);
      setPairingMessage(result.pairing.message);
      onStatusUpdate(result.status);
    } catch (err) {
      setProbeError(classifyPairingError(err));
    } finally {
      setStarting(false);
    }
  }

  async function handleWaitForPairing() {
    if (!csrfToken) return;
    setProbeError(null);
    setWaiting(true);
    try {
      const result = await waitForWhatsAppPairing(connectionId, { csrfToken });
      setPairingMessage(result.pairing.message);
      if (result.pairing.connected) {
        setQrDataUrl(null);
      }
      onStatusUpdate(result.status);
    } catch (err) {
      setProbeError(classifyPairingError(err));
    } finally {
      setWaiting(false);
    }
  }

  async function handleCheckPairingStatus() {
    if (!csrfToken) return;
    setProbeError(null);
    setProbing(true);
    try {
      await probeWhatsApp(connectionId, { csrfToken });
      const updated = await getWhatsAppStatus(connectionId);
      onStatusUpdate(updated);
    } catch (err) {
      setProbeError(classifyPairingError(err));
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          OpenClaw Pairing
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Pair a dedicated work WhatsApp identity through OpenClaw. In pairing mode, Clawback sends review prompts to WhatsApp and links back to Clawback for the final approve or deny action.
        </p>
      </div>

      {/* Pairing status */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Pairing status</span>
        <Badge
          variant="outline"
          className={
            pairingStatus === "paired"
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400"
          }
        >
          {humanizeStatus(pairingStatus)}
        </Badge>
      </div>

      {/* Prerequisite error banner — replaces QR placeholder when channel isn't ready */}
      {hasPrerequisiteError && probeError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 space-y-2">
          <p className="text-sm font-medium text-destructive">{probeError.message}</p>
          {probeError.hint ? (
            <p className="text-xs text-muted-foreground">{probeError.hint}</p>
          ) : null}
          {probeError.docsHref ? (
            <a
              href={probeError.docsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs underline text-muted-foreground hover:text-foreground"
            >
              Setup documentation
            </a>
          ) : null}
        </div>
      ) : pairingStatus !== "paired" ? (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-6 text-center">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="OpenClaw WhatsApp pairing QR code"
              className="mx-auto mb-3 h-40 w-40 rounded-lg border border-border bg-background p-2"
            />
          ) : (
            <div className="mx-auto mb-3 flex h-32 w-32 items-center justify-center rounded-lg border border-border bg-background">
              <span className="text-xs text-muted-foreground">QR Code</span>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Scan this QR code with a dedicated work WhatsApp identity to complete pairing.
          </p>
          {!qrDataUrl ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Generate a pairing session first, then scan the QR code from your phone.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Connection status with probe result */}
      {whatsappStatus?.probe ? (
        <div className="grid gap-2">
          {whatsappStatus.probe.displayName ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Paired identity</span>
              <span className="font-mono text-sm text-foreground">
                {whatsappStatus.probe.displayName}
              </span>
            </div>
          ) : null}
          {whatsappStatus.paired_identity_ref ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">OpenClaw account</span>
              <span className="font-mono text-sm text-foreground">
                {whatsappStatus.paired_identity_ref}
              </span>
            </div>
          ) : null}
          {whatsappStatus.probe.checkedAt ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Last checked</span>
              <span className="text-sm text-muted-foreground">
                {new Date(whatsappStatus.probe.checkedAt).toLocaleString()}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        {hasPrerequisiteError ? (
          <Button
            variant="outline"
            disabled={!isAdmin || !csrfToken || isPending || loading || usingFixtureFallback || starting}
            onClick={() => void handleStartPairing()}
          >
            {starting ? "Retrying..." : "Retry connection"}
          </Button>
        ) : (
          <Button
            disabled={!isAdmin || !csrfToken || isPending || loading || usingFixtureFallback || starting}
            onClick={() => void handleStartPairing()}
          >
            {starting ? "Generating QR..." : pairingStatus === "paired" ? "Re-pair session" : "Generate QR code"}
          </Button>
        )}
        {!hasPrerequisiteError ? (
          <Button
            variant="outline"
            disabled={!isAdmin || !csrfToken || isPending || loading || usingFixtureFallback || waiting}
            onClick={() => void handleWaitForPairing()}
          >
            {waiting ? "Checking..." : "I scanned the QR code"}
          </Button>
        ) : null}
        <Button
          variant="outline"
          disabled={!isAdmin || !csrfToken || isPending || loading || usingFixtureFallback || probing}
          onClick={() => void handleCheckPairingStatus()}
        >
          {probing ? "Refreshing..." : "Refresh status"}
        </Button>
      </div>

      {pairingMessage ? (
        <p className="text-sm text-muted-foreground">{pairingMessage}</p>
      ) : null}

      {/* Non-prerequisite errors (session expired, generic failures) */}
      {probeError && !hasPrerequisiteError ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1">
          <p className="text-sm font-medium text-destructive">{probeError.message}</p>
          {probeError.hint ? (
            <p className="text-xs text-muted-foreground">{probeError.hint}</p>
          ) : null}
          {probeError.docsHref ? (
            <a
              href={probeError.docsHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs underline text-muted-foreground hover:text-foreground"
            >
              Setup documentation
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main card
// ---------------------------------------------------------------------------

export function WhatsAppOnboardingCard({
  connection,
  usingFixtureFallback,
}: WhatsAppOnboardingCardProps) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [isPending, startTransition] = useTransition();
  const [whatsappStatus, setWhatsappStatus] = useState<WhatsAppStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(connection?.status ?? null);
  const [showSetupForm, setShowSetupForm] = useState(false);
  const [phoneNumberIdInput, setPhoneNumberIdInput] = useState("");
  const [accessTokenInput, setAccessTokenInput] = useState("");
  const [verifyTokenInput, setVerifyTokenInput] = useState("");

  const [transportMode, setTransportMode] = useState<WhatsAppTransportMode | null>(null);

  const effectiveStatus = localStatus ?? connection?.status ?? "not_connected";
  const isAdmin = session?.membership.role === "admin";
  const operationalState = whatsappStatus?.operational.state ?? "setup_required";

  useEffect(() => {
    if (!connection) {
      setWhatsappStatus(null);
      return;
    }

    let cancelled = false;
    setLoadingStatus(true);
    void (async () => {
      try {
        const response = await getWhatsAppStatus(connection.id);
        if (!cancelled) {
          setWhatsappStatus(response);
          setTransportMode(response.transport_mode);
        }
      } catch (err) {
        if (!cancelled) {
          setWhatsappStatus(null);
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

  async function handleTransportModeSelect(mode: WhatsAppTransportMode) {
    if (!connection || !session?.csrf_token) return;
    setError(null);
    try {
      const result = await setWhatsAppTransportMode(connection.id, {
        transportMode: mode,
        csrfToken: session.csrf_token,
      });
      setTransportMode(result.transport_mode);
      setWhatsappStatus(result);
      setLocalStatus(result.connection_status as any);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set transport mode.");
    }
  }

  async function handleSetup() {
    if (
      !connection ||
      !session?.csrf_token ||
      !phoneNumberIdInput.trim() ||
      !accessTokenInput.trim() ||
      !verifyTokenInput.trim()
    ) {
      return;
    }

    setError(null);
    try {
      const result = await setupWhatsApp(connection.id, {
        phoneNumberId: phoneNumberIdInput.trim(),
        accessToken: accessTokenInput.trim(),
        verifyToken: verifyTokenInput.trim(),
        csrfToken: session.csrf_token,
      });
      setTransportMode(result.transport_mode);
      setWhatsappStatus(result);
      setLocalStatus(result.connection_status as any);
      setPhoneNumberIdInput("");
      setAccessTokenInput("");
      setVerifyTokenInput("");
      setShowSetupForm(false);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to setup WhatsApp connection.");
    }
  }

  async function handleProbe() {
    if (!connection || !session?.csrf_token) {
      return;
    }

    setError(null);
    try {
      await probeWhatsApp(connection.id, { csrfToken: session.csrf_token });
      const updated = await getWhatsAppStatus(connection.id);
      setWhatsappStatus(updated);
      setTransportMode(updated.transport_mode);
      setLocalStatus(updated.connection_status as any);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to probe WhatsApp connection.");
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
      setWhatsappStatus(null);
      setTransportMode(null);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect WhatsApp.");
    }
  }

  async function handleBootstrap() {
    if (!session?.csrf_token) return;
    setError(null);
    try {
      await bootstrapWorkspaceConnection({
        provider: "whatsapp",
        accessMode: "write_capable",
        csrfToken: session.csrf_token,
      });
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create WhatsApp connection.");
    }
  }

  if (!connection) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create the workspace WhatsApp approval surface first, then choose OpenClaw Pairing or Meta Cloud API.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={!isAdmin || !session?.csrf_token || loading || usingFixtureFallback || isPending}
            onClick={() => void handleBootstrap()}
          >
            {isPending ? "Creating..." : "Set up WhatsApp"}
          </Button>
          {!isAdmin ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">admin only</Badge> : null}
          {usingFixtureFallback ? <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">fixture fallback</Badge> : null}
        </div>
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-sm font-medium text-destructive">WhatsApp connection error</p>
            <p className="mt-1 text-sm text-destructive/90">{error}</p>
          </div>
        ) : null}
      </div>
    );
  }

  const showMetaSetupForm =
    transportMode === "meta_cloud_api" &&
    (operationalState === "setup_required" || operationalState === "error" || showSetupForm);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <HelpTooltip content="WhatsApp is an approval surface. Team members receive approval prompts and respond via WhatsApp to approve or deny reviewed actions." />
        <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
          approval surface
        </Badge>
        {transportMode ? (
          <Badge variant="outline" className="border-border bg-muted/30 text-muted-foreground">
            {transportMode === "openclaw_pairing" ? "OpenClaw Pairing" : "Meta Cloud API"}
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={stateColorClass(operationalState)}
        >
          {humanizeStatus(operationalState)}
        </Badge>
      </div>

      {whatsappStatus?.operational.summary ? (
        <p className="text-sm text-muted-foreground">
          {whatsappStatus.operational.summary}
        </p>
      ) : null}

      {/* Transport mode selector */}
      <TransportModeSelector
        currentMode={transportMode}
        onSelect={(mode) => void handleTransportModeSelect(mode)}
        disabled={!isAdmin || !session?.csrf_token || loading || usingFixtureFallback || isPending}
      />

      {/* OpenClaw Pairing panel */}
      {transportMode === "openclaw_pairing" ? (
        <OpenClawPairingPanel
          whatsappStatus={whatsappStatus}
          isAdmin={isAdmin}
          isPending={isPending}
          loading={loading}
          usingFixtureFallback={usingFixtureFallback}
          csrfToken={session?.csrf_token ?? null}
          connectionId={connection.id}
          onStatusUpdate={(updated) => {
            setWhatsappStatus(updated);
            setLocalStatus(updated.connection_status as any);
            startTransition(() => router.refresh());
          }}
        />
      ) : null}

      {/* Meta Cloud API setup form */}
      {showMetaSetupForm ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              WhatsApp Business API Credentials
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Configure your{" "}
              <a
                href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                WhatsApp Business API
              </a>{" "}
              credentials. You need a Phone Number ID, access token, and a verify token for webhook registration.
            </p>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="whatsapp-phone-number-id" className="text-xs font-medium text-muted-foreground">
                Phone Number ID
              </label>
              <input
                id="whatsapp-phone-number-id"
                type="text"
                placeholder="123456789012345"
                value={phoneNumberIdInput}
                onChange={(e) => setPhoneNumberIdInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label htmlFor="whatsapp-access-token" className="text-xs font-medium text-muted-foreground">
                Access Token
              </label>
              <input
                id="whatsapp-access-token"
                type="password"
                placeholder="EAA..."
                value={accessTokenInput}
                onChange={(e) => setAccessTokenInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div>
              <label htmlFor="whatsapp-verify-token" className="text-xs font-medium text-muted-foreground">
                Webhook Verify Token
              </label>
              <input
                id="whatsapp-verify-token"
                type="text"
                placeholder="my-verify-token"
                value={verifyTokenInput}
                onChange={(e) => setVerifyTokenInput(e.target.value)}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Use this same token when configuring the webhook URL in the Meta Developer Dashboard.
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
                || !phoneNumberIdInput.trim()
                || !accessTokenInput.trim()
                || !verifyTokenInput.trim()
              }
              onClick={() => void handleSetup()}
            >
              {isPending ? "Connecting..." : "Connect WhatsApp"}
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

      {/* Connected state info (Meta Cloud API) */}
      {transportMode === "meta_cloud_api" && operationalState === "ready" && whatsappStatus?.probe ? (
        <div className="rounded-lg border border-border bg-background/70 p-4 space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {whatsappStatus.probe.displayName ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Business name</span>
                <span className="font-mono text-sm text-foreground">
                  {whatsappStatus.probe.displayName}
                </span>
              </div>
            ) : null}
            {whatsappStatus.probe.checkedAt ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">Last verified</span>
                <span className="text-sm text-muted-foreground">
                  {new Date(whatsappStatus.probe.checkedAt).toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Recovery hints */}
      {whatsappStatus?.recovery_hints && whatsappStatus.recovery_hints.length > 0 ? (
        <div className="space-y-2">
          {whatsappStatus.recovery_hints.map((hint) => (
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
              {isPending ? "Verifying..." : "Re-verify connection"}
            </Button>
            {transportMode === "meta_cloud_api" ? (
              <Button
                variant="outline"
                onClick={() => setShowSetupForm(true)}
                disabled={showSetupForm}
              >
                Update credentials
              </Button>
            ) : null}
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
          <p className="text-sm font-medium text-destructive">WhatsApp connection error</p>
          <p className="mt-1 text-sm text-destructive/90">{error}</p>
        </div>
      ) : null}

      {operationalState === "ready" && !error ? (
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">WhatsApp connected</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {transportMode === "openclaw_pairing"
              ? "OpenClaw pairing is active. Team members with mapped WhatsApp identities will receive approval prompts in WhatsApp and can continue the final decision in Clawback."
              : "WhatsApp Business API is connected. Team members with mapped WhatsApp identities will receive approval prompts and can approve or deny directly from WhatsApp."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
