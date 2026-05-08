import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { encodePath } from "./encoder.js";

export function findClaudeDir() {
  return join(homedir(), ".claude");
}

export function findProjectDir(claudeDir, projectPath) {
  const projectsDir = join(claudeDir, "projects");
  if (!existsSync(projectsDir)) return null;

  const encoded = encodePath(projectPath);
  const candidate = join(projectsDir, encoded);
  if (existsSync(candidate)) return candidate;

  const normalized = resolve(projectPath);
  const entries = readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const indexFile = join(projectsDir, entry.name, "sessions-index.json");
    if (!existsSync(indexFile)) continue;
    try {
      const data = JSON.parse(readFileSync(indexFile, "utf-8"));
      const original = data.originalPath || "";
      if (resolve(original) === normalized) return join(projectsDir, entry.name);
      const indexEntries = data.entries || [];
      if (indexEntries.length > 0) {
        const pp = indexEntries[0].projectPath || "";
        if (resolve(pp) === normalized) return join(projectsDir, entry.name);
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function listProjects(claudeDir) {
  const projectsDir = join(claudeDir, "projects");
  if (!existsSync(projectsDir)) return [];

  const results = [];
  const entries = readdirSync(projectsDir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = join(projectsDir, entry.name);
    let projectPath = null;
    let lastModified = null;
    let sessionCount = 0;

    const indexFile = join(entryPath, "sessions-index.json");
    if (existsSync(indexFile)) {
      try {
        const data = JSON.parse(readFileSync(indexFile, "utf-8"));
        projectPath = data.originalPath || null;
        const indexEntries = data.entries || [];
        if (!projectPath && indexEntries.length > 0) {
          projectPath = indexEntries[0].projectPath || null;
        }
        sessionCount = indexEntries.length;
        if (indexEntries.length > 0) {
          lastModified = indexEntries.reduce(
            (max, e) => (e.modified > max ? e.modified : max),
            ""
          );
        }
      } catch {
        // ignore
      }
    }

    if (sessionCount === 0) {
      const jsonlFiles = findJsonlFiles(entryPath);
      sessionCount = jsonlFiles.length;
      if (jsonlFiles.length > 0 && !lastModified) {
        let mostRecent = 0;
        for (const f of jsonlFiles) {
          const mtime = statSync(f).mtimeMs;
          if (mtime > mostRecent) mostRecent = mtime;
        }
        lastModified = new Date(mostRecent).toISOString();
      }
      if (!projectPath && jsonlFiles.length > 0) {
        projectPath = readCwdFromJsonl(jsonlFiles[0]);
      }
    }

    if (!projectPath) {
      projectPath = "/" + entry.name.slice(1).replaceAll("-", "/");
    }

    results.push({
      encodedName: entry.name,
      projectPath,
      sessionCount,
      lastModified,
    });
  }

  return results;
}

function findJsonlFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) results.push(...findJsonlFiles(full));
      else if (entry.name.endsWith(".jsonl")) results.push(full);
    }
  } catch {
    // ignore
  }
  return results;
}

function readCwdFromJsonl(jsonlFile) {
  try {
    const content = readFileSync(jsonlFile, "utf-8");
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.cwd) return obj.cwd;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }
  return null;
}
