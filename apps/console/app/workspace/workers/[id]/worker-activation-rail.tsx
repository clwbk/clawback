import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  PlugZap,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  WorkerActivationStep,
  WorkerActivationStepId,
} from "./worker-activation";
import { WorkerDemoTriggerButton } from "./worker-demo-trigger-button";

type WorkerActivationRailProps = {
  workerId: string;
  steps: WorkerActivationStep[];
  usingFixtureFallback?: boolean;
  disableLiveActions?: boolean;
};

const stepIcons: Record<WorkerActivationStepId, LucideIcon> = {
  people: Users,
  routes: RadioTower,
  connections: PlugZap,
  actions: ShieldCheck,
  proof: Sparkles,
};

export function WorkerActivationRail({
  workerId,
  steps,
  usingFixtureFallback = false,
  disableLiveActions = false,
}: WorkerActivationRailProps) {
  const completeCount = steps.filter((step) => step.complete).length;
  const allComplete = steps.length > 0 && completeCount === steps.length;

  return (
    <Card
      className={
        allComplete
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-sky-500/20 bg-sky-500/5"
      }
    >
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Activation
            </p>
            <CardTitle className="mt-1 text-base">
              Bring This Worker Live
            </CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Follow the same worker, route, connection, and action model the
              product uses in normal operation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={allComplete ? "default" : "outline"}>
              {completeCount}/{steps.length} ready
            </Badge>
            {usingFixtureFallback ? (
              <Badge variant="secondary">fixture fallback</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {steps.map((step) => {
          const Icon = stepIcons[step.id];

          return (
            <div
              key={step.id}
              className="rounded-lg border border-border bg-background/80 p-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    step.complete
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-foreground">
                      {step.title}
                    </p>
                    <Badge
                      variant="outline"
                      className={
                        step.complete
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }
                    >
                      {step.complete ? "Ready" : "Next"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {step.complete ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <CircleDashed className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {step.complete ? "Looks good" : "Needs attention"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {step.demo_action === "forward_email_sample" &&
                  step.complete ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={step.href}>{step.ctaLabel}</Link>
                    </Button>
                  ) : step.demo_action !== "forward_email_sample" ? (
                    <Button
                      asChild
                      size="sm"
                      variant={step.complete ? "outline" : "default"}
                    >
                      <Link href={step.href}>{step.ctaLabel}</Link>
                    </Button>
                  ) : null}
                  {step.demo_action === "forward_email_sample" ? (
                    <WorkerDemoTriggerButton
                      workerId={workerId}
                      label={step.demoCtaLabel ?? "Run sample activity"}
                      usingFixtureFallback={disableLiveActions}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {usingFixtureFallback ? (
          <p className="text-xs text-muted-foreground">
            This guide is still useful in fixture mode, but edits and live
            provider setup stay disabled until the control plane is available.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
