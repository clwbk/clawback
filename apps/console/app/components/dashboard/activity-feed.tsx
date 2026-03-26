"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { listConversations, type ConversationRecord } from "@/lib/control-plane";

function formatRelativeTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

interface ActivityItem {
  id: string;
  description: string;
  timestamp: string | null;
}

function conversationsToActivity(conversations: ConversationRecord[]): ActivityItem[] {
  return conversations
    .slice()
    .sort((a, b) => {
      const ta = a.last_message_at ?? a.created_at ?? "";
      const tb = b.last_message_at ?? b.created_at ?? "";
      return tb.localeCompare(ta);
    })
    .slice(0, 10)
    .map((c) => ({
      id: c.id,
      description: c.title ? `Conversation: ${c.title}` : `Conversation started`,
      timestamp: c.last_message_at ?? c.created_at ?? null,
    }));
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listConversations()
      .then((res) => {
        if (!cancelled) {
          setItems(conversationsToActivity(res.conversations));
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load activity.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">{error}</p>;
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. Start a conversation to see it here.
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item, idx) => (
        <div key={item.id}>
          <div className="flex items-center justify-between gap-4 py-3">
            <p className="text-sm text-foreground truncate">{item.description}</p>
            <p className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {formatRelativeTime(item.timestamp)}
            </p>
          </div>
          {idx < items.length - 1 && <Separator />}
        </div>
      ))}
    </div>
  );
}
