type IngressArtifactIds = Record<string, string>;

export type IngressResult<TIds extends IngressArtifactIds> = {
  source_event_id: string;
  worker_id: string;
  workspace_id: string;
  deduplicated: boolean;
} & TIds;

export function buildIngressResult<TIds extends IngressArtifactIds>(input: {
  sourceEventId: string;
  workerId: string;
  workspaceId: string;
  ids: TIds;
  deduplicated?: boolean;
}): IngressResult<TIds> {
  return {
    source_event_id: input.sourceEventId,
    worker_id: input.workerId,
    workspace_id: input.workspaceId,
    deduplicated: input.deduplicated ?? false,
    ...input.ids,
  };
}

export function buildDeduplicatedIngressResult<TIds extends IngressArtifactIds>(
  input: {
    sourceEventId: string;
    workerId: string;
    workspaceId: string;
    ids: TIds;
  },
): IngressResult<TIds> {
  return buildIngressResult({
    ...input,
    deduplicated: true,
  });
}
