import { describe, expect, it } from "vitest";

import { workerRecordSchema } from "./workers.js";
import { inputRouteRecordSchema } from "./input-routes.js";
import { connectionRecordSchema } from "./connections.js";
import { workItemRecordSchema } from "./work-items.js";
import { inboxItemRecordSchema } from "./inbox.js";
import { reviewRecordSchema } from "./reviews.js";
import { actionCapabilityRecordSchema } from "./actions.js";
import { activityEventRecordSchema, todayResponseSchema } from "./today.js";
import {
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
} from "./dev-fixtures/hartwell-v1.js";

describe("WorkerRecord schema", () => {
  it("parses all fixture workers", () => {
    for (const w of workers) {
      expect(workerRecordSchema.parse(w)).toEqual(w);
    }
  });

  it("rejects missing required fields", () => {
    expect(() => workerRecordSchema.parse({})).toThrow();
  });

  it("rejects invalid kind", () => {
    expect(() =>
      workerRecordSchema.parse({ ...workers[0], kind: "invalid" }),
    ).toThrow();
  });
});

describe("InputRouteRecord schema", () => {
  it("parses all fixture routes", () => {
    for (const r of followUpRoutes) {
      expect(inputRouteRecordSchema.parse(r)).toEqual(r);
    }
  });

  it("rejects invalid route kind", () => {
    expect(() =>
      inputRouteRecordSchema.parse({ ...followUpRoutes[0], kind: "fax" }),
    ).toThrow();
  });
});

describe("ConnectionRecord schema", () => {
  it("parses all fixture connections", () => {
    for (const c of followUpConnections) {
      expect(connectionRecordSchema.parse(c)).toEqual(c);
    }
  });

  it("rejects invalid provider", () => {
    expect(() =>
      connectionRecordSchema.parse({ ...followUpConnections[0], provider: "fax" }),
    ).toThrow();
  });
});

describe("ActionCapabilityRecord schema", () => {
  it("parses all fixture actions", () => {
    for (const a of followUpActions) {
      expect(actionCapabilityRecordSchema.parse(a)).toEqual(a);
    }
  });

  it("rejects invalid boundary_mode", () => {
    expect(() =>
      actionCapabilityRecordSchema.parse({
        ...followUpActions[0],
        boundary_mode: "yolo",
      }),
    ).toThrow();
  });
});

describe("WorkItemRecord schema", () => {
  it("parses all fixture work items", () => {
    for (const wi of workItems) {
      expect(workItemRecordSchema.parse(wi)).toEqual(wi);
    }
  });

  it("rejects invalid status", () => {
    expect(() =>
      workItemRecordSchema.parse({ ...workItems[0], status: "deleted" }),
    ).toThrow();
  });
});

describe("InboxItemRecord schema", () => {
  it("parses all fixture inbox items", () => {
    for (const item of inboxItems) {
      expect(inboxItemRecordSchema.parse(item)).toEqual(item);
    }
  });

  it("rejects invalid state", () => {
    expect(() =>
      inboxItemRecordSchema.parse({ ...inboxItems[0], state: "snoozed" }),
    ).toThrow();
  });
});

describe("ReviewRecord schema", () => {
  it("parses fixture review", () => {
    expect(reviewRecordSchema.parse(reviewDetail)).toEqual(reviewDetail);
  });

  it("rejects invalid action_kind", () => {
    expect(() =>
      reviewRecordSchema.parse({ ...reviewDetail, action_kind: "deploy" }),
    ).toThrow();
  });
});

describe("ActivityEventRecord schema", () => {
  it("parses all fixture activity events", () => {
    for (const evt of activityEvents) {
      expect(activityEventRecordSchema.parse(evt)).toEqual(evt);
    }
  });
});

describe("TodayResponse schema", () => {
  it("parses Dave today fixture", () => {
    expect(todayResponseSchema.parse(daveTodayResponse)).toEqual(daveTodayResponse);
  });

  it("parses Emma today fixture", () => {
    expect(todayResponseSchema.parse(emmaTodayResponse)).toEqual(emmaTodayResponse);
  });
});
