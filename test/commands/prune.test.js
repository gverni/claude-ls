import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "../fixtures.js";
import { pruneCommand } from "../../src/commands/prune.js";

describe("prune command", () => {
  let fixture;
  let output;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    output = [];
    global._testConsoleLog = console.log;
    global._testConsoleError = console.error;
    console.log = (...args) => output.push(args.join(" "));
    console.error = (...args) => output.push(args.join(" "));
  });

  afterEach(() => {
    console.log = global._testConsoleLog;
    console.error = global._testConsoleError;
    fixture.cleanup();
  });

  it("deletes encoded project directory from claude data", async () => {
    const projectPath = "/nonexistent/alpha-project";
    const projectDir = fixture.addProject({ path: projectPath, sessions: [{ id: "s1" }] });

    assert.ok(existsSync(projectDir));
    await pruneCommand(projectPath, { claudeDir: fixture.claudeDir, yes: true });
    assert.ok(!existsSync(projectDir));
  });

  it("removes key from .claude.json", async () => {
    const projectPath = "/nonexistent/beta-project";
    fixture.addProject({ path: projectPath, sessions: [] });

    await pruneCommand(projectPath, { claudeDir: fixture.claudeDir, yes: true });

    const claudeJson = JSON.parse(readFileSync(join(fixture.claudeDir, "..", ".claude.json"), "utf-8"));
    assert.ok(!(projectPath in claudeJson.projects));
  });

  it("removes entries from history.jsonl", async () => {
    const projectPath = "/nonexistent/gamma-project";
    fixture.addProject({ path: projectPath, sessions: [] });
    fixture.addHistory([
      { display: "cmd1", project: projectPath, timestamp: 1 },
      { display: "cmd2", project: "/other/project", timestamp: 2 },
    ]);

    await pruneCommand(projectPath, { claudeDir: fixture.claudeDir, yes: true });

    const history = readFileSync(join(fixture.claudeDir, "history.jsonl"), "utf-8");
    assert.ok(!history.includes(projectPath));
    assert.ok(history.includes("/other/project"));
  });

  it("removes matching usage-data session-meta files", async () => {
    const projectPath = "/nonexistent/delta-project";
    fixture.addProject({ path: projectPath, sessions: [] });

    const metaDir = join(fixture.claudeDir, "usage-data", "session-meta");
    mkdirSync(metaDir, { recursive: true });
    const metaFile = join(metaDir, "session-abc.json");
    writeFileSync(metaFile, JSON.stringify({ project_path: projectPath }), "utf-8");
    const otherMeta = join(metaDir, "session-xyz.json");
    writeFileSync(otherMeta, JSON.stringify({ project_path: "/other/project" }), "utf-8");

    await pruneCommand(projectPath, { claudeDir: fixture.claudeDir, yes: true });

    assert.ok(!existsSync(metaFile));
    assert.ok(existsSync(otherMeta));
  });

  it("dry-run shows preview without making changes", async () => {
    const projectPath = "/nonexistent/epsilon-project";
    const projectDir = fixture.addProject({ path: projectPath, sessions: [{ id: "s1" }] });

    await pruneCommand(projectPath, { claudeDir: fixture.claudeDir, dryRun: true });

    assert.ok(existsSync(projectDir));
    const combined = output.join("\n");
    assert.ok(combined.includes("DRY RUN"));
    assert.ok(combined.includes(projectPath));
  });

  it("--all prunes all orphaned projects", async () => {
    const p1 = "/nonexistent/prune-all-1";
    const p2 = "/nonexistent/prune-all-2";
    const dir1 = fixture.addProject({ path: p1, sessions: [] });
    const dir2 = fixture.addProject({ path: p2, sessions: [] });

    await pruneCommand(undefined, { claudeDir: fixture.claudeDir, all: true, yes: true });

    assert.ok(!existsSync(dir1));
    assert.ok(!existsSync(dir2));
  });

  it("--all prints message when no orphaned projects found", async () => {
    await pruneCommand(undefined, { claudeDir: fixture.claudeDir, all: true, yes: true });
    assert.ok(output.some((line) => line.includes("No orphaned")));
  });

  it("includes disclaimer in output", async () => {
    const projectPath = "/nonexistent/disclaimer-project";
    fixture.addProject({ path: projectPath, sessions: [] });

    await pruneCommand(projectPath, { claudeDir: fixture.claudeDir, yes: true });

    const combined = output.join("\n");
    assert.ok(combined.includes("claude project purge"));
  });
});
