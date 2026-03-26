"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleDashed, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PilotSetupStep } from "../_lib/setup-progress";

type PilotSetupGuideProps = {
  variant?: "compact" | "detailed";
  storageKey: string;
  steps: PilotSetupStep[];
};

type GuideState = "expanded" | "dismissed" | "collapsed";

export function PilotSetupGuide({
  variant = "compact",
  storageKey,
  steps,
}: PilotSetupGuideProps) {
  const detailed = variant === "detailed";
  const [guideState, setGuideState] = useState<GuideState>("expanded");
  const completeCount = useMemo(
    () => steps.filter((step) => step.complete).length,
    [steps],
  );
  const allComplete = steps.length > 0 && completeCount === steps.length;

  useEffect(() => {
    try {
      const value = window.localStorage.getItem(storageKey);
      if (value === "dismissed") {
        setGuideState("dismissed");
        return;
      }
      if (value === "expanded") {
        setGuideState("expanded");
        return;
      }
      setGuideState(allComplete ? "collapsed" : "expanded");
    } catch {
      setGuideState(allComplete ? "collapsed" : "expanded");
    }
  }, [allComplete, storageKey]);

  function dismissGuide() {
    setGuideState("dismissed");
    try {
      window.localStorage.setItem(storageKey, "dismissed");
    } catch {}
  }

  function expandGuide() {
    setGuideState("expanded");
    try {
      window.localStorage.setItem(storageKey, "expanded");
    } catch {}
  }

  if (guideState === "dismissed") {
    return (
      <Card className="border-border bg-background/70">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div>
            <p className="text-sm font-medium text-foreground">Setup guide hidden</p>
            <p className="text-xs text-muted-foreground">
              {completeCount} of {steps.length} setup steps currently complete.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={expandGuide}>
            Show setup guide
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (guideState === "collapsed" && allComplete) {
    return (
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Setup complete</p>
            <p className="text-xs text-muted-foreground">
              All {steps.length} setup steps are complete. The guide stays available if you want to
              review the exact checklist again.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{completeCount}/{steps.length} complete</Badge>
            <Button variant="outline" size="sm" onClick={expandGuide}>
              View checklist
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissGuide}>
              Hide
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-sky-500/20 bg-sky-500/5">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Setup
            </p>
            <CardTitle className="mt-1 text-lg">Operator checklist inside the product</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Reliable setup should be legible and non-blocking. Use this guide, hide it when you
              want, and reopen it later from the same page.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {completeCount}/{steps.length} complete
            </Badge>
            <Badge variant="secondary">no-Google first</Badge>
            <Button variant="ghost" size="sm" onClick={dismissGuide}>
              <X className="mr-1 h-4 w-4" />
              Hide
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.id} className="rounded-lg border border-border bg-background/70 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="pt-0.5">
                    {step.complete ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : (
                      <CircleDashed className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      step.complete
                        ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                        : "border-border bg-muted/30 text-muted-foreground"
                    }
                  >
                    {step.complete ? "Complete" : "Incomplete"}
                  </Badge>
                  <Link href={step.href}>
                    <Button variant={step.complete ? "outline" : "default"} size="sm">
                      {step.ctaLabel}
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {detailed ? (
          <div className="rounded-lg border border-border bg-background/70 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Useful commands
            </p>
            <pre className="mt-3 overflow-x-auto rounded-md bg-muted px-3 py-3 text-xs text-foreground">
{`./scripts/test-forward-email.sh
./scripts/test-watched-inbox.sh
./scripts/test-smtp-send.sh
./scripts/public-try-verify.sh`}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              These scripts hit the real ingress and reviewed-send paths. They are the fastest way
              to rehearse a public self-hosted deployment after setup.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
