import fs from "node:fs";

/**
 * Load environment variables from a file if it exists.
 *
 * - Skips blank lines and lines starting with `#`
 * - Supports an optional `export` prefix (e.g. `export FOO=bar`)
 * - Does NOT override variables that are already set in `process.env`
 * - Strips surrounding single or double quotes from values
 */
export function loadEnvFileIfPresent(filePath: string): void {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
    if (!match) {
      continue;
    }

    const key = match[1]!;
    let value = match[2]!;

    // Strip surrounding quotes (single or double)
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Do not override already-set env vars
    if (process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = value;
  }
}
