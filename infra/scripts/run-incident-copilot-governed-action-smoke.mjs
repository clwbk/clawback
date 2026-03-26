const baseUrl = process.env.CONTROL_PLANE_BASE_URL ?? process.env.CONTROL_PLANE_URL ?? "http://127.0.0.1:3011";
const loginEmail = process.env.SMOKE_ADMIN_EMAIL ?? "dave@hartwell.com";
const loginPassword = process.env.SMOKE_ADMIN_PASSWORD ?? "demo1234";
const timeoutMs = Number(process.env.SMOKE_INCIDENT_ACTION_TIMEOUT_MS ?? "120000");
const pollIntervalMs = 1000;

function cookieHeaderFrom(setCookieHeaders) {
  return setCookieHeaders
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean)
    .join("; ");
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function login() {
  const loginResult = await requestJson("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: loginEmail,
      password: loginPassword,
    }),
  });

  if (!loginResult.response.ok) {
    throw new Error(
      `Login failed: ${loginResult.response.status} ${JSON.stringify(loginResult.body)}`,
    );
  }

  const cookies = cookieHeaderFrom(loginResult.response.headers.getSetCookie());
  const csrfToken = loginResult.body.csrf_token;
  if (!cookies || !csrfToken) {
    throw new Error("Login did not return session cookies and CSRF token.");
  }

  return { cookies, csrfToken };
}

