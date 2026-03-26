import argon2 from "argon2";
import { and, eq } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { ulid } from "ulid";

import { createDb, createPool, getDatabaseUrl } from "./client.js";
import {
  actionCapabilities,
  activityEvents,
  connections,
  connectors,
  identities,
  inboxItems,
  inputRoutes,
  memberships,
  reviews,
  sourceEvents,
  users,
  workItems,
  workers,
  workspaces,
} from "./schema.js";

function cid(prefix: string) {
  return `${prefix}_${ulid()}`;
}

const DEMO_SEED_VERSION = 2;

function normalizeSettingsJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

const CONNECTOR_SYNC_JOB_NAME = "connector.sync";

async function enqueueInitialConnectorSync(params: {
  databaseUrl: string;
  workspaceId: string;
  connectorId: string;
  requestedBy: string;
  now: Date;
}) {
  const boss = new PgBoss(params.databaseUrl);
  await boss.start();
  await boss.createQueue(CONNECTOR_SYNC_JOB_NAME);

  const syncJobId = cid("csj");
  await boss.getDb().executeSql(
    `
      insert into public.connector_sync_jobs (
        id,
        workspace_id,
        connector_id,
        status,
        requested_by,
        started_at,
        completed_at,
        error_summary,
        stats_json,
        created_at,
        updated_at
      ) values ($1, $2, $3, 'queued', $4, null, null, null, null, $5, $5)
      on conflict (id) do nothing
    `,
    [
      syncJobId,
      params.workspaceId,
      params.connectorId,
      params.requestedBy,
      params.now,
    ],
  );

  await boss.send(
    CONNECTOR_SYNC_JOB_NAME,
    {
      job_type: CONNECTOR_SYNC_JOB_NAME,
      sync_job_id: syncJobId,
      connector_id: params.connectorId,
      workspace_id: params.workspaceId,
      attempt: 1,
      queued_at: params.now.toISOString(),
    },
    {
      expireInSeconds: 60 * 60,
      heartbeatSeconds: 60,
      retryLimit: 3,
    },
  );

  await boss.stop();
  return syncJobId;
}

