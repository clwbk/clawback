import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { docsNav, type DocSlug } from "./docs-nav";

const GUIDES_DIR = join(process.cwd(), "..", "..", "docs", "guides");

export async function loadDoc(slug: string): Promise<string | null> {
  const valid = docsNav.some((d) => d.slug === slug);
  if (!valid) return null;

  try {
    return await readFile(join(GUIDES_DIR, `${slug}.md`), "utf-8");
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
