import { ulid } from "ulid";
import path from "node:path";

export function createClawbackId(prefix: string) {
  return `${prefix}_${ulid()}`;
}

export function buildRuntimeAgentId(agentVersionId: string) {
  return `cb_${agentVersionId}`.toLowerCase();
}

export function buildRuntimeSessionKey(runtimeAgentId: string, conversationId: string) {
  return `agent:${runtimeAgentId.toLowerCase()}:conversation:${conversationId.toLowerCase()}`;
}

export const RUN_EXECUTE_JOB_NAME = "run.execute";

export function buildOpenClawModelRef(params: {
  provider: string;
  model: string;
  defaultProvider?: string;
}) {
  const provider =
    params.provider === "openai-compatible"
      ? (params.defaultProvider ?? "openai")
      : params.provider;

  return `${provider}/${params.model}`;
}

export function buildRuntimeWorkspaceRelativePath(params: {
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
}) {
  return path.join(params.workspaceId, params.agentId, params.agentVersionId);
}

export function buildHostRuntimeWorkspacePath(params: {
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  hostWorkspaceRoot: string;
}) {
  return path.join(
    params.hostWorkspaceRoot,
    buildRuntimeWorkspaceRelativePath(params),
  );
}

export function buildOpenClawRuntimeWorkspacePath(params: {
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  runtimeWorkspaceRoot: string;
}) {
  return path.posix.join(
    params.runtimeWorkspaceRoot,
    params.workspaceId,
    params.agentId,
    params.agentVersionId,
  );
}
