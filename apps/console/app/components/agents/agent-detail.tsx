"use client";

import { ShieldCheck, Sparkles } from "lucide-react";

import { suggestAssistantTemplate } from "@/lib/assistant-templates";
import { incidentCopilotToolCatalog } from "@/lib/tool-catalog";
import type {
  AgentDraftDetail,
  AgentRecord,
  AuthenticatedSession,
  ConnectorRecord,
} from "@/lib/control-plane";
import { VersionBadge } from "@/components/shared/version-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

interface AgentDetailProps {
  agent: AgentRecord;
  draft: AgentDraftDetail | null;
  loadingDraft: boolean;
  editorName: string;
  editorModel: string;
  editorInstructions: string;
  selectedToolIds: string[];
  availableConnectors: ConnectorRecord[];
  connectorPolicyEnabled: boolean;
  selectedConnectorIds: string[];
  savingAgent: boolean;
  publishingAgent: boolean;
  canEdit: boolean;
  session: AuthenticatedSession | null;
  onNameChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onInstructionsChange: (value: string) => void;
  onSelectedToolIdsChange: (value: string[]) => void;
  onConnectorPolicyEnabledChange: (value: boolean) => void;
  onSelectedConnectorIdsChange: (value: string[]) => void;
  onSave: () => void;
  onPublish: () => void;
  onBack: () => void;
}

