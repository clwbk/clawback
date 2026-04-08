import type {
  WorkspaceActionCapabilityRecord,
  WorkspaceConnectionRecord,
  WorkspaceInboxItemRecord,
  WorkspaceInputRouteRecord,
  WorkspaceWorkItemRecord,
  WorkspaceWorkerRecord,
} from "@/lib/control-plane";

type WorkerActivationDemoAction = "forward_email_sample";

type WorkerActivationSubject = Pick<
  WorkspaceWorkerRecord,
  "id" | "kind" | "status" | "member_ids" | "assignee_ids" | "reviewer_ids"
>;

export type WorkerActivationStepId =
  | "people"
  | "routes"
  | "connections"
  | "actions"
  | "proof";

export type WorkerActivationStep = {
  id: WorkerActivationStepId;
  title: string;
  description: string;
  complete: boolean;
  href: string;
  ctaLabel: string;
  demo_action?: WorkerActivationDemoAction | undefined;
  demoCtaLabel?: string | undefined;
};

type BuildWorkerActivationStepsInput = {
  worker: WorkerActivationSubject;
  inputRoutes: WorkspaceInputRouteRecord[];
  availableConnections: WorkspaceConnectionRecord[];
  attachedConnections: WorkspaceConnectionRecord[];
  actionCapabilities: WorkspaceActionCapabilityRecord[];
  inboxItems: WorkspaceInboxItemRecord[];
  workItems: WorkspaceWorkItemRecord[];
  from?: string | null;
};

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildWorkerFocusHref(
  workerId: string,
  focus: string,
  from?: string | null,
) {
  const params = new URLSearchParams({ focus });
  if (from) {
    params.set("from", from);
  }
  return `/workspace/workers/${workerId}?${params.toString()}`;
}

function supportsWatchInbox(connection: WorkspaceConnectionRecord) {
  return connection.capabilities.includes("watch_inbox");
}

function supportsSend(connection: WorkspaceConnectionRecord) {
  return (
    connection.capabilities.includes("send_email") ||
    connection.access_mode === "write_capable"
  );
}

