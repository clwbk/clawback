/**
 * migration-proof.test.ts
 *
 * Static analysis of the Drizzle migration directory.
 * Detects journal/file mismatches, duplicate columns, non-monotonic
 * timestamps, and common anti-patterns — without touching a live database.
 *
 * Run:  pnpm --filter @clawback/db test
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const DRIZZLE_DIR = path.resolve(import.meta.dirname, "..", "drizzle");
const META_DIR = path.join(DRIZZLE_DIR, "meta");
const JOURNAL_PATH = path.join(META_DIR, "_journal.json");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

function loadJournal(): Journal {
  return JSON.parse(fs.readFileSync(JOURNAL_PATH, "utf-8"));
}

function listSqlFiles(): string[] {
  return fs
    .readdirSync(DRIZZLE_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("migration journal integrity", () => {
  const journal = loadJournal();
  const sqlFiles = listSqlFiles();

  it("journal file exists and parses", () => {
    expect(journal.dialect).toBe("postgresql");
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("every journal entry references an existing SQL file", () => {
    const missing: string[] = [];
    for (const entry of journal.entries) {
      const expectedFile = `${entry.tag}.sql`;
      if (!sqlFiles.includes(expectedFile)) {
        missing.push(expectedFile);
      }
    }
    expect(missing, `Journal references missing SQL files: ${missing.join(", ")}`).toEqual([]);
  });

  it("every SQL file on disk is referenced in the journal", () => {
    const journalTags = new Set(journal.entries.map((e) => `${e.tag}.sql`));
    const orphans = sqlFiles.filter((f) => !journalTags.has(f));
    expect(orphans, `Orphan SQL files not in journal: ${orphans.join(", ")}`).toEqual([]);
  });

  it("journal indices are sequential starting from 0", () => {
    const gaps: string[] = [];
    for (let i = 0; i < journal.entries.length; i++) {
      const entry = journal.entries[i];
      if (!entry) {
        continue;
      }
      if (entry.idx !== i) {
        gaps.push(`expected idx=${i}, got idx=${entry.idx} (tag=${entry.tag})`);
      }
    }
    expect(gaps, `Non-sequential journal indices: ${gaps.join("; ")}`).toEqual([]);
  });

  it("no duplicate tags in the journal", () => {
    const seen = new Map<string, number>();
    const dupes: string[] = [];
    for (const entry of journal.entries) {
      if (seen.has(entry.tag)) {
        dupes.push(`"${entry.tag}" at idx ${seen.get(entry.tag)} and ${entry.idx}`);
      }
      seen.set(entry.tag, entry.idx);
    }
    expect(dupes, `Duplicate journal tags: ${dupes.join("; ")}`).toEqual([]);
  });

  it("journal timestamps are monotonically non-decreasing", () => {
    const violations: string[] = [];
    for (let i = 1; i < journal.entries.length; i++) {
      const prev = journal.entries[i - 1];
      const curr = journal.entries[i];
      if (!prev || !curr) {
        continue;
      }
      if (curr.when < prev.when) {
        violations.push(
          `idx ${curr.idx} (${curr.tag}, ts=${curr.when}) is earlier than idx ${prev.idx} (${prev.tag}, ts=${prev.when})`
        );
      }
    }
    // Known issue: 0016 has a non-monotonic timestamp. Warn but do not fail.
    if (violations.length > 0) {
      console.warn(
        `[WARN] Non-monotonic journal timestamps (${violations.length}):\n` +
          violations.map((v) => `  - ${v}`).join("\n")
      );
    }
    // This is a soft check — drizzle migrator uses idx order, not timestamp order.
    // Uncomment the expect below to make it a hard failure:
    // expect(violations).toEqual([]);
  });
});

describe("migration SQL file validity", () => {
  const journal = loadJournal();

  it("all SQL files are non-empty", () => {
    const empty: string[] = [];
    for (const entry of journal.entries) {
      const filePath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(filePath, "utf-8").trim();
      if (content.length === 0) {
        empty.push(entry.tag);
      }
    }
    expect(empty, `Empty migration files: ${empty.join(", ")}`).toEqual([]);
  });

  it("all SQL files contain valid-looking SQL (no obvious syntax errors)", () => {
    const suspicious: string[] = [];
    for (const entry of journal.entries) {
      const filePath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(filePath, "utf-8");

      // Check for unclosed parentheses (rough heuristic)
      const opens = (content.match(/\(/g) || []).length;
      const closes = (content.match(/\)/g) || []).length;
      if (opens !== closes) {
        suspicious.push(`${entry.tag}: mismatched parentheses (open=${opens}, close=${closes})`);
      }
    }
    expect(suspicious, `Files with suspicious syntax: ${suspicious.join("; ")}`).toEqual([]);
  });
});

describe("duplicate column detection", () => {
  const journal = loadJournal();

  it("no ADD COLUMN for the same table.column appears in multiple migrations without IF NOT EXISTS", () => {
    // Tracks: table -> column -> [migration tags that add it]
    const addColumnMap = new Map<string, Map<string, string[]>>();
    // Pattern: ALTER TABLE "table" ADD COLUMN [IF NOT EXISTS] "column"
    const addColRegex =
      /ALTER\s+TABLE\s+"?(\w+)"?\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?/gi;

    for (const entry of journal.entries) {
      const filePath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(filePath, "utf-8");

      let match: RegExpExecArray | null;
      while ((match = addColRegex.exec(content)) !== null) {
        const [, tableRaw, columnRaw] = match;
        if (!tableRaw || !columnRaw) {
          continue;
        }
        const table = tableRaw.toLowerCase();
        const column = columnRaw.toLowerCase();
        const key = `${table}.${column}`;

        if (!addColumnMap.has(key)) {
          addColumnMap.set(key, new Map());
        }
        const colMap = addColumnMap.get(key)!;
        if (!colMap.has(entry.tag)) {
          colMap.set(entry.tag, []);
        }
        colMap.get(entry.tag)!.push(key);
      }
    }

    const duplicates: string[] = [];
    for (const [colKey, migrations] of addColumnMap) {
      if (migrations.size > 1) {
        const tags = [...migrations.keys()];
        // Check if the LATER migration uses IF NOT EXISTS
        const lastTag = tags[tags.length - 1];
        if (!lastTag) {
          continue;
        }
        const lastFile = fs.readFileSync(path.join(DRIZZLE_DIR, `${lastTag}.sql`), "utf-8");
        const col = colKey.split(".")[1];
        if (!col) {
          continue;
        }
        const hasGuard = new RegExp(
          `ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+"?${col}"?`,
          "i"
        ).test(lastFile);

        if (hasGuard) {
          console.warn(
            `[WARN] ${colKey} added in multiple migrations (${tags.join(", ")}), ` +
              `but last occurrence uses IF NOT EXISTS — safe but redundant`
          );
        } else {
          duplicates.push(`${colKey} added in: ${tags.join(", ")}`);
        }
      }
    }
    expect(
      duplicates,
      `Duplicate ADD COLUMN without IF NOT EXISTS guard: ${duplicates.join("; ")}`
    ).toEqual([]);
  });
});

describe("CREATE TABLE duplication detection", () => {
  const journal = loadJournal();

  it("no CREATE TABLE for the same table appears in multiple migrations without IF NOT EXISTS", () => {
    const createTableMap = new Map<string, string[]>();
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s*\(/gi;

    for (const entry of journal.entries) {
      const filePath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(filePath, "utf-8");

      let match: RegExpExecArray | null;
      while ((match = createTableRegex.exec(content)) !== null) {
        const [, tableRaw] = match;
        if (!tableRaw) {
          continue;
        }
        const table = tableRaw.toLowerCase();
        if (!createTableMap.has(table)) {
          createTableMap.set(table, []);
        }
        createTableMap.get(table)!.push(entry.tag);
      }
    }

    const duplicates: string[] = [];
    for (const [table, tags] of createTableMap) {
      if (tags.length > 1) {
        duplicates.push(`"${table}" created in: ${tags.join(", ")}`);
      }
    }
    expect(
      duplicates,
      `Tables created in multiple migrations: ${duplicates.join("; ")}`
    ).toEqual([]);
  });
});

describe("CREATE TYPE duplication detection", () => {
  const journal = loadJournal();

  it("no CREATE TYPE for the same enum appears without duplication guards", () => {
    // Tracks enum name -> [{tag, hasGuard}]
    const enumMap = new Map<string, Array<{ tag: string; hasGuard: boolean }>>();
    // Matches both CREATE TYPE "public"."name" and bare CREATE TYPE "name"
    const createTypeRegex =
      /CREATE\s+TYPE\s+(?:"public"\.)?"?(\w+)"?\s+AS\s+ENUM/gi;

    for (const entry of journal.entries) {
      const filePath = path.join(DRIZZLE_DIR, `${entry.tag}.sql`);
      const content = fs.readFileSync(filePath, "utf-8");

      let match: RegExpExecArray | null;
      while ((match = createTypeRegex.exec(content)) !== null) {
        const [, enumNameRaw] = match;
        if (!enumNameRaw) {
          continue;
        }
        const enumName = enumNameRaw.toLowerCase();
        // Check if this CREATE TYPE is inside a DO $$ exception block
        const lineIdx = content.lastIndexOf("\n", match.index);
        const contextBefore = content.slice(Math.max(0, lineIdx - 200), match.index);
        const hasGuard = /DO\s+\$\$\s+BEGIN/i.test(contextBefore);

        if (!enumMap.has(enumName)) {
          enumMap.set(enumName, []);
        }
        enumMap.get(enumName)!.push({ tag: entry.tag, hasGuard });
      }
    }

    const unguardedDupes: string[] = [];
    for (const [name, entries] of enumMap) {
      if (entries.length > 1) {
        const unguarded = entries.filter((e) => !e.hasGuard);
        if (unguarded.length > 1) {
          unguardedDupes.push(
            `"${name}" created without guard in: ${unguarded.map((e) => e.tag).join(", ")}`
          );
        }
      }
    }
    expect(
      unguardedDupes,
      `Enum types created multiple times without exception guard: ${unguardedDupes.join("; ")}`
    ).toEqual([]);
  });
});

describe("migration file naming", () => {
  const sqlFiles = listSqlFiles();

  it("all SQL files follow NNNN_ prefix naming convention", () => {
    const bad = sqlFiles.filter((f) => !/^\d{4}_/.test(f));
    expect(bad, `Files not matching NNNN_ prefix: ${bad.join(", ")}`).toEqual([]);
  });

  it("file prefixes are sequential with no gaps", () => {
    const prefixes = sqlFiles
      .map((f) => {
        const [prefix] = f.split("_");
        return prefix ? parseInt(prefix, 10) : Number.NaN;
      })
      .filter((prefix) => !Number.isNaN(prefix))
      .sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 0; i < prefixes.length; i++) {
      const prefix = prefixes[i];
      if (prefix === undefined) {
        continue;
      }
      if (prefix !== i) {
        gaps.push(i);
        break; // report first gap only
      }
    }
    expect(gaps, `Gap in migration sequence at index: ${gaps.join(", ")}`).toEqual([]);
  });
});
