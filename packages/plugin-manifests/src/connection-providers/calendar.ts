import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const calendarProvider: ConnectionProviderPluginManifest = {
  id: "provider.calendar",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "Google Calendar",
  description: "Enables context-aware follow-ups by reading team calendar events.",
  owner: "first_party",
  stability: "experimental",
  category: "knowledge",
  priority: 10,
  provider: "calendar",
  accessModes: ["read_only"],
  capabilities: ["read_events"],
  compatibleInputRouteKinds: [],
  setupMode: "browser_oauth",
  secretKeys: ["google_client_id", "google_client_secret"],
  setupHelp:
    "Authorize read-only access to Google Calendar. Required: google_client_id, google_client_secret. " +
    "Uses browser OAuth flow to obtain a refresh token for the calendar.readonly scope.",
  validate:
    "Checks that OAuth client credentials are present and the refresh token is valid.",
  probe:
    "Calls the Calendar API calendarList.list to verify read access to the authorized account's calendars.",
  status:
    "Reports connected Google account email, number of accessible calendars, and token validity.",
  recoveryHints: [
    { symptom: "Token refresh fails", fix: "Re-authorize through the browser OAuth flow to obtain a new refresh token." },
    { symptom: "No calendars visible", fix: "The authorized account may not have shared calendars. Check calendar sharing settings in Google." },
  ],
  setupSteps: [
    {
      id: "calendar-connect",
      title: "Connect Google Calendar",
      description: "Authorize read-only access to team calendar events for context-aware follow-ups.",
      ctaLabel: "Connect Calendar",
      operatorOnly: true,
      target: { surface: "connections" },
    },
  ],
};
