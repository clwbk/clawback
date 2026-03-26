/**
 * Re-export Hartwell V1 dev fixtures from the contracts package public API.
 *
 * Uses the namespace export so console is not coupled to contracts internal
 * file layout. If the fixture file moves, only the barrel needs updating.
 */
import { hartwellFixtures } from "@clawback/contracts";

export const {
  daveViewer,
  emmaViewer,
  followUpWorker,
  proposalWorker,
  incidentWorker,
  bugfixWorker,
  workers,
  followUpRoutes,
  followUpConnections,
  followUpActions,
  workItems,
  inboxItems,
  reviewDetail,
  activityEvents,
  daveTodayResponse,
  emmaTodayResponse,
} = hartwellFixtures;
