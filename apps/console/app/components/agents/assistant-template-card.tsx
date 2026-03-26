"use client";

import { Sparkles } from "lucide-react";

import type { AssistantTemplateDefinition } from "@/lib/assistant-templates";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AssistantTemplateCardProps {
  template: AssistantTemplateDefinition;
  onUse: (templateId: string) => void;
}

export function AssistantTemplateCard({ template, onUse }: AssistantTemplateCardProps) {
  return (
    <Card className="border-border/80 bg-card/70">
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <Badge variant="outline">{template.badge}</Badge>
            <CardTitle className="text-base">{template.name}</CardTitle>
          </div>
          <div className="rounded-full bg-primary/10 p-2 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{template.summary}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Starter prompts
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {template.starterPrompts.slice(0, 2).map((prompt) => (
              <li key={prompt} className="line-clamp-2">
                {prompt}
              </li>
            ))}
          </ul>
        </div>
        <Button className="w-full" variant="outline" onClick={() => onUse(template.id)}>
          Use template
        </Button>
      </CardContent>
    </Card>
  );
}
