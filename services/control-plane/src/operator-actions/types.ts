export type RuntimeControlStatus = {
  enabled: boolean;
  mode: "local_compose" | "local_host" | "local_dev_watch" | "disabled";
  target: "openclaw" | "runtime_worker";
  label: string;
  reason: string | null;
};

export type RuntimeReadinessCheck = {
  ok: boolean;
  summary: string;
  detail: string | null;
};

export type RuntimeReadinessStatus = {
  ok: boolean;
  status: "ready" | "degraded" | "blocked";
  configured_provider: string;
  configured_provider_env_var: string | null;
  configured_provider_key_present: boolean;
  gateway_main_model: string | null;
  gateway_main_provider: string | null;
  gateway_main_provider_env_var: string | null;
  gateway_main_provider_key_present: boolean | null;
  published_agent_count: number;
  checks: {
    gateway: RuntimeReadinessCheck;
    configured_provider_key: RuntimeReadinessCheck;
    gateway_main_provider_key: RuntimeReadinessCheck | null;
  };
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
  getRuntimeReadinessStatus(): Promise<RuntimeReadinessStatus>;
  restartOpenClaw(): Promise<RuntimeRestartResult>;
  getRuntimeWorkerControlStatus(): Promise<RuntimeControlStatus>;
  restartRuntimeWorker(): Promise<RuntimeRestartResult>;
}