function capabilityBoundaryLabel(toolId: string) {
  const tool = incidentCopilotToolCatalog.find((candidate) => candidate.id === toolId);
  if (!tool) {
    return { label: "Auto", tone: "border-zinc-200 bg-zinc-100 text-zinc-700" };
  }
  if (tool.approval === "workspace_admin") {
    return { label: "Ask before acting", tone: "border-amber-200 bg-amber-50 text-amber-800" };
  }
  if (tool.riskClass === "guarded") {
    return { label: "Auto within context", tone: "border-blue-200 bg-blue-50 text-blue-700" };
  }
  return { label: "Auto", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

export function AgentDetail({
  agent,
  draft,
  loadingDraft,
  editorName,
  editorModel,
  editorInstructions,
  selectedToolIds,
  availableConnectors,
  connectorPolicyEnabled,
  selectedConnectorIds,
  savingAgent,
  publishingAgent,
  canEdit,
  session,
  onNameChange,
  onModelChange,
  onInstructionsChange,
  onSelectedToolIdsChange,
  onConnectorPolicyEnabledChange,
  onSelectedConnectorIdsChange,
  onSave,
  onPublish,
  onBack,
}: AgentDetailProps) {
  const canPublish = canEdit && draft !== null && !publishingAgent;
  const canManageConnectors = canEdit && session?.membership.role === "admin";
  const suggestedTemplate = suggestAssistantTemplate({
    agentName: agent.name,
    selectedToolIds,
  });
  const templateBadge = suggestedTemplate?.badge ?? "General";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
              ← Back
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold text-foreground">{agent.name}</h2>
                <VersionBadge agent={agent} />
                <Badge variant="outline">{templateBadge}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Templates shape the setup. Chat stays first-class. Structured work and reviews show
                up as the assistant produces artifacts.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                onClick={onSave}
                disabled={savingAgent || loadingDraft}
              >
                {savingAgent ? "Saving…" : "Save changes"}
              </Button>
            ) : null}
            <Button size="sm" onClick={onPublish} disabled={!canPublish}>
              {publishingAgent ? "Publishing…" : "Publish update"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Tabs defaultValue="setup" className="flex flex-col gap-4">
              <TabsList className="w-fit">
                <TabsTrigger value="setup">Setup</TabsTrigger>
                <TabsTrigger value="behavior">Behavior</TabsTrigger>
                <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
                <TabsTrigger value="boundaries">Boundaries</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="setup" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Assistant identity</CardTitle>
                    <CardDescription>
                      Give this assistant a clear job and keep the setup lightweight.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="agent-name">Name</Label>
                      <Input
                        id="agent-name"
                        value={editorName}
                        onChange={(event) => onNameChange(event.target.value)}
                        disabled={!canEdit || savingAgent}
                        placeholder="Assistant name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="agent-model">Model</Label>
                      <Input
                        id="agent-model"
                        value={editorModel}
                        onChange={(event) => onModelChange(event.target.value)}
                        disabled={!canEdit || savingAgent || loadingDraft}
                        placeholder="gpt-4.1-mini"
                      />
                      <p className="text-xs text-muted-foreground">
                        The runtime stays flexible; this is just the default route for this assistant.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <CardTitle>Suggested starting point</CardTitle>
                    </div>
                    <CardDescription>
                      The current setup looks closest to this template.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{suggestedTemplate?.badge ?? "General"}</Badge>
                      <p className="text-sm font-medium text-foreground">
                        {suggestedTemplate?.name ?? "Blank Assistant"}
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {suggestedTemplate?.summary ??
                        "Start with a narrow role, connected knowledge, and clear review boundaries."}
                    </p>
                    <div className="grid gap-4 text-sm md:grid-cols-3">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Scope
                        </p>
                        <p className="mt-1 text-foreground">{agent.scope}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Status
                        </p>
                        <p className="mt-1 text-foreground">{agent.status}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Connected knowledge
                        </p>
                        <p className="mt-1 text-foreground">
                          {connectorPolicyEnabled ? selectedConnectorIds.length : 0}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="behavior" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Behavior instructions</CardTitle>
                    <CardDescription>
                      Use plain language. The builder/admin chat layer can help later, but these
                      instructions remain the visible source of truth.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      id="agent-instructions"
                      value={editorInstructions}
                      onChange={(event) => onInstructionsChange(event.target.value)}
                      disabled={!canEdit || savingAgent}
                      placeholder="Describe how this assistant should behave…"
                      className="min-h-[280px] resize-none font-mono text-sm"
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="knowledge" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Knowledge sources</CardTitle>
                    <CardDescription>
                      Connect the folders and docs this assistant should search before answering or
                      drafting work.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!canManageConnectors ? (
                      <p className="text-sm text-muted-foreground">
                        Knowledge management is currently an admin setup task. Once sources are
                        connected, other users can still work with the assistant in chat.
                      </p>
                    ) : availableConnectors.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        No knowledge sources connected yet. Add one from the Knowledge page.
                      </p>
                    ) : (
                      <>
                        <label className="flex items-center gap-3 rounded-lg border border-border px-4 py-3">
                          <input
                            type="checkbox"
                            checked={connectorPolicyEnabled}
                            disabled={!canEdit || savingAgent}
                            onChange={(event) =>
                              onConnectorPolicyEnabledChange(event.target.checked)
                            }
                            className="h-4 w-4 rounded border-border bg-background"
                          />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">
                              Search connected knowledge before answering
                            </p>
                            <p className="text-xs text-muted-foreground">
                              When off, the assistant behaves like a general chat assistant.
                            </p>
                          </div>
                        </label>
                        <div className="grid gap-3 md:grid-cols-2">
                          {availableConnectors.map((connector) => {
                            const checked = selectedConnectorIds.includes(connector.id);
                            return (
                              <label
                                key={connector.id}
                                className="flex items-start gap-3 rounded-lg border border-border px-4 py-3"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={!canEdit || savingAgent || !connectorPolicyEnabled}
                                  onChange={(event) => {
                                    if (event.target.checked) {
                                      onSelectedConnectorIdsChange([
                                        ...selectedConnectorIds,
                                        connector.id,
                                      ]);
                                      return;
                                    }

                                    onSelectedConnectorIdsChange(
                                      selectedConnectorIds.filter(
                                        (connectorId) => connectorId !== connector.id,
                                      ),
                                    );
                                  }}
                                  className="mt-1 h-4 w-4 rounded border-border bg-background"
                                />
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {connector.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {connector.config.root_path}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="boundaries" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <CardTitle>Capability boundaries</CardTitle>
                    </div>
                    <CardDescription>
                      Capabilities determine what this assistant can do. Boundaries determine when
                      it can do it automatically and when it must stop for review.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {incidentCopilotToolCatalog.map((tool) => {
                      const checked = selectedToolIds.includes(tool.id);
                      const boundary = capabilityBoundaryLabel(tool.id);

                      return (
                        <label
                          key={tool.id}
                          className="flex items-start gap-3 rounded-lg border border-border px-4 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!canEdit || savingAgent}
                            onChange={(event) => {
                              if (event.target.checked) {
                                onSelectedToolIdsChange([...selectedToolIds, tool.id]);
                                return;
                              }

                              onSelectedToolIdsChange(
                                selectedToolIds.filter((toolId) => toolId !== tool.id),
                              );
                            }}
                            className="mt-1 h-4 w-4 rounded border-border bg-background"
                          />
                          <div className="min-w-0 flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{tool.label}</p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${boundary.tone}`}
                              >
                                {boundary.label}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">{tool.summary}</p>
                          </div>
                        </label>
                      );
                    })}
                    {selectedToolIds.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        This assistant is currently chat-and-draft only. Add capabilities when you
                        want it to take governed actions.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="preview" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>How this assistant will feel</CardTitle>
                    <CardDescription>
                      The product layers stay consistent: chat for exploration, workbench for
                      structured work, review for meaningful actions.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border/80 p-4">
                        <p className="text-sm font-medium text-foreground">1. Chat</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ask questions, refine drafts, and keep work moving conversationally.
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/80 p-4">
                        <p className="text-sm font-medium text-foreground">2. Workbench</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Structured outputs surface as artifacts instead of disappearing into
                          chat bubbles.
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/80 p-4">
                        <p className="text-sm font-medium text-foreground">3. Review</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Risky actions stop for a human decision before anything real happens.
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Starter prompts
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(suggestedTemplate?.starterPrompts ?? []).map((prompt) => (
                          <Badge key={prompt} variant="outline" className="px-3 py-1">
                            {prompt}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Publish posture</CardTitle>
                <CardDescription>
                  Draft changes stay editable until you publish a new version.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Draft loaded</span>
                  <span className="text-foreground">{loadingDraft ? "Loading…" : draft ? "Yes" : "No"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Published version</span>
                  <span className="text-foreground">
                    {agent.published_version?.version_number ?? "Not published"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Current scope</span>
                  <span className="text-foreground">{agent.scope}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next good move</CardTitle>
                <CardDescription>
                  A simple assistant setup sequence keeps the product powerful without feeling
                  enterprisey.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>1. Give the assistant one clear job.</p>
                <p>2. Connect the knowledge it needs.</p>
                <p>3. Decide which actions should pause for review.</p>
                <p>4. Publish and test it in chat.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
