import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";

export function createTestClaudeDir() {
  const base = join(tmpdir(), `claude-ls-test-${randomBytes(4).toString("hex")}`);
  mkdirSync(base, { recursive: true });

  const projectsDir = join(base, "projects");
  mkdirSync(projectsDir);

  return {
    claudeDir: base,
    projectsDir,
    addProject({ path, sessions = [], lastModified = null }) {
      const encoded = path.replaceAll("/", "-");
      const dir = join(projectsDir, encoded);
      mkdirSync(dir, { recursive: true });

      const entries = sessions.map((s, i) => ({
        sessionId: s.id || `session-${i}`,
        projectPath: path,
        fullPath: join(dir, `${s.id || `session-${i}`}.jsonl`),
        modified: s.modified || lastModified || "2026-01-01T00:00:00",
      }));

      writeFileSync(
        join(dir, "sessions-index.json"),
        JSON.stringify({ originalPath: path, entries }, null, 2),
        "utf-8"
      );

      for (const entry of entries) {
        const content = sessions.find((s) => s.id === entry.sessionId)?.content ||
          JSON.stringify({ type: "human", cwd: path, message: "test" });
        writeFileSync(entry.fullPath, content + "\n", "utf-8");
      }

      return dir;
    },
    addHistory(lines) {
      writeFileSync(
        join(base, "history.jsonl"),
        lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
        "utf-8"
      );
    },
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}
