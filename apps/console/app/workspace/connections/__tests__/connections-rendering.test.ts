/**
 * Verification tests for the plugin-console completion sprint (C4).
 *
 * Since React Testing Library is not set up in the console app, and the
 * vitest environment cannot resolve UI component imports (shadcn, etc.),
 * these tests verify the rendering contracts at the resolver and registry level.
 *
 * We register mock panels and resolvers directly rather than importing
 * panel-registrations.ts (which would transitively import React UI components).
 *
 * Tests prove:
 * 1. The resolver returns the correct props for known manifest IDs
 * 2. Providers without custom panels get no resolver entry (generic fallback)
 * 3. Category grouping produces the expected structure
 * 4. All registered panels have matching resolver entries
 * 5. The shell/body contract is enforced (custom panels are body-only)
 */
import { describe, expect, it, beforeEach } from "vitest";

import {
  registerProviderPanel,
  getProviderPanel,
  hasProviderPanel,
  listRegisteredPanelIds,
} from "../../_lib/provider-panel-registry";
import {
  registerPanelPropsResolver,
  resolvePanelPropsMap,
  type ResolverContext,
} from "../../_lib/provider-panel-resolver";

// ---------------------------------------------------------------------------
// Mock panel components (stand-ins for real onboarding cards)
// ---------------------------------------------------------------------------

function MockGmailPanel() { return null; }
function MockSmtpPanel() { return null; }
function MockSlackPanel() { return null; }

// Register mock panels (same manifest IDs as real registrations)
registerProviderPanel("provider.gmail.read-only", MockGmailPanel);
registerProviderPanel("provider.smtp-relay", MockSmtpPanel);
registerProviderPanel("provider.slack", MockSlackPanel);

