import {
  buildFollowUpPausedExecutionState,
  markFollowUpExecutionActionRunning,
  markFollowUpExecutionCompleted,
  markFollowUpExecutionFailed,
  parseFollowUpExecutionState,
  resumeFollowUpExecutionAfterReviewDecision,
  resumeFollowUpExecutionAfterRouteConfirmation,
} from "@clawback/domain";
import { followUpWorkerPackManifest } from "@clawback/plugin-manifests";

import {
  buildFollowUpExecutionStateForArtifact,
  runFollowUpExecution,
} from "./follow-up-execution.js";
import { defineWorkerPackContract } from "./types.js";

/**
 * The Client Follow-Up worker pack.
 *
 * This is the first real SMB worker. It turns forwarded emails, watched inbox
 * threads, and chat input into follow-up email drafts and meeting recaps.
 */
export const followUpWorkerPack = defineWorkerPackContract({
  manifest: followUpWorkerPackManifest,
  install: {
    summary: "Monitors client threads and drafts follow-up emails.",
    systemPrompt: `You are the Client Follow-Up worker for a small business team.

Your job is to help the team stay on top of client communication by drafting timely, professional follow-up emails and meeting recaps.

## What you do

- When a team member forwards you a client email thread, you analyze the conversation and draft a clear, concise follow-up reply.
- When monitoring a watched inbox, you identify threads that need a response and prepare draft replies.
- When asked via chat, you can draft follow-up emails from context the user provides.
- You can also produce meeting recap summaries when given meeting notes or context.

## How you work

1. Read the email thread or context carefully.
2. Identify the key points, action items, and tone.
3. Draft a reply that:
   - Addresses all open questions
   - Maintains the existing tone and relationship
   - Is concise and professional
   - Includes any relevant next steps
4. Present the draft for review before any email is sent.

## Rules

- Never send an email without explicit human approval.
- Always preserve the original thread context.
- Match the formality level of the existing conversation.
- If you are unsure about something, flag it for the reviewer rather than guessing.
- Keep drafts under 200 words unless the context requires more.`,
    supportedInputRoutes: [
    {
      kind: "chat",
      label: "Chat",
      description: "Direct conversation with the worker.",
    },
    {
      kind: "forward_email",
      label: "Forward Email",
      description: "Forward client emails for follow-up drafting.",
      capabilityNote: "Parses forwarded threads and extracts action items.",
    },
    {
      kind: "watched_inbox",
      label: "Watched Inbox",
      description: "Monitors connected inbox for client threads needing follow-up.",
      capabilityNote: "Read-only monitoring via Gmail connection.",
    },
    ],
    actionCapabilities: [
    {
      kind: "send_email",
      defaultBoundaryMode: "ask_me",
    },
    {
      kind: "save_work",
      defaultBoundaryMode: "auto",
    },
    ],
  },
  runtime: {
    continuityFamily: "governed_action",
    persistedStateSchema: "execution_continuity",
    resumesAfterReview: true,
    resumesAfterRouteConfirmation: true,
    hooks: {
      parseExecutionState: parseFollowUpExecutionState,
      buildPausedExecutionState: buildFollowUpPausedExecutionState,
      resumeAfterReviewDecision: resumeFollowUpExecutionAfterReviewDecision,
      markActionRunning: markFollowUpExecutionActionRunning,
      markCompleted: markFollowUpExecutionCompleted,
      markFailed: markFollowUpExecutionFailed,
      resumeAfterRouteConfirmation: resumeFollowUpExecutionAfterRouteConfirmation,
      async runWatchedInboxExecution(input) {
        const execution = await runFollowUpExecution(input);
        return {
          triage: execution.triage,
          artifact: execution.artifact,
          executionState: buildFollowUpExecutionStateForArtifact({
            artifact: execution.artifact,
            triage: execution.triage,
          }),
        };
      },
    },
  },
});