async function main() {
  const workspaceName = process.env.SEED_WORKSPACE_NAME ?? "Hartwell & Associates";
  const workspaceSlug = process.env.SEED_WORKSPACE_SLUG ?? "hartwell";
  const adminEmail = (
    process.env.SEED_ADMIN_EMAIL ?? "dave@hartwell.com"
  ).toLowerCase();
  const adminDisplayName = process.env.SEED_ADMIN_DISPLAY_NAME ?? "Dave Hartwell";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "demo1234";
  const now = new Date();
  const databaseUrl = getDatabaseUrl();

  const pool = createPool();
  const db = createDb(pool);

  // -----------------------------------------------------------------------
  // 1. Workspace
  // -----------------------------------------------------------------------
  const existingWorkspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, workspaceSlug),
  });

  const workspaceId = existingWorkspace?.id ?? `ws_${ulid()}`;
  const workspaceSettings = normalizeSettingsJson(existingWorkspace?.settingsJson);
  const existingDemoSeedVersion =
    typeof workspaceSettings.demoSeedVersion === "number"
      ? workspaceSettings.demoSeedVersion
      : 0;

  if (!existingWorkspace) {
    await db.insert(workspaces).values({
      id: workspaceId,
      slug: workspaceSlug,
      name: workspaceName,
      status: "active",
      settingsJson: { demoSeedVersion: DEMO_SEED_VERSION },
    });
    console.log(`  Created workspace: ${workspaceName} (${workspaceId})`);
  } else {
    console.log(`  Workspace already exists: ${workspaceName} (${workspaceId})`);
  }

  // -----------------------------------------------------------------------
  // 2. Admin user (Dave)
  // -----------------------------------------------------------------------
  const existingAdmin = await db.query.users.findFirst({
    where: eq(users.normalizedEmail, adminEmail),
  });

  const daveId = existingAdmin?.id ?? `usr_${ulid()}`;

  if (!existingAdmin) {
    await db.insert(users).values({
      id: daveId,
      email: adminEmail,
      normalizedEmail: adminEmail,
      displayName: adminDisplayName,
      kind: "human",
      status: "active",
    });
    console.log(`  Created user: ${adminDisplayName} (${daveId})`);
  } else {
    console.log(`  User already exists: ${adminDisplayName} (${daveId})`);
  }

  const passwordHash = await argon2.hash(adminPassword, {
    type: argon2.argon2id,
  });

  const existingLocalPasswordIdentity = await db.query.identities.findFirst({
    where: and(
      eq(identities.userId, daveId),
      eq(identities.provider, "local-password"),
    ),
  });

  if (!existingLocalPasswordIdentity) {
    await db.insert(identities).values({
      id: `ident_${ulid()}`,
      userId: daveId,
      provider: "local-password",
      subject: adminEmail,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await db
      .update(identities)
      .set({ subject: adminEmail, passwordHash, updatedAt: now })
      .where(eq(identities.id, existingLocalPasswordIdentity.id));
  }

  await db
    .insert(memberships)
    .values({ workspaceId, userId: daveId, role: "admin" })
    .onConflictDoNothing();

  // -----------------------------------------------------------------------
  // 3. Second user (Emma)
  // -----------------------------------------------------------------------
  const emmaEmail = "emma@hartwell.com";
  const existingEmma = await db.query.users.findFirst({
    where: eq(users.normalizedEmail, emmaEmail),
  });

  const emmaId = existingEmma?.id ?? `usr_${ulid()}`;

  if (!existingEmma) {
    await db.insert(users).values({
      id: emmaId,
      email: emmaEmail,
      normalizedEmail: emmaEmail,
      displayName: "Emma Chen",
      kind: "human",
      status: "active",
    });
    console.log(`  Created user: Emma Chen (${emmaId})`);
  } else {
    console.log(`  User already exists: Emma Chen (${emmaId})`);
  }

  const emmaPasswordHash = await argon2.hash("demo1234", { type: argon2.argon2id });
  const existingEmmaIdentity = await db.query.identities.findFirst({
    where: and(
      eq(identities.userId, emmaId),
      eq(identities.provider, "local-password"),
    ),
  });

  if (!existingEmmaIdentity) {
    await db.insert(identities).values({
      id: `ident_${ulid()}`,
      userId: emmaId,
      provider: "local-password",
      subject: emmaEmail,
      passwordHash: emmaPasswordHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  await db
    .insert(memberships)
    .values({ workspaceId, userId: emmaId, role: "user" })
    .onConflictDoNothing();

  // -----------------------------------------------------------------------
  // 4. Idempotency check — skip Hartwell demo data if workers already exist
  // -----------------------------------------------------------------------
  const existingWorkers = await db
    .select()
    .from(workers)
    .where(eq(workers.workspaceId, workspaceId));

  if (existingWorkers.length > 0) {
    const [
      existingRoutes,
      existingConnections,
      existingActionCapabilities,
      existingWorkItems,
      existingInboxItems,
      existingReviews,
      existingActivityEvents,
      existingSourceEvents,
    ] = await Promise.all([
      db
        .select({ id: inputRoutes.id, kind: inputRoutes.kind, status: inputRoutes.status })
        .from(inputRoutes)
        .where(eq(inputRoutes.workspaceId, workspaceId)),
      db
        .select({
          id: connections.id,
          provider: connections.provider,
          status: connections.status,
          attachedWorkerIds: connections.attachedWorkerIds,
        })
        .from(connections)
        .where(eq(connections.workspaceId, workspaceId)),
      db.select({ id: actionCapabilities.id }).from(actionCapabilities).where(eq(actionCapabilities.workspaceId, workspaceId)),
      db.select({ id: workItems.id }).from(workItems).where(eq(workItems.workspaceId, workspaceId)),
      db.select({ id: inboxItems.id }).from(inboxItems).where(eq(inboxItems.workspaceId, workspaceId)),
      db.select({ id: reviews.id }).from(reviews).where(eq(reviews.workspaceId, workspaceId)),
      db.select({ id: activityEvents.id }).from(activityEvents).where(eq(activityEvents.workspaceId, workspaceId)),
      db.select({ id: sourceEvents.id }).from(sourceEvents).where(eq(sourceEvents.workspaceId, workspaceId)),
    ]);

    const looksComplete =
      existingWorkers.length >= 4
      && existingRoutes.length >= 5
      && existingConnections.length >= 4
      && existingActionCapabilities.length >= 3
      && existingWorkItems.length >= 7
      && existingInboxItems.length >= 7
      && existingReviews.length >= 2
      && existingActivityEvents.length >= 9
      && existingSourceEvents.length >= 3;

    const gmailConnection = existingConnections.find((connection) => connection.provider === "gmail");
    const smtpConnection = existingConnections.find((connection) => connection.provider === "smtp_relay");
    const watchedInboxRoute = existingRoutes.find((route) => route.kind === "watched_inbox");
    const gmailAttachedWorkerIds = normalizeStringArray(gmailConnection?.attachedWorkerIds);
    const needsSeedUpgrade =
      existingDemoSeedVersion < DEMO_SEED_VERSION
      || gmailConnection?.status !== "not_connected"
      || gmailAttachedWorkerIds.length > 0
      || smtpConnection?.status !== "not_connected"
      || watchedInboxRoute?.status !== "suggested";

    if (looksComplete && !needsSeedUpgrade) {
      console.log(`  Hartwell demo data already seeded (${existingWorkers.length} workers found). Skipping.`);
      await pool.end();
      return;
    }

    console.log("  Existing Hartwell demo data needs refresh. Rebuilding demo product tables...");
    await db.delete(activityEvents).where(eq(activityEvents.workspaceId, workspaceId));
    await db.delete(inboxItems).where(eq(inboxItems.workspaceId, workspaceId));
    await db.delete(reviews).where(eq(reviews.workspaceId, workspaceId));
    await db.delete(workItems).where(eq(workItems.workspaceId, workspaceId));
    await db.delete(sourceEvents).where(eq(sourceEvents.workspaceId, workspaceId));
    await db.delete(actionCapabilities).where(eq(actionCapabilities.workspaceId, workspaceId));
    await db.delete(inputRoutes).where(eq(inputRoutes.workspaceId, workspaceId));
    await db.delete(connections).where(eq(connections.workspaceId, workspaceId));
    await db.delete(connectors).where(eq(connectors.workspaceId, workspaceId));
    await db.delete(workers).where(eq(workers.workspaceId, workspaceId));
  }

  console.log("  Seeding Hartwell demo data...");

  // -----------------------------------------------------------------------
  // Timestamps
  // -----------------------------------------------------------------------
  const NOW = new Date("2026-03-18T10:00:00+00:00");
  const HOUR_AGO = new Date("2026-03-18T09:00:00+00:00");
  const TWO_HOURS_AGO = new Date("2026-03-18T08:00:00+00:00");
  const YESTERDAY = new Date("2026-03-17T10:00:00+00:00");

  // -----------------------------------------------------------------------
  // IDs — generated fresh but deterministic within a single run
  // -----------------------------------------------------------------------
  const W_FOLLOWUP = cid("wkr");
  const W_PROPOSAL = cid("wkr");
  const W_INCIDENT = cid("wkr");
  const W_BUGFIX = cid("wkr");

  // Follow-Up input routes
  const ROUTE_CHAT = cid("rte");
  const ROUTE_EMAIL = cid("rte");
  const ROUTE_INBOX = cid("rte");

  // Proposal input routes
  const ROUTE_PROP_CHAT = cid("rte");
  const ROUTE_PROP_UPLOAD = cid("rte");

  // Incident input routes
  const ROUTE_INCIDENT_CHAT = cid("rte");

  // Bugfix input routes
  const ROUTE_BUGFIX_CHAT = cid("rte");

  const CONN_GMAIL = cid("conn");
  const CONN_SMTP = cid("conn");
  const CONN_CALENDAR = cid("conn");
  const CONN_DRIVE = cid("conn");

  // Follow-Up action capabilities
  const ACT_SEND_EMAIL = cid("act");
  const ACT_SAVE_WORK = cid("act");

  // Proposal action capabilities
  const ACT_PROP_SAVE_WORK = cid("act");

  // Incident action capabilities
  const ACT_INCIDENT_TICKET = cid("act");
  const ACT_INCIDENT_SAVE = cid("act");

  // Bugfix action capabilities
  const ACT_BUGFIX_TICKET = cid("act");
  const ACT_BUGFIX_SAVE = cid("act");

  // Follow-Up work items
  const WI_DRAFT = cid("wi");
  const WI_SENT = cid("wi");
  const WI_SHADOW_DRAFT = cid("wi"); // Watched inbox shadow draft
  const WI_DENIED_DRAFT = cid("wi"); // Denied follow-up draft

  // Proposal work items
  const WI_PROPOSAL = cid("wi");
  const WI_PROPOSAL_ACTION_PLAN = cid("wi");
  const WI_PROPOSAL_EMMA = cid("wi");

  const REV_01 = cid("rev");
  const REV_DENIED = cid("rev"); // Denied review example

  // Follow-Up inbox items
  const INBOX_REVIEW = cid("inb");
  const INBOX_SETUP = cid("inb");
  const INBOX_SHADOW_FU = cid("inb"); // Watched inbox shadow inbox item
  const INBOX_DENIED = cid("inb"); // Denied review inbox item (resolved)

  // Proposal inbox items
  const INBOX_SHADOW = cid("inb");
  const INBOX_PROP_BOUNDARY = cid("inb");
  const INBOX_PROP_EMMA = cid("inb");

  // Follow-Up activity events
  const EVT_01 = cid("evt");
  const EVT_02 = cid("evt");
  const EVT_03 = cid("evt");
  const EVT_SHADOW = cid("evt"); // Shadow draft created activity
  const EVT_DENIED_REQ = cid("evt"); // Denied review requested activity
  const EVT_DENIED_RES = cid("evt"); // Review denied activity

  // Proposal activity events
  const EVT_PROP_01 = cid("evt");
  const EVT_PROP_02 = cid("evt");
  const EVT_PROP_03 = cid("evt");

  const CTR_DOCS = cid("ctr");

  const RUN_FU_01 = cid("run");
  const RUN_FU_02 = cid("run");
  const RUN_FU_03 = cid("run"); // Shadow draft run
  const RUN_FU_04 = cid("run"); // Denied draft run
  const RUN_PROP_01 = cid("run");
  const RUN_PROP_02 = cid("run");
  const RUN_PROP_03 = cid("run");
  const SRC_EVT_01 = cid("sevt");
  const SRC_EVT_SHADOW = cid("sevt"); // Shadow source event
  const SRC_EVT_DENIED = cid("sevt"); // Denied flow source event

  // -----------------------------------------------------------------------
  // 5. Workers
  // -----------------------------------------------------------------------
  await db.insert(workers).values([
    {
      id: W_FOLLOWUP,
      workspaceId,
      slug: "client-follow-up",
      name: "Client Follow-Up",
      kind: "follow_up",
      scope: "shared",
      status: "active",
      summary: "Monitors client threads and drafts follow-up emails.",
      memberIds: [daveId, emmaId],
      assigneeIds: [emmaId],
      reviewerIds: [daveId],
      inputRouteIds: [ROUTE_CHAT, ROUTE_EMAIL, ROUTE_INBOX],
      connectionIds: [CONN_GMAIL, CONN_SMTP, CONN_CALENDAR],
      actionIds: [ACT_SEND_EMAIL, ACT_SAVE_WORK],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
    {
      id: W_PROPOSAL,
      workspaceId,
      slug: "proposal",
      name: "Proposal",
      kind: "proposal",
      scope: "shared",
      status: "active",
      summary: "Scope drafts, assumptions, risks, and proposal follow-up notes.",
      memberIds: [daveId, emmaId],
      assigneeIds: [daveId, emmaId],
      reviewerIds: [daveId],
      inputRouteIds: [ROUTE_PROP_CHAT, ROUTE_PROP_UPLOAD],
      connectionIds: [CONN_DRIVE],
      actionIds: [ACT_PROP_SAVE_WORK],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
    {
      id: W_INCIDENT,
      workspaceId,
      slug: "incident",
      name: "Incident",
      kind: "incident",
      scope: "shared",
      status: "active",
      summary: "Triages incidents, coordinates response, and tracks resolution.",
      memberIds: [daveId, emmaId],
      assigneeIds: [daveId],
      reviewerIds: [daveId],
      inputRouteIds: [ROUTE_INCIDENT_CHAT],
      connectionIds: [],
      actionIds: [ACT_INCIDENT_TICKET, ACT_INCIDENT_SAVE],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
    {
      id: W_BUGFIX,
      workspaceId,
      slug: "bugfix",
      name: "Bugfix",
      kind: "bugfix",
      scope: "shared",
      status: "active",
      summary: "Investigates bug reports, documents findings, and tracks fixes.",
      memberIds: [emmaId],
      assigneeIds: [emmaId],
      reviewerIds: [daveId],
      inputRouteIds: [ROUTE_BUGFIX_CHAT],
      connectionIds: [],
      actionIds: [ACT_BUGFIX_TICKET, ACT_BUGFIX_SAVE],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
  ]);
  console.log("    4 workers created");

  // -----------------------------------------------------------------------
  // 6. Input Routes (Follow-Up worker)
  // -----------------------------------------------------------------------
  await db.insert(inputRoutes).values([
    {
      id: ROUTE_CHAT,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "chat",
      status: "active",
      label: "Chat",
      description: "Direct conversation with the worker.",
      address: null,
      capabilityNote: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: ROUTE_EMAIL,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "forward_email",
      status: "active",
      label: "Forward Email",
      description: "Forward client emails for follow-up drafting.",
      address: "followup@hartwell.clawback.dev",
      capabilityNote: "Parses forwarded threads and extracts action items.",
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: ROUTE_INBOX,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "watched_inbox",
      status: "suggested",
      label: "Watched Inbox",
      description: "Monitors dave@hartwell.com for client threads.",
      address: "dave@hartwell.com",
      capabilityNote: "Read-only monitoring via Gmail connection.",
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    3 Follow-Up input routes created");

  // -----------------------------------------------------------------------
  // 6b. Input Routes (Proposal worker)
  // -----------------------------------------------------------------------
  await db.insert(inputRoutes).values([
    {
      id: ROUTE_PROP_CHAT,
      workspaceId,
      workerId: W_PROPOSAL,
      kind: "chat",
      status: "active",
      label: "Chat",
      description: "Discuss proposals and provide context directly.",
      address: null,
      capabilityNote: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: ROUTE_PROP_UPLOAD,
      workspaceId,
      workerId: W_PROPOSAL,
      kind: "upload",
      status: "active",
      label: "Upload",
      description: "Upload briefs, RFPs, or meeting notes for proposal drafting.",
      address: null,
      capabilityNote: "Extracts requirements and structures proposal drafts.",
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    2 Proposal input routes created");

  // -----------------------------------------------------------------------
  // 6c. Input Routes (Incident worker)
  // -----------------------------------------------------------------------
  await db.insert(inputRoutes).values([
    {
      id: ROUTE_INCIDENT_CHAT,
      workspaceId,
      workerId: W_INCIDENT,
      kind: "chat",
      status: "active",
      label: "Chat",
      description: "Report and discuss incidents directly.",
      address: null,
      capabilityNote: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    1 Incident input route created");

  // -----------------------------------------------------------------------
  // 6d. Input Routes (Bugfix worker)
  // -----------------------------------------------------------------------
  await db.insert(inputRoutes).values([
    {
      id: ROUTE_BUGFIX_CHAT,
      workspaceId,
      workerId: W_BUGFIX,
      kind: "chat",
      status: "active",
      label: "Chat",
      description: "Report and discuss bugs directly.",
      address: null,
      capabilityNote: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    1 Bugfix input route created");

  // -----------------------------------------------------------------------
  // 7. Connections
  // -----------------------------------------------------------------------
  await db.insert(connections).values([
    {
      id: CONN_GMAIL,
      workspaceId,
      provider: "gmail",
      accessMode: "read_only",
      status: "not_connected",
      label: "Gmail Read-Only",
      capabilities: ["read_threads", "watch_inbox"],
      attachedWorkerIds: [],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
    {
      id: CONN_SMTP,
      workspaceId,
      provider: "smtp_relay",
      accessMode: "write_capable",
      status: "not_connected",
      label: "Shared Mail Relay",
      capabilities: ["send_email"],
      attachedWorkerIds: [W_FOLLOWUP],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
    {
      id: CONN_CALENDAR,
      workspaceId,
      provider: "calendar",
      accessMode: "read_only",
      status: "suggested",
      label: "Team Calendar",
      capabilities: ["read_events"],
      attachedWorkerIds: [W_FOLLOWUP],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
    {
      id: CONN_DRIVE,
      workspaceId,
      provider: "drive",
      accessMode: "read_only",
      status: "connected",
      label: "Shared Drive",
      capabilities: ["read_files"],
      attachedWorkerIds: [W_FOLLOWUP, W_PROPOSAL],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
  ]);
  console.log("    4 connections created");

  // -----------------------------------------------------------------------
  // 8. Action Capabilities (Follow-Up worker)
  // -----------------------------------------------------------------------
  await db.insert(actionCapabilities).values([
    {
      id: ACT_SEND_EMAIL,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "send_email",
      boundaryMode: "ask_me",
      reviewerIds: [daveId],
      destinationConnectionId: CONN_SMTP,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: ACT_SAVE_WORK,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "save_work",
      boundaryMode: "auto",
      reviewerIds: [],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    2 Follow-Up action capabilities created");

  // -----------------------------------------------------------------------
  // 8b. Action Capabilities (Proposal worker)
  // -----------------------------------------------------------------------
  await db.insert(actionCapabilities).values([
    {
      id: ACT_PROP_SAVE_WORK,
      workspaceId,
      workerId: W_PROPOSAL,
      kind: "save_work",
      boundaryMode: "auto",
      reviewerIds: [],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    1 Proposal action capability created");

  // -----------------------------------------------------------------------
  // 8c. Action Capabilities (Incident worker)
  // -----------------------------------------------------------------------
  await db.insert(actionCapabilities).values([
    {
      id: ACT_INCIDENT_TICKET,
      workspaceId,
      workerId: W_INCIDENT,
      kind: "create_ticket",
      boundaryMode: "ask_me",
      reviewerIds: [daveId],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: ACT_INCIDENT_SAVE,
      workspaceId,
      workerId: W_INCIDENT,
      kind: "save_work",
      boundaryMode: "auto",
      reviewerIds: [],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    2 Incident action capabilities created");

  // -----------------------------------------------------------------------
  // 8d. Action Capabilities (Bugfix worker)
  // -----------------------------------------------------------------------
  await db.insert(actionCapabilities).values([
    {
      id: ACT_BUGFIX_TICKET,
      workspaceId,
      workerId: W_BUGFIX,
      kind: "create_ticket",
      boundaryMode: "ask_me",
      reviewerIds: [daveId],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: ACT_BUGFIX_SAVE,
      workspaceId,
      workerId: W_BUGFIX,
      kind: "save_work",
      boundaryMode: "auto",
      reviewerIds: [],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
  ]);
  console.log("    2 Bugfix action capabilities created");

  // -----------------------------------------------------------------------
  // 9. Reviews (create before work items that reference them)
  // -----------------------------------------------------------------------
  await db.insert(reviews).values([
    {
      id: REV_01,
      workspaceId,
      actionKind: "send_email",
      status: "pending",
      workerId: W_FOLLOWUP,
      workItemId: WI_DRAFT,
      reviewerIds: [daveId],
      assigneeIds: [emmaId],
      sourceRouteKind: "watched_inbox",
      actionDestination: "sarah@acmecorp.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: REV_DENIED,
      workspaceId,
      actionKind: "send_email",
      status: "denied",
      workerId: W_FOLLOWUP,
      workItemId: WI_DENIED_DRAFT,
      reviewerIds: [daveId],
      assigneeIds: [emmaId],
      sourceRouteKind: "forward_email",
      actionDestination: "mike@widgetinc.com",
      requestedAt: TWO_HOURS_AGO,
      resolvedAt: HOUR_AGO,
      createdAt: TWO_HOURS_AGO,
      updatedAt: HOUR_AGO,
    },
  ]);
  console.log("    2 reviews created");

  // -----------------------------------------------------------------------
  // 10. Work Items
  // -----------------------------------------------------------------------
  await db.insert(workItems).values([
    {
      id: WI_DRAFT,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "email_draft",
      status: "pending_review",
      title: "Follow-up: Acme Corp renewal discussion",
      summary: "Draft reply to Sarah at Acme regarding Q3 renewal terms.",
      assigneeIds: [emmaId],
      reviewerIds: [daveId],
      sourceRouteKind: "watched_inbox",
      sourceEventId: SRC_EVT_01,
      reviewId: REV_01,
      runId: RUN_FU_01,
      draftTo: "sarah@acmecorp.com",
      draftSubject: "Re: Acme Corp renewal discussion",
      draftBody:
        "Hi Sarah,\n\nThanks for the update about \"Acme Corp renewal discussion\". I reviewed your note and drafted a follow-up.\n\nBest,\nClawback team",
      executionStatus: "not_requested",
      executionError: null,
      createdAt: HOUR_AGO,
      updatedAt: NOW,
    },
    {
      id: WI_SENT,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "sent_update",
      status: "sent",
      title: "Status update: Widget Inc onboarding",
      summary: "Sent weekly onboarding progress update to Widget Inc team.",
      assigneeIds: [emmaId],
      reviewerIds: [],
      sourceRouteKind: "schedule",
      sourceEventId: null,
      reviewId: null,
      runId: RUN_FU_02,
      draftTo: "team@widgetinc.com",
      draftSubject: "Widget Inc onboarding status update",
      draftBody:
        "Hi team,\n\nHere is the weekly onboarding update for Widget Inc.\n\nBest,\nClawback team",
      executionStatus: "completed",
      executionError: null,
      createdAt: TWO_HOURS_AGO,
      updatedAt: TWO_HOURS_AGO,
    },
    {
      id: WI_PROPOSAL,
      workspaceId,
      workerId: W_PROPOSAL,
      kind: "proposal_draft",
      status: "draft",
      title: "Proposal: Globex consulting engagement",
      summary: "Initial draft for Globex Corp consulting scope and pricing.",
      assigneeIds: [daveId],
      reviewerIds: [daveId],
      sourceRouteKind: "chat",
      sourceEventId: null,
      reviewId: null,
      runId: RUN_PROP_01,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      createdAt: YESTERDAY,
      updatedAt: HOUR_AGO,
    },
    {
      id: WI_PROPOSAL_ACTION_PLAN,
      workspaceId,
      workerId: W_PROPOSAL,
      kind: "action_plan",
      status: "completed",
      title: "Action plan: Globex engagement prep",
      summary: "Next steps for finalizing Globex proposal — pricing review, timeline confirmation, team allocation.",
      assigneeIds: [daveId],
      reviewerIds: [],
      sourceRouteKind: "chat",
      sourceEventId: null,
      reviewId: null,
      runId: RUN_PROP_02,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: WI_PROPOSAL_EMMA,
      workspaceId,
      workerId: W_PROPOSAL,
      kind: "proposal_draft",
      status: "draft",
      title: "Proposal: Initech website redesign",
      summary: "Scope and timeline draft for Initech Corp website redesign project.",
      assigneeIds: [emmaId],
      reviewerIds: [daveId],
      sourceRouteKind: "upload",
      sourceEventId: null,
      reviewId: null,
      runId: RUN_PROP_03,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      createdAt: HOUR_AGO,
      updatedAt: HOUR_AGO,
    },
    // Watched-inbox shadow draft (Follow-Up worker, no review)
    {
      id: WI_SHADOW_DRAFT,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "email_draft",
      status: "draft",
      title: "Shadow draft: Apex Labs quarterly check-in",
      summary: "Watched inbox detected activity from jen@apexlabs.com. Draft reply prepared in shadow mode.",
      assigneeIds: [emmaId],
      reviewerIds: [daveId],
      sourceRouteKind: "watched_inbox",
      sourceEventId: SRC_EVT_SHADOW,
      reviewId: null,
      runId: RUN_FU_03,
      draftTo: "jen@apexlabs.com",
      draftSubject: "Re: Apex Labs quarterly check-in",
      draftBody:
        "Hi Jen,\n\nThanks for the note about \"Apex Labs quarterly check-in\". I reviewed your message and drafted a proactive follow-up.\n\nBest,\nClawback team",
      executionStatus: "not_requested",
      executionError: null,
      createdAt: HOUR_AGO,
      updatedAt: HOUR_AGO,
    },
    // Denied follow-up draft (still pending_review after denial)
    {
      id: WI_DENIED_DRAFT,
      workspaceId,
      workerId: W_FOLLOWUP,
      kind: "email_draft",
      status: "pending_review",
      title: "Follow-up: Widget Inc onboarding concerns",
      summary: "Draft reply to Mike at Widget Inc regarding onboarding timeline concerns. Review was denied — tone needs revision.",
      assigneeIds: [emmaId],
      reviewerIds: [daveId],
      sourceRouteKind: "forward_email",
      sourceEventId: SRC_EVT_DENIED,
      reviewId: REV_DENIED,
      runId: RUN_FU_04,
      draftTo: "mike@widgetinc.com",
      draftSubject: "Re: Widget Inc onboarding concerns",
      draftBody:
        "Hi Mike,\n\nThanks for the note about the onboarding timeline. I reviewed the concern and drafted a follow-up.\n\nBest,\nClawback team",
      executionStatus: "failed",
      executionError: "Tone needs revision before retrying send.",
      createdAt: TWO_HOURS_AGO,
      updatedAt: HOUR_AGO,
    },
  ]);
  console.log("    7 work items created");

  // -----------------------------------------------------------------------
  // 11. Inbox Items
  // -----------------------------------------------------------------------
  await db.insert(inboxItems).values([
    {
      id: INBOX_REVIEW,
      workspaceId,
      kind: "review",
      title: "Review email draft: Acme Corp renewal",
      summary: "The Follow-Up worker drafted a reply for Dave to review before sending.",
      assigneeIds: [daveId],
      workerId: W_FOLLOWUP,
      workItemId: WI_DRAFT,
      reviewId: REV_01,
      routeKind: "watched_inbox",
      state: "open",
      createdAt: NOW,
      updatedAt: NOW,
    },
    {
      id: INBOX_SHADOW,
      workspaceId,
      kind: "shadow",
      title: "Shadow mode: Proposal worker processed a brief",
      summary: "The Proposal worker ran against Globex brief. No action was taken (shadow mode).",
      assigneeIds: [daveId],
      workerId: W_PROPOSAL,
      workItemId: WI_PROPOSAL,
      reviewId: null,
      routeKind: "chat",
      state: "open",
      createdAt: HOUR_AGO,
      updatedAt: HOUR_AGO,
    },
    {
      id: INBOX_SETUP,
      workspaceId,
      kind: "setup",
      title: "Connect Gmail to enable proactive follow-ups",
      summary: "The Follow-Up worker can monitor your inbox if you connect Gmail with read access.",
      assigneeIds: [emmaId],
      workerId: W_FOLLOWUP,
      workItemId: null,
      reviewId: null,
      routeKind: null,
      state: "open",
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    },
    {
      id: INBOX_PROP_BOUNDARY,
      workspaceId,
      kind: "boundary",
      title: "Proposal draft ready: Globex consulting engagement",
      summary: "The Proposal worker created a scope draft for Dave to review.",
      assigneeIds: [daveId],
      workerId: W_PROPOSAL,
      workItemId: WI_PROPOSAL,
      reviewId: null,
      routeKind: "chat",
      state: "open",
      createdAt: HOUR_AGO,
      updatedAt: HOUR_AGO,
    },
    {
      id: INBOX_PROP_EMMA,
      workspaceId,
      kind: "shadow",
      title: "Proposal draft: Initech website redesign",
      summary: "The Proposal worker drafted an initial scope from Emma's uploaded brief.",
      assigneeIds: [emmaId],
      workerId: W_PROPOSAL,
      workItemId: WI_PROPOSAL_EMMA,
      reviewId: null,
      routeKind: "upload",
      state: "open",
      createdAt: HOUR_AGO,
      updatedAt: HOUR_AGO,
    },
    // Watched-inbox shadow inbox item (Follow-Up worker)
    {
      id: INBOX_SHADOW_FU,
      workspaceId,
      kind: "shadow",
      title: "Shadow suggestion: Apex Labs quarterly check-in",
      summary: "Your Follow-Up worker drafted a reply for the Apex Labs thread from watched inbox.",
      assigneeIds: [daveId],
      workerId: W_FOLLOWUP,
      workItemId: WI_SHADOW_DRAFT,
      reviewId: null,
      routeKind: "watched_inbox",
      state: "open",
      createdAt: HOUR_AGO,
      updatedAt: HOUR_AGO,
    },
    // Denied review inbox item (resolved after denial)
    {
      id: INBOX_DENIED,
      workspaceId,
      kind: "review",
      title: "Review email draft: Widget Inc onboarding concerns",
      summary: "The Follow-Up worker drafted a reply for Dave to review. Review was denied — tone needs revision.",
      assigneeIds: [daveId],
      workerId: W_FOLLOWUP,
      workItemId: WI_DENIED_DRAFT,
      reviewId: REV_DENIED,
      routeKind: "forward_email",
      state: "resolved",
      createdAt: TWO_HOURS_AGO,
      updatedAt: HOUR_AGO,
    },
  ]);
  console.log("    7 inbox items created");

  // -----------------------------------------------------------------------
  // 12. Activity Events
  // -----------------------------------------------------------------------
  await db.insert(activityEvents).values([
    {
      id: EVT_01,
      workspaceId,
      timestamp: NOW,
      workerId: W_FOLLOWUP,
      routeKind: "watched_inbox",
      resultKind: "review_requested",
      title: "Review requested for Acme Corp follow-up email",
      summary: "Dave needs to approve the draft before it sends.",
      assigneeIds: [daveId],
      runId: RUN_FU_01,
      workItemId: WI_DRAFT,
      reviewId: REV_01,
    },
    {
      id: EVT_02,
      workspaceId,
      timestamp: HOUR_AGO,
      workerId: W_FOLLOWUP,
      routeKind: "forward_email",
      resultKind: "work_item_created",
      title: "Email draft created: Acme Corp renewal",
      summary: null,
      assigneeIds: [emmaId],
      runId: RUN_FU_01,
      workItemId: WI_DRAFT,
      reviewId: null,
    },
    {
      id: EVT_03,
      workspaceId,
      timestamp: TWO_HOURS_AGO,
      workerId: W_FOLLOWUP,
      routeKind: "chat",
      resultKind: "work_item_sent",
      title: "Follow-Up worker finished processing Widget Inc update",
      summary: "Sent status update successfully.",
      assigneeIds: [emmaId],
      runId: RUN_FU_02,
      workItemId: WI_SENT,
      reviewId: null,
    },
    {
      id: EVT_PROP_01,
      workspaceId,
      timestamp: YESTERDAY,
      workerId: W_PROPOSAL,
      routeKind: "chat",
      resultKind: "work_item_created",
      title: "Proposal draft created: Globex consulting engagement",
      summary: "Dave provided a client brief via chat and the Proposal worker drafted a scope document.",
      assigneeIds: [daveId],
      runId: RUN_PROP_01,
      workItemId: WI_PROPOSAL,
      reviewId: null,
    },
    {
      id: EVT_PROP_02,
      workspaceId,
      timestamp: YESTERDAY,
      workerId: W_PROPOSAL,
      routeKind: "chat",
      resultKind: "work_item_created",
      title: "Action plan created: Globex engagement prep",
      summary: "Next steps for finalizing the Globex proposal.",
      assigneeIds: [daveId],
      runId: RUN_PROP_02,
      workItemId: WI_PROPOSAL_ACTION_PLAN,
      reviewId: null,
    },
    {
      id: EVT_PROP_03,
      workspaceId,
      timestamp: HOUR_AGO,
      workerId: W_PROPOSAL,
      routeKind: "upload",
      resultKind: "work_item_created",
      title: "Proposal draft created: Initech website redesign",
      summary: "Emma uploaded a brief and the Proposal worker drafted an initial scope.",
      assigneeIds: [emmaId],
      runId: RUN_PROP_03,
      workItemId: WI_PROPOSAL_EMMA,
      reviewId: null,
    },
    // Watched-inbox shadow draft activity (Follow-Up worker)
    {
      id: EVT_SHADOW,
      workspaceId,
      timestamp: HOUR_AGO,
      workerId: W_FOLLOWUP,
      routeKind: "watched_inbox",
      resultKind: "shadow_draft_created",
      title: "Shadow draft created: Apex Labs quarterly check-in",
      summary: "Watched inbox activity from jen@apexlabs.com processed by Follow-Up worker in shadow mode.",
      assigneeIds: [emmaId],
      runId: RUN_FU_03,
      workItemId: WI_SHADOW_DRAFT,
      reviewId: null,
    },
    // Denied review requested activity
    {
      id: EVT_DENIED_REQ,
      workspaceId,
      timestamp: TWO_HOURS_AGO,
      workerId: W_FOLLOWUP,
      routeKind: "forward_email",
      resultKind: "review_requested",
      title: "Review requested: Widget Inc onboarding concerns",
      summary: "Forwarded email from mike@widgetinc.com is ready for review.",
      assigneeIds: [daveId],
      runId: RUN_FU_04,
      workItemId: WI_DENIED_DRAFT,
      reviewId: REV_DENIED,
    },
    // Review denied activity
    {
      id: EVT_DENIED_RES,
      workspaceId,
      timestamp: HOUR_AGO,
      workerId: W_FOLLOWUP,
      routeKind: "forward_email",
      resultKind: "review_denied",
      title: "Review denied: Widget Inc onboarding concerns",
      summary: "Tone needs revision before sending.",
      assigneeIds: [daveId],
      runId: null,
      workItemId: WI_DENIED_DRAFT,
      reviewId: REV_DENIED,
    },
  ]);
  console.log("    9 activity events created");

  // -----------------------------------------------------------------------
  // 15. Connectors (document indexing)
  // -----------------------------------------------------------------------
  await db.insert(connectors).values([
    {
      id: CTR_DOCS,
      workspaceId,
      type: "local_directory",
      name: "Company Docs",
      status: "active",
      configJson: {
        root_path: "./docs",
        recursive: true,
        include_extensions: [".md", ".mdx", ".txt", ".json", ".yaml", ".yml"],
      },
      createdBy: daveId,
      createdAt: YESTERDAY,
      updatedAt: NOW,
    },
  ]);
  console.log("    1 connector created");

  const syncJobId = await enqueueInitialConnectorSync({
    databaseUrl,
    workspaceId,
    connectorId: CTR_DOCS,
    requestedBy: daveId,
    now,
  });
  console.log(`    queued initial connector sync job (${syncJobId})`);

  await db
    .update(workspaces)
    .set({
      settingsJson: {
        ...workspaceSettings,
        demoSeedVersion: DEMO_SEED_VERSION,
      },
      updatedAt: now,
    })
    .where(eq(workspaces.id, workspaceId));

  console.log("  Hartwell demo seed complete.");
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
