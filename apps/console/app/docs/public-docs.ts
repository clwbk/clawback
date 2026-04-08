import manifest from "./public-docs-manifest.json";

export type DocDefinition = {
  slug: string;
  title: string;
};

export const baseDocsNav = manifest.base as readonly DocDefinition[];
export const publicDemoDocsNav = manifest.publicDemoOnly as readonly DocDefinition[];
export const siteLinkedDocSlugs = manifest.siteLinkedSlugs as readonly string[];
export const isPublicDemoMode = process.env.NEXT_PUBLIC_PUBLIC_DEMO_MODE === "true";
export const docsNav = (
  isPublicDemoMode ? [...publicDemoDocsNav, ...baseDocsNav] : [...baseDocsNav]
) as readonly DocDefinition[];

export function getDocsNavForMode(publicDemoMode: boolean): readonly DocDefinition[] {
  return publicDemoMode ? [...publicDemoDocsNav, ...baseDocsNav] : [...baseDocsNav];
}
