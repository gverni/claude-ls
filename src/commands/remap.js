import { resolve } from "path";
import { createInterface } from "readline";
import chalk from "chalk";
import { remapProject, previewOperation, classifyProject, MoveError } from "../lib/mover.js";

function confirm(prompt) {
  return new Promise((res) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close();
      res(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes");
    });
  });
}

export async function remapCommand(oldPath, newPath, opts = {}) {
  oldPath = resolve(oldPath.replace(/^~/, process.env.HOME));
  newPath = resolve(newPath.replace(/^~/, process.env.HOME));
  const claudeDir = opts.claudeDir ? resolve(opts.claudeDir.replace(/^~/, process.env.HOME)) : null;

  if (opts.dryRun) {
    console.log(chalk.yellow.bold("DRY RUN - no files will be modified\n"));
  }

  console.log(`● ${chalk.bold("Old:")} ${oldPath}`);
  console.log(`  ⎿  ${chalk.bold("New:")} ${newPath}\n`);

  const classification = classifyProject(oldPath, claudeDir);

  if (classification.type === "worktree") {
    console.error(chalk.red("● Error: This directory is a git worktree."));
    console.error("  Claude Code stores worktree data under the main repository.");
    console.error("  Use 'git worktree move' to relocate it, then remap from the main repo path.");
    console.error(chalk.dim("\n  More info: https://github.com/gverni/claude-ls#move-behaviour-by-project-type"));
    process.exit(1);
  }

  if (classification.type === "untracked") {
    console.error(chalk.red("● Error: This path is not tracked by Claude Code."));
    console.error("  It has no entry in ~/.claude.json and no project directory in ~/.claude/projects/.");
    console.error("  Tip: run 'claude-ls list' to see tracked projects.");
    console.error(chalk.dim("\n  More info: https://github.com/gverni/claude-ls#move-behaviour-by-project-type"));
    process.exit(1);
  }

  let updateCwd = false;

  if (classification.type === "subfolder") {
    console.log(chalk.yellow.bold("  ⚠  Warning: This project is not in ~/.claude.json."));
    console.log(`  It appears to be a subfolder of ${chalk.bold(classification.parentPath)} (git).`);
    console.log("  Permissions, MCP configs, and approved tools are stored on the parent project");
    console.log("  and will NOT be transferred.\n");
    console.log(chalk.yellow("  Only proceed if you know what you are doing."));
    console.log(chalk.dim("\n  More info: https://github.com/gverni/claude-ls#move-behaviour-by-project-type\n"));

    if (!opts.yes && !opts.dryRun) {
      const confirmed = await confirm("Continue anyway?");
      if (!confirmed) {
        console.log("Aborted.");
        process.exit(0);
      }
    }
    updateCwd = true;
  }

  if (!opts.dryRun && !opts.yes) {
    const preview = previewOperation(oldPath, claudeDir);
    if (preview.projectFound) {
      console.log(`  ${chalk.dim("Will update:")}`);
      if (preview.sessionCount) console.log(`    - ${preview.sessionCount} session file(s)`);
      if (preview.hasHistory) console.log("    - history.jsonl");
    }
    console.log();

    const confirmed = await confirm("Update all Claude Code references to the new path?");
    if (!confirmed) {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  try {
    const result = remapProject(oldPath, newPath, {
      claudeDir,
      dryRun: opts.dryRun,
      noBackup: opts.noBackup,
      verbose: opts.verbose,
      updateCwd,
    });
    console.log(chalk.green.bold("● Done!"));
    console.log(result.summary());
  } catch (e) {
    if (e instanceof MoveError) {
      console.error(chalk.red(`● Error: ${e.message}`));
      process.exit(1);
    }
    throw e;
  }
}
