import type React from "react";

interface AppShellProps {
  rail: React.ReactNode;
  panel?: React.ReactNode;
  header?: React.ReactNode;
  children: React.ReactNode;
}

export function AppShell({ rail, panel, header, children }: AppShellProps) {
  return (
    <div
      className={[
        "h-screen overflow-hidden bg-background text-foreground",
        panel
          ? "grid grid-cols-[48px_minmax(200px,240px)_1fr]"
          : "grid grid-cols-[48px_1fr]",
      ].join(" ")}
    >
      {/* Icon rail */}
      <div className="bg-background text-foreground">{rail}</div>

      {/* Optional side panel */}
      {panel && (
        <div className="bg-background text-foreground overflow-hidden border-r border-border">
          {panel}
        </div>
      )}

      {/* Main content */}
      <div className="bg-background text-foreground overflow-hidden flex min-w-0 flex-col">
        {header ? (
          <div className="shrink-0 border-b border-border bg-background/95">
            {header}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
