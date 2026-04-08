import { describe, expect, it } from "vitest";

import {
  getRunStreamReconnectDelayMs,
  shouldRetryRunStreamReconnect,
} from "./use-run-stream";

describe("run stream reconnect policy", () => {
  it("uses bounded exponential backoff", () => {
    expect([
      getRunStreamReconnectDelayMs(1),
      getRunStreamReconnectDelayMs(2),
      getRunStreamReconnectDelayMs(3),
      getRunStreamReconnectDelayMs(4),
      getRunStreamReconnectDelayMs(5),
    ]).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("stops retrying after five attempts", () => {
    expect(shouldRetryRunStreamReconnect(5)).toBe(true);
    expect(shouldRetryRunStreamReconnect(6)).toBe(false);
  });
});
