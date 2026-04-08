"use client";

import { usePathname, useRouter } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { IconRail } from "@/components/navigation/icon-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { type AuthenticatedSession } from "@/lib/control-plane";
import { pathToWorkspaceSection, workspaceSectionToPath } from "@/lib/workspace-navigation";
import { useApprovalSummary } from "@/hooks/use-approval-summary";
import { useWorkspaceRail } from "@/hooks/use-workspace-rail";
import { useSession } from "@/hooks/use-session";
import { useSetupProgress } from "@/hooks/use-setup-progress";

import { SetupHealthBadge } from "./_components/setup-health-badge";

export function WorkspaceShell({
  children,
  initialSession,
}: {
  children: React.ReactNode;
  initialSession: AuthenticatedSession;
}) {
  const { session, loading, error } = useSession(initialSession);
  const router = useRouter();
  const pathname = usePathname();
  const role = session?.membership.role === "admin" ? "admin" : "user";
  const { pendingCount } = useApprovalSummary(role);
  const { incompleteCount: incompleteSetupSteps } = useSetupProgress(role);
  const { railExpanded, toggleRail } = useWorkspaceRail();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-destructive">
            Workspace error
          </p>
          <h1 className="mt-4 text-2xl font-semibold text-foreground">
            The console could not load.
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">{error}</p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Return to login
          </a>
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/workspace/chat")) {
    return <>{children}</>;
  }

  const activeSection = pathToWorkspaceSection(pathname);
  const sectionLabelMap: Record<string, string> = {
    today: "Today",
    setup: "Setup",
    workers: "Workers",
    inbox: "Inbox",
    work: "Work",
    connectors: "Knowledge",
    contacts: "Contacts",
    connections: "Connections",
    activity: "Activity",
    chat: "Chat",
  };

  function handleNavigate(section: string) {
    if (section === "docs") {
      window.open("/docs", "_blank", "noopener");
      return;
    }
    router.push(workspaceSectionToPath(section));
  }

  return (
    <AppShell
      railExpanded={railExpanded}
      rail={
        <IconRail
          role={role}
          activeSection={activeSection}
          onNavigate={handleNavigate}
          pendingApprovals={pendingCount}
          incompleteSetupSteps={incompleteSetupSteps}
          expanded={railExpanded}
          onToggleExpanded={toggleRail}
        />
      }
      header={
        <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Workspace
            </p>
            <p className="text-sm font-medium text-foreground">
              {sectionLabelMap[activeSection] ?? "Workspace"}
            </p>
          </div>
          {session?.membership.role === "admin" ? (
            <SetupHealthBadge userId={session.user.id} />
          ) : null}
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
