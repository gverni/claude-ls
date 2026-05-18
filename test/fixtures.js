import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { encodePath } from "../src/lib/encoder.js";

export function createTestClaudeDir() {
  const base = join(tmpdir(), `claude-ls-test-${randomBytes(4).toString("hex")}`);
  const claudeDir = join(base, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  const projectsDir = join(claudeDir, "projects");
  mkdirSync(projectsDir);

  const claudeJsonPath = join(base, ".claude.json");

  function updateClaudeJson(path) {
    let data = {};
    if (existsSync(claudeJsonPath)) {
      try { data = JSON.parse(readFileSync(claudeJsonPath, "utf-8")); } catch { /* ignore */ }
    }
    if (!data.projects) data.projects = {};
    data.projects[path] = {};
    writeFileSync(claudeJsonPath, JSON.stringify(data, null, 2), "utf-8");
  }

  return {
    claudeDir,
    projectsDir,
    addProject({ path, sessions = [], lastModified = null }) {
      const encoded = encodePath(path);
      const dir = join(projectsDir, encoded);
      mkdirSync(dir, { recursive: true });

      for (const s of sessions) {
        const id = s.id || `session-${sessions.indexOf(s)}`;
        const filePath = join(dir, `${id}.jsonl`);
        const content = s.content ||
          JSON.stringify({ type: "human", cwd: path, message: "test" });
        writeFileSync(filePath, content + "\n", "utf-8");
        if (s.modified) {
          const mtime = new Date(s.modified);
          utimesSync(filePath, mtime, mtime);
        }
      }

      updateClaudeJson(path);

      return dir;
    },
    addHistory(lines) {
      writeFileSync(
        join(claudeDir, "history.jsonl"),
        lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
        "utf-8"
      );
    },
    cleanup() {
      rmSync(base, { recursive: true, force: true });
    },
  };
}
