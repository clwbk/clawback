import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  label: string;
  value: number | string | null;
  loading?: boolean;
}

export function StatCard({ label, value, loading = false }: StatCardProps) {
  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      {loading ? (
        <Skeleton className="h-8 w-16" />
      ) : (
        <p className="text-3xl font-semibold text-foreground tabular-nums">
          {value ?? "—"}
        </p>
      )}
    </div>
  );
}
