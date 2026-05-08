import { resolve } from "path";
import { createInterface } from "readline";
import chalk from "chalk";
import { remapProject, previewOperation, MoveError } from "../lib/mover.js";

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

  if (!opts.dryRun && !opts.yes) {
    const preview = previewOperation(oldPath, claudeDir);
    if (preview.projectFound) {
      console.log(`  ${chalk.dim("Will update:")}`);
      if (preview.sessionCount) console.log(`    - ${preview.sessionCount} session file(s)`);
      if (preview.hasHistory) console.log("    - history.jsonl");
    } else {
      console.log(`  ${chalk.yellow("Warning:")} Project not found in Claude data.`);
      console.log("  Tip: run 'claude-ls list' to see tracked projects.");
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