export function buildWorkerActivationSteps({
  worker,
  inputRoutes,
  availableConnections,
  attachedConnections,
  actionCapabilities,
  inboxItems,
  workItems,
  from,
}: BuildWorkerActivationStepsInput): WorkerActivationStep[] {
  const asksForReview = actionCapabilities.some(
    (action) => action.boundary_mode === "ask_me",
  );
  const peopleComplete =
    worker.member_ids.length > 0 &&
    worker.assignee_ids.length > 0 &&
    (!asksForReview || worker.reviewer_ids.length > 0);

  const activeRoutes = inputRoutes.filter((route) => route.status === "active");
  const suggestedRoutes = inputRoutes.filter(
    (route) => route.status === "suggested",
  );
  const routesComplete = activeRoutes.length > 0;

  const sendActions = actionCapabilities.filter(
    (action) => action.kind === "send_email",
  );
  const destinationBoundActions = actionCapabilities.filter(
    (action) =>
      action.destination_connection_id && action.kind !== "send_email",
  );
  const needsWatchInbox = inputRoutes.some(
    (route) => route.kind === "watched_inbox",
  );
  const hasConnectedWatch = attachedConnections.some(
    (connection) =>
      connection.status === "connected" && supportsWatchInbox(connection),
  );
  const hasConnectedSend = sendActions.every((action) => {
    if (action.destination_connection_id) {
      return attachedConnections.some(
        (connection) =>
          connection.id === action.destination_connection_id &&
          connection.status === "connected" &&
          supportsSend(connection),
      );
    }

    return attachedConnections.some(
      (connection) =>
        connection.status === "connected" && supportsSend(connection),
    );
  });
  const hasConnectedDestinations = destinationBoundActions.every((action) =>
    attachedConnections.some(
      (connection) =>
        connection.id === action.destination_connection_id &&
        connection.status === "connected",
    ),
  );
  const requiresConnections =
    needsWatchInbox ||
    sendActions.length > 0 ||
    destinationBoundActions.length > 0;
  const connectionsComplete =
    (!needsWatchInbox || hasConnectedWatch) &&
    (sendActions.length === 0 || hasConnectedSend) &&
    hasConnectedDestinations;

  const enabledActions = actionCapabilities.filter(
    (action) => action.boundary_mode !== "never",
  );
  const actionsComplete =
    actionCapabilities.length === 0 || enabledActions.length > 0;

  const proofComplete = inboxItems.length > 0 || workItems.length > 0;
  const demoForwardRoute = inputRoutes.find(
    (route) =>
      route.kind === "forward_email" &&
      route.status === "active" &&
      route.address,
  );
  const demoAction: WorkerActivationDemoAction | undefined =
    worker.kind === "follow_up" &&
    worker.status === "active" &&
    demoForwardRoute
      ? "forward_email_sample"
      : undefined;

  const latestProofHref = inboxItems[0]
    ? `/workspace/inbox?item=${inboxItems[0].id}`
    : workItems[0]
      ? `/workspace/work/${workItems[0].id}`
      : "/workspace/activity";
  const latestProofLabel = inboxItems[0]
    ? "Open inbox item"
    : workItems[0]
      ? "Open work item"
      : "Open activity";

  let connectionsDescription =
    "Attach live systems when this worker needs external context or delivery.";
  if (!requiresConnections) {
    connectionsDescription =
      "This worker can start without a live connection. Attach systems later when you want external context or delivery.";
  } else if (connectionsComplete) {
    const connectedRelevantCount = new Set(
      attachedConnections
        .filter((connection) => connection.status === "connected")
        .filter((connection) => {
          if (needsWatchInbox && supportsWatchInbox(connection)) return true;
          if (sendActions.length > 0 && supportsSend(connection)) return true;
          return destinationBoundActions.some(
            (action) => action.destination_connection_id === connection.id,
          );
        })
        .map((connection) => connection.id),
    ).size;
    connectionsDescription = `${pluralize(
      connectedRelevantCount,
      "connected system",
    )} ready for live worker traffic.`;
  } else if (availableConnections.length === 0) {
    connectionsDescription =
      "No workspace connections are available yet. Add one here before expecting live sources or delivery.";
  } else if (
    needsWatchInbox &&
    !hasConnectedWatch &&
    sendActions.length > 0 &&
    !hasConnectedSend
  ) {
    connectionsDescription =
      "Attach a connected read-only inbox and a connected send path before this worker can monitor and deliver live work.";
  } else if (needsWatchInbox && !hasConnectedWatch) {
    connectionsDescription =
      "Attach a connected read-only inbox so watched input can move from suggested to live intake.";
  } else if (sendActions.length > 0 && !hasConnectedSend) {
    connectionsDescription =
      "Attach a connected send path before reviewed output can leave Clawback.";
  } else if (!hasConnectedDestinations) {
    connectionsDescription =
      "Attach the destination system required for this worker's external action.";
  }

  return [
    {
      id: "people",
      title: "Assign people",
      description: peopleComplete
        ? `${pluralize(worker.member_ids.length, "member")}, ${pluralize(
            worker.assignee_ids.length,
            "assignee",
          )}${asksForReview ? `, ${pluralize(worker.reviewer_ids.length, "reviewer")}` : ""}.`
        : asksForReview && worker.reviewer_ids.length === 0
          ? "This worker uses review gates. Add at least one reviewer alongside members and assignees."
          : "Choose who can access this worker and who should own incoming work.",
      complete: peopleComplete,
      href: buildWorkerFocusHref(worker.id, "people", from),
      ctaLabel: peopleComplete ? "Review people" : "Assign people",
    },
    {
      id: "routes",
      title: "Confirm inputs",
      description: routesComplete
        ? `${pluralize(activeRoutes.length, "active route")}${suggestedRoutes.length > 0 ? `, ${pluralize(suggestedRoutes.length, "suggested route")}.` : "."}`
        : inputRoutes.length === 0
          ? "Add or install at least one input route so this worker can receive work."
          : "Routes exist, but none are live yet. Activate an input path before expecting new work.",
      complete: routesComplete,
      href: buildWorkerFocusHref(worker.id, "routes", from),
      ctaLabel: routesComplete ? "Review routes" : "Open routes",
    },
    {
      id: "connections",
      title: "Attach live systems",
      description: connectionsDescription,
      complete: connectionsComplete,
      href: buildWorkerFocusHref(worker.id, "connections", from),
      ctaLabel: connectionsComplete ? "Review connections" : "Attach systems",
    },
    {
      id: "actions",
      title: "Confirm action posture",
      description: actionsComplete
        ? actionCapabilities.length === 0
          ? "This worker is currently knowledge-only. It can produce work without taking external action."
          : `${pluralize(enabledActions.length, "action")} enabled${asksForReview ? ", with review still in the loop where needed." : "."}`
        : "All actions are currently disabled. Pick Ask me or Auto for at least one action when you are ready.",
      complete: actionsComplete,
      href: buildWorkerFocusHref(worker.id, "actions", from),
      ctaLabel: actionsComplete ? "Review actions" : "Set action posture",
    },
    {
      id: "proof",
      title: "Inspect recent work",
      description: proofComplete
        ? demoAction
          ? `${pluralize(inboxItems.length, "inbox item")} and ${pluralize(workItems.length, "work item")} already show this worker producing real product state. Run another sample intake any time to watch fresh state appear.`
          : `${pluralize(inboxItems.length, "inbox item")} and ${pluralize(workItems.length, "work item")} now show this worker producing real product state.`
        : demoAction
          ? "Run a sample intake through the installed forward-email path to create real worker state in inbox, work, and activity."
          : "Once this worker receives input, its inbox items and work records will appear here and across the workspace.",
      complete: proofComplete,
      href: latestProofHref,
      ctaLabel: proofComplete
        ? latestProofLabel
        : demoAction
          ? "Run sample activity"
          : latestProofLabel,
      ...(demoAction
        ? {
            demo_action: demoAction,
            demoCtaLabel: "Run sample activity",
          }
        : {}),
    },
  ];
}
