import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ExternalLink, FileStack } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { getArtifact } from "@/lib/control-plane";

interface ArtifactDetailPageProps {
  params: Promise<{ artifactId: string }>;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ArtifactBodyView({ body }: { body: Record<string, unknown> }) {
  const likelyCause = typeof body.likely_cause === "string" ? body.likely_cause : null;
  const impact = typeof body.impact === "string" ? body.impact : null;
  const owner = typeof body.owner === "string" ? body.owner : null;
  const recommendedActions = Array.isArray(body.recommended_actions)
    ? body.recommended_actions.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <div className="space-y-5">
      {likelyCause ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Likely cause
          </p>
          <p className="text-sm text-foreground">{likelyCause}</p>
        </div>
      ) : null}
      {impact ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Impact
          </p>
          <p className="text-sm text-foreground">{impact}</p>
        </div>
      ) : null}
      {recommendedActions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Recommended actions
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {recommendedActions.map((action, index) => (
              <li key={`${action}-${index}`} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {owner ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Suggested owner
          </p>
          <p className="text-sm text-foreground">{owner}</p>
        </div>
      ) : null}
      <details className="rounded-md border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Raw artifact data
        </summary>
        <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(body, null, 2)}
        </pre>
      </details>
    </div>
  );
}

async function ArtifactDetailContent({ artifactId }: { artifactId: string }) {
  const { artifact } = await getArtifact(artifactId);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <Button asChild size="sm" variant="ghost" className="gap-1.5 text-muted-foreground">
        <Link href="/workspace/work">
          <ArrowLeft className="h-4 w-4" />
          Back to artifacts
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <FileStack className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium uppercase tracking-widest">Artifact detail</span>
              </div>
              <CardTitle className="text-2xl">{artifact.title}</CardTitle>
              <CardDescription>{artifact.summary}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{artifact.kind}</Badge>
              <Badge variant={artifact.status === "created" ? "secondary" : "outline"}>
                {artifact.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Reference
              </p>
              <p className="text-sm text-foreground">{artifact.external_ref ?? "Pending"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Source provider
              </p>
              <p className="text-sm text-foreground">{artifact.source_provider}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Created
              </p>
              <p className="text-sm text-foreground">{formatTimestamp(artifact.created_at)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Updated
              </p>
              <p className="text-sm text-foreground">{formatTimestamp(artifact.updated_at)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-sm">
            {artifact.run_id ? (
              <Link
                href={`/workspace/runs/${artifact.run_id}`}
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                View linked trace
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}
            {artifact.review_request_id ? (
              <Link
                href={`/workspace/inbox?review=${artifact.review_request_id}`}
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                Open review
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>

          <Separator />

          <ArtifactBodyView body={artifact.body} />
        </CardContent>
      </Card>
    </div>
  );
}

function ArtifactDetailSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-10">
      <Skeleton className="h-8 w-40" />
      <div className="rounded-xl border bg-card p-6">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-2 h-8 w-96" />
        <Skeleton className="mt-3 h-4 w-80" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    </div>
  );
}

export default async function ArtifactDetailPage({ params }: ArtifactDetailPageProps) {
  const { artifactId } = await params;

  return (
    <Suspense fallback={<ArtifactDetailSkeleton />}>
      <ArtifactDetailContent artifactId={artifactId} />
    </Suspense>
  );
}
