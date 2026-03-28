import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { registerGracefulShutdown } from "./graceful-shutdown.js";

class FakeProcess extends EventEmitter {
  exit = vi.fn<(code?: number) => void>();
}

describe("registerGracefulShutdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes the app and exits 0 on SIGTERM", async () => {
    const app = {
      close: vi.fn(async () => {}),
    };
    const processRef = new FakeProcess();

    registerGracefulShutdown({
      app,
      processRef,
    });

    processRef.emit("SIGTERM");
    await vi.waitFor(() => {
      expect(app.close).toHaveBeenCalledTimes(1);
      expect(processRef.exit).toHaveBeenCalledWith(0);
    });
  });

  it("ignores duplicate signals while shutdown is already in progress", async () => {
    let resolveClose!: () => void;
    const closePromise = new Promise<void>((resolve) => {
      resolveClose = resolve;
    });
    const app = {
      close: vi.fn(async () => {
        await closePromise;
      }),
    };
    const processRef = new FakeProcess();

    registerGracefulShutdown({
      app,
      processRef,
    });

    processRef.emit("SIGTERM");
    processRef.emit("SIGINT");

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(processRef.exit).not.toHaveBeenCalled();

    resolveClose();

    await vi.waitFor(() => {
      expect(processRef.exit).toHaveBeenCalledTimes(1);
      expect(processRef.exit).toHaveBeenCalledWith(0);
    });
  });

  it("forces exit 1 if close hangs past the timeout", async () => {
    vi.useFakeTimers();
    const app = {
      close: vi.fn(async () => {
        await new Promise<void>(() => {});
      }),
    };
    const processRef = new FakeProcess();

    registerGracefulShutdown({
      app,
      processRef,
      timeoutMs: 500,
    });

    processRef.emit("SIGINT");
    await vi.runOnlyPendingTimersAsync();

    expect(app.close).toHaveBeenCalledTimes(1);
    expect(processRef.exit).toHaveBeenCalledWith(1);
  });

  it("exits 1 if app.close rejects", async () => {
    const app = {
      close: vi.fn(async () => {
        throw new Error("close failed");
      }),
    };
    const processRef = new FakeProcess();

    registerGracefulShutdown({
      app,
      processRef,
    });

    processRef.emit("SIGTERM");

    await vi.waitFor(() => {
      expect(processRef.exit).toHaveBeenCalledWith(1);
    });
  });
});
