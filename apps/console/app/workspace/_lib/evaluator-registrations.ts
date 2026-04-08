/**
 * Registers first-party setup evaluators.
 *
 * Import this module for its side effects before calling buildPilotSetupSteps().
 * Each registration maps a pluginId:stepId compound key to a completion evaluator.
 */
import { registerSetupEvaluator } from "./setup-evaluator-registry";
import { hasReadyKnowledgeConnector } from "./knowledge-path";

// ---------------------------------------------------------------------------
// Knowledge evaluators
// ---------------------------------------------------------------------------

// Seeded local-directory connector has indexed at least one document
registerSetupEvaluator(
  "connector.local-directory",
  "seeded-knowledge-ready",
  (ctx) => hasReadyKnowledgeConnector(ctx.connectors, ctx.syncJobsByConnector),
);

// ---------------------------------------------------------------------------
// Gmail evaluators
// ---------------------------------------------------------------------------

// Gmail: credentials connected
registerSetupEvaluator(
  "provider.gmail.read-only",
  "gmail-credentials",
  (ctx) => {
    const gmailConn = ctx.connections.find(
      (c) => c.provider === "gmail" && c.access_mode === "read_only",
    );
    return gmailConn?.status === "connected";
  },
);

// Gmail: attached to at least one worker
registerSetupEvaluator(
  "provider.gmail.read-only",
  "gmail-attach-worker",
  (ctx) => {
    const gmailConn = ctx.connections.find(
      (c) => c.provider === "gmail" && c.access_mode === "read_only",
    );
    return (gmailConn?.attached_worker_ids.length ?? 0) > 0;
  },
);

// ---------------------------------------------------------------------------
// Drive evaluators
// ---------------------------------------------------------------------------

// Drive: OAuth app configured
registerSetupEvaluator(
  "provider.drive",
  "drive-oauth-app",
  (ctx) => {
    const driveConn = ctx.connections.find(
      (c) => c.provider === "drive" && c.access_mode === "read_only",
    );
    // Consider step complete if connection exists and is connected or at least not_connected with config
    return driveConn?.status === "connected";
  },
);

// Drive: connected
registerSetupEvaluator(
  "provider.drive",
  "drive-connect",
  (ctx) => {
    const driveConn = ctx.connections.find(
      (c) => c.provider === "drive" && c.access_mode === "read_only",
    );
    return driveConn?.status === "connected";
  },
);

// Drive: attached to at least one worker
registerSetupEvaluator(
  "provider.drive",
  "drive-attach-worker",
  (ctx) => {
    const driveConn = ctx.connections.find(
      (c) => c.provider === "drive" && c.access_mode === "read_only",
    );
    return (driveConn?.attached_worker_ids.length ?? 0) > 0;
  },
);

// ---------------------------------------------------------------------------
// SMTP evaluators
// ---------------------------------------------------------------------------

// SMTP: relay configured and connected
registerSetupEvaluator(
  "provider.smtp-relay",
  "smtp-configure",
  (ctx) => {
    const smtpConn = ctx.connections.find(
      (c) => c.provider === "smtp_relay" && c.access_mode === "write_capable",
    );
    return smtpConn?.status === "connected";
  },
);

// ---------------------------------------------------------------------------
// WhatsApp evaluators
// ---------------------------------------------------------------------------

// WhatsApp: transport mode selected
registerSetupEvaluator(
  "provider.whatsapp",
  "whatsapp-transport-mode",
  (ctx) => {
    const whatsappConn = ctx.connections.find(
      (c) => c.provider === "whatsapp" && c.access_mode === "write_capable",
    );
    return Boolean(whatsappConn);
  },
);

// WhatsApp: selected transport connected
registerSetupEvaluator(
  "provider.whatsapp",
  "whatsapp-connect-transport",
  (ctx) => {
    const whatsappConn = ctx.connections.find(
      (c) => c.provider === "whatsapp" && c.access_mode === "write_capable",
    );
    return whatsappConn?.status === "connected";
  },
);

// WhatsApp: identity mapping (at least one mapped identity)
registerSetupEvaluator(
  "provider.whatsapp",
  "whatsapp-identity-mapping",
  (_ctx) => {
    // This evaluator would ideally check approval_surface_identities,
    // but the evaluator context currently only has connections/workers/routes.
    // Return false until the context is extended or the mapping is done.
    return false;
  },
);

// ---------------------------------------------------------------------------
// Worker pack evaluators
// ---------------------------------------------------------------------------

// Worker install: at least one worker with members, assignees, and reviewers
registerSetupEvaluator(
  "worker-pack.follow-up",
  "install-follow-up",
  (ctx) => {
    return ctx.workers.some(
      (w) =>
        w.member_ids.length > 0 &&
        w.assignee_ids.length > 0 &&
        w.reviewer_ids.length > 0,
    );
  },
);

// ---------------------------------------------------------------------------
// Ingress evaluators
// ---------------------------------------------------------------------------

// Watched inbox active
registerSetupEvaluator(
  "ingress.gmail.watch-hook",
  "gmail-watch-hook",
  (ctx) => {
    return ctx.inputRoutes.some(
      (r) => r.kind === "watched_inbox" && r.status === "active",
    );
  },
);

// Forwarded email still active
registerSetupEvaluator(
  "ingress.forward-email",
  "forward-email-ready",
  (ctx) => {
    return ctx.inputRoutes.some(
      (r) => r.kind === "forward_email" && r.status === "active",
    );
  },
);

// Demo proof: a follow-up worker has produced real inbox/work state
registerSetupEvaluator(
  "demo.follow-up",
  "run-sample-activity",
  (ctx) => {
    const followUpWorkerIds = new Set(
      ctx.workers
        .filter((worker) => worker.kind === "follow_up")
        .map((worker) => worker.id),
    );
    if (followUpWorkerIds.size === 0) {
      return false;
    }

    return (
      ctx.inboxItems.some(
        (item) => item.worker_id !== null && followUpWorkerIds.has(item.worker_id),
      ) ||
      ctx.workItems.some(
        (item) => item.worker_id !== null && followUpWorkerIds.has(item.worker_id),
      )
    );
  },
);

// ---------------------------------------------------------------------------
// Action executor evaluators
// ---------------------------------------------------------------------------

// Reviewed send path ready
registerSetupEvaluator(
  "action.smtp-reviewed-send",
  "smtp-reviewed-send",
  (ctx) => {
    const smtpConn = ctx.connections.find(
      (c) => c.provider === "smtp_relay" && c.access_mode === "write_capable",
    );
    return (
      smtpConn?.status === "connected" &&
      ctx.actionCapabilities.some(
        (a) => a.kind === "send_email" && a.boundary_mode !== "never",
      )
    );
  },
);
