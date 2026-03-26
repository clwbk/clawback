import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const slackProvider: ConnectionProviderPluginManifest = {
  id: "provider.slack",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Slack",
  description: "Approval surface for reviewed actions delivered through the Slack Bot API.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 10,
  provider: "slack",
  accessModes: ["write_capable"],
  capabilities: ["send_approval_prompts", "receive_approval_decisions"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: ["slack_bot_token", "slack_signing_secret"],
  setupHelp:
    "Create a Slack app at api.slack.com/apps. Required: slack_bot_token (xoxb-...), slack_signing_secret. " +
    "Install the app to your workspace and invite the bot to the channel used for approval prompts.",
  validate:
    "Checks that slack_bot_token starts with 'xoxb-' and slack_signing_secret is present.",
  probe:
    "Calls the Slack API auth.test endpoint to verify the bot token is valid and the bot is in the target channel.",
  status:
    "Reports bot name, connected workspace, target channel, and last approval prompt timestamp.",
  recoveryHints: [
    { symptom: "invalid_auth", fix: "The bot token is invalid or revoked. Reinstall the Slack app to generate a new token." },
    { symptom: "channel_not_found", fix: "The bot is not a member of the target channel. Invite it with /invite @botname in the channel." },
    { symptom: "Signature verification fails", fix: "The signing secret does not match. Copy the correct value from the Slack app's Basic Information page." },
  ],
  setupSteps: [
    {
      id: "slack-connect",
      title: "Connect Slack approval surface",
      description: "Add the Slack bot token, signing secret, and destination channel used for approval prompts.",
      ctaLabel: "Connect Slack",
      operatorOnly: true,
      target: { surface: "connections", focus: "slack" },
    },
  ],
};