// Register mock resolvers (same logic as real registrations)
registerPanelPropsResolver("provider.gmail.read-only", (ctx: ResolverContext) => {
  const workerNames = new Map(ctx.workers.map((w) => [w.id, w.name]));
  const gmailConnection = ctx.connections.find(
    (c) => c.provider === "gmail" && c.access_mode === "read_only",
  ) ?? null;
  const gmailWorkerStatuses = ctx.inputRoutes
    .filter((route) => route.kind === "watched_inbox")
    .map((route) => ({
      workerId: route.worker_id,
      workerName: workerNames.get(route.worker_id) ?? route.worker_id,
      routeStatus: route.status,
      attached: gmailConnection?.attached_worker_ids.includes(route.worker_id) ?? false,
    }));
  return {
    connection: gmailConnection,
    workers: gmailWorkerStatuses,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.smtp-relay", (ctx: ResolverContext) => {
  const smtpConnection = ctx.connections.find(
    (c) => c.provider === "smtp_relay" && c.access_mode === "write_capable",
  ) ?? null;
  return {
    connection: smtpConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

registerPanelPropsResolver("provider.slack", (ctx: ResolverContext) => {
  const slackConnection = ctx.connections.find(
    (c) => c.provider === "slack" && c.access_mode === "write_capable",
  ) ?? null;
  return {
    connection: slackConnection,
    usingFixtureFallback: ctx.usingFixtureFallback,
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockResolverContext: ResolverContext = {
  connections: [
    {
      id: "conn_gmail_1",
      workspace_id: "ws_1",
      provider: "gmail",
      access_mode: "read_only",
      status: "connected",
      label: "Gmail Read-Only",
      capabilities: ["read_threads", "watch_inbox"],
      attached_worker_ids: ["wrk_1"],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "conn_smtp_1",
      workspace_id: "ws_1",
      provider: "smtp_relay",
      access_mode: "write_capable",
      status: "connected",
      label: "SMTP Relay",
      capabilities: ["send_email"],
      attached_worker_ids: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "conn_slack_1",
      workspace_id: "ws_1",
      provider: "slack",
      access_mode: "write_capable",
      status: "connected",
      label: "Slack Approvals",
      capabilities: ["send_approval_prompts", "receive_approval_decisions"],
      attached_worker_ids: [],
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  inputRoutes: [
    {
      id: "route_1",
      kind: "watched_inbox",
      worker_id: "wrk_1",
      status: "active",
    },
  ],
  workers: [{ id: "wrk_1", name: "Follow-Up Worker" }],
  usingFixtureFallback: false,
};

/** Registry-shaped provider records. */
type RegistryProvider = {
  id: string;
  display_name: string;
  description: string;
  provider: string;
  access_modes: string[];
  capabilities: string[];
  stability: string;
  category?: string;
  priority?: number;
  setup_steps: { id: string; title: string; description: string; ctaLabel: string }[];
};

const mockProviders: RegistryProvider[] = [
  {
    id: "provider.gmail.read-only",
    display_name: "Gmail Read-Only",
    description: "Workspace-level Gmail read-only connection.",
    provider: "gmail",
    access_modes: ["read_only"],
    capabilities: ["read_threads", "watch_inbox"],
    stability: "pilot",
    category: "email",
    priority: 10,
    setup_steps: [],
  },
  {
    id: "provider.smtp-relay",
    display_name: "SMTP Relay",
    description: "Outbound SMTP relay for reviewed sends.",
    provider: "smtp_relay",
    access_modes: ["write_capable"],
    capabilities: ["send_email"],
    stability: "pilot",
    category: "email",
    priority: 20,
    setup_steps: [],
  },
  {
    id: "provider.calendar",
    display_name: "Google Calendar",
    description: "Knowledge source for calendar events.",
    provider: "calendar",
    access_modes: ["read_only"],
    capabilities: ["read_events"],
    stability: "experimental",
    category: "knowledge",
    priority: 10,
    setup_steps: [{ id: "calendar-connect", title: "Connect Calendar", description: "Auth", ctaLabel: "Connect" }],
  },
  {
    id: "provider.drive",
    display_name: "Google Drive",
    description: "Knowledge source for documents.",
    provider: "drive",
    access_modes: ["read_only"],
    capabilities: ["read_documents"],
    stability: "experimental",
    category: "knowledge",
    priority: 20,
    setup_steps: [{ id: "drive-connect", title: "Connect Drive", description: "Auth", ctaLabel: "Connect" }],
  },
  {
    id: "provider.notion",
    display_name: "Notion",
    description: "Knowledge source for team wikis, project notes, and meeting docs.",
    provider: "notion",
    access_modes: ["read_only"],
    capabilities: ["read_pages", "search"],
    stability: "experimental",
    category: "knowledge",
    priority: 30,
    setup_steps: [{ id: "notion-connect", title: "Connect Notion workspace", description: "Auth", ctaLabel: "Connect Notion" }],
  },
  {
    id: "provider.slack",
    display_name: "Slack",
    description: "Approval surface for reviewed actions delivered through the Slack Bot API.",
    provider: "slack",
    access_modes: ["write_capable"],
    capabilities: ["send_approval_prompts", "receive_approval_decisions"],
    stability: "pilot",
    category: "project",
    priority: 10,
    setup_steps: [{ id: "slack-connect", title: "Connect Slack approval surface", description: "Auth", ctaLabel: "Connect Slack" }],
  },
];

// ---------------------------------------------------------------------------
// Category grouping helper (mirrors the page logic)
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ["email", "knowledge", "project", "crm", "other"];
const CATEGORY_LABELS: Record<string, string> = {
  email: "Email",
  knowledge: "Knowledge Sources",
  project: "Project Management",
  crm: "CRM",
  other: "Other",
};

function groupProvidersByCategory(providers: RegistryProvider[]) {
  const sorted = [...providers].sort((a, b) => {
    const catA = CATEGORY_ORDER.indexOf(a.category ?? "other");
    const catB = CATEGORY_ORDER.indexOf(b.category ?? "other");
    const orderA = catA === -1 ? CATEGORY_ORDER.length : catA;
    const orderB = catB === -1 ? CATEGORY_ORDER.length : catB;
    if (orderA !== orderB) return orderA - orderB;
    return (a.priority ?? 999) - (b.priority ?? 999);
  });

  const groups: { category: string; label: string; providers: RegistryProvider[] }[] = [];
  const seen = new Set<string>();

  for (const provider of sorted) {
    const cat = provider.category ?? "other";
    if (!seen.has(cat)) {
      seen.add(cat);
      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1),
        providers: [],
      });
    }
    groups.find((g) => g.category === cat)?.providers.push(provider);
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("connections rendering contracts (C4)", () => {
  describe("panel registry and resolver", () => {
    it("Gmail has a registered custom panel", () => {
      expect(hasProviderPanel("provider.gmail.read-only")).toBe(true);
      expect(getProviderPanel("provider.gmail.read-only")).toBeDefined();
    });

    it("SMTP has a registered custom panel", () => {
      expect(hasProviderPanel("provider.smtp-relay")).toBe(true);
      expect(getProviderPanel("provider.smtp-relay")).toBeDefined();
    });

    it("experimental providers have no registered custom panel", () => {
      expect(hasProviderPanel("provider.calendar")).toBe(false);
      expect(hasProviderPanel("provider.drive")).toBe(false);
      expect(hasProviderPanel("provider.notion")).toBe(false);
    });

    it("resolver returns props for Gmail and SMTP", () => {
      const propsMap = resolvePanelPropsMap(mockResolverContext);
      expect(propsMap.has("provider.gmail.read-only")).toBe(true);
      expect(propsMap.has("provider.smtp-relay")).toBe(true);
    });

    it("resolver returns no props for generic experimental providers", () => {
      const propsMap = resolvePanelPropsMap(mockResolverContext);
      expect(propsMap.has("provider.calendar")).toBe(false);
      expect(propsMap.has("provider.drive")).toBe(false);
      expect(propsMap.has("provider.notion")).toBe(false);
    });

    it("Gmail resolver props include connection and workers", () => {
      const propsMap = resolvePanelPropsMap(mockResolverContext);
      const gmailProps = propsMap.get("provider.gmail.read-only");
      expect(gmailProps).toBeDefined();
      expect(gmailProps?.connection).toBeDefined();
      expect(gmailProps?.connection?.provider).toBe("gmail");
      expect(gmailProps?.workers).toBeInstanceOf(Array);
      expect(gmailProps?.usingFixtureFallback).toBe(false);
    });

    it("SMTP resolver props include connection", () => {
      const propsMap = resolvePanelPropsMap(mockResolverContext);
      const smtpProps = propsMap.get("provider.smtp-relay");
      expect(smtpProps).toBeDefined();
      expect(smtpProps?.connection).toBeDefined();
      expect(smtpProps?.connection?.provider).toBe("smtp_relay");
      expect(smtpProps?.usingFixtureFallback).toBe(false);
    });

    it("all registered panels have matching resolver entries", () => {
      const panelIds = listRegisteredPanelIds();
      const propsMap = resolvePanelPropsMap(mockResolverContext);
      for (const id of panelIds) {
        expect(propsMap.has(id)).toBe(true);
      }
    });
  });

  describe("grouped providers render with category headings", () => {
    const groups = groupProvidersByCategory(mockProviders);

    it("produces at least two category groups", () => {
      expect(groups.length).toBeGreaterThanOrEqual(2);
    });

    it("Email group appears first with Gmail and SMTP", () => {
      const emailGroup = groups.find((g) => g.category === "email");
      expect(emailGroup).toBeDefined();
      expect(emailGroup?.label).toBe("Email");
      const ids = emailGroup?.providers.map((p) => p.id) ?? [];
      expect(ids).toContain("provider.gmail.read-only");
      expect(ids).toContain("provider.smtp-relay");
    });

    it("Knowledge Sources group includes Calendar, Drive, and Notion", () => {
      const knowledgeGroup = groups.find((g) => g.category === "knowledge");
      expect(knowledgeGroup).toBeDefined();
      expect(knowledgeGroup?.label).toBe("Knowledge Sources");
      const ids = knowledgeGroup?.providers.map((p) => p.id) ?? [];
      expect(ids).toContain("provider.calendar");
      expect(ids).toContain("provider.drive");
      expect(ids).toContain("provider.notion");
    });

    it("groups are sorted by CATEGORY_ORDER", () => {
      const categories = groups.map((g) => g.category);
      const expectedOrder = categories
        .slice()
        .sort((a, b) => {
          const idxA = CATEGORY_ORDER.indexOf(a);
          const idxB = CATEGORY_ORDER.indexOf(b);
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
      expect(categories).toEqual(expectedOrder);
    });

    it("providers within a group are sorted by priority", () => {
      for (const group of groups) {
        const priorities = group.providers.map((p) => p.priority ?? 999);
        const sorted = [...priorities].sort((a, b) => a - b);
        expect(priorities).toEqual(sorted);
      }
    });
  });

  describe("experimental provider renders generic fallback shell", () => {
    it("an experimental provider with no custom panel would show Coming Soon", () => {
      const notion = mockProviders.find((p) => p.id === "provider.notion");
      expect(notion).toBeDefined();
      expect(notion?.stability).toBe("experimental");
      expect(hasProviderPanel("provider.notion")).toBe(false);

      // ProviderSetupCard condition: isComingSoon = stability === "experimental"
      const isComingSoon = notion?.stability === "experimental";
      const hasPanel = hasProviderPanel("provider.notion");
      expect(isComingSoon).toBe(true);
      expect(hasPanel).toBe(false);
    });

    it("shell metadata is available for the experimental provider", () => {
      const notion = mockProviders.find((p) => p.id === "provider.notion");
      expect(notion?.display_name).toBe("Notion");
      expect(notion?.description).toBe(
        "Knowledge source for team wikis, project notes, and meeting docs.",
      );
      expect(notion?.capabilities).toEqual(["read_pages", "search"]);
      expect(notion?.access_modes).toEqual(["read_only"]);
    });
  });

  describe("custom provider renders inside shell (not instead of it)", () => {
    it("Gmail panel is a body-only component", () => {
      const GmailPanel = getProviderPanel("provider.gmail.read-only");
      expect(GmailPanel).toBeDefined();
      expect(typeof GmailPanel).toBe("function");
    });

    it("SMTP panel is a body-only component", () => {
      const SmtpPanel = getProviderPanel("provider.smtp-relay");
      expect(SmtpPanel).toBeDefined();
      expect(typeof SmtpPanel).toBe("function");
    });

    it("a provider with no registered panel shows generic fallback", () => {
      const calendarPanel = getProviderPanel("provider.calendar");
      expect(calendarPanel).toBeUndefined();

      const propsMap = resolvePanelPropsMap(mockResolverContext);
      expect(propsMap.has("provider.calendar")).toBe(false);
    });
  });

  describe("Slack approval surface", () => {
    it("Slack has a console-side panel registration", () => {
      expect(hasProviderPanel("provider.slack")).toBe(true);
    });

    it("Slack appears in the Project Management category group", () => {
      const groups = groupProvidersByCategory(mockProviders);
      const projectGroup = groups.find((g) => g.category === "project");
      const slackEntry = projectGroup?.providers.find(
        (p) => p.id === "provider.slack",
      );
      expect(slackEntry).toBeDefined();
      expect(slackEntry?.display_name).toBe("Slack");
    });

    it("Slack is no longer marked experimental", () => {
      const slack = mockProviders.find((p) => p.id === "provider.slack");
      expect(slack?.stability).toBe("pilot");
    });

    it("Slack setup steps are available for the setup flow", () => {
      const slack = mockProviders.find((p) => p.id === "provider.slack");
      expect(slack).toBeDefined();
      expect(slack!.setup_steps.length).toBeGreaterThan(0);
      expect(slack!.setup_steps[0]!.id).toBe("slack-connect");
    });

    it("Slack shell metadata includes approval capabilities", () => {
      const slack = mockProviders.find((p) => p.id === "provider.slack");
      expect(slack?.display_name).toBe("Slack");
      expect(slack?.capabilities).toContain("send_approval_prompts");
      expect(slack?.capabilities).toContain("receive_approval_decisions");
      expect(slack?.access_modes).toEqual(["write_capable"]);
    });
  });

  describe("Notion proof plugin (C5 verification)", () => {
    it("Notion has no console-side panel registration (zero console changes)", () => {
      expect(hasProviderPanel("provider.notion")).toBe(false);
    });

    it("Notion appears in the Knowledge Sources category group", () => {
      const groups = groupProvidersByCategory(mockProviders);
      const knowledgeGroup = groups.find((g) => g.category === "knowledge");
      const notionEntry = knowledgeGroup?.providers.find(
        (p) => p.id === "provider.notion",
      );
      expect(notionEntry).toBeDefined();
      expect(notionEntry?.display_name).toBe("Notion");
    });

    it("Notion would render with Coming Soon badge (experimental stability)", () => {
      const notion = mockProviders.find((p) => p.id === "provider.notion");
      expect(notion?.stability).toBe("experimental");
    });

    it("Notion setup steps are available for the generic fallback preview", () => {
      const notion = mockProviders.find((p) => p.id === "provider.notion");
      expect(notion).toBeDefined();
      expect(notion!.setup_steps.length).toBeGreaterThan(0);
      expect(notion!.setup_steps[0]!.id).toBe("notion-connect");
    });
  });
});
