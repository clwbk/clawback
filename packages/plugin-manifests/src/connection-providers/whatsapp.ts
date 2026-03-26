import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const whatsappProvider: ConnectionProviderPluginManifest = {
  id: "provider.whatsapp",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "WhatsApp Business",
  description:
    "Approval surface for reviewed actions. Team members receive approval prompts and respond via WhatsApp.",
  owner: "first_party",
  stability: "pilot",
  category: "messaging",
  priority: 5,
  provider: "whatsapp",
  accessModes: ["write_capable"],
  capabilities: ["send_approval_prompts", "receive_approval_decisions"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: [],
  setupHelp:
    "Choose a transport mode: OpenClaw Pairing (fastest) or Meta Cloud API (official Business API). " +
    "For OpenClaw Pairing, generate a QR code and scan with a dedicated work WhatsApp identity. " +
    "Then map team members to their WhatsApp phone numbers for approval routing.",
  validate:
    "Checks that a transport is connected and at least one team member has a mapped WhatsApp number.",
  probe:
    "Sends a lightweight presence check through the active transport to verify message delivery capability.",
  status:
    "Reports active transport mode, connected phone number, number of mapped team members, and last message timestamp.",
  recoveryHints: [
    { symptom: "QR code scan fails", fix: "Ensure the WhatsApp app is updated to the latest version. Try regenerating the QR code." },
    { symptom: "Messages not delivered", fix: "Check that the WhatsApp identity is still logged in. For OpenClaw Pairing, the phone must stay online." },
    { symptom: "Approval responses not received", fix: "Verify the team member's phone number is correctly mapped and the user has replied in the correct format." },
  ],
  setupSteps: [
    {
      id: "whatsapp-transport-mode",
      title: "Choose a transport mode",
      description:
        "Pick OpenClaw Pairing for the fastest operator setup, or Meta Cloud API if you need the official Business API path.",
      ctaLabel: "Open WhatsApp setup",
      operatorOnly: true,
      target: { surface: "connections", focus: "whatsapp" },
    },
    {
      id: "whatsapp-connect-transport",
      title: "Connect the selected transport",
      description:
        "Complete the selected transport setup. For OpenClaw Pairing, generate a QR code and scan it with a dedicated work WhatsApp identity.",
      ctaLabel: "Connect transport",
      operatorOnly: true,
      docsHref: "/docs/whatsapp-openclaw-pairing-guide",
      target: { surface: "connections", focus: "whatsapp" },
    },
    {
      id: "whatsapp-identity-mapping",
      title: "Map team members to WhatsApp numbers",
      description:
        "Link workspace users to their WhatsApp phone numbers in the approval surface identity settings. " +
        "Only mapped and allowed users can receive and respond to approval prompts.",
      ctaLabel: "Map Identities",
      operatorOnly: true,
      target: { surface: "connections", focus: "whatsapp-identities" },
    },
  ],
};
