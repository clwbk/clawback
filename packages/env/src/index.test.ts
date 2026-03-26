import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadEnvFileIfPresent } from "./index.js";

describe("loadEnvFileIfPresent", () => {
  let tmpDir: string;
  const injectedKeys: string[] = [];

  function trackKey(key: string) {
    injectedKeys.push(key);
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-test-"));
  });

  afterEach(() => {
    // Clean up env vars set during tests
    for (const key of injectedKeys) {
      delete process.env[key];
    }
    injectedKeys.length = 0;

    // Remove temp directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads variables from a file", () => {
    const envFile = path.join(tmpDir, ".env");
    fs.writeFileSync(envFile, "TEST_LOAD_A=hello\nTEST_LOAD_B=world\n");
    trackKey("TEST_LOAD_A");
    trackKey("TEST_LOAD_B");

    loadEnvFileIfPresent(envFile);

    expect(process.env["TEST_LOAD_A"]).toBe("hello");
    expect(process.env["TEST_LOAD_B"]).toBe("world");
  });

  it("does not override existing env vars", () => {
    const envFile = path.join(tmpDir, ".env");
    fs.writeFileSync(envFile, "TEST_NO_OVERRIDE=new_value\n");
    trackKey("TEST_NO_OVERRIDE");

    process.env["TEST_NO_OVERRIDE"] = "existing_value";
    loadEnvFileIfPresent(envFile);

    expect(process.env["TEST_NO_OVERRIDE"]).toBe("existing_value");
  });

  it("strips double quotes from values", () => {
    const envFile = path.join(tmpDir, ".env");
    fs.writeFileSync(envFile, 'TEST_DOUBLE_QUOTE="quoted_value"\n');
    trackKey("TEST_DOUBLE_QUOTE");

    loadEnvFileIfPresent(envFile);

    expect(process.env["TEST_DOUBLE_QUOTE"]).toBe("quoted_value");
  });

  it("strips single quotes from values", () => {
    const envFile = path.join(tmpDir, ".env");
    fs.writeFileSync(envFile, "TEST_SINGLE_QUOTE='quoted_value'\n");
    trackKey("TEST_SINGLE_QUOTE");

    loadEnvFileIfPresent(envFile);

    expect(process.env["TEST_SINGLE_QUOTE"]).toBe("quoted_value");
  });

  it("skips comments and blank lines", () => {
    const envFile = path.join(tmpDir, ".env");
    fs.writeFileSync(envFile, "# This is a comment\n\nTEST_SKIP_COMMENTS=yes\n   \n# another comment\n");
    trackKey("TEST_SKIP_COMMENTS");

    loadEnvFileIfPresent(envFile);

    expect(process.env["TEST_SKIP_COMMENTS"]).toBe("yes");
  });

  it("handles export prefix", () => {
    const envFile = path.join(tmpDir, ".env");
    fs.writeFileSync(envFile, "export TEST_EXPORT_PREFIX=exported\n");
    trackKey("TEST_EXPORT_PREFIX");

    loadEnvFileIfPresent(envFile);

    expect(process.env["TEST_EXPORT_PREFIX"]).toBe("exported");
  });

  it("does nothing if file does not exist", () => {
    const envFile = path.join(tmpDir, ".env.nonexistent");

    // Should not throw
    loadEnvFileIfPresent(envFile);
  });
});
