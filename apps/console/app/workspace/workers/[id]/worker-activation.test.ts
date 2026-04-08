import { describe, expect, it } from "vitest";

import {
  followUpActions,
  followUpConnections,
  followUpRoutes,
  followUpWorker,
  inboxItems,
  proposalWorker,
  workItems,
} from "@/lib/dev-fixtures";
import {
  buildWorkerActivationSteps,
  buildWorkerFocusHref,
} from "./worker-activation";

describe("buildWorkerActivationSteps", () => {
  it("keeps live systems incomplete when only irrelevant connections are connected", () => {
    const steps = buildWorkerActivationSteps({
      worker: followUpWorker,
      inputRoutes: followUpRoutes,
      availableConnections: followUpConnections,
      attachedConnections: followUpConnections.filter((connection) =>
        connection.attached_worker_ids.includes(followUpWorker.id),
      ),
      actionCapabilities: followUpActions,
      inboxItems: inboxItems.filter(
        (item) => item.worker_id === followUpWorker.id,
      ),
      workItems: workItems.filter(
        (item) => item.worker_id === followUpWorker.id,
      ),
    });

    expect(steps.find((step) => step.id === "people")?.complete).toBe(true);
    expect(steps.find((step) => step.id === "routes")?.complete).toBe(true);
    expect(steps.find((step) => step.id === "connections")?.complete).toBe(
      false,
    );
    expect(steps.find((step) => step.id === "proof")).toMatchObject({
      href: `/workspace/inbox?item=${inboxItems[0]?.id}`,
      demo_action: "forward_email_sample",
      demoCtaLabel: "Run sample activity",
    });
  });

  it("requires reviewers when the worker uses ask-me actions", () => {
    const steps = buildWorkerActivationSteps({
      worker: {
        ...followUpWorker,
        reviewer_ids: [],
      },
      inputRoutes: followUpRoutes,
      availableConnections: followUpConnections,
      attachedConnections: [],
      actionCapabilities: followUpActions,
      inboxItems: [],
      workItems: [],
      from: "setup",
    });

    const peopleStep = steps.find((step) => step.id === "people");

    expect(peopleStep?.complete).toBe(false);
    expect(peopleStep?.href).toContain("focus=people");
    expect(peopleStep?.href).toContain("from=setup");
  });

  it("builds worker-focus links that preserve the source surface", () => {
    expect(buildWorkerFocusHref(followUpWorker.id, "proof", "workers")).toBe(
      `/workspace/workers/${followUpWorker.id}?focus=proof&from=workers`,
    );
  });

  it("offers a sample activity action when an active follow-up worker has a live forward-email route", () => {
    const steps = buildWorkerActivationSteps({
      worker: followUpWorker,
      inputRoutes: followUpRoutes,
      availableConnections: followUpConnections,
      attachedConnections: [],
      actionCapabilities: followUpActions,
      inboxItems: [],
      workItems: [],
    });

    expect(steps.find((step) => step.id === "proof")).toMatchObject({
      complete: false,
      ctaLabel: "Run sample activity",
      demo_action: "forward_email_sample",
    });
  });

  it("keeps the sample activity trigger available after real worker state already exists", () => {
    const steps = buildWorkerActivationSteps({
      worker: followUpWorker,
      inputRoutes: followUpRoutes,
      availableConnections: followUpConnections,
      attachedConnections: [],
      actionCapabilities: followUpActions,
      inboxItems: inboxItems.filter(
        (item) => item.worker_id === followUpWorker.id,
      ),
      workItems: workItems.filter(
        (item) => item.worker_id === followUpWorker.id,
      ),
    });

    expect(steps.find((step) => step.id === "proof")).toMatchObject({
      complete: true,
      ctaLabel: "Open inbox item",
      demo_action: "forward_email_sample",
      demoCtaLabel: "Run sample activity",
    });
  });

  it("does not offer sample activity when the worker is paused", () => {
    const steps = buildWorkerActivationSteps({
      worker: {
        ...followUpWorker,
        status: "paused",
      },
      inputRoutes: followUpRoutes,
      availableConnections: followUpConnections,
      attachedConnections: [],
      actionCapabilities: followUpActions,
      inboxItems: [],
      workItems: [],
    });

    const proofStep = steps.find((step) => step.id === "proof");

    expect(proofStep).toMatchObject({
      complete: false,
      ctaLabel: "Open activity",
    });
    expect(proofStep?.demo_action).toBeUndefined();
  });

  it("treats connection setup as optional for workers without live-system dependencies", () => {
    const steps = buildWorkerActivationSteps({
      worker: proposalWorker,
      inputRoutes: [],
      availableConnections: [],
      attachedConnections: [],
      actionCapabilities: [],
      inboxItems: [],
      workItems: [],
    });

    expect(steps.find((step) => step.id === "connections")?.complete).toBe(
      true,
    );
    expect(steps.find((step) => step.id === "actions")?.complete).toBe(true);
    expect(steps.find((step) => step.id === "proof")?.complete).toBe(false);
  });

});
