"use client";

import { useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RetrievalCitation } from "@/lib/control-plane";

export interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  citations?: RetrievalCitation[] | null;
  isStreaming?: boolean;
  className?: string;
}

export function ChatBubble({ role, content, citations, isStreaming, className }: ChatBubbleProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (role === "user") {
    return (
      <div className={cn("flex justify-end", className)}>
        <div
          className={cn(
            "max-w-[75%] rounded-2xl rounded-br-sm px-4 py-2.5",
            "bg-primary text-primary-foreground",
            isStreaming && "animate-pulse",
          )}
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl rounded-bl-sm border px-4 py-2.5",
          isStreaming
            ? "border-primary/30 bg-card animate-pulse"
            : "border-border bg-card",
        )}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {content}
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
          )}
        </p>
      </div>

      {/* Action row — only shown when not streaming */}
      {!isStreaming && content && (
        <div className="flex flex-col gap-2 pl-1">
          {citations && citations.length > 0 && (
            <div className="max-w-[75%] rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                  Sources
                </p>
                <Badge variant="outline" className="text-[10px]">
                  {citations.length}
                </Badge>
              </div>
              <div className="mt-2 space-y-2">
                {citations.map((citation) => (
                  <div key={citation.chunk_id} className="space-y-1">
                    <p className="text-xs font-medium text-foreground">
                      {citation.title ?? citation.path_or_uri}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{citation.path_or_uri}</p>
                    <p className="text-xs text-foreground/80">{citation.snippet}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-0.5">
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={handleCopy}
                    aria-label="Copy response"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{copied ? "Copied" : "Copy"}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    aria-label="Thumbs up"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Good response</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    aria-label="Thumbs down"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Bad response</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      )}
    </div>
  );
}
