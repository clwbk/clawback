type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export type PeopleMap = Map<string, string>;

export function humanizeLabel(value: string | null | undefined) {
  if (!value) return "N/A";
  return value.replace(/_/g, " ");
}

export function titleFromId(value: string | null | undefined) {
  if (!value) return "Unknown";
  const cleaned = value
    .replace(/^[a-z]+_/i, "")
    .replace(/_\d+$/i, "")
    .replace(/_/g, " ");
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function personName(
  people: PeopleMap,
  id: string | null | undefined,
) {
  if (!id) return "Unknown";
  return people.get(id) ?? titleFromId(id);
}

export function personNames(people: PeopleMap, ids: string[]) {
  if (ids.length === 0) return "None assigned";
  return ids.map((id) => personName(people, id)).join(", ");
}

export function inboxKindVariant(kind: string): BadgeVariant {
  switch (kind) {
    case "review":
      return "destructive";
    case "shadow":
      return "secondary";
    case "setup":
    case "boundary":
      return "outline";
    default:
      return "default";
  }
}

export function shadowBadgeClassName(kind: string) {
  if (kind !== "shadow") return "";
  return "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300";
}

export function workKindVariant(kind: string): BadgeVariant {
  switch (kind) {
    case "email_draft":
    case "sent_update":
      return "default";
    case "proposal_draft":
    case "meeting_recap":
    case "action_plan":
      return "secondary";
    case "ticket_draft":
    case "created_ticket":
      return "destructive";
    case "pr_draft":
      return "outline";
    default:
      return "secondary";
  }
}

export function workKindClassName(kind: string) {
  if (kind !== "email_draft") return "";
  return "";
}

export function workStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "sent":
    case "completed":
    case "created":
      return "default";
    case "approved":
    case "pending_review":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function executionStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "completed":
      return "default";
    case "queued":
    case "executing":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function workerStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "active":
      return "default";
    case "paused":
      return "secondary";
    default:
      return "outline";
  }
}

export function connectionStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "connected":
      return "default";
    case "suggested":
      return "secondary";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

export function connectionAccentClassName(params: {
  provider?: string | null;
  accessMode?: string | null;
  status?: string | null;
}) {
  if (params.provider !== "gmail" || params.accessMode !== "read_only") {
    return "";
  }

  switch (params.status) {
    case "connected":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300";
    case "suggested":
      return "border-sky-100 bg-sky-50/70 text-sky-700 dark:border-sky-950 dark:bg-sky-950/20 dark:text-sky-300";
    default:
      return "";
  }
}

export function routeStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "active":
      return "default";
    case "suggested":
      return "secondary";
    default:
      return "outline";
  }
}

export function routeAccentClassName(kind: string | null | undefined) {
  if (kind !== "watched_inbox") return "";
  return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300";
}

export function boundaryModeVariant(mode: string): BadgeVariant {
  switch (mode) {
    case "auto":
      return "default";
    case "ask_me":
      return "secondary";
    case "never":
      return "destructive";
    default:
      return "outline";
  }
}

export function reviewStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "approved":
    case "completed":
      return "default";
    case "pending":
      return "secondary";
    case "denied":
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

export function activityResultVariant(kind: string): BadgeVariant {
  if (kind.includes("sent") || kind.includes("created") || kind.includes("connected")) {
    return "default";
  }
  if (kind.includes("review") || kind.includes("draft")) {
    return "secondary";
  }
  if (kind.includes("failed") || kind.includes("error")) {
    return "destructive";
  }
  return "outline";
}

export function activityAccentClassName(params: {
  resultKind?: string | null;
  routeKind?: string | null;
}) {
  if (params.routeKind === "watched_inbox" || params.resultKind === "shadow_draft_created") {
    return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300";
  }
  return "";
}

export function isShadowSuggestion(params: {
  inboxKind?: string | null;
  routeKind?: string | null;
  reviewId?: string | null;
}) {
  return params.inboxKind === "shadow"
    || (params.routeKind === "watched_inbox" && !params.reviewId);
}

export function shadowModeDescription(params: {
  routeKind?: string | null;
  source?: string;
}) {
  if (params.routeKind !== "watched_inbox") {
    return params.source ?? "Prepared proactively from connected context. No external action was taken.";
  }
  return params.source
    ?? "Prepared proactively from watched inbox activity. No send occurred and no review has been requested yet.";
}

export function formatClockTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
