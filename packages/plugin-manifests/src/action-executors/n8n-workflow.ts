import type { ActionExecutorPluginManifest } from "@clawback/plugin-sdk";

export const n8nWorkflowExecutor: ActionExecutorPluginManifest = {
  id: "action.n8n-workflow",
  kind: "action_executor",
  version: "1.0.0",
  displayName: "n8n Workflow Handoff",
  description: "Hands a reviewed deterministic segment to a configured n8n workflow while keeping approval and outcome truth in Clawback.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 20,
  actionKind: "run_external_workflow",
  destinationProviders: ["n8n"],
  defaultBoundaryMode: "ask_me",
  executionModel: "governed_async",
  secretKeys: ["n8n_base_url", "n8n_auth_token"],
  setupHelp:
    "Requires a configured n8n connection provider. The executor hands reviewed deterministic segments to n8n workflows. " +
    "All handoffs are governed — the worker proposes, a human reviews, and only approved workflows are triggered.",
  validate:
    "Checks that the n8n connection is active and the target workflow exists and is enabled.",
  probe:
    "Calls the n8n API to verify the configured workflow is accessible and in an active state.",
  status:
    "Reports n8n connection status, target workflow name, and count of handoffs executed/pending/failed.",
  recoveryHints: [
    { symptom: "n8n connection not configured", fix: "Set up the n8n connection provider first. This executor depends on it." },
    { symptom: "Workflow execution failed", fix: "Check the n8n execution logs for the workflow. Common causes: missing input data or node configuration errors." },
    { symptom: "Timeout waiting for n8n response", fix: "The n8n instance may be overloaded. Check n8n's execution queue and resource usage." },
  ],
  setupSteps: [
    {
      id: "n8n-reviewed-workflow",
      title: "Verify reviewed n8n handoff",
      description: "Configure an n8n backend before approving external workflow handoffs from the product.",
      ctaLabel: "Configure n8n",
      operatorOnly: true,
      target: { surface: "connections", focus: "n8n" },
    },
  ],
};
