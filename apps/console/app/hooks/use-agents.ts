"use client";

import { useEffect, useState } from "react";
import {
  createAgent,
  getAgentDraft,
  listConnectors,
  listAgents,
  publishAgent,
  updateAgent,
  updateAgentDraft,
  type AgentDraftDetail,
  type AgentRecord,
  type AuthenticatedSession,
  type ConnectorRecord,
} from "@/lib/control-plane";
import type { AssistantTemplateDraft } from "@/lib/assistant-templates";
import { buildDraftToolPolicy } from "@/lib/tool-catalog";
import { resolvePreferredSelectionId } from "@/lib/workspace-navigation";

type Notice = {
  tone: "error" | "success" | "info";
  message: string;
};

export interface AgentHandlers {
  createAgent: (params: {
    name: string;
    scope: "personal" | "shared";
    session: AuthenticatedSession;
    templateDraft?: AssistantTemplateDraft | null;
  }) => Promise<void>;
  saveAgent: (params: {
    agentId: string;
    session: AuthenticatedSession;
    editorName: string;
    editorInstructions: string;
    editorModel: string;
    selectedToolIds: string[];
    connectorPolicyEnabled: boolean;
    selectedConnectorIds: string[];
    selectedAgent: AgentRecord;
    selectedDraft: AgentDraftDetail | null;
    canEdit: boolean;
  }) => Promise<void>;
  publishAgent: (params: {
    agentId: string;
    session: AuthenticatedSession;
    draftId: string;
  }) => Promise<void>;
  selectAgent: (agentId: string | null) => void;
  refreshAgents: (preferredAgentId?: string | null) => Promise<void>;
}

export interface AgentsState {
  agents: AgentRecord[];
  selectedAgentId: string | null;
  selectedAgent: AgentRecord | null;
  selectedDraft: AgentDraftDetail | null;
  editorName: string;
  editorInstructions: string;
  editorModel: string;
  selectedToolIds: string[];
  availableConnectors: ConnectorRecord[];
  connectorPolicyEnabled: boolean;
  selectedConnectorIds: string[];
  loadingDraft: boolean;
  creatingAgent: boolean;
  savingAgent: boolean;
  publishingAgent: boolean;
  canEditSelectedAgent: boolean;
}

function agentCanBeEdited(session: AuthenticatedSession | null, agent: AgentRecord | null) {
  if (!session || !agent) return false;
  if (session.membership.role === "admin") return true;
  return agent.owner_user_id === session.user.id;
}

