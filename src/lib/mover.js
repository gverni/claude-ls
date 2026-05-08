import { existsSync, readdirSync, renameSync, cpSync, rmSync } from "fs";
import { resolve, join } from "path";
import { encodePath } from "./encoder.js";
import { findClaudeDir, findProjectDir } from "./scanner.js";
import { mergeSessionsIndex, updateHistory, updateJsonlFiles, updateSessionsIndex, updateUsageData } from "./updaters.js";

export class MoveError extends Error {
  constructor(message) {
    super(message);
    this.name = "MoveError";
  }
}

class MoveResult {
  constructor() {
    this.projectDirRenamed = false;
    this.sessionsMerged = 0;
    this.sessionsIndexUpdated = 0;
    this.jsonlFilesUpdated = 0;
    this.jsonlLinesChanged = 0;
    this.historyLinesChanged = 0;
    this.usageDataUpdated = 0;
    this.backupPath = null;
    this.dryRun = false;
  }

  summary() {
    const prefix = this.dryRun ? "[DRY RUN] Would have: " : "";
    const lines = [];
    if (this.projectDirRenamed) {
      lines.push(`${prefix}renamed project directory in ~/.claude/projects/`);
    }
    if (this.sessionsMerged) {
      lines.push(`${prefix}merged ${this.sessionsMerged} session(s) from old directory into new`);
    }
    if (this.sessionsIndexUpdated) {
      lines.push(`${prefix}updated sessions-index.json`);
    }
    if (this.jsonlFilesUpdated) {
      lines.push(`${prefix}updated ${this.jsonlFilesUpdated} session file(s) (${this.jsonlLinesChanged} line(s) changed)`);
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

function mergeProjectDirs(src, dst, dryRun) {
  const srcJsonl = findJsonlFilesRecursive(src);
  if (dryRun) return srcJsonl.length;

  cpSync(src, dst, {
    recursive: true,
    filter: (source) => !source.endsWith("sessions-index.json"),
  });
  rmSync(src, { recursive: true });
  return srcJsonl.length;
}

function renameAndUpdate(projectDir, newProjectDir, historyPath, oldPath, newPath, newEncoded, dryRun, merge, verbose, result) {
  if (projectDir && existsSync(projectDir)) {
    if (existsSync(newProjectDir)) {
      if (!merge) {
        throw new MoveError(
          `Destination Claude data directory already exists: ${newProjectDir}\nUse --merge to combine sessions from both directories.`
        );
      }
      const srcIndex = join(projectDir, "sessions-index.json");
      const dstIndex = join(newProjectDir, "sessions-index.json");
      result.sessionsMerged = mergeSessionsIndex(dstIndex, srcIndex, oldPath, newPath, newEncoded, { dryRun });
      mergeProjectDirs(projectDir, newProjectDir, dryRun);
    } else {
      if (!dryRun) renameSync(projectDir, newProjectDir);
    }
    result.projectDirRenamed = true;
  }

  const workingProjectDir = existsSync(newProjectDir) ? newProjectDir : projectDir;
  updateDataFiles(workingProjectDir, historyPath, oldPath, newPath, newEncoded, dryRun, result, verbose);
}

function updateDataFiles(projectDir, historyPath, oldPath, newPath, newEncoded, dryRun, result, verbose) {
  const claudeDir = join(historyPath, "..");

  if (projectDir && existsSync(projectDir)) {
    const indexPath = join(projectDir, "sessions-index.json");
    result.sessionsIndexUpdated = updateSessionsIndex(indexPath, oldPath, newPath, newEncoded, { dryRun, verbose });

    const { filesUpdated, totalLinesChanged } = updateJsonlFiles(projectDir, oldPath, newPath, { dryRun, verbose });
    result.jsonlFilesUpdated = filesUpdated;
    result.jsonlLinesChanged = totalLinesChanged;
  }

  result.historyLinesChanged = updateHistory(historyPath, oldPath, newPath, { dryRun, verbose });
  result.usageDataUpdated = updateUsageData(claudeDir, oldPath, newPath, { dryRun, verbose });
}

function prepareOperation(oldPath, newPath, claudeDir, dryRun, noBackup, merge, verbose) {
  if (!claudeDir) claudeDir = findClaudeDir();

  const result = new MoveResult();
  result.dryRun = dryRun;

  const projectDir = findProjectDir(claudeDir, oldPath);
  const newEncoded = encodePath(newPath);
  const newProjectDir = join(claudeDir, "projects", newEncoded);
  const historyPath = join(claudeDir, "history.jsonl");

  if (verbose) {
    process.stderr.write(`  Claude dir: ${claudeDir}\n`);
    if (projectDir) process.stderr.write(`  Found project: ${projectDir.split("/").pop()}\n`);
    else process.stderr.write("  Project not found in Claude data\n");
  }

  return { result, projectDir, newProjectDir, historyPath, newEncoded };
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

export function moveProject(oldPath, newPath, { claudeDir = null, dryRun = false, noBackup = false, merge = false, verbose = false } = {}) {
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

  const { result, projectDir, newProjectDir, historyPath, newEncoded } = prepareOperation(oldPath, newPath, claudeDir, dryRun, noBackup, merge, verbose);

  try {
    if (!dryRun) {
      if (existsSync(newPath)) rmSync(newPath, { recursive: true });
      cpSync(oldPath, newPath, { recursive: true });
      rmSync(oldPath, { recursive: true });
    }

    renameAndUpdate(projectDir, newProjectDir, historyPath, oldPath, newPath, newEncoded, dryRun, merge, verbose, result);
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

export function remapProject(oldPath, newPath, { claudeDir = null, dryRun = false, noBackup = false, merge = false, verbose = false } = {}) {
  oldPath = resolve(oldPath);
  newPath = resolve(newPath);

  if (oldPath === newPath) throw new MoveError("Source and destination are the same path.");
  if (!existsSync(newPath)) {
    throw new MoveError(
      `Destination directory does not exist: ${newPath}\nThe directory must already exist for 'remap'. Use 'claude-ls mv' if you haven't moved it yet.`
    );
  }

  const { result, projectDir, newProjectDir, historyPath, newEncoded } = prepareOperation(oldPath, newPath, claudeDir, dryRun, noBackup, merge, verbose);

  try {
    renameAndUpdate(projectDir, newProjectDir, historyPath, oldPath, newPath, newEncoded, dryRun, merge, verbose, result);
  } catch (e) {
    if (e instanceof MoveError) throw e;
    throw new MoveError(`Remap failed: ${e.message}\nChanges have been rolled back.`);
  }

  return result;
}
