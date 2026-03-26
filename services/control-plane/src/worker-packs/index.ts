import type { WorkerKind } from "@clawback/contracts";

import { followUpWorkerPack } from "./follow-up-pack.js";
import { proposalWorkerPack } from "./proposal-pack.js";
import { incidentWorkerPack } from "./incident-pack.js";
import { bugfixWorkerPack } from "./bugfix-pack.js";
import { syntheticValidationWorkerPack } from "./synthetic-validation-pack.js";
import {
  isRuntimeCapableWorkerPack,
  type RuntimeCapableWorkerPackContract,
  type WorkerPackContract,
} from "./types.js";
export { followUpWorkerPack } from "./follow-up-pack.js";
export { proposalWorkerPack } from "./proposal-pack.js";
export { incidentWorkerPack } from "./incident-pack.js";
export { bugfixWorkerPack } from "./bugfix-pack.js";
export { syntheticValidationWorkerPack } from "./synthetic-validation-pack.js";
export { WorkerPackInstallService, generateForwardingAddress } from "./install-service.js";
export type * from "./types.js";

export const firstPartyWorkerPacks = [
  followUpWorkerPack,
  proposalWorkerPack,
  incidentWorkerPack,
  bugfixWorkerPack,
] as const;

export function getWorkerPackByKind(kind: WorkerKind): WorkerPackContract | null {
  return firstPartyWorkerPacks.find((pack) => pack.kind === kind) ?? null;
}

export function getRuntimeWorkerPackByKind(
  kind: WorkerKind,
): RuntimeCapableWorkerPackContract | null {
  const pack = getWorkerPackByKind(kind);
  return pack && isRuntimeCapableWorkerPack(pack) ? pack : null;
}
