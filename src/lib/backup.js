import { existsSync, cpSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * Snapshot the Claude data files that will be mutated by a move/remap.
 * Writes to ~/.claude/backups/claude-ls-{timestamp}/.
 * Returns the backup directory path.
 */
export function createBackup(claudeDir, projectDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = join(claudeDir, "backups", "claude-ls-" + timestamp);
  mkdirSync(backupDir, { recursive: true });

  const claudeJsonPath = join(claudeDir, "..", ".claude.json");
  if (existsSync(claudeJsonPath)) {
    cpSync(claudeJsonPath, join(backupDir, ".claude.json"));
  }

  const historyPath = join(claudeDir, "history.jsonl");
  if (existsSync(historyPath)) {
    cpSync(historyPath, join(backupDir, "history.jsonl"));
  }

  if (projectDir && existsSync(projectDir)) {
    const encodedName = projectDir.split("/").pop();
    cpSync(projectDir, join(backupDir, "projects", encodedName), { recursive: true });
  }

  return backupDir;
}
