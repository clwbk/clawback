"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { listWorkerPacks, installWorkerPack } from "@/lib/control-plane";
import type { WorkerPackListItem } from "@clawback/contracts";
import { useSession } from "@/hooks/use-session";

export function InstallWorkerDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const [open, setOpen] = React.useState(false);
  const [packs, setPacks] = React.useState<WorkerPackListItem[]>([]);
  const [loadingPacks, setLoadingPacks] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedPackId, setSelectedPackId] = React.useState<string>("");
  const [workerName, setWorkerName] = React.useState("");
  const [installing, setInstalling] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedPack = packs.find((p) => p.id === selectedPackId);

  function resetForm() {
    setSelectedPackId("");
    setWorkerName("");
    setError(null);
    setLoadError(null);
    setInstalling(false);
  }

  async function fetchPacks() {
    setLoadingPacks(true);
    setLoadError(null);
    try {
      const result = await listWorkerPacks();
      setPacks(result.packs);
    } catch {
      setPacks([]);
      setLoadError("Could not load worker templates from registry. Is the control plane running?");
    } finally {
      setLoadingPacks(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      fetchPacks();
    } else {
      resetForm();
    }
  }

  function handlePackSelect(packId: string) {
    setSelectedPackId(packId);
    const pack = packs.find((p) => p.id === packId);
    if (pack && !workerName) {
      setWorkerName(pack.name);
    }
  }

  async function handleInstall() {
    if (!selectedPackId || !workerName.trim() || !csrfToken) {
      setError("Please select a template and enter a name.");
      return;
    }

    setInstalling(true);
    setError(null);

    try {
      const result = await installWorkerPack({
        packId: selectedPackId,
        ...(workerName.trim() !== selectedPack?.name ? { name: workerName.trim() } : {}),
        csrfToken,
      });
      setOpen(false);
      resetForm();
      router.push(`/workspace/workers/${result.worker_id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install worker. Please try again.");
      setInstalling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Add worker</DialogTitle>
            <HelpTooltip content="Installing a worker provisions the pack-owned routes and actions for that role. After install, open the worker page to assign people, attach Gmail, and confirm the action posture." />
          </div>
          <DialogDescription>
            Choose a worker template and configure its identity.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="worker-template">Template</Label>
            {loadError ? (
              <p className="text-xs text-destructive">{loadError}</p>
            ) : loadingPacks ? (
              <p className="text-xs text-muted-foreground">Loading templates...</p>
            ) : (
              <Select value={selectedPackId} onValueChange={handlePackSelect}>
                <SelectTrigger id="worker-template">
                  <SelectValue placeholder="Select a template..." />
                </SelectTrigger>
                <SelectContent>
                  {packs.map((pack) => (
                    <SelectItem key={pack.id} value={pack.id} disabled={pack.stability === "experimental"}>
                      <span className="flex items-center gap-2">
                        {pack.name}
                        {pack.stability === "experimental" ? (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">Coming soon</Badge>
                        ) : null}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedPack ? (
              <p className="text-xs text-muted-foreground">{selectedPack.summary}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="worker-name">Name</Label>
            <Input
              id="worker-name"
              placeholder="e.g. Client Follow-Up"
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
            />
          </div>

          {selectedPack && selectedPack.supported_input_routes.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Input routes</p>
              <div className="flex flex-wrap gap-1">
                {selectedPack.supported_input_routes.map((route) => (
                  <Badge key={route.kind} variant="secondary" className="text-xs">
                    {route.label}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {selectedPack && selectedPack.action_capabilities.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Actions</p>
              <div className="flex flex-wrap gap-1">
                {selectedPack.action_capabilities.map((action) => (
                  <Badge key={action.kind} variant="secondary" className="text-xs">
                    {action.kind.replace(/_/g, " ")} ({action.default_boundary_mode.replace(/_/g, " ")})
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {selectedPack ? (
            <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
              After install:
              <span className="block mt-1">
                1. open the worker page, 2. assign members / assignees / reviewers,{" "}
                {selectedPack.supported_input_routes.some((r) => r.kind === "watched_inbox")
                  ? "3. attach the read-only connection if the worker uses watched inbox, 4. "
                  : "3. "}
                confirm the action boundary mode.
              </span>
            </div>
          ) : null}

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={installing}>
            Cancel
          </Button>
          <Button onClick={handleInstall} disabled={installing || !selectedPackId || !workerName.trim()}>
            {installing ? "Installing..." : "Install worker"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
