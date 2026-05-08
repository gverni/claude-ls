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

  it("marks existing projects", async () => {
    const realPath = join(fixture.claudeDir, "real-dir");
    mkdirSync(realPath);
    fixture.addProject({
      path: realPath,
      sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }],
    });

    await listCommand({ claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("✓"));
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
});
