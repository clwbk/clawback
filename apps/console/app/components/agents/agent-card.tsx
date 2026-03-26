"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { VersionBadge } from "@/components/shared/version-badge";
import type { AgentRecord } from "@/lib/control-plane";

interface AgentCardProps {
  agent: AgentRecord;
  selected?: boolean;
  onSelect: (agentId: string) => void;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export function AgentCard({ agent, selected, onSelect }: AgentCardProps) {
  const statusLabel = agent.published_version ? "Published" : "Draft only";

  return (
    <Card
      onClick={() => onSelect(agent.id)}
      className={[
        "cursor-pointer transition-all duration-150 select-none",
        "hover:shadow-md hover:-translate-y-0.5",
        selected
          ? "ring-2 ring-primary border-primary/50"
          : "border-border hover:border-primary/30",
      ].join(" ")}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {getInitials(agent.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="truncate font-semibold text-foreground leading-tight">{agent.name}</p>
              <VersionBadge agent={agent} />
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  agent.scope === "shared"
                    ? "text-sky-400 border-sky-500/30 bg-sky-500/10"
                    : "text-muted-foreground"
                }
              >
                {agent.scope}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs text-muted-foreground">{agent.slug}</p>
          <Badge variant="outline" className="text-[11px]">
            {statusLabel}
          </Badge>
        </div>
        <p className="mt-2 text-xs text-muted-foreground/70">
          {agent.published_version
            ? `Published ${new Date(agent.published_version.published_at ?? agent.published_version.created_at).toLocaleDateString()}`
            : "Create and publish when the setup feels right."}
        </p>
      </CardContent>
    </Card>
  );
}
