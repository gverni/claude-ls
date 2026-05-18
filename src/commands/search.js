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
  const matches = allProjects.filter((p) => p.projectPath.toLowerCase().includes(lower));

  if (opts.json) {
    console.log(JSON.stringify(matches.map((p) => ({ projectPath: p.projectPath, exists: p.exists }))));
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
  }

  console.log(chalk.dim(`\n${matches.length} match${matches.length !== 1 ? "es" : ""}`));
}
