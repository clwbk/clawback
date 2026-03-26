/**
 * Navigation config for /docs routes.
 * Self-contained — no imports from the main app.
 */
export const docsNav = [
  { slug: "getting-started", title: "Getting Started" },
  { slug: "admin-guide", title: "Admin Guide" },
  { slug: "user-guide", title: "User Guide" },
  { slug: "plugins-and-providers", title: "Plugins & Providers" },
  { slug: "plugin-authoring", title: "Writing Plugins" },
  { slug: "plugin-api-reference", title: "Plugin API Reference" },
  { slug: "plugin-cookbook", title: "Plugin Cookbook" },
  { slug: "deployment", title: "Deployment" },
  { slug: "security", title: "Security Overview" },
  { slug: "api-reference", title: "API Reference" },
] as const;

export type DocSlug = (typeof docsNav)[number]["slug"];
