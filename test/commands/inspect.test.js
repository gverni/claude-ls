import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { createTestClaudeDir } from "../fixtures.js";
import { inspectCommand } from "../../src/commands/inspect.js";

describe("inspect command", () => {
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

  function setClaudeJsonEntry(path, entry) {
    const claudeJsonPath = join(fixture.claudeDir, "..", ".claude.json");
    const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    data.projects[path] = { ...data.projects[path], ...entry };
    writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2), "utf-8");
  }

  it("shows project path in header", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes(projectDir)));
  });

  it("shows allowed tools from claude.json", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });
    setClaudeJsonEntry(projectDir, { allowedTools: ["Bash", "Read", "Edit"] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Bash"));
    assert.ok(combined.includes("Read"));
    assert.ok(combined.includes("Edit"));
  });

  it("shows MCPs from claude.json", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });
    setClaudeJsonEntry(projectDir, {
      mcpServers: { "my-server": { command: "npx", args: ["-y", "@my/mcp"] } },
    });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("my-server"));
    assert.ok(combined.includes("npx"));
  });

  it("shows MCPs from .mcp.json in project directory", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });
    writeFileSync(
      join(projectDir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "local-mcp": { command: "node", args: ["./server.js"] } } }),
      "utf-8"
    );

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("local-mcp"));
    assert.ok(combined.includes("node"));
  });

  it("shows tools from .claude/settings.json", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });
    mkdirSync(join(projectDir, ".claude"), { recursive: true });
    writeFileSync(
      join(projectDir, ".claude", "settings.json"),
      JSON.stringify({ allowedTools: ["Write"] }),
      "utf-8"
    );

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    assert.ok(output.some((line) => line.includes("Write")));
  });

  it("lists sessions with full IDs and dates", async () => {
    fixture.addProject({
      path: projectDir,
      sessions: [
        { id: "aaa11111-0000-0000-0000-000000000000", modified: "2026-03-01T10:00:00" },
        { id: "bbb22222-0000-0000-0000-000000000000", modified: "2026-04-01T12:00:00" },
      ],
    });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Sessions"));
    assert.ok(combined.includes("aaa11111-0000-0000-0000-000000000000")); // full id
    assert.ok(combined.includes("bbb22222-0000-0000-0000-000000000000"));
    assert.ok(combined.includes("created:"));
    assert.ok(combined.includes("last:"));
  });

  it("shows custom-title when session has been renamed", async () => {
    const { mkdirSync: mk, writeFileSync: wf } = await import("fs");
    const { encodePath } = await import("../../src/lib/encoder.js");
    const { join: j } = await import("path");

    fixture.addProject({ path: projectDir, sessions: [] });

    const encoded = encodePath(projectDir);
    const sessionDir = j(fixture.claudeDir, "projects", encoded);
    mk(sessionDir, { recursive: true });
    const sessionId = "cccc3333-0000-0000-0000-000000000000";
    const lines = [
      JSON.stringify({ type: "user", cwd: projectDir, sessionId }),
      JSON.stringify({ type: "custom-title", customTitle: "tidy-golden-lamp", sessionId }),
    ];
    wf(j(sessionDir, sessionId + ".jsonl"), lines.join("\n") + "\n", "utf-8");

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes(sessionId));
    assert.ok(combined.includes("tidy-golden-lamp"));
  });

  it("shows no title when session has not been renamed", async () => {
    const { mkdirSync: mk, writeFileSync: wf } = await import("fs");
    const { encodePath } = await import("../../src/lib/encoder.js");
    const { join: j } = await import("path");

    fixture.addProject({ path: projectDir, sessions: [] });

    const encoded = encodePath(projectDir);
    const sessionDir = j(fixture.claudeDir, "projects", encoded);
    mk(sessionDir, { recursive: true });
    const sessionId = "dddd4444-0000-0000-0000-000000000000";
    const lines = [
      JSON.stringify({ type: "user", cwd: projectDir, sessionId }),
      JSON.stringify({ type: "assistant", sessionId, slug: "auto-generated-slug" }),
    ];
    wf(j(sessionDir, sessionId + ".jsonl"), lines.join("\n") + "\n", "utf-8");

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes(sessionId));
    assert.ok(!combined.includes("auto-generated-slug"));
  });

  it("shows session count of 0 when no sessions", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Sessions"));
    assert.ok(combined.includes("(0)"));
  });

  it("outputs JSON with --json flag", async () => {
    fixture.addProject({ path: projectDir, sessions: [{ id: "s1" }] });
    setClaudeJsonEntry(projectDir, { allowedTools: ["Bash"] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir, json: true });
    const parsed = JSON.parse(output.join(""));
    assert.equal(parsed.projectPath, projectDir);
    assert.ok(parsed.tools.global.includes("Bash"));
    assert.ok(Array.isArray(parsed.sessions));
    assert.equal(parsed.sessions.length, 1);
    assert.ok("created" in parsed.sessions[0]);
    assert.ok("lastInteraction" in parsed.sessions[0]);
  });

  it("shows CLAUDE.md title when file exists", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });
    writeFileSync(join(projectDir, "CLAUDE.md"), "# My Project Instructions\n\nSome content.\n", "utf-8");

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("CLAUDE.md"));
    assert.ok(combined.includes("My Project Instructions"));
  });

  it("shows none for CLAUDE.md when file does not exist", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("CLAUDE.md"));
    assert.ok(combined.includes("none"));
  });

  it("shows plans that reference the project path", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });
    const plansDir = join(fixture.claudeDir, "plans");
    mkdirSync(plansDir, { recursive: true });
    writeFileSync(
      join(plansDir, "my-plan.md"),
      "# Refactor Auth\n\nThis plan is for " + projectDir + " project.\n",
      "utf-8"
    );
    writeFileSync(
      join(plansDir, "other-plan.md"),
      "# Other Plan\n\nThis is for /other/project.\n",
      "utf-8"
    );

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Refactor Auth"));
    assert.ok(combined.includes("my-plan.md"));
    assert.ok(!combined.includes("Other Plan"));
  });

  it("shows plans count of 0 when no plans reference the project", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Plans"));
    assert.ok(combined.includes("(0)"));
  });

  it("shows memory entries from project encoded directory", async () => {
    const projectDir2 = fixture.addProject({ path: projectDir, sessions: [] });
    const memoryDir = join(projectDir2, "memory");
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(
      join(memoryDir, "pref-no-em-dash.md"),
      "---\nname: No em dashes\ndescription: Never use em dashes in output\ntype: feedback\n---\n\nContent here.\n",
      "utf-8"
    );
    writeFileSync(
      join(memoryDir, "MEMORY.md"),
      "# Memory Index\n\n- [No em dashes](pref-no-em-dash.md)\n",
      "utf-8"
    );

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Memory"));
    assert.ok(combined.includes("No em dashes"));
    assert.ok(combined.includes("Never use em dashes"));
    assert.ok(!combined.includes("MEMORY.md"));
  });

  it("shows memory count of 0 when no memory directory", async () => {
    fixture.addProject({ path: projectDir, sessions: [] });

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes("Memory"));
    assert.ok(combined.includes("(0)"));
  });

  it("outputs memory in --json flag", async () => {
    const projectDir2 = fixture.addProject({ path: projectDir, sessions: [] });
    const memoryDir = join(projectDir2, "memory");
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(
      join(memoryDir, "pref-terse.md"),
      "---\nname: Be terse\ndescription: Keep responses short\ntype: feedback\n---\n",
      "utf-8"
    );

    await inspectCommand(projectDir, { claudeDir: fixture.claudeDir, json: true });
    const parsed = JSON.parse(output.join(""));
    assert.ok(Array.isArray(parsed.memory));
    assert.equal(parsed.memory.length, 1);
    assert.equal(parsed.memory[0].name, "Be terse");
    assert.equal(parsed.memory[0].description, "Keep responses short");
  });

  it("shows orphaned project with data from claude.json", async () => {
    const orphanPath = "/nonexistent/orphan-inspect";
    fixture.addProject({ path: orphanPath, sessions: [] });
    setClaudeJsonEntry(orphanPath, { allowedTools: ["Read"] });

    await inspectCommand(orphanPath, { claudeDir: fixture.claudeDir });
    const combined = output.join("\n");
    assert.ok(combined.includes(orphanPath));
    assert.ok(combined.includes("orphaned"));
    assert.ok(combined.includes("Read"));
  });
});
