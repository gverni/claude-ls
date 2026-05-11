import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { encodePath } from "./encoder.js";

export function findClaudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

export function findProjectDir(claudeDir, projectPath) {
  const projectsDir = join(claudeDir, "projects");
  if (!existsSync(projectsDir)) return null;

  const encoded = encodePath(projectPath);
  const candidate = join(projectsDir, encoded);
  if (existsSync(candidate)) return candidate;

  return null;
}

export function listProjects(claudeDir) {
  const projectsDir = join(claudeDir, "projects");
  if (!existsSync(projectsDir)) return [];

  const claudeJsonPath = join(claudeDir, "..", ".claude.json");
  const claudeJsonProjects = loadClaudeJsonPaths(claudeJsonPath);

  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  const encodedToMeta = new Map();
  for (const dirName of projectDirs) {
    encodedToMeta.set(dirName, getDirectoryMeta(join(projectsDir, dirName)));
  }

  const results = [];
  const matched = new Set();

  for (const projectPath of claudeJsonProjects) {
    const encoded = encodePath(projectPath);
    const meta = encodedToMeta.get(encoded);
    const isGit = existsSync(join(projectPath, ".git"));
    const exists = existsSync(projectPath);

    const subfolders = [];
    if (isGit) {
      for (const [dirName, dirMeta] of encodedToMeta) {
        if (dirName === encoded) continue;
        if (matched.has(dirName)) continue;
        const cwd = dirMeta.cwd;
        if (cwd && cwd.startsWith(projectPath + "/")) {
          subfolders.push({
            projectPath: cwd,
            ...dirMeta,
            exists: existsSync(cwd),
          });
          matched.add(dirName);
        }
      }
    }

    matched.add(encoded);
    results.push({
      projectPath,
      sessionCount: meta ? meta.sessionCount : 0,
      lastModified: meta ? meta.lastModified : null,
      exists,
      isGit,
      subfolders,
      source: "claude.json",
    });
  }

  for (const [dirName, meta] of encodedToMeta) {
    if (matched.has(dirName)) continue;
    const projectPath = meta.cwd || ("/" + dirName.slice(1).replaceAll("-", "/"));
    results.push({
      projectPath,
      sessionCount: meta.sessionCount,
      lastModified: meta.lastModified,
      exists: existsSync(projectPath),
      isGit: false,
      subfolders: [],
      source: meta.cwd ? "jsonl" : "decoded",
    });
  }

  return results;
}

function getDirectoryMeta(dirPath) {
  const jsonlFiles = findJsonlFiles(dirPath);
  let lastModified = null;
  let mostRecent = 0;

  for (const f of jsonlFiles) {
    const mtime = statSync(f).mtimeMs;
    if (mtime > mostRecent) mostRecent = mtime;
  }
  if (mostRecent > 0) {
    lastModified = new Date(mostRecent).toISOString();
  }

  const cwd = jsonlFiles.length > 0 ? readCwdFromJsonl(jsonlFiles[0]) : null;

  return { sessionCount: jsonlFiles.length, lastModified, cwd };
}

function loadClaudeJsonPaths(claudeJsonPath) {
  if (!existsSync(claudeJsonPath)) return [];

  try {
    const data = JSON.parse(readFileSync(claudeJsonPath, "utf-8"));
    const projects = data.projects || {};
    return Object.keys(projects);
  } catch {
    return [];
  }
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
