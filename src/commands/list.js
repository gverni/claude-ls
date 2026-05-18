import chalk from "chalk";
import { findClaudeDir, listProjects } from "../lib/scanner.js";

export async function listCommand(opts = {}) {
  const claudeDir = opts.claudeDir || findClaudeDir();
  const projects = listProjects(claudeDir);

  if (projects.length === 0) {
    console.log("No Claude Code projects found.");
    return;
  }

  let filtered = opts.orphaned
    ? projects.filter((p) => !p.exists)
    : projects;

  const sort = opts.sort || "alpha";
  if (sort === "recent") {
    filtered = [...filtered].sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));
  } else if (sort === "oldest") {
    filtered = [...filtered].sort((a, b) => (a.lastModified || "").localeCompare(b.lastModified || ""));
  } else {
    filtered = [...filtered].sort((a, b) => a.projectPath.localeCompare(b.projectPath));
  }

  if (opts.json) {
    console.log(JSON.stringify(filtered));
    return;
  }

  if (filtered.length === 0) {
    console.log("No orphaned projects found.");
    return;
  }

  for (const p of filtered) {
    const dot = p.exists ? chalk.green("●") : chalk.redBright("●");
    let modified = formatDate(p.lastModified);

    let label = p.projectPath;
    if (!p.exists) {
      label += p.source === "claude.json" ? " (orphaned)" : " (potentially orphaned)";
    }
    if (p.isGit) {
      label += chalk.dim(" (git)");
    }
    if (p.source !== "claude.json") {
      label += chalk.dim(` [${p.source}]`);
    }

    console.log(`${dot} ${chalk.bold(label)}`);
    if (p.sessionCount > 0) {
      console.log(`  ⎿  sessions: ${p.sessionCount}, last active: ${modified}`);
    } else {
      console.log(`  ⎿  ${chalk.yellow("no sessions")}`);
    }

    for (const sub of p.subfolders || []) {
      const subDot = sub.exists ? chalk.green("●") : chalk.redBright("●");
      let subLabel = sub.projectPath;
      if (!sub.exists) subLabel += " (potentially orphaned)";
      console.log(`  ⎿  ${subDot} ${subLabel}`);
      if (sub.sessionCount > 0) {
        console.log(`     ⎿  sessions: ${sub.sessionCount}, last active: ${formatDate(sub.lastModified)}`);
      }
    }

    for (const wt of p.worktrees || []) {
      const wtDot = chalk.green("●");
      console.log(`  ⎿  ${wtDot} ${wt.projectPath} ${chalk.dim("(worktree)")}`);
      if (wt.sessionCount > 0) {
        console.log(`     ⎿  sessions: ${wt.sessionCount}, last active: ${formatDate(wt.lastModified)}`);
      }
    }

    console.log();
  }

  const total = filtered.length;
  const subTotal = filtered.reduce((sum, p) => sum + (p.subfolders || []).length, 0);
  const onDisk = filtered.filter((p) => p.exists).length;
  const orphaned = total - onDisk;
  const parts = [`${onDisk} on disk`];
  if (orphaned) parts.push(`${orphaned} orphaned`);
  if (subTotal) parts.push(`${subTotal} subfolder${subTotal !== 1 ? "s" : ""}`);
  const label = `${total} project${total !== 1 ? "s" : ""}`;
  console.log(chalk.dim(`\n${label} (${parts.join(", ")})`));
}

function formatDate(dateStr) {
  if (!dateStr) return "unknown";
  if (dateStr.includes("T")) return dateStr.slice(0, 16).replace("T", " ");
  return dateStr;
}
