import { describe, expect, it, vi } from "vitest";

import { validateRuntimeWorkerHeartbeat } from "./status.js";

describe("runtime worker heartbeat validation", () => {
  it("accepts a ready heartbeat with a live pid", () => {
    const signalProcess = vi.fn();

    expect(() =>
      validateRuntimeWorkerHeartbeat(
        {
          pid: 123,
          started_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T00:00:05.000Z",
          state: "ready",
          signal: null,
        },
        { signalProcess },
      ),
    ).not.toThrow();

    expect(signalProcess).toHaveBeenCalledWith(123, 0);
  });

  it("rejects a non-ready heartbeat", () => {
    expect(() =>
      validateRuntimeWorkerHeartbeat(
        {
          pid: 123,
          started_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T00:00:05.000Z",
          state: "stopping",
          signal: "SIGTERM",
        },
        { signalProcess: vi.fn() },
      ),
    ).toThrow(/not ready/);
  });

  it("rejects a missing pid", () => {
    expect(() =>
      validateRuntimeWorkerHeartbeat(
        {
          pid: 0,
          started_at: "2026-03-25T00:00:00.000Z",
          updated_at: "2026-03-25T00:00:05.000Z",
          state: "ready",
          signal: null,
        },
        { signalProcess: vi.fn() },
      ),
    ).toThrow(/valid pid/);
  });
});
