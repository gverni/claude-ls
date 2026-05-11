import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createTestClaudeDir } from "./fixtures.js";
import { listProjects, findProjectDir } from "../src/lib/scanner.js";

describe("listProjects", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns empty array when no projects exist", () => {
    const projects = listProjects(fixture.claudeDir);
    assert.deepEqual(projects, []);
  });

  it("returns projects with correct metadata", () => {
    fixture.addProject({
      path: "/tmp/my-project",
      sessions: [
        { id: "sess-1", modified: "2026-03-01T10:00:00" },
        { id: "sess-2", modified: "2026-03-05T14:00:00" },
      ],
    });

    const projects = listProjects(fixture.claudeDir);
    assert.equal(projects.length, 1);
    assert.equal(projects[0].projectPath, "/tmp/my-project");
    assert.equal(projects[0].sessionCount, 2);
    assert.ok(projects[0].lastModified);
  });

  it("lists multiple projects", () => {
    fixture.addProject({ path: "/tmp/project-a", sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });
    fixture.addProject({ path: "/tmp/project-b", sessions: [{ id: "s2", modified: "2026-02-01T00:00:00" }] });

    const projects = listProjects(fixture.claudeDir);
    assert.equal(projects.length, 2);
  });
});

describe("findProjectDir", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("returns null when project not found", () => {
    const result = findProjectDir(fixture.claudeDir, "/nonexistent/path");
    assert.equal(result, null);
  });

  it("finds project by encoded path", () => {
    fixture.addProject({ path: "/tmp/my-project", sessions: [{ id: "s1", modified: "2026-01-01T00:00:00" }] });

    const result = findProjectDir(fixture.claudeDir, "/tmp/my-project");
    assert.ok(result);
    assert.ok(result.endsWith("-tmp-my-project"));
  });
});
