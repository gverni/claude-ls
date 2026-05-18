import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "../fixtures.js";
import { searchCommand } from "../../src/commands/search.js";

describe("search command", () => {
  let fixture;
  let output;
  let projectDir;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    projectDir = join(fixture.claudeDir, "..", "test-project");
    mkdirSync(projectDir, { recursive: true });
    output = [];
    global._testConsoleLog = console.log;
    console.log = (...args) => output.push(args.join(" "));
  });

  afterEach(() => {
    console.log = global._testConsoleLog;
    fixture.cleanup();
  });

  it("prints no matches when nothing found", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await searchCommand("nonexistentquery12345", { claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes("No matches found")));
  });

  it("finds project by path name", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await searchCommand("test-project", { claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes(projectDir)));
  });

  it("is case-insensitive", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await searchCommand("TEST-PROJECT", { claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes(projectDir)));
  });

  it("finds orphaned project by path name", async () => {
    fixture.addProject({ path: "/nonexistent/payment-engine", sessions: [] });

    await searchCommand("payment-engine", { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("/nonexistent/payment-engine"));
    assert.ok(combined.includes("orphaned"));
  });

  it("searches across multiple projects", async () => {
    const project2Dir = join(fixture.claudeDir, "..", "test-project-2");
    mkdirSync(project2Dir, { recursive: true });
    fixture.addProject({ path: projectDir, sessions: [] });
    fixture.addProject({ path: project2Dir, sessions: [] });

    await searchCommand("test-project", { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes(projectDir));
    assert.ok(combined.includes(project2Dir));
  });

  it("outputs JSON with --json flag", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await searchCommand("test-project", { claudeDir: fixture.claudeDir, json: true });
    const parsed = JSON.parse(output.join(""));
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].projectPath, projectDir);
    assert.equal(typeof parsed[0].exists, "boolean");
  });
});
