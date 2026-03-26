export type WorkspaceSection =
  | "today"
  | "workers"
  | "inbox"
  | "work"
  | "contacts"
  | "connectors"
  | "connections"
  | "activity"
  | "chat"
  | "setup";

export function pathToWorkspaceSection(pathname: string): WorkspaceSection {
  if (pathname.startsWith("/workspace/setup")) return "setup";
  if (pathname.startsWith("/workspace/workers")) return "workers";
  if (pathname.startsWith("/workspace/inbox")) return "inbox";
  if (pathname.startsWith("/workspace/work")) return "work";
  if (pathname.startsWith("/workspace/contacts")) return "contacts";
  if (pathname.startsWith("/workspace/connectors")) return "connectors";
  if (pathname.startsWith("/workspace/connections")) return "connections";
  if (pathname.startsWith("/workspace/activity")) return "activity";
  if (pathname.startsWith("/workspace/chat")) return "chat";
  if (pathname.startsWith("/workspace/runs")) return "chat";
  return "today";
}

export function workspaceSectionToPath(section: string): string {
  switch (section) {
    case "today":
      return "/workspace";
    case "workers":
      return "/workspace/workers";
    case "inbox":
      return "/workspace/inbox";
    case "work":
      return "/workspace/work";
    case "contacts":
      return "/workspace/contacts";
    case "connectors":
      return "/workspace/connectors";
    case "connections":
      return "/workspace/connections";
    case "activity":
      return "/workspace/activity";
    case "chat":
      return "/workspace/chat";
    case "setup":
      return "/workspace/setup";
    default:
      return "/workspace";
  }
}

export function buildChatLocation(agentId: string | null, conversationId: string | null): string {
  const params = new URLSearchParams();
  if (agentId) params.set("agent", agentId);
  if (conversationId) params.set("conversation", conversationId);
  const query = params.toString();
  return query ? `/workspace/chat?${query}` : "/workspace/chat";
}

export function resolvePreferredSelectionId(
  availableIds: string[],
  options: {
    requestedId?: string | null | undefined;
    currentId?: string | null | undefined;
  },
): string | null {
  const { requestedId = null, currentId = null } = options;

  if (requestedId && availableIds.includes(requestedId)) {
    return requestedId;
  }

  if (currentId && availableIds.includes(currentId)) {
    return currentId;
  }

  return availableIds[0] ?? null;
}
