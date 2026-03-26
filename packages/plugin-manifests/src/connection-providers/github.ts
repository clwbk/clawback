import type { ConnectionProviderPluginManifest } from "@clawback/plugin-sdk";

export const githubProvider: ConnectionProviderPluginManifest = {
  id: "provider.github",
  kind: "connection_provider",
  version: "1.0.0",
  displayName: "GitHub",
  description: "Read-only technical context from repositories, issues, and pull requests.",
  owner: "first_party",
  stability: "pilot",
  category: "project",
  priority: 15,
  provider: "github",
  accessModes: ["read_only"],
  capabilities: ["read_repositories", "read_issues", "read_pull_requests"],
  compatibleInputRouteKinds: [],
  setupMode: "operator_driven",
  secretKeys: ["github_personal_access_token"],
  setupHelp:
    "Create a fine-grained personal access token at github.com/settings/tokens. Required: github_personal_access_token. " +
    "Grant read-only permissions for metadata, contents, issues, and pull requests on the target repositories.",
  validate:
    "Checks that the token is present, has valid format, and has not expired.",
  probe:
    "Calls the GitHub API /user endpoint to verify the token is valid and has the expected read permissions.",
  status:
    "Reports authenticated GitHub user, token expiry date, and number of accessible repositories.",
  recoveryHints: [
    { symptom: "401 Bad credentials", fix: "The token is invalid or expired. Generate a new fine-grained PAT at github.com/settings/tokens." },
    { symptom: "403 Resource not accessible", fix: "The token lacks permissions for the target repository. Edit the token to add the required repository access." },
    { symptom: "Rate limit exceeded", fix: "GitHub API rate limit hit. Wait for the reset window or use a token with higher limits." },
  ],
  setupSteps: [
    {
      id: "github-pat",
      title: "Add a read-only GitHub token",
      description:
        "Create a fine-grained personal access token with read-only metadata, contents, issues, and pull request permissions.",
      ctaLabel: "Add GitHub token",
      operatorOnly: true,
      docsHref: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens",
      target: { surface: "connections", focus: "github" },
    },
    {
      id: "github-verify",
      title: "Verify repository access",
      description:
        "Check that the token can read the organization or repositories you want workers to use as technical context.",
      ctaLabel: "Verify GitHub",
      operatorOnly: true,
      target: { surface: "connections", focus: "github" },
    },
    {
      id: "github-attach-worker",
      title: "Attach GitHub to eligible workers",
      description:
        "Attach the GitHub connection to technical workers that need repository, issue, or pull request context.",
      ctaLabel: "Attach to worker",
      operatorOnly: true,
      target: { surface: "workers", workerKind: "incident", focus: "connections" },
    },
  ],
};
