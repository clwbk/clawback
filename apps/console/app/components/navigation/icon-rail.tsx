"use client";

import {
  Activity,
  BookOpen,
  ChevronLeft,
  Contact,
  FolderSearch,
  Inbox,
  FileStack,
  Home,
  Link2,
  Menu,
  MessageSquare,
  Settings2,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NotificationBadge } from "./notification-badge";

export interface RailSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  position?: "top" | "bottom";
}

interface IconRailProps {
  role: "admin" | "user";
  activeSection: string;
  onNavigate: (section: string) => void;
  pendingApprovals?: number;
  incompleteSetupSteps?: number;
  sections?: RailSection[];
  expanded?: boolean;
  onToggleExpanded?: (() => void) | undefined;
}

function RailButton({
  section,
  isActive,
  onNavigate,
  expanded,
}: {
  section: RailSection;
  isActive: boolean;
  onNavigate: (id: string) => void;
  expanded: boolean;
}) {
  const badgeCount =
    section.badge !== undefined ? (section.badge > 99 ? "99+" : String(section.badge)) : null;

  const button = (
    <button
      type="button"
      onClick={() => onNavigate(section.id)}
      className={cn(
        "relative flex items-center rounded-lg transition-colors",
        expanded ? "h-10 w-full gap-3 px-3 text-left" : "h-8 w-8 justify-center rounded-md",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
      )}
      aria-current={isActive ? "page" : undefined}
      aria-label={section.label}
    >
      <span className="shrink-0">{section.icon}</span>
      {expanded ? (
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{section.label}</span>
      ) : null}
      {section.badge !== undefined
        ? expanded
          ? (
              <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                {badgeCount}
              </span>
            )
          : <NotificationBadge count={section.badge} />
        : null}
    </button>
  );

  if (expanded) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {section.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function IconRail({
  role,
  activeSection,
  onNavigate,
  pendingApprovals = 0,
  incompleteSetupSteps = 0,
  sections: externalSections,
  expanded = false,
  onToggleExpanded,
}: IconRailProps) {
  const topSections: RailSection[] = [
    { id: "today", label: "Today", icon: <Home className="h-4 w-4" />, position: "top" },
    ...(pendingApprovals > 0
      ? [{ id: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" />, badge: pendingApprovals, position: "top" as const }]
      : [{ id: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" />, position: "top" as const }]),
    { id: "work", label: "Work", icon: <FileStack className="h-4 w-4" />, position: "top" },
    { id: "chat", label: "Chat", icon: <MessageSquare className="h-4 w-4" />, position: "top" },
    { id: "workers", label: "Workers", icon: <Users className="h-4 w-4" />, position: "top" },
    { id: "connectors", label: "Knowledge", icon: <FolderSearch className="h-4 w-4" />, position: "top" },
    { id: "connections", label: "Connections", icon: <Link2 className="h-4 w-4" />, position: "top" },
    { id: "contacts", label: "Contacts", icon: <Contact className="h-4 w-4" />, position: "top" },
  ];

  const bottomSections: RailSection[] = [
    { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" />, position: "bottom" },
    ...(role === "admin"
      ? [{
          id: "setup",
          label: "Setup",
          icon: <Settings2 className="h-4 w-4" />,
          ...(incompleteSetupSteps > 0 ? { badge: incompleteSetupSteps } : {}),
          position: "bottom" as const,
        }]
      : []),
    { id: "docs", label: "Documentation", icon: <BookOpen className="h-4 w-4" />, position: "bottom" },
  ];

  // Use external sections if provided, otherwise use standard 1.0 shell
  if (externalSections) {
    const extTop = externalSections.filter((s) => s.position !== "bottom");
    const extBottom = externalSections.filter((s) => s.position === "bottom");
    return (
      <TooltipProvider delayDuration={300}>
        <nav
          className={cn(
            "flex h-full flex-col border-r border-sidebar-border bg-sidebar py-3 transition-[width] duration-200 ease-out",
            expanded ? "w-full px-2" : "w-12 items-center",
          )}
          aria-label="Main navigation"
        >
          <RailHeader expanded={expanded} onToggleExpanded={onToggleExpanded} />
          <div className={cn("flex flex-col gap-1", expanded ? "px-0" : "items-center")}>
            {extTop.map((section) => (
              <RailButton
                key={section.id}
                section={section}
                isActive={activeSection === section.id}
                onNavigate={onNavigate}
                expanded={expanded}
              />
            ))}
          </div>
          <div className="flex-1" />
          <div className={cn("flex flex-col gap-1", expanded ? "px-0" : "items-center")}>
            {extBottom.map((section) => (
              <RailButton
                key={section.id}
                section={section}
                isActive={activeSection === section.id}
                onNavigate={onNavigate}
                expanded={expanded}
              />
            ))}
          </div>
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className={cn(
          "flex h-full flex-col border-r border-sidebar-border bg-sidebar py-3 transition-[width] duration-200 ease-out",
          expanded ? "w-full px-2" : "w-12 items-center",
        )}
        aria-label="Main navigation"
      >
        <RailHeader expanded={expanded} onToggleExpanded={onToggleExpanded} />

        {/* Top sections — primary workspace nav */}
        <div className={cn("flex flex-col gap-1", expanded ? "px-0" : "items-center")}>
          {topSections.map((section) => (
            <RailButton
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              onNavigate={onNavigate}
              expanded={expanded}
            />
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom sections — documentation and other non-primary links */}
        <div className={cn("flex flex-col gap-1", expanded ? "px-0" : "items-center")}>
          {bottomSections.map((section) => (
            <RailButton
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              onNavigate={onNavigate}
              expanded={expanded}
            />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  );
}

function RailHeader({
  expanded,
  onToggleExpanded,
}: {
  expanded: boolean;
  onToggleExpanded?: (() => void) | undefined;
}) {
  const toggleLabel = expanded ? "Collapse navigation" : "Expand navigation";

  if (expanded) {
    return (
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent/40 text-xs font-bold tracking-tight text-sidebar-foreground">
            CB
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
              Workspace
            </p>
            <p className="truncate text-sm font-medium text-sidebar-foreground">Clawback</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          aria-label={toggleLabel}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
        aria-label={toggleLabel}
      >
        <Menu className="h-4 w-4" />
      </button>
      <div className="flex h-8 w-8 items-center justify-center rounded-md">
        <span className="text-xs font-bold tracking-tight text-sidebar-foreground/80">CB</span>
      </div>
    </div>
  );
}
