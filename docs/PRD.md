# claude-ls - Product Requirements Document

## Overview

**claude-ls** is a Node.js CLI tool for managing Claude Code projects. It provides visibility and control over the `~/.claude/projects/` directory - listing, inspecting, moving, searching, and pruning projects.

## Problem Statement

Claude Code stores project data in `~/.claude/projects/` using path-encoded directory names. When users move, rename, or delete project directories, this data becomes orphaned or broken. There is no built-in way to inspect project settings, search across projects, or manage this data. No Node.js tool exists to fill this gap.

## Target Users

Claude Code power users who:
- Work across many projects
- Move or rename project directories
- Want visibility into per-project settings, MCPs, and permissions
- Need to clean up stale project data

## Commands

### `claude-ls list`

List all projects tracked by Claude Code.

**Output:** table with columns - path, status (exists/orphaned), session count, last active date.

**Flags:**
- `--json` - output as JSON
- `--orphaned` - show only orphaned projects

---

### `claude-ls inspect <path>`

Show detailed properties of a specific project.

**Sections displayed:**
- **Settings** - permissions, enabled plugins (from `.claude/settings.json`)
- **Local settings** - local overrides (from `.claude/settings.local.json`)
- **MCPs** - configured MCP servers
- **CLAUDE.md** - project instructions (first 20 lines, or full with `--full`)
- **Sessions** - count and last active date
- **Memory** - memory files if present

**Flags:**
- `--json` - output as JSON
- `--section <name>` - show only one section (settings, mcps, memory, claudemd, sessions)
- `--full` - show full CLAUDE.md instead of truncated

---

### `claude-ls mv <old-path> <new-path>`

Move a project directory and update all Claude Code internal references.

**What it updates:**
- Actual project directory on disk
- `~/.claude.json` - project keys renamed in `projects` object
- `~/.claude/projects/{encoded}/` directory (renamed)
- `sessions-index.json` - originalPath, projectPath, fullPath fields
- `~/.claude/history.jsonl` - project field
- `~/.claude/usage-data/session-meta/*.json` - project_path field

Note: session `.jsonl` files are conversation transcripts only and are not updated (no functional impact).

If the destination Claude data directory already exists, the command errors out.

**Flags:**
- `--dry-run` - preview changes without modifying files
- `--no-backup` - skip backup creation
- `--yes` / `-y` - skip confirmation prompt
- `--verbose` / `-v` - show detailed output
- `--claude-dir <path>` - override Claude data directory

---

### `claude-ls remap <old-path> <new-path>`

Update Claude Code references only (directory already moved manually).

Same flags and behaviour as `mv`, but skips moving the actual directory. Validates that `<new-path>` exists.

---

### `claude-ls search <query>`

Search across all projects for a string match.

**Searches in:**
- `CLAUDE.md` files in project directories
- `.claude/settings.json` files
- Session content (only with `--sessions` flag, as it can be slow)

**Output:** matching project path + context line.

**Flags:**
- `--json` - output as JSON
- `--sessions` - also search session `.jsonl` files

---

### ~~`claude-ls prune`~~ - removed

Not implementing. Claude Code already provides `claude project purge` which handles deleting project state (transcripts, memory, tasks, debug, file-history, history.jsonl entries, and the project's entry in `~/.claude.json`). Users should use that command directly. Orphaned projects can be identified with `claude-ls list --orphaned`.

---

### `claude-ls restore [timestamp]` (Phase 2)

Restore Claude data from a backup created by `mv` or `remap`.

**Flags:**
- `--list` - list available backups
- `--claude-dir <path>` - override Claude data directory

---

## Technical Requirements

- **Runtime:** Node.js >= 18
- **Dependencies:** `commander` (CLI framework) - no other runtime dependencies
- **Dev dependencies:** Node.js built-in test runner (`node:test`, `node:assert`)
- **Module system:** ESM (`"type": "module"`)
- **Binary name:** `claude-ls`
- **Development approach:** TDD - tests written before implementation

## Project Structure

```
claude-ls/
  package.json
  src/
    cli.js                  Entry point (commander setup)
    commands/
      list.js
      inspect.js
      mv.js
      remap.js
      search.js
      restore.js
    lib/
      encoder.js            Path encoding
      scanner.js            Project discovery
      updaters.js           File updaters for move/remap
      backup.js             Backup/restore utilities
      mover.js              Move orchestration
      format.js             Shared ANSI/output helpers
  test/
    encoder.test.js
    scanner.test.js
    updaters.test.js
    backup.test.js
    mover.test.js
    commands/
      list.test.js
      inspect.test.js
      mv.test.js
      search.test.js
      restore.test.js
```

## Development Approach - TDD

Each module follows red-green-refactor:

1. **Write test** - define expected behaviour
2. **Run test** - confirm it fails
3. **Implement** - write minimal code to pass
4. **Refactor** - clean up while tests stay green

Tests use a temporary `~/.claude`-like directory structure created in `beforeEach` and cleaned in `afterEach`. No tests touch the real `~/.claude` directory.

### Test fixtures

A shared test helper creates a fake Claude directory structure:
```
/tmp/claude-ls-test-{random}/
  projects/
    -tmp-test-project-alpha/
      sessions-index.json
      session1.jsonl
  history.jsonl
  usage-data/session-meta/session1.json
```

### Development order (one command at a time)

Each command is developed end-to-end (test + lib + command) before moving to the next:

1. **Scaffolding** - package.json, commander setup, format helpers, encoder, test fixtures helper
2. **list** - scanner lib + list command
3. **inspect** - inspect command (reads project settings, MCPs, CLAUDE.md, memory)
4. **search** - search command (searches across projects)
5. **mv** - updaters lib + mover lib + mv command
7. **remap** - remap command (reuses mover lib)

Phase 2:
8. **restore** - backup lib + restore command

## Non-goals

- No GUI or TUI
- No daemon/background processes
- No network calls (no update checker, no telemetry)
- No support for Windows (macOS/Linux only, matching Claude Code)
- No modification of Claude Code's own behaviour (read-only inspection)

## Success Criteria

- `claude-ls list` correctly shows all projects with accurate status
- `claude-ls mv` successfully moves a project and all references update
- `claude-ls inspect` displays settings, MCPs, and CLAUDE.md for any project
- `claude-ls search` finds matching projects
- Orphaned projects identifiable via `claude-ls list --orphaned` (removal delegated to `claude project purge`)
- All commands have `--json` output where applicable for scripting
- Full test suite passes with `npm test`
