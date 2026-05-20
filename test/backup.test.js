import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "./fixtures.js";
import { createBackup } from "../src/lib/backup.js";

describe("createBackup", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("creates a backup directory under ~/.claude/backups/", () => {
    const backupPath = createBackup(fixture.claudeDir, null);
    assert.ok(existsSync(backupPath));
    assert.ok(backupPath.includes("backups/claude-ls-"));
  });

  it("backs up .claude.json when it exists", () => {
    fixture.addProject({ path: "/tmp/test-project", sessions: [] });

    const backupPath = createBackup(fixture.claudeDir, null);
    assert.ok(existsSync(join(backupPath, ".claude.json")));
    const backed = JSON.parse(readFileSync(join(backupPath, ".claude.json"), "utf-8"));
    assert.ok("/tmp/test-project" in backed.projects);
  });

  it("backs up history.jsonl when it exists", () => {
    fixture.addHistory([{ display: "test", project: "/tmp/p", timestamp: 1 }]);

    const backupPath = createBackup(fixture.claudeDir, null);
    assert.ok(existsSync(join(backupPath, "history.jsonl")));
  });

  it("backs up the project encoded directory when provided", () => {
    const projectDir = fixture.addProject({
      path: "/tmp/backup-test",
      sessions: [{ id: "s1" }],
    });

    const backupPath = createBackup(fixture.claudeDir, projectDir);
    const encodedName = projectDir.split("/").pop();
    assert.ok(existsSync(join(backupPath, "projects", encodedName)));
    assert.ok(existsSync(join(backupPath, "projects", encodedName, "s1.jsonl")));
  });

  it("skips missing files gracefully", () => {
    // Empty claudeDir - no .claude.json, no history
    const backupPath = createBackup(fixture.claudeDir, null);
    assert.ok(existsSync(backupPath));
    assert.ok(!existsSync(join(backupPath, ".claude.json")));
    assert.ok(!existsSync(join(backupPath, "history.jsonl")));
  });
});

describe("moveProject backup integration", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("creates a backup by default during mv", async () => {
    const { moveProject } = await import("../src/lib/mover.js");
    const { mkdirSync } = await import("fs");
    const { join } = await import("path");

    const srcDir = join(fixture.claudeDir, "src-project");
    const dstDir = join(fixture.claudeDir, "dst-project");
    mkdirSync(srcDir);
    fixture.addProject({ path: srcDir, sessions: [{ id: "s1" }] });

    const result = moveProject(srcDir, dstDir, { claudeDir: fixture.claudeDir });
    assert.ok(result.backupPath, "backupPath should be set");
    assert.ok(existsSync(result.backupPath));
  });

  it("skips backup when --no-backup is set", async () => {
    const { moveProject } = await import("../src/lib/mover.js");
    const { mkdirSync } = await import("fs");
    const { join } = await import("path");

    const srcDir = join(fixture.claudeDir, "src-project2");
    const dstDir = join(fixture.claudeDir, "dst-project2");
    mkdirSync(srcDir);
    fixture.addProject({ path: srcDir, sessions: [] });

    const result = moveProject(srcDir, dstDir, { claudeDir: fixture.claudeDir, noBackup: true });
    assert.equal(result.backupPath, null);
  });

  it("skips backup in dry-run mode", async () => {
    const { moveProject } = await import("../src/lib/mover.js");
    const { mkdirSync } = await import("fs");
    const { join } = await import("path");

    const srcDir = join(fixture.claudeDir, "src-project3");
    const dstDir = join(fixture.claudeDir, "dst-project3");
    mkdirSync(srcDir);
    fixture.addProject({ path: srcDir, sessions: [] });

    const result = moveProject(srcDir, dstDir, { claudeDir: fixture.claudeDir, dryRun: true });
    assert.equal(result.backupPath, null);
  });
});
