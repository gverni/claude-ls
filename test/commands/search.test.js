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

  it("shows session count and last active date", async () => {
    fixture.addProject({
      path: projectDir,
      sessions: [{ id: "s1", modified: "2026-04-01T10:00:00" }],
    });

    await searchCommand("test-project", { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("sessions: 1"));
    assert.ok(combined.includes("last active:"));
  });

  it("shows no sessions when project has none", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await searchCommand("test-project", { claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes("no sessions")));
  });

  it("sorts by most recent with --sort recent", async () => {
    const oldDir = join(fixture.claudeDir, "..", "search-alpha");
    const newDir = join(fixture.claudeDir, "..", "search-omega");
    mkdirSync(oldDir, { recursive: true });
    mkdirSync(newDir, { recursive: true });
    fixture.addProject({ path: oldDir, sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });
    fixture.addProject({ path: newDir, sessions: [{ id: "s2", modified: "2026-05-01T00:00:00" }] });

    await searchCommand("search-", { claudeDir: fixture.claudeDir, sort: "recent" });
    const combined = output.join("\n");
    assert.ok(combined.indexOf(newDir) < combined.indexOf(oldDir), "Newer project should appear first");
  });

  it("sorts by oldest with --sort oldest", async () => {
    const oldDir = join(fixture.claudeDir, "..", "search-alpha");
    const newDir = join(fixture.claudeDir, "..", "search-omega");
    mkdirSync(oldDir, { recursive: true });
    mkdirSync(newDir, { recursive: true });
    fixture.addProject({ path: oldDir, sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });
    fixture.addProject({ path: newDir, sessions: [{ id: "s2", modified: "2026-05-01T00:00:00" }] });

    await searchCommand("search-", { claudeDir: fixture.claudeDir, sort: "oldest" });
    const combined = output.join("\n");
    assert.ok(combined.indexOf(oldDir) < combined.indexOf(newDir), "Older project should appear first");
  });

  it("outputs JSON with --json flag including session info", async () => {
    fixture.addProject({ path: projectDir, sessions: [{ id: "s1", modified: "2026-04-01T10:00:00" }] });

    await searchCommand("test-project", { claudeDir: fixture.claudeDir, json: true });
    const parsed = JSON.parse(output.join(""));
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].projectPath, projectDir);
    assert.equal(typeof parsed[0].exists, "boolean");
    assert.equal(typeof parsed[0].sessionCount, "number");
    assert.ok("lastModified" in parsed[0]);
  });
});
