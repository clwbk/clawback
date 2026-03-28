type ShutdownSignal = "SIGINT" | "SIGTERM";

type ClosableApp = {
  close: () => Promise<void>;
};

type ProcessLike = {
  on: (event: ShutdownSignal, listener: () => void) => unknown;
  exit: (code?: number) => never | void;
};

type TimeoutHandle = {
  unref?: () => void;
};

type TimerLike = {
  setTimeout: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearTimeout: (handle: TimeoutHandle) => void;
};

const defaultTimers: TimerLike = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export function registerGracefulShutdown(options: {
  app: ClosableApp;
  processRef?: ProcessLike;
  timeoutMs?: number;
  timers?: TimerLike;
}) {
  const {
    app,
    processRef = process,
    timeoutMs = 10_000,
    timers = defaultTimers,
  } = options;

  let isShuttingDown = false;
  let hasExited = false;

  const exitOnce = (code: number) => {
    if (hasExited) {
      return;
    }
    hasExited = true;
    processRef.exit(code);
  };

  const shutdown = async (_signal: ShutdownSignal) => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;

    const forcedExitTimer = timers.setTimeout(() => {
      exitOnce(1);
    }, timeoutMs);
    forcedExitTimer.unref?.();

    try {
      await app.close();
      timers.clearTimeout(forcedExitTimer);
      exitOnce(0);
    } catch {
      timers.clearTimeout(forcedExitTimer);
      exitOnce(1);
    }
  };

  processRef.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  processRef.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  return {
    shutdown,
  };
}
