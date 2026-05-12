import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, readdirSync } from "fs";
import { join } from "path";

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

export function updateJsonlCwd(projectDir, oldPath, newPath, { dryRun = false, verbose = false } = {}) {
  if (!existsSync(projectDir)) return 0;

  let filesUpdated = 0;
  const jsonlFiles = findJsonlFilesRecursive(projectDir);

  for (const file of jsonlFiles) {
    let content;
    try {
      content = readFileSync(file, "utf-8");
    } catch {
      continue;
    }

    const lines = content.split("\n");
    let changed = false;
    const newLines = [];

    for (const line of lines) {
      if (!line.trim()) {
        newLines.push(line);
        continue;
      }
      try {
        const obj = JSON.parse(line);
        if (obj.cwd && (obj.cwd === oldPath || obj.cwd.startsWith(oldPath + "/"))) {
          obj.cwd = newPath + obj.cwd.slice(oldPath.length);
          newLines.push(JSON.stringify(obj));
          changed = true;
        } else {
          newLines.push(line);
        }
      } catch {
        newLines.push(line);
      }
    }

    if (changed) {
      filesUpdated++;
      if (verbose) {
        const rel = file.slice(projectDir.length + 1);
        process.stderr.write(`    ${rel}: updated cwd\n`);
      }
      if (!dryRun) {
        const tmpPath = file + ".tmp";
        try {
          writeFileSync(tmpPath, newLines.join("\n"), "utf-8");
          renameSync(tmpPath, file);
        } catch {
          try { unlinkSync(tmpPath); } catch { /* ignore */ }
        }
      }
    }
  }

  return filesUpdated;
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
  } catch { /* ignore */ }
  return results;
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

