import { existsSync, readFileSync, readdirSync, renameSync, cpSync, rmSync } from "fs";
import { resolve, join } from "path";
import { encodePath } from "./encoder.js";
import { findClaudeDir, findProjectDir } from "./scanner.js";
import { updateClaudeJson, updateHistory, updateJsonlCwd, updateUsageData } from "./updaters.js";

export class MoveError extends Error {
  constructor(message) {
    super(message);
    this.name = "MoveError";
  }
}

class MoveResult {
  constructor() {
    this.projectDirRenamed = false;
    this.claudeJsonUpdated = 0;
    this.historyLinesChanged = 0;
    this.usageDataUpdated = 0;
    this.cwdUpdated = 0;
    this.backupPath = null;
    this.dryRun = false;
  }

  summary() {
    const prefix = this.dryRun ? "[DRY RUN] Would have: " : "";
    const lines = [];
    if (this.projectDirRenamed) {
      lines.push(`${prefix}renamed project directory in ~/.claude/projects/`);
    }
    if (this.claudeJsonUpdated) {
      lines.push(`${prefix}updated ${this.claudeJsonUpdated} project key(s) in ~/.claude.json`);
    }
    if (this.cwdUpdated) {
      lines.push(`${prefix}updated cwd in ${this.cwdUpdated} session file(s)`);
    }
    if (this.historyLinesChanged) {
      lines.push(`${prefix}updated ${this.historyLinesChanged} line(s) in history.jsonl`);
    }
    if (this.usageDataUpdated) {
      lines.push(`${prefix}updated ${this.usageDataUpdated} usage-data file(s)`);
    }
    if (this.backupPath) {
      lines.push(`backup saved to: ${this.backupPath}`);
    }
    if (lines.length === 0) {
      lines.push("nothing to update (project may not be tracked by Claude Code)\n  Tip: run 'claude-ls list' to see tracked projects.");
    }
    return lines.map((l) => `  ⎿  ${l}`).join("\n");
  }
}

function isGitWorktree(dirPath) {
  const gitPath = join(dirPath, ".git");
  if (!existsSync(gitPath)) return false;
  try {
    const content = readFileSync(gitPath, "utf-8").trim();
    return content.startsWith("gitdir:");
  } catch {
    return false;
  }
}

function loadClaudeJsonKeys(claudeDir) {
  const claudeJsonPath = join(claudeDir, "..", ".claude.json");
  if (!existsSync(claudeJsonPath)) return [];
  try {
    const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    return Object.keys(data.projects || {});
  } catch {
    return [];
  }
}

export function classifyProject(oldPath, claudeDir = null) {
  if (!claudeDir) claudeDir = findClaudeDir();
  oldPath = resolve(oldPath);

  const keys = loadClaudeJsonKeys(claudeDir);

  if (keys.includes(oldPath)) {
    return { type: "tracked", parentPath: null };
  }

  const parent = keys.find((k) => oldPath.startsWith(k + "/"));
  if (parent) {
    return { type: "subfolder", parentPath: parent };
  }

  if (isGitWorktree(oldPath)) {
    return { type: "worktree", parentPath: null };
  }

  return { type: "untracked", parentPath: null };
}

function findJsonlFilesRecursive(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findJsonlFilesRecursive(full));
      else if (entry.name.endsWith(".jsonl")) results.push(full);
    }
  } catch { /* ignore */ }
  return results;
}

function renameAndUpdate(projectDir, newProjectDir, historyPath, oldPath, newPath, dryRun, verbose, result, updateCwd = false) {
  if (projectDir && existsSync(projectDir)) {
    if (existsSync(newProjectDir)) {
      throw new MoveError(
        `Destination Claude data directory already exists: ${newProjectDir}`
      );
    }
    if (!dryRun) renameSync(projectDir, newProjectDir);
    result.projectDirRenamed = true;
  }

  if (updateCwd) {
    const workingDir = existsSync(newProjectDir) ? newProjectDir : projectDir;
    if (workingDir) {
      result.cwdUpdated = updateJsonlCwd(workingDir, oldPath, newPath, { dryRun, verbose });
    }
  }

  updateDataFiles(historyPath, oldPath, newPath, dryRun, result, verbose);
}

