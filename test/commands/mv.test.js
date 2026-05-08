import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "../fixtures.js";
import { mvCommand } from "../../src/commands/mv.js";

describe("mv command", () => {
  let fixture;
  let output;
  let srcDir;
  let dstDir;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    output = [];
    global._testConsoleLog = console.log;
    global._testConsoleError = console.error;
    console.log = (...args) => output.push(args.join(" "));
    console.error = (...args) => output.push(args.join(" "));

    srcDir = join(fixture.claudeDir, "src-project");
    dstDir = join(fixture.claudeDir, "dst-project");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "file.txt"), "hello", "utf-8");
  });

  afterEach(() => {
    console.log = global._testConsoleLog;
    console.error = global._testConsoleError;
    fixture.cleanup();
  });

  it("moves project with --yes flag", async () => {
    fixture.addProject({
      path: srcDir,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await mvCommand(srcDir, dstDir, { yes: true, claudeDir: fixture.claudeDir, noBackup: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("Done"));
    assert.ok(!existsSync(srcDir));
    assert.ok(existsSync(dstDir));
  });

  it("shows dry-run output without making changes", async () => {
    fixture.addProject({
      path: srcDir,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await mvCommand(srcDir, dstDir, { dryRun: true, claudeDir: fixture.claudeDir, noBackup: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("DRY RUN"));
    assert.ok(existsSync(srcDir));
    assert.ok(!existsSync(dstDir));
  });

  it("shows error when source does not exist", async () => {
    const originalExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error("EXIT"); };

    try {
      await mvCommand("/nonexistent/path", dstDir, { yes: true, claudeDir: fixture.claudeDir, noBackup: true });
    } catch (e) {
      if (e.message !== "EXIT") throw e;
    }
    const combined = output.join("\n");
    assert.ok(combined.includes("Error"));
    assert.equal(exitCode, 1);

    process.exit = originalExit;
  });

  it("displays From and To paths", async () => {
    fixture.addProject({
      path: srcDir,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await mvCommand(srcDir, dstDir, { yes: true, claudeDir: fixture.claudeDir, noBackup: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("From:"));
    assert.ok(combined.includes("To:"));
  });
});
