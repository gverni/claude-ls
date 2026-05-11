import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "./fixtures.js";
import {
  updateHistory,
  updateUsageData,
  updateClaudeJson,
  replacePathValues,
} from "../src/lib/updaters.js";

describe("replacePathValues", () => {
  it("replaces exact path match in object values", () => {
    const obj = { projectPath: "/old/path", other: "unrelated" };
    const changed = replacePathValues(obj, "/old/path", "/new/path");
    assert.equal(changed, true);
    assert.equal(obj.projectPath, "/new/path");
    assert.equal(obj.other, "unrelated");
  });

  it("replaces path prefix match", () => {
    const obj = { fullPath: "/old/path/sub/file.jsonl" };
    const changed = replacePathValues(obj, "/old/path", "/new/path");
    assert.equal(changed, true);
    assert.equal(obj.fullPath, "/new/path/sub/file.jsonl");
  });

  it("does not replace partial matches", () => {
    const obj = { path: "/old/pathology" };
    const changed = replacePathValues(obj, "/old/path", "/new/path");
    assert.equal(changed, false);
    assert.equal(obj.path, "/old/pathology");
  });

  it("recurses into nested objects and arrays", () => {
    const obj = { entries: [{ projectPath: "/old/path" }] };
    const changed = replacePathValues(obj, "/old/path", "/new/path");
    assert.equal(changed, true);
    assert.equal(obj.entries[0].projectPath, "/new/path");
  });
});



describe("updateHistory", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("replaces paths in history.jsonl", () => {
    fixture.addHistory([
      { display: "test", project: "/old/project", timestamp: 1234 },
      { display: "other", project: "/other/project", timestamp: 5678 },
    ]);

    const historyPath = join(fixture.claudeDir, "history.jsonl");
    const count = updateHistory(historyPath, "/old/project", "/new/project");
    assert.equal(count, 1);

    const content = readFileSync(historyPath, "utf-8");
    assert.ok(content.includes("/new/project"));
    assert.ok(content.includes("/other/project"));
  });

  it("returns 0 when history does not exist", () => {
    const count = updateHistory("/nonexistent/history.jsonl", "/old", "/new");
    assert.equal(count, 0);
  });
});

describe("updateUsageData", () => {
  let fixture;

  beforeEach(() => {
    fixture = createTestClaudeDir();
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("updates project_path in session-meta files", () => {
    const metaDir = join(fixture.claudeDir, "usage-data", "session-meta");
    mkdirSync(metaDir, { recursive: true });
    writeFileSync(
      join(metaDir, "s1.json"),
      JSON.stringify({ project_path: "/old/project", tokens: 100 }),
      "utf-8"
    );
    writeFileSync(
      join(metaDir, "s2.json"),
      JSON.stringify({ project_path: "/other/project", tokens: 50 }),
      "utf-8"
    );

    const count = updateUsageData(fixture.claudeDir, "/old/project", "/new/project");
    assert.equal(count, 1);

    const s1 = JSON.parse(readFileSync(join(metaDir, "s1.json"), "utf-8"));
    assert.equal(s1.project_path, "/new/project");

    const s2 = JSON.parse(readFileSync(join(metaDir, "s2.json"), "utf-8"));
    assert.equal(s2.project_path, "/other/project");
  });
});

describe("updateClaudeJson", () => {
  let fixture;
  let claudeJsonPath;

  beforeEach(() => {
    fixture = createTestClaudeDir();
    claudeJsonPath = join(fixture.claudeDir, "..", ".claude.json");
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it("renames project key from old path to new path", () => {
    writeFileSync(claudeJsonPath, JSON.stringify({
      projects: {
        "/old/project": { allowedTools: ["Read"], hasTrustDialogAccepted: true },
        "/other/project": { allowedTools: [] },
      },
    }), "utf-8");

    const count = updateClaudeJson(claudeJsonPath, "/old/project", "/new/project");
    assert.equal(count, 1);

    const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    assert.ok(data.projects["/new/project"]);
    assert.ok(!data.projects["/old/project"]);
    assert.deepEqual(data.projects["/new/project"].allowedTools, ["Read"]);
    assert.ok(data.projects["/other/project"]);
  });

  it("renames sub-path keys that start with old path", () => {
    writeFileSync(claudeJsonPath, JSON.stringify({
      projects: {
        "/old/project": { allowedTools: [] },
        "/old/project/sub": { allowedTools: ["Edit"] },
      },
    }), "utf-8");

    const count = updateClaudeJson(claudeJsonPath, "/old/project", "/new/project");
    assert.equal(count, 2);

    const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    assert.ok(data.projects["/new/project"]);
    assert.ok(data.projects["/new/project/sub"]);
    assert.ok(!data.projects["/old/project"]);
    assert.ok(!data.projects["/old/project/sub"]);
  });

  it("returns 0 when no matching keys found", () => {
    writeFileSync(claudeJsonPath, JSON.stringify({
      projects: {
        "/other/project": { allowedTools: [] },
      },
    }), "utf-8");

    const count = updateClaudeJson(claudeJsonPath, "/old/project", "/new/project");
    assert.equal(count, 0);
  });

  it("returns 0 when file does not exist", () => {
    const count = updateClaudeJson("/nonexistent/.claude.json", "/old/project", "/new/project");
    assert.equal(count, 0);
  });

  it("does not write in dry-run mode", () => {
    writeFileSync(claudeJsonPath, JSON.stringify({
      projects: {
        "/old/project": { allowedTools: [] },
      },
    }), "utf-8");

    const before = readFileSync(claudeJsonPath, "utf-8");
    const count = updateClaudeJson(claudeJsonPath, "/old/project", "/new/project", { dryRun: true });
    assert.equal(count, 1);
    const after = readFileSync(claudeJsonPath, "utf-8");
    assert.equal(before, after);
  });

  it("handles file without projects key", () => {
    writeFileSync(claudeJsonPath, JSON.stringify({
      hasCompletedOnboarding: true,
    }), "utf-8");

    const count = updateClaudeJson(claudeJsonPath, "/old/project", "/new/project");
    assert.equal(count, 0);
  });
});
