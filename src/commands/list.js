import { existsSync } from "fs";
import chalk from "chalk";
import { findClaudeDir, listProjects } from "../lib/scanner.js";

export async function listCommand(opts = {}) {
  const claudeDir = opts.claudeDir || findClaudeDir();
  const projects = listProjects(claudeDir);

  if (projects.length === 0) {
    console.log("No Claude Code projects found.");
    return;
  }

  const withStatus = projects.map((p) => ({
    ...p,
    exists: existsSync(p.projectPath),
  }));

  let filtered = opts.orphaned ? withStatus.filter((p) => !p.exists) : withStatus;

  const sort = opts.sort || "alpha";
  if (sort === "recent") {
    filtered = [...filtered].sort((a, b) => (b.lastModified || "").localeCompare(a.lastModified || ""));
  } else if (sort === "oldest") {
    filtered = [...filtered].sort((a, b) => (a.lastModified || "").localeCompare(b.lastModified || ""));
  } else {
    filtered = [...filtered].sort((a, b) => a.projectPath.localeCompare(b.projectPath));
  }

  if (opts.json) {
    console.log(JSON.stringify(filtered.map(({ encodedName, ...rest }) => rest)));
    return;
  }

  if (filtered.length === 0) {
    console.log("No orphaned projects found.");
    return;
  }

  for (const p of filtered) {
    const dot = p.exists ? chalk.green("●") : chalk.redBright("●");
    let modified = p.lastModified || "unknown";
    if (modified.includes("T")) modified = modified.slice(0, 16).replace("T", " ");

    const label = p.exists ? p.projectPath : `${p.projectPath} (orphaned)`;
    console.log(`${dot} ${chalk.bold(label)}`);
    console.log(`  ⎿  sessions: ${p.sessionCount}, last active: ${modified}`);
    console.log();
  }

  const total = filtered.length;
  const onDisk = filtered.filter((p) => p.exists).length;
  const orphaned = total - onDisk;
  const parts = [`${onDisk} on disk`];
  if (orphaned) parts.push(`${orphaned} orphaned`);
  const label = `${total} project${total !== 1 ? "s" : ""}`;
  console.log(chalk.dim(`\n${label} (${parts.join(", ")})`));
}
