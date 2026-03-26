import { describe, expect, it, vi } from "vitest";

import { listLocalDirectoryFiles, splitIntoBatches } from "./local-directory.js";

type MockDirent = {
  name: string;
  isDirectory: () => boolean;
  isFile: () => boolean;
  isSymbolicLink: () => boolean;
};

function createDirent(params: {
  name: string;
  kind: "directory" | "file" | "symlink";
}): MockDirent {
  return {
    name: params.name,
    isDirectory: () => params.kind === "directory",
    isFile: () => params.kind === "file",
    isSymbolicLink: () => params.kind === "symlink",
  };
}

describe("listLocalDirectoryFiles", () => {
  it("handles large nested subtrees without overflowing the call stack", async () => {
    const nestedFileCount = 150_000;
    const readDirectory = vi.fn(async (targetPath: string) => {
      if (targetPath === "/root") {
        return [createDirent({ name: "nested", kind: "directory" })];
      }

      if (targetPath === "/root/nested") {
        return Array.from({ length: nestedFileCount }, (_, index) =>
          createDirent({ name: `file-${index}.md`, kind: "file" }),
        );
      }

      throw new Error(`Unexpected path: ${String(targetPath)}`);
    });

    const files = await listLocalDirectoryFiles("/root", true, readDirectory);

    expect(files).toHaveLength(nestedFileCount);
    expect(files[0]).toBe("/root/nested/file-0.md");
    expect(files.at(-1)).toBe(`/root/nested/file-${nestedFileCount - 1}.md`);
    expect(readDirectory).toHaveBeenCalledTimes(2);
  });

  it("ignores symbolic links during traversal", async () => {
    const readDirectory = vi.fn(async (targetPath: string) => {
      if (targetPath === "/root") {
        return [
          createDirent({ name: "linked-dir", kind: "symlink" }),
          createDirent({ name: "note.md", kind: "file" }),
        ];
      }

      throw new Error(`Unexpected path: ${String(targetPath)}`);
    });

    await expect(listLocalDirectoryFiles("/root", true, readDirectory)).resolves.toEqual([
      "/root/note.md",
    ]);
  });

  it("skips default junk and generated directories", async () => {
    const readDirectory = vi.fn(async (targetPath: string) => {
      if (targetPath === "/root") {
        return [
          createDirent({ name: "src", kind: "directory" }),
          createDirent({ name: "test-output", kind: "directory" }),
          createDirent({ name: "node_modules", kind: "directory" }),
          createDirent({ name: ".git", kind: "directory" }),
        ];
      }

      if (targetPath === "/root/src") {
        return [createDirent({ name: "readme.md", kind: "file" })];
      }

      throw new Error(`Unexpected path: ${String(targetPath)}`);
    });

    await expect(listLocalDirectoryFiles("/root", true, readDirectory)).resolves.toEqual([
      "/root/src/readme.md",
    ]);
    expect(readDirectory).toHaveBeenCalledTimes(2);
  });
});

describe("splitIntoBatches", () => {
  it("splits long id lists into smaller batches", () => {
    const values = Array.from({ length: 7 }, (_, index) => `doc-${index + 1}`);

    expect(splitIntoBatches(values, 3)).toEqual([
      ["doc-1", "doc-2", "doc-3"],
      ["doc-4", "doc-5", "doc-6"],
      ["doc-7"],
    ]);
  });

  it("rejects non-positive batch sizes", () => {
    expect(() => splitIntoBatches(["doc-1"], 0)).toThrow("batchSize must be greater than zero.");
  });
});
