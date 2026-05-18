import { existsSync, rmSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from "fs";
import { join, resolve } from "path";
import { createInterface } from "readline";
import chalk from "chalk";
import { findClaudeDir, findProjectDir, listProjects } from "../lib/scanner.js";

const DISCLAIMER =
  "Try 'claude project purge' first — use this command only as a fallback\n" +
  "  if that command is not available on your system.\n";

function confirm(prompt) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

export async function pruneCommand(targetPath, opts = {}) {
  const claudeDir = opts.claudeDir || findClaudeDir();

  console.log(chalk.yellow("⚠  " + DISCLAIMER));

  if (!targetPath && !opts.all) {
    console.error(chalk.red("Specify a project path or use --all to prune all orphaned projects."));
    process.exit(1);
  }

  let targets;

  if (opts.all) {
    const projects = listProjects(claudeDir);
    const all = [];
    for (const p of projects) {
      all.push(p);
      for (const sub of p.subfolders || []) all.push(sub);
    }
    targets = all.filter((p) => !p.exists).map((p) => p.projectPath);
    if (targets.length === 0) {
      console.log("No orphaned projects found.");
      return;
    }
    console.log(`Found ${targets.length} orphaned project(s):`);
    for (const t of targets) console.log(`  ${chalk.dim(t)}`);
    console.log();
  } else {
    const resolved = resolve(targetPath);
    if (existsSync(resolved)) {
      console.error(chalk.red(`● Error: Directory still exists: ${resolved}`));
      console.error("  Only orphaned projects (where the directory no longer exists on disk) can be pruned.");
      console.error("  Delete the directory first, then run this command.");
      process.exit(1);
    }
    targets = [resolved];
  }

  if (opts.dryRun) {
    console.log(chalk.yellow.bold("DRY RUN - no files will be modified\n"));
  }

  for (const path of targets) {
    const preview = buildPreview(path, claudeDir);
    console.log(chalk.bold(path));
    if (preview.sessionCount > 0) {
      console.log(`  ⎿  ${preview.sessionCount} session file(s) in ~/.claude/projects/`);
    }
    if (preview.claudeJsonKeys > 0) {
      console.log(`  ⎿  ${preview.claudeJsonKeys} key(s) in ~/.claude.json`);
    }
    if (preview.historyLines > 0) {
      console.log(`  ⎿  ${preview.historyLines} line(s) in history.jsonl`);
    }
    if (preview.usageDataFiles > 0) {
      console.log(`  ⎿  ${preview.usageDataFiles} usage-data file(s)`);
    }
  }
  console.log();

  if (!opts.dryRun && !opts.yes) {
    const msg =
      targets.length === 1
        ? "Prune this project?"
        : `Prune all ${targets.length} orphaned projects?`;
    const confirmed = await confirm(msg);
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  if (!opts.dryRun) {
    for (const path of targets) {
      pruneOne(path, claudeDir);
    }
    console.log(chalk.green.bold("● Done!"));
  }
}

function buildPreview(targetPath, claudeDir) {
  const projectDir = findProjectDir(claudeDir, targetPath);
  const claudeJsonPath = join(claudeDir, "..", ".claude.json");
  const historyPath = join(claudeDir, "history.jsonl");
  return {
    projectDir,
    sessionCount: projectDir ? countJsonlFiles(projectDir) : 0,
    claudeJsonKeys: countClaudeJsonKeys(claudeJsonPath, targetPath),
    historyLines: countHistoryLines(historyPath, targetPath),
    usageDataFiles: countUsageDataFiles(claudeDir, targetPath),
  };
}

function pruneOne(targetPath, claudeDir) {
  const projectDir = findProjectDir(claudeDir, targetPath);
  if (projectDir && existsSync(projectDir)) {
    rmSync(projectDir, { recursive: true });
  }
  deleteFromClaudeJson(join(claudeDir, "..", ".claude.json"), targetPath);
  deleteFromHistory(join(claudeDir, "history.jsonl"), targetPath);
  deleteFromUsageData(claudeDir, targetPath);
}

// --- Count helpers ---

function countJsonlFiles(dir) {
  let count = 0;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.endsWith(".jsonl")) count++;
      else if (entry.isDirectory()) count += countJsonlFiles(join(dir, entry.name));
    }
  } catch {}
  return count;
}

function countClaudeJsonKeys(jsonPath, targetPath) {
  if (!existsSync(jsonPath)) return 0;
  try {
    const projects = JSON.parse(readFileSync(jsonPath, "utf-8")).projects || {};
    return Object.keys(projects).filter((k) => k === targetPath || k.startsWith(targetPath + "/")).length;
  } catch {
    return 0;
  }
}

function countHistoryLines(historyPath, targetPath) {
  if (!existsSync(historyPath)) return 0;
  try {
    return readFileSync(historyPath, "utf-8")
      .split("\n")
      .filter((line) => {
        if (!line.trim()) return false;
        try {
          const p = JSON.parse(line).project || "";
          return p === targetPath || p.startsWith(targetPath + "/");
        } catch {
          return false;
        }
      }).length;
  } catch {
    return 0;
  }
}

function countUsageDataFiles(claudeDir, targetPath) {
  const metaDir = join(claudeDir, "usage-data", "session-meta");
  if (!existsSync(metaDir)) return 0;
  let count = 0;
  try {
    for (const file of readdirSync(metaDir).filter((f) => f.endsWith(".json"))) {
      try {
        const pp = JSON.parse(readFileSync(join(metaDir, file), "utf-8")).project_path || "";
        if (pp === targetPath || pp.startsWith(targetPath + "/")) count++;
      } catch {}
    }
  } catch {}
  return count;
}

// --- Delete helpers ---

function deleteFromClaudeJson(jsonPath, targetPath) {
  if (!existsSync(jsonPath)) return;
  try {
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
    const projects = data.projects || {};
    let changed = false;
    for (const key of Object.keys(projects)) {
      if (key === targetPath || key.startsWith(targetPath + "/")) {
        delete projects[key];
        changed = true;
      }
    }
    if (changed) writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

function deleteFromHistory(historyPath, targetPath) {
  if (!existsSync(historyPath)) return;
  try {
    const kept = readFileSync(historyPath, "utf-8")
      .split("\n")
      .filter((line) => {
        if (!line.trim()) return true;
        try {
          const p = JSON.parse(line).project || "";
          return !(p === targetPath || p.startsWith(targetPath + "/"));
        } catch {
          return true;
        }
      });
    writeFileSync(historyPath, kept.join("\n"), "utf-8");
  } catch {}
}

function deleteFromUsageData(claudeDir, targetPath) {
  const metaDir = join(claudeDir, "usage-data", "session-meta");
  if (!existsSync(metaDir)) return;
  try {
    for (const file of readdirSync(metaDir).filter((f) => f.endsWith(".json"))) {
      const filePath = join(metaDir, file);
      try {
        const pp = JSON.parse(readFileSync(filePath, "utf-8")).project_path || "";
        if (pp === targetPath || pp.startsWith(targetPath + "/")) unlinkSync(filePath);
      } catch {}
    }
  } catch {}
}
