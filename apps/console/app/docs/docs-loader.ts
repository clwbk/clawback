import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { docsNav, type DocSlug } from "./docs-nav";

const GUIDES_DIR_CANDIDATES = [
  join(process.cwd(), "docs", "guides"),
  join(process.cwd(), "..", "..", "docs", "guides"),
];

async function resolveGuidesDir(): Promise<string | null> {
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

export async function loadDoc(slug: string): Promise<string | null> {
  const valid = docsNav.some((d) => d.slug === slug);
  if (!valid) return null;

  try {
    const guidesDir = await resolveGuidesDir();
    if (!guidesDir) return null;
    return await readFile(join(guidesDir, `${slug}.md`), "utf-8");
  } catch {
    return null;
  }
}

export function getDocTitle(slug: string): string | undefined {
  return docsNav.find((d) => d.slug === slug)?.title;
}

export function isValidSlug(slug: string): slug is DocSlug {
  return docsNav.some((d) => d.slug === slug);
}
