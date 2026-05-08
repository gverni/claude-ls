import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { encodePath } from "./encoder.js";

export function updateUsageData(claudeDir, oldPath, newPath, { dryRun = false, verbose = false } = {}) {
  const metaDir = join(claudeDir, "usage-data", "session-meta");
  if (!existsSync(metaDir)) return 0;

  let filesUpdated = 0;
  const files = readdirSync(metaDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    const filePath = join(metaDir, file);
    let data;
    try {
      data = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      continue;
    }

    const pp = data.project_path || "";
    if (pp === oldPath || pp.startsWith(oldPath + "/")) {
      data.project_path = newPath + pp.slice(oldPath.length);
      filesUpdated++;
      if (verbose) process.stderr.write(`    ${file}: updated project_path\n`);
      if (!dryRun) {
        writeFileSync(filePath, JSON.stringify(data, null, 4), "utf-8");
      }
    }
  }

  return filesUpdated;
}

export function updateSessionsIndex(indexPath, oldPath, newPath, newEncodedDir, { dryRun = false, verbose = false } = {}) {
  if (!existsSync(indexPath)) return 0;

  let data;
  try {
    data = JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    return 0;
  }

  let changed = false;
  const oldEncoded = encodePath(oldPath);

  if (data.originalPath === oldPath) {
    data.originalPath = newPath;
    changed = true;
  }

  for (const entry of data.entries || []) {
    if (entry.projectPath === oldPath) {
      entry.projectPath = newPath;
      changed = true;
    }
    const fullPath = entry.fullPath || "";
    if (fullPath.includes(oldEncoded)) {
      entry.fullPath = fullPath.replace(oldEncoded, newEncodedDir);
      changed = true;
    }
  }

  if (verbose && changed) {
    process.stderr.write(`    sessions-index.json: updated\n`);
  }

  if (changed && !dryRun) {
    writeFileSync(indexPath, JSON.stringify(data, null, 2), "utf-8");
  }

  return changed ? 1 : 0;
}

export function updateJsonlFiles(projectDir, oldPath, newPath, { dryRun = false, verbose = false } = {}) {
  let filesUpdated = 0;
  let totalLinesChanged = 0;

  const jsonlFiles = findJsonlFilesRecursive(projectDir);

  for (const file of jsonlFiles) {
    const linesChanged = replaceInFile(file, oldPath, newPath, dryRun);
    if (linesChanged > 0) {
      filesUpdated++;
      totalLinesChanged += linesChanged;
      if (verbose) {
        const rel = file.slice(projectDir.length + 1);
        process.stderr.write(`    ${rel}: ${linesChanged} line(s) changed\n`);
      }
    }
  }

  return { filesUpdated, totalLinesChanged };
}

export function updateHistory(historyPath, oldPath, newPath, { dryRun = false, verbose = false } = {}) {
  if (!existsSync(historyPath)) return 0;
  const count = replaceInFile(historyPath, oldPath, newPath, dryRun);
  if (verbose && count) {
    process.stderr.write(`    history.jsonl: ${count} line(s) changed\n`);
  }
  return count;
}

export function mergeSessionsIndex(dstIndex, srcIndex, oldPath, newPath, newEncoded, { dryRun = false } = {}) {
  if (!existsSync(dstIndex) || !existsSync(srcIndex)) return 0;

  let dstData, srcData;
  try {
    dstData = JSON.parse(readFileSync(dstIndex, "utf-8"));
    srcData = JSON.parse(readFileSync(srcIndex, "utf-8"));
  } catch {
    return 0;
  }

  const oldEncoded = encodePath(oldPath);
  const existingIds = new Set((dstData.entries || []).map((e) => e.sessionId));

  let merged = 0;
  for (const entry of srcData.entries || []) {
    if (existingIds.has(entry.sessionId)) {
      process.stderr.write(`  Warning: skipping duplicate session '${entry.sessionId}'\n`);
      continue;
    }
    if (entry.projectPath === oldPath) {
      entry.projectPath = newPath;
    }
    const fullPath = entry.fullPath || "";
    if (fullPath.includes(oldEncoded)) {
      entry.fullPath = fullPath.replace(oldEncoded, newEncoded);
    }
    if (!dstData.entries) dstData.entries = [];
    dstData.entries.push(entry);
    merged++;
  }

  if (dstData.originalPath === oldPath) {
    dstData.originalPath = newPath;
  }

  if (merged > 0 && !dryRun) {
    writeFileSync(dstIndex, JSON.stringify(dstData, null, 2), "utf-8");
  }

  return merged;
}

export function replacePathValues(obj, oldPath, newPath) {
  let changed = false;
  const keys = Array.isArray(obj) ? [...obj.keys()] : Object.keys(obj);
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "string") {
      if (val === oldPath || val.startsWith(oldPath + "/")) {
        obj[key] = newPath + val.slice(oldPath.length);
        changed = true;
      }
    } else if (val && typeof val === "object") {
      if (replacePathValues(val, oldPath, newPath)) {
        changed = true;
      }
    }
  }
  return changed;
}

function replaceInFile(filePath, oldPath, newPath, dryRun) {
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return 0;
  }

  const lines = content.split("\n");
  let linesChanged = 0;
  const newLines = [];

  for (const line of lines) {
    if (!line.includes(oldPath)) {
      newLines.push(line);
      continue;
    }

    const stripped = line.trimEnd();
    try {
      const obj = JSON.parse(stripped);
      if (replacePathValues(obj, oldPath, newPath)) {
        newLines.push(JSON.stringify(obj));
        linesChanged++;
      } else {
        newLines.push(line);
      }
    } catch {
      newLines.push(line.replaceAll(oldPath, newPath));
      linesChanged++;
    }
  }

  if (linesChanged > 0 && !dryRun) {
    const tmpPath = filePath + ".tmp";
    try {
      writeFileSync(tmpPath, newLines.join("\n"), "utf-8");
      renameSync(tmpPath, filePath);
    } catch {
      try { unlinkSync(tmpPath); } catch { /* ignore */ }
      throw new Error(`Failed to write ${filePath}`);
    }
  }

  return linesChanged;
}

function findJsonlFilesRecursive(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findJsonlFilesRecursive(full));
      else if (entry.name.endsWith(".jsonl")) results.push(full);
    }
  } catch {
    // ignore
  }
  return results;
}
