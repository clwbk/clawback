"use client";

import Link from "next/link";
import { Shield, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function BoundariesPage() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-44 rounded-xl" />
      </div>
    );
  }

  if (session?.membership.role !== "admin") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>
              Boundaries are managed by workspace admins in the current product.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          Legacy interface. Boundary configuration now lives in worker settings.{" "}
          <Link href="/workspace/workers" className="font-medium underline underline-offset-2">Go to Workers &rarr;</Link>
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-foreground">Boundaries</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            This is where Clawback will make review posture and action boundaries explicit across
            assistants, packs, and channels.
          </p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <CardTitle>Boundary controls are being promoted</CardTitle>
            </div>
            <CardDescription>
              The current console already enforces review-gated actions. This screen is the future
              home for safer, more visible boundary configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-border/70 p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <SlidersHorizontal className="h-4 w-4" />
                  <p className="font-medium">Today</p>
                </div>
                <p className="mt-2">
                  Configure capability posture inside assistant detail and resolve governed actions
                  from the reviews queue.
                </p>
              </div>
              <div className="rounded-lg border border-border/70 p-4">
                <div className="flex items-center gap-2 text-foreground">
                  <ShieldCheck className="h-4 w-4" />
                  <p className="font-medium">Next</p>
                </div>
                <p className="mt-2">
                  Make safe, review-gated, and blocked behaviors visible at the shell level across
                  packs and approval surfaces.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/workspace/workers">Open assistants</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/workspace/inbox">Open reviews</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