function updateDataFiles(historyPath, oldPath, newPath, dryRun, result, verbose) {
  const claudeDir = join(historyPath, "..");
  const claudeJsonPath = join(claudeDir, "..", ".claude.json");

  result.claudeJsonUpdated = updateClaudeJson(claudeJsonPath, oldPath, newPath, { dryRun, verbose });
  result.historyLinesChanged = updateHistory(historyPath, oldPath, newPath, { dryRun, verbose });
  result.usageDataUpdated = updateUsageData(claudeDir, oldPath, newPath, { dryRun, verbose });
}

function prepareOperation(oldPath, newPath, claudeDir, dryRun, noBackup, verbose) {
  if (!claudeDir) claudeDir = findClaudeDir();

  const result = new MoveResult();
  result.dryRun = dryRun;

  const projectDir = findProjectDir(claudeDir, oldPath);
  const newProjectDir = join(claudeDir, "projects", encodePath(newPath));
  const historyPath = join(claudeDir, "history.jsonl");

  if (verbose) {
    process.stderr.write(`  Claude dir: ${claudeDir}\n`);
    if (projectDir) process.stderr.write(`  Found project: ${projectDir.split("/").pop()}\n`);
    else process.stderr.write("  Project not found in Claude data\n");
  }

  return { result, projectDir, newProjectDir, historyPath };
}

export function previewOperation(oldPath, claudeDir = null) {
  if (!claudeDir) claudeDir = findClaudeDir();

  const projectDir = findProjectDir(claudeDir, oldPath);
  const historyPath = join(claudeDir, "history.jsonl");

  return {
    projectFound: projectDir !== null,
    sessionCount: projectDir && existsSync(projectDir) ? findJsonlFilesRecursive(projectDir).length : 0,
    hasHistory: existsSync(historyPath),
  };
}

export function moveProject(oldPath, newPath, { claudeDir = null, dryRun = false, noBackup = false, verbose = false, updateCwd = false } = {}) {
  oldPath = resolve(oldPath);
  newPath = resolve(newPath);

  if (oldPath === newPath) throw new MoveError("Source and destination are the same path.");
  if (!existsSync(oldPath)) throw new MoveError(`Source directory does not exist: ${oldPath}`);
  if (existsSync(newPath)) {
    const contents = readdirSync(newPath);
    if (contents.length > 0) {
      throw new MoveError(
        `Destination directory already exists and is not empty: ${newPath}\nIf you already moved the files manually, use 'claude-ls remap' instead.`
      );
    }
  }

  const { result, projectDir, newProjectDir, historyPath } = prepareOperation(oldPath, newPath, claudeDir, dryRun, noBackup, verbose);

  try {
    if (!dryRun) {
      if (existsSync(newPath)) rmSync(newPath, { recursive: true });
      cpSync(oldPath, newPath, { recursive: true });
      rmSync(oldPath, { recursive: true });
    }

    renameAndUpdate(projectDir, newProjectDir, historyPath, oldPath, newPath, dryRun, verbose, result, updateCwd);
  } catch (e) {
    if (!dryRun && existsSync(newPath) && !existsSync(oldPath)) {
      cpSync(newPath, oldPath, { recursive: true });
      rmSync(newPath, { recursive: true });
    }
    if (e instanceof MoveError) throw e;
    throw new MoveError(`Move failed: ${e.message}\nChanges have been rolled back.`);
  }

  return result;
}

export function remapProject(oldPath, newPath, { claudeDir = null, dryRun = false, noBackup = false, verbose = false, updateCwd = false } = {}) {
  oldPath = resolve(oldPath);
  newPath = resolve(newPath);

  if (oldPath === newPath) throw new MoveError("Source and destination are the same path.");
  if (!existsSync(newPath)) {
    throw new MoveError(
      `Destination directory does not exist: ${newPath}\nThe directory must already exist for 'remap'. Use 'claude-ls mv' if you haven't moved it yet.`
    );
  }

  const { result, projectDir, newProjectDir, historyPath } = prepareOperation(oldPath, newPath, claudeDir, dryRun, noBackup, verbose);

  try {
    renameAndUpdate(projectDir, newProjectDir, historyPath, oldPath, newPath, dryRun, verbose, result);
  } catch (e) {
    if (e instanceof MoveError) throw e;
    throw new MoveError(`Remap failed: ${e.message}\nChanges have been rolled back.`);
  }

  return result;
}
