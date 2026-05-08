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

  const filtered = opts.orphaned ? withStatus.filter((p) => !p.exists) : withStatus;

  if (opts.json) {
    console.log(JSON.stringify(filtered.map(({ encodedName, ...rest }) => rest)));
    return;
  }

  if (filtered.length === 0) {
    console.log("No orphaned projects found.");
    return;
  }

  console.log(chalk.bold(`Claude Code projects in ${claudeDir}/projects/\n`));

  for (const p of filtered) {
    const status = p.exists ? chalk.green(" ✓") : chalk.red.dim(" ✗ orphaned");
    let modified = p.lastModified || "unknown";
    if (modified.includes("T")) modified = modified.slice(0, 16).replace("T", " ");

    console.log(`  ${chalk.bold(p.projectPath)}${status}`);
    console.log(`    ${chalk.dim("sessions:")} ${p.sessionCount}  ${chalk.dim("last active:")} ${modified}`);
    console.log();
  }

  const total = filtered.length;
  const onDisk = filtered.filter((p) => p.exists).length;
  const orphaned = total - onDisk;
  const parts = [`${onDisk} on disk`];
  if (orphaned) parts.push(`${orphaned} orphaned`);
  const label = `${total} project${total !== 1 ? "s" : ""}`;
  console.log(chalk.dim(`${label} (${parts.join(", ")})`));
}
