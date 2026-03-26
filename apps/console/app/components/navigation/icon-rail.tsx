"use client";

import {
  Activity,
  BookOpen,
  Contact,
  FolderSearch,
  Inbox,
  FileStack,
  Home,
  Link2,
  Settings2,
  Users,
} from "lucide-react";
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
}

function RailButton({
  section,
  isActive,
  onNavigate,
}: {
  section: RailSection;
  isActive: boolean;
  onNavigate: (id: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onNavigate(section.id)}
          className={[
            "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          ].join(" ")}
          aria-current={isActive ? "page" : undefined}
          aria-label={section.label}
        >
          {section.icon}
          {section.badge !== undefined && <NotificationBadge count={section.badge} />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {section.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function IconRail({ role, activeSection, onNavigate, pendingApprovals = 0, incompleteSetupSteps = 0, sections: externalSections }: IconRailProps) {
  const topSections: RailSection[] = [
    { id: "today", label: "Today", icon: <Home className="h-4 w-4" />, position: "top" },
    ...(role === "admin"
      ? [{
          id: "setup",
          label: "Setup",
          icon: <Settings2 className="h-4 w-4" />,
          ...(incompleteSetupSteps > 0 ? { badge: incompleteSetupSteps } : {}),
          position: "top" as const,
        }]
      : []),
    { id: "workers", label: "Workers", icon: <Users className="h-4 w-4" />, position: "top" },
    ...(pendingApprovals > 0
      ? [{ id: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" />, badge: pendingApprovals, position: "top" as const }]
      : [{ id: "inbox", label: "Inbox", icon: <Inbox className="h-4 w-4" />, position: "top" as const }]),
    { id: "work", label: "Work", icon: <FileStack className="h-4 w-4" />, position: "top" },
    { id: "connectors", label: "Knowledge", icon: <FolderSearch className="h-4 w-4" />, position: "top" },
    { id: "contacts", label: "Contacts", icon: <Contact className="h-4 w-4" />, position: "top" },
    { id: "connections", label: "Connections", icon: <Link2 className="h-4 w-4" />, position: "top" },
    { id: "activity", label: "Activity", icon: <Activity className="h-4 w-4" />, position: "top" },
  ];

  const bottomSections: RailSection[] = [
    { id: "docs", label: "Documentation", icon: <BookOpen className="h-4 w-4" />, position: "bottom" },
  ];

  // Use external sections if provided, otherwise use standard 1.0 shell
  if (externalSections) {
    const extTop = externalSections.filter((s) => s.position !== "bottom");
    const extBottom = externalSections.filter((s) => s.position === "bottom");
    return (
      <TooltipProvider delayDuration={300}>
        <nav className="flex h-full w-12 flex-col items-center border-r border-sidebar-border bg-sidebar py-3" aria-label="Main navigation">
          <div className="mb-4 flex h-8 w-8 items-center justify-center">
            <span className="text-xs font-bold tracking-tight text-sidebar-foreground/80">CB</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            {extTop.map((section) => (
              <RailButton key={section.id} section={section} isActive={activeSection === section.id} onNavigate={onNavigate} />
            ))}
          </div>
          <div className="flex-1" />
          <div className="flex flex-col items-center gap-1">
            {extBottom.map((section) => (
              <RailButton key={section.id} section={section} isActive={activeSection === section.id} onNavigate={onNavigate} />
            ))}
          </div>
        </nav>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <nav
        className="flex h-full w-12 flex-col items-center border-r border-sidebar-border bg-sidebar py-3"
        aria-label="Main navigation"
      >
        {/* Logo / Brand mark */}
        <div className="mb-4 flex h-8 w-8 items-center justify-center">
          <span className="text-xs font-bold tracking-tight text-sidebar-foreground/80">CB</span>
        </div>

        {/* Top sections — primary workspace nav */}
        <div className="flex flex-col items-center gap-1">
          {topSections.map((section) => (
            <RailButton
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom sections — documentation and other non-primary links */}
        <div className="flex flex-col items-center gap-1">
          {bottomSections.map((section) => (
            <RailButton
              key={section.id}
              section={section}
              isActive={activeSection === section.id}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>
    </TooltipProvider>
  );
}
