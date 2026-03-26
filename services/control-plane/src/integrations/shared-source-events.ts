import type { WorkerTriageRecord } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type { StoredSourceEvent } from "./inbound-email/types.js";

export function buildStoredSourceEvent(input: Omit<StoredSourceEvent, "id"> & {
  triageJson?: WorkerTriageRecord | null;
}): StoredSourceEvent {
  return {
    id: createClawbackId("src"),
    ...input,
  };
}
