/**
 * Slack-specific approval action types.
 *
 * These mirror the WhatsApp approval action types in the review surface service
 * but use Slack user IDs as the actor identity.
 */

export type SlackApprovalActionRecipient = {
  userId: string;
  displayName: string;
  /** Slack user ID (e.g., U01234ABC) — the external identity for the approval surface. */
  actorIdentity: string;
  approveToken: string;
  denyToken: string;
};