export function useAgents(
  session: AuthenticatedSession | null,
  sessionLoading: boolean,
  onNotice: (notice: Notice | null) => void,
  onLocationChange: (agentId: string | null, conversationId: string | null) => void,
  requestedAgentId?: string | null,
) {
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<AgentDraftDetail | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const [editorName, setEditorName] = useState("");
  const [editorInstructions, setEditorInstructions] = useState("");
  const [editorModel, setEditorModel] = useState("gpt-4.1-mini");
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [availableConnectors, setAvailableConnectors] = useState<ConnectorRecord[]>([]);
  const [connectorPolicyEnabled, setConnectorPolicyEnabled] = useState(false);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<string[]>([]);

  const [creatingAgent, setCreatingAgent] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [publishingAgent, setPublishingAgent] = useState(false);

  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) ?? null;
  const canEditSelectedAgent = agentCanBeEdited(session, selectedAgent);

  async function refreshAgents(preferredAgentId?: string | null) {
    const result = await listAgents();
    setAgents(result.agents);

    const nextSelectedAgentId =
      preferredAgentId && result.agents.some((agent) => agent.id === preferredAgentId)
        ? preferredAgentId
        : result.agents.some((agent) => agent.id === selectedAgentId)
          ? selectedAgentId
          : result.agents[0]?.id ?? null;

    setSelectedAgentId(nextSelectedAgentId);
    if (nextSelectedAgentId !== selectedAgentId) {
      onLocationChange(nextSelectedAgentId, null);
    }
  }

  // Fetch agents when session becomes available
  useEffect(() => {
    if (sessionLoading || !session) return;
    void refreshAgents(requestedAgentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionLoading, session]);

  // Initial agent selection after session loads
  useEffect(() => {
    if (sessionLoading) return;
    if (agents.length === 0) {
      setSelectedAgentId(null);
      return;
    }
    const nextAgentId = resolvePreferredSelectionId(
      agents.map((agent) => agent.id),
      {
        requestedId: requestedAgentId,
        currentId: selectedAgentId,
      },
    );

    if (nextAgentId === selectedAgentId) return;

    setSelectedAgentId(nextAgentId);
    if (requestedAgentId !== nextAgentId) {
      onLocationChange(nextAgentId, null);
    }
  }, [agents, onLocationChange, requestedAgentId, sessionLoading]);

  useEffect(() => {
    if (!requestedAgentId || agents.length === 0) return;
    if (!agents.some((agent) => agent.id === requestedAgentId)) return;
    if (requestedAgentId === selectedAgentId) return;
    setSelectedAgentId(requestedAgentId);
  }, [agents, requestedAgentId, selectedAgentId]);

  // Sync editor name from selected agent
  useEffect(() => {
    if (!selectedAgent) {
      setEditorName("");
      return;
    }
    setEditorName(selectedAgent.name);
  }, [selectedAgent]);

  // Sync editor fields from draft
  useEffect(() => {
    if (!selectedDraft) {
      setEditorInstructions("");
      setEditorModel("gpt-4.1-mini");
      setSelectedToolIds([]);
      setConnectorPolicyEnabled(false);
      setSelectedConnectorIds([]);
      return;
    }
    setEditorInstructions(selectedDraft.draft.instructions_markdown);
    setEditorModel(selectedDraft.draft.model_routing.model);
    setSelectedToolIds(selectedDraft.draft.tool_policy.allowed_tools);
    setConnectorPolicyEnabled(selectedDraft.draft.connector_policy.enabled);
    setSelectedConnectorIds(selectedDraft.draft.connector_policy.connector_ids);
  }, [selectedDraft]);

  useEffect(() => {
    let canceled = false;

    if (!session || session.membership.role !== "admin") {
      setAvailableConnectors([]);
      return () => {
        canceled = true;
      };
    }

    void (async () => {
      try {
        const response = await listConnectors();
        if (!canceled) {
          setAvailableConnectors(response.connectors);
        }
      } catch (error) {
        if (!canceled) {
          onNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Failed to load connectors.",
          });
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [onNotice, session]);

  // Load agent draft when selection changes
  useEffect(() => {
    let canceled = false;

    if (!selectedAgentId || !selectedAgent || !canEditSelectedAgent) {
      setSelectedDraft(null);
      return () => {
        canceled = true;
      };
    }

    setLoadingDraft(true);

    void (async () => {
      try {
        const draft = await getAgentDraft(selectedAgentId);
        if (canceled) return;
        setSelectedDraft(draft);
      } catch (error) {
        if (!canceled) {
          setSelectedDraft(null);
          onNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Failed to load the agent draft.",
          });
        }
      } finally {
        if (!canceled) setLoadingDraft(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [canEditSelectedAgent, selectedAgent, selectedAgentId]);

  const handlers: AgentHandlers = {
    selectAgent: (agentId) => {
      setSelectedAgentId(agentId);
    },

    refreshAgents,

    createAgent: async ({ name, scope, session: sess, templateDraft }) => {
      setCreatingAgent(true);
      onNotice(null);

      try {
        const created = await createAgent({
          name: name.trim(),
          scope: sess.membership.role === "admin" ? scope : "personal",
          csrfToken: sess.csrf_token,
        });

        if (templateDraft) {
          await updateAgentDraft({
            agentId: created.id,
            csrfToken: sess.csrf_token,
            body: templateDraft,
          });
        }

        await refreshAgents(created.id);
        const refreshedDraft = await getAgentDraft(created.id);
        setSelectedDraft(refreshedDraft);
        onNotice({
          tone: "success",
          message: templateDraft
            ? `Created ${created.name} from a template. Review the draft, then publish to make it chat-ready.`
            : `Created ${created.name}. Edit the draft, then publish to make it chat-ready.`,
        });
      } catch (error) {
        onNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to create the agent.",
        });
      } finally {
        setCreatingAgent(false);
      }
    },

    saveAgent: async ({
      agentId,
      session: sess,
      editorName: name,
      editorInstructions: instructions,
      editorModel: model,
      selectedToolIds: nextSelectedToolIds,
      connectorPolicyEnabled: nextConnectorPolicyEnabled,
      selectedConnectorIds: nextSelectedConnectorIds,
      selectedAgent: agent,
      selectedDraft: draft,
      canEdit,
    }) => {
      setSavingAgent(true);
      onNotice(null);

      try {
        if (name.trim() !== agent.name) {
          await updateAgent({
            agentId,
            csrfToken: sess.csrf_token,
            body: { name: name.trim() },
          });
        }

        if (draft) {
          await updateAgentDraft({
            agentId,
            csrfToken: sess.csrf_token,
            body: {
              instructions_markdown: instructions,
              model_routing: {
                provider: draft.draft.model_routing.provider,
                model: model.trim(),
              },
              tool_policy: buildDraftToolPolicy(
                nextSelectedToolIds,
                draft.draft.tool_policy.tool_rules,
              ),
              connector_policy: {
                enabled: nextConnectorPolicyEnabled && nextSelectedConnectorIds.length > 0,
                connector_ids:
                  nextConnectorPolicyEnabled && nextSelectedConnectorIds.length > 0
                    ? nextSelectedConnectorIds
                    : [],
              },
            },
          });
        }

        await refreshAgents(agentId);
        if (canEdit) {
          const refreshedDraft = await getAgentDraft(agentId);
          setSelectedDraft(refreshedDraft);
        }

        onNotice({ tone: "success", message: "Agent draft saved." });
      } catch (error) {
        onNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to save the agent.",
        });
      } finally {
        setSavingAgent(false);
      }
    },

    publishAgent: async ({ agentId, session: sess, draftId }) => {
      setPublishingAgent(true);
      onNotice(null);

      try {
        const result = await publishAgent({
          agentId,
          expectedDraftVersionId: draftId,
          csrfToken: sess.csrf_token,
        });

        await refreshAgents(agentId);
        const refreshedDraft = await getAgentDraft(agentId);
        setSelectedDraft(refreshedDraft);

        onNotice({
          tone:
            result.runtime_publication.status === "failed"
              ? "error"
              : result.runtime_publication.status === "restart_required"
                ? "info"
                : "success",
          message:
            result.runtime_publication.detail ??
            `Published version ${result.published_version.version_number}. Runtime status: ${result.runtime_publication.status}.`,
        });
      } catch (error) {
        onNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to publish the agent.",
        });
      } finally {
        setPublishingAgent(false);
      }
    },
  };

  const state: AgentsState = {
    agents,
    selectedAgentId,
    selectedAgent,
    selectedDraft,
    editorName,
    editorInstructions,
    editorModel,
    selectedToolIds,
    availableConnectors,
    connectorPolicyEnabled,
    selectedConnectorIds,
    loadingDraft,
    creatingAgent,
    savingAgent,
    publishingAgent,
    canEditSelectedAgent,
  };

  return {
    state,
    handlers,
    setEditorName,
    setEditorInstructions,
    setEditorModel,
    setSelectedToolIds,
    setConnectorPolicyEnabled,
    setSelectedConnectorIds,
    setSelectedDraft,
  };
}
