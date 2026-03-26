"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  getControlPlaneUrl,
  updateConnectionAttachedWorkers,
  updateWorkspaceActionCapability,
  type WorkspaceActionCapabilityRecord,
  type WorkspaceConnectionRecord,
  type WorkspaceInputRouteRecord,
} from "@/lib/control-plane";
import { useSession } from "@/hooks/use-session";

type PersonOption = {
  id: string;
  display_name: string;
};

type WorkerConfigPanelProps = {
  workerId: string;
  initialName: string;
  initialStatus: string;
  initialMemberIds: string[];
  initialAssigneeIds: string[];
  initialReviewerIds: string[];
  inputRoutes: WorkspaceInputRouteRecord[];
  connections: WorkspaceConnectionRecord[];
  actionCapabilities: WorkspaceActionCapabilityRecord[];
  usingFixtureFallback: boolean;
  people: PersonOption[];
};

export function WorkerConfigPanel({
  workerId,
  initialName,
  initialStatus,
  initialMemberIds,
  initialAssigneeIds,
  initialReviewerIds,
  inputRoutes,
  connections,
  actionCapabilities,
  usingFixtureFallback,
  people,
}: WorkerConfigPanelProps) {
  const router = useRouter();
  const { session } = useSession();
  const csrfToken = session?.csrf_token ?? null;
  const isAdmin = session?.membership.role === "admin";
  const canManage = isAdmin && Boolean(csrfToken) && !usingFixtureFallback;

  // Name editing
  const [editingName, setEditingName] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [savingName, setSavingName] = React.useState(false);

  // Status toggle
  const [status, setStatus] = React.useState(initialStatus);
  const [savingStatus, setSavingStatus] = React.useState(false);

  // People management
  const [memberIds, setMemberIds] = React.useState<string[]>(initialMemberIds);
  const [assigneeIds, setAssigneeIds] = React.useState<string[]>(initialAssigneeIds);
  const [reviewerIds, setReviewerIds] = React.useState<string[]>(initialReviewerIds);
  const [savingPeople, setSavingPeople] = React.useState(false);
  const [attachedConnectionIds, setAttachedConnectionIds] = React.useState<string[]>(
    connections
      .filter((connection) => connection.attached_worker_ids.includes(workerId))
      .map((connection) => connection.id),
  );
  const [savingConnections, setSavingConnections] = React.useState(false);
  const [actionBoundaryModes, setActionBoundaryModes] = React.useState<Record<string, "auto" | "ask_me" | "never">>(
    () =>
      Object.fromEntries(
        actionCapabilities.map((action) => [action.id, action.boundary_mode]),
      ) as Record<string, "auto" | "ask_me" | "never">,
  );
  const [savingActions, setSavingActions] = React.useState(false);

  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAttachedConnectionIds(
      connections
        .filter((connection) => connection.attached_worker_ids.includes(workerId))
        .map((connection) => connection.id),
    );
  }, [connections, workerId]);

  React.useEffect(() => {
    setActionBoundaryModes(
      Object.fromEntries(
        actionCapabilities.map((action) => [action.id, action.boundary_mode]),
      ) as Record<string, "auto" | "ask_me" | "never">,
    );
  }, [actionCapabilities]);

  async function patchWorker(body: Record<string, unknown>) {
    setError(null);
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }

    const response = await fetch(
      getControlPlaneUrl(`/api/workspace/workers/${workerId}`),
      {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? `Update failed with status ${response.status}.`);
    }

    return response.json();
  }

  async function handleSaveName() {
    if (!name.trim() || name.trim() === initialName) {
      setEditingName(false);
      setName(initialName);
      return;
    }

    setSavingName(true);
    try {
      await patchWorker({ name: name.trim() });
      setEditingName(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update name.");
    } finally {
      setSavingName(false);
    }
  }

  async function handleToggleStatus() {
    const nextStatus = status === "active" ? "paused" : "active";
    setSavingStatus(true);
    try {
      await patchWorker({ status: nextStatus });
      setStatus(nextStatus);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status.");
    } finally {
      setSavingStatus(false);
    }
  }

  function togglePerson(
    currentIds: string[],
    setIds: React.Dispatch<React.SetStateAction<string[]>>,
    personId: string,
  ) {
    if (currentIds.includes(personId)) {
      setIds(currentIds.filter((id) => id !== personId));
    } else {
      setIds([...currentIds, personId]);
    }
  }

  async function handleSavePeople() {
    setSavingPeople(true);
    try {
      await patchWorker({
        member_ids: memberIds,
        assignee_ids: assigneeIds,
        reviewer_ids: reviewerIds,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update people.");
    } finally {
      setSavingPeople(false);
    }
  }

  async function handleSaveConnections() {
    if (!csrfToken) {
      return;
    }

    setSavingConnections(true);
    setError(null);
    try {
      for (const connection of connections) {
        const wasAttached = connection.attached_worker_ids.includes(workerId);
        const shouldAttach = attachedConnectionIds.includes(connection.id);
        if (wasAttached === shouldAttach) {
          continue;
        }

        const nextAttachedWorkerIds = shouldAttach
          ? Array.from(new Set([...connection.attached_worker_ids, workerId]))
          : connection.attached_worker_ids.filter((id) => id !== workerId);

        await updateConnectionAttachedWorkers({
          connectionId: connection.id,
          csrfToken,
          attachedWorkerIds: nextAttachedWorkerIds,
        });
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update worker connections.");
    } finally {
      setSavingConnections(false);
    }
  }

  async function handleSaveActions() {
    if (!csrfToken) {
      return;
    }

    setSavingActions(true);
    setError(null);
    try {
      for (const action of actionCapabilities) {
        const nextBoundaryMode = actionBoundaryModes[action.id];
        if (!nextBoundaryMode || nextBoundaryMode === action.boundary_mode) {
          continue;
        }

        await updateWorkspaceActionCapability({
          actionCapabilityId: action.id,
          csrfToken,
          body: {
            boundary_mode: nextBoundaryMode,
          },
        });
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update action posture.");
    } finally {
      setSavingActions(false);
    }
  }

  function toggleConnection(connectionId: string) {
    setAttachedConnectionIds((current) =>
      current.includes(connectionId)
        ? current.filter((id) => id !== connectionId)
        : [...current, connectionId],
    );
  }

  const peopleChanged =
    JSON.stringify([...memberIds].sort()) !== JSON.stringify([...initialMemberIds].sort()) ||
    JSON.stringify([...assigneeIds].sort()) !== JSON.stringify([...initialAssigneeIds].sort()) ||
    JSON.stringify([...reviewerIds].sort()) !== JSON.stringify([...initialReviewerIds].sort());
  const initialAttachedConnectionIds = connections
    .filter((connection) => connection.attached_worker_ids.includes(workerId))
    .map((connection) => connection.id)
    .sort();
  const connectionsChanged =
    JSON.stringify([...attachedConnectionIds].sort()) !== JSON.stringify(initialAttachedConnectionIds);
  const actionsChanged = actionCapabilities.some(
    (action) => actionBoundaryModes[action.id] && actionBoundaryModes[action.id] !== action.boundary_mode,
  );
  const connectionsById = new Map(connections.map((connection) => [connection.id, connection]));
  const hasAttachedReadOnlyConnection = connections.some(
    (connection) =>
      connection.access_mode === "read_only"
      && attachedConnectionIds.includes(connection.id),
  );

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {/* Name editing */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Identity</CardTitle>
            {!editingName && isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingName(true)}
                disabled={!canManage}
              >
                Edit
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {editingName ? (
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <div className="flex gap-2">
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={savingName}
                />
                <Button size="sm" onClick={handleSaveName} disabled={savingName || !name.trim()}>
                  {savingName ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingName(false);
                    setName(initialName);
                  }}
                  disabled={savingName}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-foreground">{initialName}</p>
          )}
        </CardContent>
      </Card>

      {/* Status toggle */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Status</CardTitle>
            {isAdmin ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleStatus}
                disabled={savingStatus || !canManage}
              >
                {savingStatus
                  ? "Updating..."
                  : status === "active"
                    ? "Pause worker"
                    : "Activate worker"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <Badge variant={status === "active" ? "default" : "secondary"}>
            {status}
          </Badge>
        </CardContent>
      </Card>

      {/* People management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">People</CardTitle>
            {peopleChanged && isAdmin ? (
              <Button
                size="sm"
                onClick={handleSavePeople}
                disabled={savingPeople || !canManage}
              >
                {savingPeople ? "Saving..." : "Save changes"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <PeopleSelector
            title="Members"
            description="Team members who can see and interact with this worker."
            selectedIds={memberIds}
            people={people}
            disabled={!canManage}
            onToggle={(id) => togglePerson(memberIds, setMemberIds, id)}
          />
          <PeopleSelector
            title="Assignees"
            description="People who receive inbox items from this worker."
            selectedIds={assigneeIds}
            people={people}
            disabled={!canManage}
            onToggle={(id) => togglePerson(assigneeIds, setAssigneeIds, id)}
          />
          <PeopleSelector
            title="Reviewers"
            description="People who review actions before execution."
            selectedIds={reviewerIds}
            people={people}
            disabled={!canManage}
            onToggle={(id) => togglePerson(reviewerIds, setReviewerIds, id)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inputs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {inputRoutes.length > 0 ? (
            inputRoutes.map((route) => (
              <div key={route.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{route.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{route.description}</p>
                  </div>
                  <Badge variant="outline">{humanize(route.status)}</Badge>
                </div>
                {route.kind === "forward_email" && route.address ? (
                  <p className="mt-2 font-mono text-xs text-muted-foreground">{route.address}</p>
                ) : null}
                {route.kind === "watched_inbox" ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {hasAttachedReadOnlyConnection
                      ? "This route follows the read-only connection state. When connected, watched inbox becomes active."
                      : "Attach a read-only connection below to enable watched inbox for this worker."}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    This route is provisioned by the worker pack and managed in-product through worker install plus connection state.
                  </p>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No input routes configured yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Connections</CardTitle>
            {connectionsChanged && isAdmin ? (
              <Button
                size="sm"
                onClick={handleSaveConnections}
                disabled={savingConnections || !canManage}
              >
                {savingConnections ? "Saving..." : "Save changes"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {connections.length > 0 ? (
            connections.map((connection) => {
              const attached = attachedConnectionIds.includes(connection.id);
              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => {
                    if (canManage) {
                      toggleConnection(connection.id);
                    }
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    attached
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  } ${canManage ? "" : "cursor-default"}`}
                  disabled={!canManage}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{connection.label}</p>
                        <Badge variant="secondary">{humanize(connection.access_mode)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {connection.capabilities.join(", ")}
                      </p>
                      {connection.access_mode === "read_only" ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Attach this to let the worker consume watched inbox suggestions. Send uses a separate write-capable connection.
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant={attached ? "default" : "outline"}>
                        {attached ? "attached" : "detached"}
                      </Badge>
                      <Badge variant={connection.status === "connected" ? "default" : "secondary"}>
                        {humanize(connection.status)}
                      </Badge>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No workspace connections available yet.</p>
          )}
          {!isAdmin ? <p className="text-xs text-muted-foreground">Only workspace admins can attach connections.</p> : null}
          {usingFixtureFallback ? (
            <p className="text-xs text-muted-foreground">Connection edits are disabled while the page is using fixture fallback.</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Actions</CardTitle>
            {actionsChanged && isAdmin ? (
              <Button
                size="sm"
                onClick={handleSaveActions}
                disabled={savingActions || !canManage}
              >
                {savingActions ? "Saving..." : "Save changes"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionCapabilities.length > 0 ? (
            actionCapabilities.map((action) => {
              const destination = action.destination_connection_id
                ? connectionsById.get(action.destination_connection_id)?.label ?? action.destination_connection_id
                : null;

              return (
                <div key={action.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{humanize(action.kind)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {boundaryModeDescription(actionBoundaryModes[action.id] ?? action.boundary_mode)}
                      </p>
                      {destination ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Destination: {destination}
                        </p>
                      ) : null}
                    </div>
                    <div className="w-40 shrink-0">
                      <Label htmlFor={`boundary-${action.id}`} className="sr-only">
                        Boundary mode
                      </Label>
                      <Select
                        value={actionBoundaryModes[action.id] ?? action.boundary_mode}
                        onValueChange={(value: "auto" | "ask_me" | "never") => {
                          setActionBoundaryModes((current) => ({
                            ...current,
                            [action.id]: value,
                          }));
                        }}
                        disabled={!canManage}
                      >
                        <SelectTrigger id={`boundary-${action.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ask_me">Ask me</SelectItem>
                          <SelectItem value="auto">Auto</SelectItem>
                          <SelectItem value="never">Never</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">No actions configured for this worker.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PeopleSelector({
  title,
  description,
  selectedIds,
  people,
  disabled = false,
  onToggle,
}: {
  title: string;
  description: string;
  selectedIds: string[];
  people: PersonOption[];
  disabled?: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mb-2 text-xs text-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-1.5">
        {people.map((person) => {
          const isSelected = selectedIds.includes(person.id);
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => {
                if (!disabled) onToggle(person.id);
              }}
              className={`inline-flex items-center rounded-md border px-2 py-1 text-xs transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              } ${disabled ? "cursor-default opacity-80" : ""}`}
              disabled={disabled}
            >
              {person.display_name}
              {isSelected ? (
                <span className="ml-1 text-xs">&#10003;</span>
              ) : null}
            </button>
          );
        })}
        {people.length === 0 ? (
          <span className="text-xs text-muted-foreground">
            No workspace members found.
          </span>
        ) : null}
      </div>
    </div>
  );
}

function humanize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function boundaryModeDescription(mode: string): string {
  switch (mode) {
    case "auto":
      return "Executes automatically without review.";
    case "ask_me":
      return "Requires human review before execution.";
    case "never":
      return "Disabled. This action will never execute.";
    default:
      return "";
  }
}
