import type { WorkerKind } from "@clawback/contracts";
import type { ReviewedEmailSender } from "./smtp-relay-email-sender.js";
import type { WorkerRecordView } from "../workers/types.js";

export const TEST_SMTP_CONNECTION_ID = "conn_smtp_01";

export function createFakeReviewedEmailSender(
  options?: {
    failWith?: Error;
    providerMessageId?: string;
  },
): ReviewedEmailSender {
  return {
    async sendReviewedEmail() {
      if (options?.failWith) {
        throw options.failWith;
      }

      return {
        providerMessageId: options?.providerMessageId ?? "msg_test_01",
      };
    },
  };
}

export function createReviewedSendDeps(
  workerId: string,
  options?: {
    destinationConnectionId?: string;
    connectionLabel?: string;
    connectionStatus?: string;
    connectionProvider?: string;
    accessMode?: string;
    workerKind?: WorkerKind;
    failWith?: Error;
    providerMessageId?: string;
  },
) {
  const destinationConnectionId = options?.destinationConnectionId ?? TEST_SMTP_CONNECTION_ID;

  return {
    actionCapabilityService: {
      async list() {
        return {
          action_capabilities: [
            {
              id: "act_send_email_test",
              worker_id: workerId,
              kind: "send_email",
              boundary_mode: "ask_me",
              reviewer_ids: [],
              destination_connection_id: destinationConnectionId,
            },
          ],
        };
      },
    },
    connectionService: {
      async getById(_workspaceId: string, id: string) {
        return {
          id,
          provider: options?.connectionProvider ?? "smtp_relay",
          access_mode: options?.accessMode ?? "write_capable",
          status: options?.connectionStatus ?? "connected",
          label: options?.connectionLabel ?? "SMTP Relay",
        };
      },
    },
    workerService: {
      async getById(workspaceId: string, id: string): Promise<WorkerRecordView> {
        return {
          id,
          workspace_id: workspaceId,
          slug: `worker-${id}`,
          name: `Worker ${id}`,
          kind: options?.workerKind ?? "follow_up",
          scope: "shared",
          status: "active",
          summary: null,
          member_ids: [],
          assignee_ids: [],
          reviewer_ids: [],
          input_route_ids: [],
          connection_ids: [],
          action_ids: [],
          created_at: new Date("2026-03-18T00:00:00.000Z").toISOString(),
          updated_at: new Date("2026-03-18T00:00:00.000Z").toISOString(),
        };
      },
    },
    reviewedEmailSender: createFakeReviewedEmailSender({
      ...(options?.failWith ? { failWith: options.failWith } : {}),
      ...(options?.providerMessageId ? { providerMessageId: options.providerMessageId } : {}),
    }),
  };
}
