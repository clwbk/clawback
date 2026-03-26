type StatusDotProps = {
  status: "connected" | "failed" | "checking";
};

const statusConfig = {
  connected: {
    className: "bg-green-500",
    label: "Connected",
  },
  failed: {
    className: "bg-red-500",
    label: "Failed",
  },
  checking: {
    className: "bg-amber-500 animate-pulse",
    label: "Checking",
  },
} satisfies Record<StatusDotProps["status"], { className: string; label: string }>;

export function StatusDot({ status }: StatusDotProps) {
  const config = statusConfig[status];
  return (
    <span
      role="status"
      aria-label={config.label}
      className={`inline-block h-2 w-2 rounded-full ${config.className}`}
    />
  );
}
