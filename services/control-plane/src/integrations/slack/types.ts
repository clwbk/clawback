/**
 * Slack integration types following the frozen provider lifecycle contract.
 */

// ---------------------------------------------------------------------------
// Config stored in connection.configJson
// ---------------------------------------------------------------------------

export type SlackConnectionConfig = {
  botToken: string;
  signingSecret: string;
  defaultChannel: string;
  /** Display name of the bot (from auth.test). */
  validatedBotName: string | null;
  /** Team name from auth.test. */
  validatedTeamName: string | null;
  lastProbeAt: string | null;
  lastProbeError: string | null;
};

// ---------------------------------------------------------------------------
// Lifecycle types (operator contract)
// ---------------------------------------------------------------------------

export type SlackOperationalState =
  | "setup_required"
  | "configured"
  | "ready"
  | "degraded"
  | "error";

export type SlackDiagnosticIssue = {
  severity: "info" | "warn" | "error";
  code: string;
  summary: string;
  detail?: string;
};

export type SlackValidationResult = {
  ok: boolean;
  issues: SlackDiagnosticIssue[];
};

export type SlackProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: SlackDiagnosticIssue[];
  botName?: string | null | undefined;
  teamName?: string | null | undefined;
};

export type SlackOperationalStatus = {
  state: SlackOperationalState;
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type SlackRecoveryHint = {
  code: string;
  label: string;
  description: string;
  docsHref?: string;
  target?: {
    surface: "setup" | "connections" | "workers" | "docs";
    focus?: string;
  };
};

// ---------------------------------------------------------------------------
// Setup input
// ---------------------------------------------------------------------------

export type SlackSetupInput = {
  bot_token: string;
  signing_secret: string;
  default_channel: string;
};

// ---------------------------------------------------------------------------
// Status response (returned by the status endpoint)
// ---------------------------------------------------------------------------

export type SlackStatusResponse = {
  connection_id: string;
  connection_status: string;
  operational: SlackOperationalStatus;
  probe: SlackProbeResult | null;
  recovery_hints: SlackRecoveryHint[];
};

// ---------------------------------------------------------------------------
// Slack API types
// ---------------------------------------------------------------------------

export type SlackAuthTestResponse = {
  ok: boolean;
  url?: string;
  team?: string;
  user?: string;
  team_id?: string;
  user_id?: string;
  bot_id?: string;
  is_enterprise_install?: boolean;
  error?: string;
};

export type SlackChatPostMessageResponse = {
  ok: boolean;
  channel?: string;
  ts?: string;
  error?: string;
};

/** Slack interaction payload from interactive messages. */
export type SlackInteractionPayload = {
  type: string;
  token?: string;
  trigger_id?: string;
  response_url?: string;
  user: {
    id: string;
    username?: string;
    name?: string;
    team_id?: string;
  };
  channel?: {
    id: string;
    name?: string;
  };
  team?: {
    id: string;
    domain?: string;
  };
  actions?: Array<{
    type: string;
    action_id: string;
    block_id?: string;
    value?: string;
    text?: {
      type: string;
      text: string;
    };
  }>;
  message?: {
    ts?: string;
    text?: string;
  };
};
