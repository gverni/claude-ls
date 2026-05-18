#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));

const program = new Command();

program
  .name("claude-ls")
  .description("CLI tool for managing Claude Code projects")
  .version(pkg.version);

program
  .command("list")
  .description("List all projects tracked by Claude Code")
  .option("--json", "Output as JSON")
  .option("--orphaned", "Show only orphaned projects")
  .option("--sort <order>", "Sort order: recent, oldest, alpha (default: alpha)", "alpha")
  .option("--claude-dir <path>", "Override Claude data directory")
  .action(async (opts) => {
    const { listCommand } = await import("./commands/list.js");
    await listCommand(opts);
  });

program
  .command("inspect <path>")
  .description("Show project properties (settings, MCPs, CLAUDE.md, sessions)")
  .option("--json", "Output as JSON")
  .option("--section <name>", "Show only one section (settings, mcps, memory, claudemd, sessions)")
  .option("--full", "Show full CLAUDE.md instead of truncated")
  .option("--claude-dir <path>", "Override Claude data directory")
  .action(async (path, opts) => {
    const { inspectCommand } = await import("./commands/inspect.js");
    await inspectCommand(path, opts);
  });

program
  .command("mv <old-path> <new-path>")
  .description("Move project directory and update all Claude references")
  .option("--dry-run", "Preview changes without modifying files")
  .option("--no-backup", "Skip creating a backup")
  .option("--yes, -y", "Skip confirmation prompt")
  .option("--verbose, -v", "Show detailed output")
  .option("--claude-dir <path>", "Override Claude data directory")
  .action(async (oldPath, newPath, opts) => {
    const { mvCommand } = await import("./commands/mv.js");
    await mvCommand(oldPath, newPath, opts);
  });

program
  .command("remap <old-path> <new-path>")
  .description("Update Claude references only (directory already moved)")
  .option("--dry-run", "Preview changes without modifying files")
  .option("--no-backup", "Skip creating a backup")
  .option("--yes, -y", "Skip confirmation prompt")
  .option("--verbose, -v", "Show detailed output")
  .option("--claude-dir <path>", "Override Claude data directory")
  .action(async (oldPath, newPath, opts) => {
    const { remapCommand } = await import("./commands/remap.js");
    await remapCommand(oldPath, newPath, opts);
  });

program
  .command("prune [path]")
  .description("Delete Claude data for an orphaned project")
  .option("--all", "Prune all orphaned projects")
  .option("--dry-run", "Preview changes without modifying files")
  .option("--yes, -y", "Skip confirmation prompt")
  .option("--claude-dir <path>", "Override Claude data directory")
  .action(async (path, opts) => {
    const { pruneCommand } = await import("./commands/prune.js");
    await pruneCommand(path, opts);
  });

program
  .command("search <query>")
  .description("Search across projects (CLAUDE.md, settings, sessions)")
  .option("--json", "Output as JSON")
  .option("--claude-dir <path>", "Override Claude data directory")
  .action(async (query, opts) => {
    const { searchCommand } = await import("./commands/search.js");
    await searchCommand(query, opts);
  });


program.parse();
