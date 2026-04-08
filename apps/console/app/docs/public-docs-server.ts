import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  getDocsNavForMode,
  isPublicDemoMode,
  siteLinkedDocSlugs,
} from "./public-docs";

const GUIDES_DIR_CANDIDATES = [
  join(process.cwd(), "docs", "guides"),
  join(process.cwd(), "..", "..", "docs", "guides"),
];

export async function resolveGuidesDir(): Promise<string | null> {
  for (const candidate of GUIDES_DIR_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

export async function buildPublicDocsVersion(options?: { publicDemoMode?: boolean }) {
  const publicDemoMode = options?.publicDemoMode ?? isPublicDemoMode;
  const docs = getDocsNavForMode(publicDemoMode);
  const guidesDir = await resolveGuidesDir();

  if (!guidesDir) {
    throw new Error("Unable to locate docs/guides for public docs versioning.");
  }

  const entries = await Promise.all(
    docs.map(async ({ slug, title }) => ({
      slug,
      title,
      content: await readFile(join(guidesDir, `${slug}.md`), "utf-8"),
    })),
  );

  const payload = {
    publicDemoMode,
    siteLinkedDocSlugs: [...siteLinkedDocSlugs],
    docs: entries,
  };

  return {
    hash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    publicDemoMode,
    siteLinkedDocSlugs: [...siteLinkedDocSlugs],
    docs: docs.map(({ slug, title }) => ({ slug, title })),
  };
}
