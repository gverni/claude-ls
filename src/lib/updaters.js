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

export function updateClaudeJson(jsonPath, oldPath, newPath, { dryRun = false, verbose = false } = {}) {
  if (!existsSync(jsonPath)) return 0;

  let data;
  try {
    data = JSON.parse(readFileSync(jsonPath, "utf-8"));
  } catch {
    return 0;
  }

  const projects = data.projects;
  if (!projects || typeof projects !== "object") return 0;

  let keysRenamed = 0;
  for (const key of Object.keys(projects)) {
    if (key === oldPath || key.startsWith(oldPath + "/")) {
      const newKey = newPath + key.slice(oldPath.length);
      projects[newKey] = projects[key];
      delete projects[key];
      keysRenamed++;
    }
  }

  if (keysRenamed > 0) {
    if (verbose) process.stderr.write(`    .claude.json: renamed ${keysRenamed} project key(s)\n`);
    if (!dryRun) {
      writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
    }
  }

  return keysRenamed;
}

export function updateHistory(historyPath, oldPath, newPath, { dryRun = false, verbose = false } = {}) {
  if (!existsSync(historyPath)) return 0;
  const count = replaceInFile(historyPath, oldPath, newPath, dryRun);
  if (verbose && count) {
    process.stderr.write(`    history.jsonl: ${count} line(s) changed\n`);
  }
  return count;
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

