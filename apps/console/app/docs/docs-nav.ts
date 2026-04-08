/**
 * Navigation config for /docs routes.
 * Self-contained — driven only by NEXT_PUBLIC_PUBLIC_DEMO_MODE.
 */
const baseDocsNav = [
  { slug: "start-here", title: "Start Here" },
  { slug: "quickstart", title: "Quickstart" },
  { slug: "getting-started", title: "Getting Started" },
  { slug: "demo-walkthrough", title: "Demo Walkthrough" },
  { slug: "first-run", title: "First-Run Guide" },
  { slug: "deployment", title: "Deployment" },
  { slug: "verification-and-testing", title: "Verification and Testing" },
  { slug: "troubleshooting", title: "Troubleshooting" },
  { slug: "known-limitations", title: "Known Limitations" },
  { slug: "admin-guide", title: "Admin Guide" },
  { slug: "user-guide", title: "User Guide" },
  { slug: "security", title: "Security Overview" },
  { slug: "api-reference", title: "API Reference" },
  { slug: "plugins-and-providers", title: "Plugins & Providers" },
  { slug: "plugin-authoring", title: "Writing Plugins" },
  { slug: "plugin-api-reference", title: "Plugin API Reference" },
  { slug: "plugin-cookbook", title: "Plugin Cookbook" },
] as const;

export const isPublicDemoMode = process.env.NEXT_PUBLIC_PUBLIC_DEMO_MODE === "true";

export const docsNav = (
  isPublicDemoMode
    ? [{ slug: "public-demo", title: "Public Demo Guide" }, ...baseDocsNav]
    : [...baseDocsNav]
) as readonly { slug: string; title: string }[];

export type DocSlug = string;
