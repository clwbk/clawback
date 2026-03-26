import { describe, expect, it } from "vitest";
import {
  buildControlPlaneProxyUrl,
  getControlPlaneProxyOrigins,
} from "./control-plane-proxy";

describe("controlPlaneProxy", () => {
  it("prefers an explicit internal origin", () => {
    expect(
      getControlPlaneProxyOrigins({
        CONTROL_PLANE_INTERNAL_URL: "http://localhost:4010/",
        CONTROL_PLANE_PORT: "3001",
      }),
    ).toEqual(["http://localhost:4010"]);
  });

  it("falls back to the configured control-plane port", () => {
    expect(getControlPlaneProxyOrigins({ CONTROL_PLANE_PORT: "3011" })).toEqual([
      "http://127.0.0.1:3011",
    ]);
  });

  it("uses the local fallback ports when no env is set", () => {
    expect(getControlPlaneProxyOrigins({})).toEqual([
      "http://127.0.0.1:3001",
      "http://127.0.0.1:3011",
    ]);
  });

  it("builds the upstream control-plane URL", () => {
    expect(
      buildControlPlaneProxyUrl(
        "http://127.0.0.1:3011",
        ["runs", "run_123", "events"],
        "?limit=50",
      ).toString(),
    ).toBe("http://127.0.0.1:3011/api/runs/run_123/events?limit=50");
  });
});
