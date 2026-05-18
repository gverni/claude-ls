import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "../fixtures.js";
import { listCommand } from "../../src/commands/list.js";

describe("list command", () => {
  let fixture;
  let output;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    output = [];
    // Capture console.log output
    global._testConsoleLog = console.log;
    console.log = (...args) => output.push(args.join(" "));
  });

  afterEach(() => {
    console.log = global._testConsoleLog;
    fixture.cleanup();
  });

  it("prints message when no projects found", async () => {
    await listCommand({ claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes("No Claude Code projects found")));
  });

  it("lists projects with path and session count", async () => {
    fixture.addProject({
      path: "/tmp/test-project",
      sessions: [
        { id: "s1", modified: "2026-03-01T10:00:00" },
        { id: "s2", modified: "2026-03-05T14:00:00" },
      ],
    });

    await listCommand({ claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("/tmp/test-project"));
    assert.ok(combined.includes("2"));
  });

  it("marks orphaned projects", async () => {
    fixture.addProject({
      path: "/tmp/nonexistent-project-xyz",
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await listCommand({ claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("orphaned"));
  });

  it("marks existing projects without orphaned label", async () => {
    const realPath = join(fixture.claudeDir, "real-dir");
    mkdirSync(realPath);
    fixture.addProject({
      path: realPath,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await listCommand({ claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes(realPath));
    assert.ok(!combined.includes("orphaned"));
  });

  it("outputs JSON with --json flag", async () => {
    fixture.addProject({
      path: "/tmp/json-project",
      sessions: [{ id: "s1", modified: "2026-02-01T00:00:00" }],
    });

    await listCommand({ claudeDir: fixture.claudeDir, json: true });
    const parsed = JSON.parse(output.join(""));
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].projectPath, "/tmp/json-project");
    assert.equal(parsed[0].sessionCount, 1);
  });

  it("filters orphaned only with --orphaned flag", async () => {
    const realPath = join(fixture.claudeDir, "real-dir");
    mkdirSync(realPath);
    fixture.addProject({ path: realPath, sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });
    fixture.addProject({ path: "/tmp/gone-project", sessions: [{ id: "s2", modified: "2026-01-01T00:00:00" }] });

    await listCommand({ claudeDir: fixture.claudeDir, orphaned: true });
    const combined = output.join("\n");
    assert.ok(combined.includes("/tmp/gone-project"));
    assert.ok(!combined.includes(realPath));
  });

  it("sorts by most recent with --sort recent", async () => {
    fixture.addProject({ path: "/tmp/aaa-old", sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });
    fixture.addProject({ path: "/tmp/zzz-new", sessions: [{ id: "s2", modified: "2026-05-01T00:00:00" }] });

    await listCommand({ claudeDir: fixture.claudeDir, sort: "recent" });
    const combined = output.join("\n");
    const posNew = combined.indexOf("/tmp/zzz-new");
    const posOld = combined.indexOf("/tmp/aaa-old");
    assert.ok(posNew < posOld, "Most recent project should appear first");
  });

  it("sorts by oldest with --sort oldest", async () => {
    fixture.addProject({ path: "/tmp/aaa-old", sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });
    fixture.addProject({ path: "/tmp/zzz-new", sessions: [{ id: "s2", modified: "2026-05-01T00:00:00" }] });

    await listCommand({ claudeDir: fixture.claudeDir, sort: "oldest" });
    const combined = output.join("\n");
    const posOld = combined.indexOf("/tmp/aaa-old");
    const posNew = combined.indexOf("/tmp/zzz-new");
    assert.ok(posOld < posNew, "Oldest project should appear first");
  });

  it("sorts alphabetically by default", async () => {
    fixture.addProject({ path: "/tmp/zzz-project", sessions: [{ id: "s1", modified: "2026-05-01T00:00:00" }] });
    fixture.addProject({ path: "/tmp/aaa-project", sessions: [{ id: "s2", modified: "2026-01-01T00:00:00" }] });

    await listCommand({ claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    const posA = combined.indexOf("/tmp/aaa-project");
    const posZ = combined.indexOf("/tmp/zzz-project");
    assert.ok(posA < posZ, "Alphabetically first project should appear first");
  });

  it("shows source label for non-claude.json projects", async () => {
    // Add a project with no .claude.json entry so it falls back to jsonl source
    fixture.addProject({ path: "/tmp/jsonl-only-project", sessions: [{ id: "s1", modified: "2026-01-01T00:00:00", content: JSON.stringify({ type: "human", cwd: "/tmp/jsonl-only-project", message: "hi" }) }] });

    // Remove from .claude.json so the scanner uses jsonl fallback
    const { writeFileSync, readFileSync } = await import("fs");
    const { join } = await import("path");
    const claudeJsonPath = join(fixture.claudeDir, "..", ".claude.json");
    const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    delete data.projects["/tmp/jsonl-only-project"];
    writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2), "utf-8");

    await listCommand({ claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("[jsonl]"));
  });
});
