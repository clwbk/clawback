import {
  n8nConnectionConfigSchema,
  type ExternalWorkflowRequest,
  type ExternalWorkflowResult,
  type N8nConnectionConfig,
} from "@clawback/contracts";

export type ReviewedExternalWorkflowExecutionInput = {
  workspaceId: string;
  reviewId: string;
  workItemId: string;
  connection: {
    id: string;
    label: string;
    configJson?: Record<string, unknown>;
  };
  request: ExternalWorkflowRequest;
};

export interface ReviewedExternalWorkflowExecutor {
  runReviewedExternalWorkflow(
    input: ReviewedExternalWorkflowExecutionInput,
  ): Promise<ExternalWorkflowResult>;
}

export class ReviewedExternalWorkflowExecutionError extends Error {
  readonly code = "reviewed_external_workflow_execution_failed";
  readonly responseStatusCode: number | null;
  readonly responseSummary: string | null;
  readonly backendReference: string | null;

  constructor(
    message: string,
    input: {
      responseStatusCode?: number | null;
      responseSummary?: string | null;
      backendReference?: string | null;
    } = {},
  ) {
    super(message);
    this.responseStatusCode = input.responseStatusCode ?? null;
    this.responseSummary = input.responseSummary ?? null;
    this.backendReference = input.backendReference ?? null;
  }
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildN8nWebhookUrl(config: N8nConnectionConfig, workflowIdentifier: string) {
  const prefix = (config.webhook_path_prefix ?? "webhook").replace(/^\/+|\/+$/g, "");
  return new URL(`${prefix}/${encodeURIComponent(workflowIdentifier)}`, ensureTrailingSlash(config.base_url)).toString();
}

function extractBackendReference(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const candidates = [
    record.executionId,
    record.execution_id,
    record.id,
    record.reference,
    record.workflowExecutionId,
    record.workflow_execution_id,
  ];
  const match = candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0);
  return match ?? null;
}

function summarizeResponseBody(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 280) : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : null;
  const message = typeof record.message === "string" ? record.message : null;
  const summary = typeof record.summary === "string" ? record.summary : null;
  const detail = [status, message, summary].filter(Boolean).join(" | ");
  if (detail.length > 0) {
    return detail.slice(0, 280);
  }

  return JSON.stringify(record).slice(0, 280);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return await response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

export class N8nWorkflowExecutor implements ReviewedExternalWorkflowExecutor {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async runReviewedExternalWorkflow(
    input: ReviewedExternalWorkflowExecutionInput,
  ): Promise<ExternalWorkflowResult> {
    if (input.request.backend_kind !== "n8n") {
      throw new ReviewedExternalWorkflowExecutionError(
        `Unsupported external workflow backend: ${input.request.backend_kind}.`,
      );
    }

    const config = n8nConnectionConfigSchema.parse(input.connection.configJson ?? {});
    const url = buildN8nWebhookUrl(config, input.request.workflow_identifier);
    const requestBody = {
      clawback: {
        workspace_id: input.workspaceId,
        review_id: input.reviewId,
        work_item_id: input.workItemId,
      },
      workflow_identifier: input.request.workflow_identifier,
      payload: input.request.payload,
    };

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.auth_token}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "n8n workflow handoff failed.";
      throw new ReviewedExternalWorkflowExecutionError(message);
    }

    const responseBody = await parseResponseBody(response);
    const responseSummary = summarizeResponseBody(responseBody);
    const backendReference = extractBackendReference(responseBody);

    if (!response.ok) {
      throw new ReviewedExternalWorkflowExecutionError(
        responseSummary
          ? `n8n workflow handoff failed: ${responseSummary}`
          : `n8n workflow handoff failed with status ${response.status}.`,
        {
          responseStatusCode: response.status,
          responseSummary,
          backendReference,
        },
      );
    }

    return {
      response_status_code: response.status,
      response_summary: responseSummary,
      backend_reference: backendReference,
    };
  }
}
