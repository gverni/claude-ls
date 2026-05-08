import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "../fixtures.js";
import { remapCommand } from "../../src/commands/remap.js";

describe("remap command", () => {
  let fixture;
  let output;
  let dstDir;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    output = [];
    global._testConsoleLog = console.log;
    global._testConsoleError = console.error;
    console.log = (...args) => output.push(args.join(" "));
    console.error = (...args) => output.push(args.join(" "));

    dstDir = join(fixture.claudeDir, "dst-project");
    mkdirSync(dstDir);
    writeFileSync(join(dstDir, "file.txt"), "hello", "utf-8");
  });

  afterEach(() => {
    console.log = global._testConsoleLog;
    console.error = global._testConsoleError;
    fixture.cleanup();
  });

  it("remaps project references with --yes flag", async () => {
    const oldPath = join(fixture.claudeDir, "old-project");
    fixture.addProject({
      path: oldPath,
      sessions: [{
        id: "s1",
        modified: "2026-01-01T00:00:00",
        content: JSON.stringify({ type: "human", cwd: oldPath, message: "hi" }),
      }],
    });

    await remapCommand(oldPath, dstDir, { yes: true, claudeDir: fixture.claudeDir, noBackup: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("Done"));
  });

  it("shows dry-run output without making changes", async () => {
    const oldPath = join(fixture.claudeDir, "old-project");
    fixture.addProject({
      path: oldPath,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await remapCommand(oldPath, dstDir, { dryRun: true, claudeDir: fixture.claudeDir, noBackup: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("DRY RUN"));
  });

  it("shows error when destination does not exist", async () => {
    const originalExit = process.exit;
    let exitCode = null;
    process.exit = (code) => { exitCode = code; throw new Error("EXIT"); };

    try {
      await remapCommand("/old/path", "/nonexistent/destination", { yes: true, claudeDir: fixture.claudeDir, noBackup: true });
    } catch (e) {
      if (e.message !== "EXIT") throw e;
    }
    const combined = output.join("\n");
    assert.ok(combined.includes("Error"));
    assert.equal(exitCode, 1);

    process.exit = originalExit;
  });

  it("displays Old and New paths", async () => {
    const oldPath = join(fixture.claudeDir, "old-project");
    fixture.addProject({
      path: oldPath,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await remapCommand(oldPath, dstDir, { yes: true, claudeDir: fixture.claudeDir, noBackup: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("Old:"));
    assert.ok(combined.includes("New:"));
  });
});