async function waitForRun(auth, runId, options = {}) {
  const targetStatuses = options.targetStatuses ?? ["completed", "failed", "canceled"];
  const deadline = Date.now() + (options.timeoutMs ?? timeoutMs);

  while (Date.now() < deadline) {
    const runResult = await requestJson(`/api/runs/${runId}`, {
      headers: {
        cookie: auth.cookies,
      },
    });

    if (!runResult.response.ok) {
      throw new Error(
        `Run polling failed for ${runId}: ${runResult.response.status} ${JSON.stringify(runResult.body)}`,
      );
    }

    if (targetStatuses.includes(runResult.body.status)) {
      return runResult.body;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for run ${runId} to reach ${targetStatuses.join(", ")}.`);
}

async function waitForApproval(auth, runId) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const approvalsResult = await requestJson("/api/approvals", {
      headers: {
        cookie: auth.cookies,
      },
    });

    if (!approvalsResult.response.ok) {
      throw new Error(
        `Approval polling failed: ${approvalsResult.response.status} ${JSON.stringify(approvalsResult.body)}`,
      );
    }

    const approval = approvalsResult.body.approvals.find(
      (entry) => entry.run_id === runId && entry.status === "pending",
    );
    if (approval) {
      return approval;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Timed out waiting for approval for run ${runId}.`);
}

async function getRunEvents(auth, runId) {
  const eventsResult = await requestJson(`/api/runs/${runId}/events`, {
    headers: {
      cookie: auth.cookies,
    },
  });

  if (!eventsResult.response.ok) {
    throw new Error(
      `Run events fetch failed for ${runId}: ${eventsResult.response.status} ${JSON.stringify(eventsResult.body)}`,
    );
  }

  return eventsResult.body.events;
}

async function getConversation(auth, conversationId) {
  const conversationResult = await requestJson(`/api/conversations/${conversationId}`, {
    headers: {
      cookie: auth.cookies,
    },
  });

  if (!conversationResult.response.ok) {
    throw new Error(
      `Conversation fetch failed: ${conversationResult.response.status} ${JSON.stringify(conversationResult.body)}`,
    );
  }

  return conversationResult.body;
}

function getLatestAssistantMessage(conversation) {
  return [...conversation.messages].reverse().find((message) => message.role === "assistant") ?? null;
}

async function main() {
  const auth = await login();

  const agentsResult = await requestJson("/api/agents", {
    headers: {
      cookie: auth.cookies,
    },
  });
  if (!agentsResult.response.ok) {
    throw new Error(`Agents fetch failed: ${agentsResult.response.status} ${JSON.stringify(agentsResult.body)}`);
  }

  const incidentCopilot = agentsResult.body.agents.find((agent) => agent.slug === "incident-copilot");
  if (!incidentCopilot) {
    throw new Error("Incident Copilot agent was not found.");
  }

  const createConversationResult = await requestJson("/api/conversations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: auth.cookies,
      "x-csrf-token": auth.csrfToken,
    },
    body: JSON.stringify({
      agent_id: incidentCopilot.id,
    }),
  });

  if (!createConversationResult.response.ok) {
    throw new Error(
      `Conversation creation failed: ${createConversationResult.response.status} ${JSON.stringify(createConversationResult.body)}`,
    );
  }

  const conversationId = createConversationResult.body.id;

  const promptAndWait = async (text, options = {}) => {
    const runResult = await requestJson("/api/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: auth.cookies,
        "x-csrf-token": auth.csrfToken,
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        input: {
          type: "text",
          text,
        },
      }),
    });

    if (!runResult.response.ok) {
      throw new Error(`Run creation failed: ${runResult.response.status} ${JSON.stringify(runResult.body)}`);
    }

    const run = await waitForRun(auth, runResult.body.run_id, options);
    return run;
  };

  const incidentRun = await promptAndWait("Why did checkout fail last night?");
  if (incidentRun.status !== "completed") {
    throw new Error(`Incident answer run ended in unexpected status ${incidentRun.status}.`);
  }

  const incidentConversation = await getConversation(auth, conversationId);
  const incidentAssistant = getLatestAssistantMessage(incidentConversation);
  if (!incidentAssistant) {
    throw new Error("No assistant response was recorded for the incident answer.");
  }
  if (!incidentAssistant.citations || incidentAssistant.citations.length === 0) {
    throw new Error("Incident answer completed without citations.");
  }

  const draftRun = await promptAndWait(
    "Use the draft_ticket tool now. Create a follow-up ticket titled 'Follow-up: checkout-api stale primary target after payments-db failover' and pass a concise markdown body covering customer impact, likely cause, next remediation actions, and owner.",
  );
  if (draftRun.status !== "completed") {
    throw new Error(`Draft run ended in unexpected status ${draftRun.status}.`);
  }

  const draftEvents = await getRunEvents(auth, draftRun.id);
  const draftToolCompletion = draftEvents.find(
    (event) =>
      event.event_type === "run.tool.completed" &&
      (event.payload.tool_name === "draft_ticket" || event.payload.name === "draft_ticket"),
  );
  if (!draftToolCompletion) {
    throw new Error("Draft run completed without a draft_ticket tool completion event.");
  }
  if (draftToolCompletion.payload.isError === true) {
    throw new Error(`draft_ticket completed with an error payload: ${JSON.stringify(draftToolCompletion.payload)}`);
  }

  const createRunResult = await requestJson("/api/runs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: auth.cookies,
      "x-csrf-token": auth.csrfToken,
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      input: {
        type: "text",
        text: "Use the create_ticket tool now to create the real follow-up ticket. Pass the same title and markdown body, and wait for approval instead of only describing the action.",
      },
    }),
  });

  if (!createRunResult.response.ok) {
    throw new Error(
      `Create-ticket run creation failed: ${createRunResult.response.status} ${JSON.stringify(createRunResult.body)}`,
    );
  }

  const waitingRun = await waitForRun(auth, createRunResult.body.run_id, {
    targetStatuses: ["waiting_for_approval", "completed", "failed", "canceled"],
  });
  if (waitingRun.status !== "waiting_for_approval") {
    throw new Error(`Expected waiting_for_approval, received ${waitingRun.status}.`);
  }

  const approval = await waitForApproval(auth, waitingRun.id);
  const resolveApprovalResult = await requestJson(`/api/approvals/${approval.id}/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: auth.cookies,
      "x-csrf-token": auth.csrfToken,
    },
    body: JSON.stringify({
      decision: "approved",
      rationale: "Smoke test approval",
    }),
  });

  if (!resolveApprovalResult.response.ok) {
    throw new Error(
      `Approval resolution failed: ${resolveApprovalResult.response.status} ${JSON.stringify(resolveApprovalResult.body)}`,
    );
  }

  const finalCreateRun = await waitForRun(auth, waitingRun.id, {
    targetStatuses: ["completed", "failed", "canceled"],
    timeoutMs,
  });
  if (finalCreateRun.status !== "completed") {
    throw new Error(`Create-ticket run ended in unexpected status ${finalCreateRun.status}.`);
  }

  const createEvents = await getRunEvents(auth, waitingRun.id);
  const approvalResolved = createEvents.find((event) => event.event_type === "run.approval.resolved");
  const createToolCompletion = createEvents.find(
    (event) =>
      event.event_type === "run.tool.completed" &&
      (event.payload.tool_name === "create_ticket" || event.payload.name === "create_ticket"),
  );
  if (!approvalResolved) {
    throw new Error("Create-ticket run completed without a run.approval.resolved event.");
  }
  if (!createToolCompletion) {
    throw new Error("Create-ticket run completed without a create_ticket tool completion event.");
  }
  if (createToolCompletion.payload.isError === true) {
    throw new Error(`create_ticket completed with an error payload: ${JSON.stringify(createToolCompletion.payload)}`);
  }

  const ticketsResult = await requestJson("/api/admin/mock-tickets", {
    headers: {
      cookie: auth.cookies,
    },
  });
  if (!ticketsResult.response.ok) {
    throw new Error(`Mock tickets fetch failed: ${ticketsResult.response.status} ${JSON.stringify(ticketsResult.body)}`);
  }

  const createdTicket = ticketsResult.body.tickets.find(
    (ticket) => ticket.approval_request_id === approval.id || ticket.run_id === waitingRun.id,
  );
  if (!createdTicket) {
    throw new Error("No created mock ticket matched the approved action.");
  }

  const finalConversation = await getConversation(auth, conversationId);
  const finalAssistant = getLatestAssistantMessage(finalConversation);

  console.log(
    JSON.stringify(
      {
        ok: true,
        conversation_id: conversationId,
        incident_run_id: incidentRun.id,
        draft_run_id: draftRun.id,
        create_run_id: waitingRun.id,
        approval_id: approval.id,
        created_ticket_id: createdTicket.id,
        created_ticket_ref: createdTicket.external_ref,
        draft_tool_event: draftToolCompletion.payload,
        create_tool_event: createToolCompletion.payload,
        assistant_preview: finalAssistant?.content?.[0]?.text?.slice(0, 240) ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
