"use client";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

import { InstallWorkerDialog } from "./install-worker-dialog";

export function AddWorkerButton() {
  const { session, loading } = useSession();
  const isAdmin = session?.membership.role === "admin";

  if (loading || !isAdmin) {
    return null;
  }

  return (
    <InstallWorkerDialog>
      <Button>Add worker</Button>
    </InstallWorkerDialog>
  );
}
