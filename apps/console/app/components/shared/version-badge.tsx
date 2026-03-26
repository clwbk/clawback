"use client";

import { Badge } from "@/components/ui/badge";
import type { AgentRecord } from "@/lib/control-plane";

interface VersionBadgeProps {
  agent: Pick<AgentRecord, "published_version" | "draft_version">;
}

export function VersionBadge({ agent }: VersionBadgeProps) {
  const { published_version, draft_version } = agent;

  if (published_version) {
    return (
      <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20">
        v{published_version.version_number}
      </Badge>
    );
  }

  if (draft_version) {
    return (
      <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/20 border-amber-500/20">
        draft
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      unpublished
    </Badge>
  );
}
