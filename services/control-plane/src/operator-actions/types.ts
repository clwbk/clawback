export type RuntimeControlStatus = {
  enabled: boolean;
  mode: "local_compose" | "local_host" | "local_dev_watch" | "disabled";
  target: "openclaw" | "runtime_worker";
  label: string;
  reason: string | null;
};

export type RuntimeRestartResult = {
  target: "openclaw" | "runtime_worker";
  status: "completed";
  message: string;
  requested_at: string;
  completed_at: string;
};

export interface OperatorActionsServiceContract {
  getRuntimeControlStatus(): Promise<RuntimeControlStatus>;
  restartOpenClaw(): Promise<RuntimeRestartResult>;
  getRuntimeWorkerControlStatus(): Promise<RuntimeControlStatus>;
  restartRuntimeWorker(): Promise<RuntimeRestartResult>;
}
