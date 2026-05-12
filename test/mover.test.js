import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "./fixtures.js";
import { moveProject, remapProject, classifyProject, MoveError } from "../src/lib/mover.js";

describe("moveProject", () => {
  let fixture;
  let srcDir;
  let dstDir;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    srcDir = join(fixture.claudeDir, "src-project");
    dstDir = join(fixture.claudeDir, "dst-project");
    mkdirSync(srcDir);
    writeFileSync(join(srcDir, "file.txt"), "hello", "utf-8");
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("moves directory and updates Claude references", () => {
    fixture.addProject({
      path: srcDir,
      sessions: [{
        id: "s1",
        modified: "2026-01-01T00:00:00",
        content: JSON.stringify({ type: "human", cwd: srcDir, message: "hi" }),
      }],
    });
    fixture.addHistory([{ display: "test", project: srcDir, timestamp: 1234 }]);

    const result = moveProject(srcDir, dstDir, {
      claudeDir: fixture.claudeDir,
      noBackup: true,
    });

    assert.ok(!existsSync(srcDir));
    assert.ok(existsSync(dstDir));
    assert.equal(readFileSync(join(dstDir, "file.txt"), "utf-8"), "hello");
    assert.ok(result.projectDirRenamed);
    assert.equal(result.historyLinesChanged, 1);
  });

  it("throws when source does not exist", () => {
    assert.throws(
      () => moveProject("/nonexistent/src", dstDir, { claudeDir: fixture.claudeDir, noBackup: true }),
      MoveError
    );
  });

  it("throws when destination is not empty", () => {
    mkdirSync(dstDir);
    writeFileSync(join(dstDir, "existing.txt"), "content", "utf-8");

    assert.throws(
      () => moveProject(srcDir, dstDir, { claudeDir: fixture.claudeDir, noBackup: true }),
      MoveError
    );
  });

  it("throws when source and destination are the same", () => {
    assert.throws(
      () => moveProject(srcDir, srcDir, { claudeDir: fixture.claudeDir, noBackup: true }),
      MoveError
    );
  });

  it("supports dry-run mode without making changes", () => {
    fixture.addProject({
      path: srcDir,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    const result = moveProject(srcDir, dstDir, {
      claudeDir: fixture.claudeDir,
      noBackup: true,
      dryRun: true,
    });

    assert.ok(existsSync(srcDir));
    assert.ok(!existsSync(dstDir));
    assert.equal(result.dryRun, true);
  });
});

describe("remapProject", () => {
  let fixture;
  let dstDir;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    dstDir = join(fixture.claudeDir, "dst-project");
    mkdirSync(dstDir);
    writeFileSync(join(dstDir, "file.txt"), "hello", "utf-8");
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("updates Claude references without moving directory", () => {
    const oldPath = join(fixture.claudeDir, "old-project");
    fixture.addProject({
      path: oldPath,
      sessions: [{
        id: "s1",
        modified: "2026-01-01T00:00:00",
        content: JSON.stringify({ type: "human", cwd: oldPath, message: "hi" }),
      }],
    });
    fixture.addHistory([{ display: "test", project: oldPath, timestamp: 1234 }]);

    const result = remapProject(oldPath, dstDir, {
      claudeDir: fixture.claudeDir,
      noBackup: true,
    });

    assert.ok(result.projectDirRenamed);
    assert.equal(result.historyLinesChanged, 1);
  });

  it("throws when destination does not exist", () => {
    assert.throws(
      () => remapProject("/old/path", "/nonexistent/dst", { claudeDir: fixture.claudeDir, noBackup: true }),
      MoveError
    );
  });
});

describe("classifyProject", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns tracked when path is in .claude.json", () => {
    fixture.addProject({ path: "/projects/myapp", sessions: [{ id: "s1" }] });

    const result = classifyProject("/projects/myapp", fixture.claudeDir);
    assert.equal(result.type, "tracked");
    assert.equal(result.parentPath, null);
  });

  it("returns subfolder when path is child of a .claude.json key", () => {
    fixture.addProject({ path: "/projects/myapp", sessions: [{ id: "s1" }] });

    const subDir = join(fixture.claudeDir, "..", "sub");
    mkdirSync(subDir);

    const result = classifyProject("/projects/myapp/src/frontend", fixture.claudeDir);
    assert.equal(result.type, "subfolder");
    assert.equal(result.parentPath, "/projects/myapp");
  });

  it("returns worktree when .git is a file with gitdir:", () => {
    const wtDir = join(fixture.claudeDir, "..", "worktree-dir");
    mkdirSync(wtDir);
    writeFileSync(join(wtDir, ".git"), "gitdir: /some/repo/.git/worktrees/wt1", "utf-8");

    const result = classifyProject(wtDir, fixture.claudeDir);
    assert.equal(result.type, "worktree");
  });

  it("returns untracked when path is not in .claude.json and not a worktree", () => {
    const unknownDir = join(fixture.claudeDir, "..", "unknown-dir");
    mkdirSync(unknownDir);

    const result = classifyProject(unknownDir, fixture.claudeDir);
    assert.equal(result.type, "untracked");
  });
});
