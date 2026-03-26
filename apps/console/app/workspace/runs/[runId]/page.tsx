import { Skeleton } from "@/components/ui/skeleton";
import { getRun, getRunEvents } from "@/lib/control-plane";
import { RunTimeline } from "@/components/audit/run-timeline";
import { Suspense } from "react";

interface RunDetailPageProps {
  params: Promise<{ runId: string }>;
}

async function RunDetailContent({ runId }: { runId: string }) {
  const [run, { events }] = await Promise.all([getRun(runId), getRunEvents(runId)]);

  return <RunTimeline run={run} events={events} />;
}

function RunDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Skeleton className="mb-6 h-8 w-16" />
      <div className="mb-6 rounded-xl border bg-card p-6">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-2 h-5 w-96" />
        <div className="my-4 h-px bg-border" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="mt-1.5 h-2.5 w-2.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-72" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function RunDetailPage({ params }: RunDetailPageProps) {
  const { runId } = await params;

  return (
    <Suspense fallback={<RunDetailSkeleton />}>
      <RunDetailContent runId={runId} />
    </Suspense>
  );
}
