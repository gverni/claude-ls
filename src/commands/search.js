import chalk from "chalk";
import { findClaudeDir, listProjects } from "../lib/scanner.js";

export async function searchCommand(query, opts = {}) {
  const claudeDir = opts.claudeDir || findClaudeDir();
  const projects = listProjects(claudeDir);

  const allProjects = [];
  for (const p of projects) {
    allProjects.push(p);
    for (const sub of p.subfolders || []) {
      allProjects.push(sub);
    }
  }

  const lower = query.toLowerCase();
  let matches = allProjects.filter((p) => p.projectPath.toLowerCase().includes(lower));

  const sort = opts.sort || "alpha";
  if (sort === "recent") {
    matches = matches.sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));
  } else if (sort === "oldest") {
    matches = matches.sort((a, b) => (a.lastModified || "").localeCompare(b.lastModified || ""));
  } else {
    matches = matches.sort((a, b) => a.projectPath.localeCompare(b.projectPath));
  }

  if (opts.json) {
    console.log(JSON.stringify(matches.map((p) => ({
      projectPath: p.projectPath,
      exists: p.exists,
      sessionCount: p.sessionCount,
      lastModified: p.lastModified,
    }))));
    return;
  }

  if (matches.length === 0) {
    console.log("No matches found.");
    return;
  }

  for (const p of matches) {
    const dot = p.exists ? chalk.green("●") : chalk.redBright("●");
    let label = p.projectPath;
    if (!p.exists) label += " (orphaned)";
    console.log(`${dot} ${chalk.bold(label)}`);
    if (p.sessionCount > 0) {
      console.log(`  ⎿  sessions: ${p.sessionCount}, last active: ${formatDate(p.lastModified)}`);
    } else {
      console.log(`  ⎿  ${chalk.yellow("no sessions")}`);
    }
  }

  console.log(chalk.dim(`\n${matches.length} match${matches.length !== 1 ? "es" : ""}`));
}

function formatDate(dateStr) {
  if (!dateStr) return "unknown";
  if (dateStr.includes("T")) return dateStr.slice(0, 16).replace("T", " ");
  return dateStr;
}
