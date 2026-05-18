# claude-ls

CLI tool for managing Claude Code projects.

⚠️ **Disclaimer**: This is not an official Anthropic tool. The logic has been implemented by reverse-engineering the documentation and the `~/.claude` directory structure. Use at your own risk.

## Why

You're working in the terminal, you create a new folder, start a Claude Code session, build out your project... and then realise the folder name is wrong. Maybe it's a typo, maybe the scope changed, maybe you just want to reorganise.

Normally you'd just `mv` the folder. But Claude Code stores session history, permissions, and settings in `~/.claude/` keyed by the project path. Rename the folder and Claude loses track: your conversation history, your approved tools, your MCP configs all become orphaned.

`claude-ls` was born to fix this. It moves your project directory and updates all the internal references, so you keep your full context and chat history intact.

But it grew from there. `claude-ls` is the project management CLI that Claude Code doesn't have yet: list your projects, inspect their settings, search across them.

## Install

```bash
git clone https://github.com/gverni/claude-ls.git
cd claude-ls
npm install
npm link
```

This makes the `claude-ls` command available globally on your system.

Requires Node.js >= 18.

## Commands

### `claude-ls list`

List all projects tracked by Claude Code.

```bash
claude-ls list                        # List all projects (alphabetical)
claude-ls list --sort recent          # Sort by most recently used
claude-ls list --sort oldest          # Sort by least recently used
claude-ls list --orphaned             # Show only orphaned projects
claude-ls list --json                 # Output as JSON
claude-ls list --claude-dir <path>    # Override Claude data directory
```

**Example output:**

```
● ~/projects/my-app (git)
  ⎿  sessions: 5, last active: 2026-05-10 14:30
  ⎿  ● ~/projects/my-app/packages/frontend
     ⎿  sessions: 2, last active: 2026-05-09 11:00
  ⎿  ● ~/worktrees/my-app-feature (worktree)
     ⎿  sessions: 1, last active: 2026-05-08 16:45

● ~/projects/scripts
  ⎿  sessions: 3, last active: 2026-04-20 09:15

● ~/old/deleted-project (orphaned)
  ⎿  sessions: 2, last active: 2026-03-01 10:00
```

**Entry types:**

- **Project** - a folder where you've run Claude Code. Can be a standalone directory or a git repo (marked with `(git)`).
- **Subfolder** - only applies to git repos. Shown indented under the parent project. Claude Code creates a separate session directory for each subdirectory you run it from, but permissions and MCP configs are stored on the git root.
- **Worktree** - shown indented under the parent repo, marked with `(worktree)`. Git worktrees have their own directory on disk (possibly with a completely different path), but Claude Code tracks them under the main repository.
- **Orphaned** - marked with `(orphaned)`. The directory no longer exists on disk but Claude still has data for it. Use `claude-ls prune` or `claude project purge` to clean up.

**Source labels** (shown when a project was not found in `~/.claude.json`):

- `[jsonl]` - path was read from a session file's `cwd` field. This happens for git subfolders, worktrees, and any project whose `~/.claude.json` entry is missing.
- `[decoded]` - path was guessed by decoding the directory name. This is a last resort and is lossy: dashes in the original path are indistinguishable from encoded slashes.

### `claude-ls mv <old-path> <new-path>`

Move a project directory and update all Claude Code internal references.

```bash
claude-ls mv ~/projects/old ~/projects/new
claude-ls mv ~/old ~/new --dry-run          # Preview without changes
claude-ls mv ~/old ~/new --yes              # Skip confirmation
claude-ls mv ~/old ~/new --no-backup        # Skip backup
claude-ls mv ~/old ~/new --verbose          # Detailed output
claude-ls mv ~/old ~/new --claude-dir <path>
```

#### Move behaviour by project type

Before moving, `claude-ls mv` classifies the source path and adjusts its behaviour:

| Scenario | What happens |
|----------|-------------|
| **Tracked project** | The path is in `~/.claude.json`. Moves the directory and updates all Claude Code references. This is the normal case. |
| **Subfolder of a git project** | The path is a subdirectory of a tracked git repo. Shows a warning: permissions, MCP configs, and approved tools are stored on the parent and will not be transferred. Asks for confirmation before proceeding. |
| **Git worktree** | Refuses to move. Claude Code stores worktree data under the main repository, so moving the worktree directory alone would break things. Use `git worktree move` instead, then `claude-ls remap` to update references. |
| **Untracked path** | Refuses to move. The path has no entry in `~/.claude.json` and no session data in `~/.claude/projects/`. There is nothing for Claude Code to update. |

### `claude-ls remap <old-path> <new-path>`

Update Claude Code references only (directory already moved manually).

Use this when you've already renamed or moved the folder yourself and just need Claude to catch up.

```bash
claude-ls remap ~/old/path ~/new/path
claude-ls remap ~/old ~/new --dry-run
claude-ls remap ~/old ~/new --yes
claude-ls remap ~/old ~/new --no-backup
claude-ls remap ~/old ~/new --verbose
claude-ls remap ~/old ~/new --claude-dir <path>
```

### `claude-ls search <query>`

Search for projects by path name.

```bash
claude-ls search payment              # Find projects whose path contains "payment"
claude-ls search --json               # Output as JSON
claude-ls search --claude-dir <path>  # Override Claude data directory
```

Search is case-insensitive and includes orphaned projects (no disk access required for path matching).

### `claude-ls prune [path]`

Delete Claude Code data for an orphaned project. Try `claude project purge` first - use this only as a fallback if that command is not available on your system.

```bash
claude-ls prune ~/old/deleted-project   # Prune a specific orphaned project
claude-ls prune --all                   # Prune all orphaned projects
claude-ls prune --all --dry-run         # Preview what would be deleted
claude-ls prune --all --yes             # Skip confirmation prompt
claude-ls prune --claude-dir <path>     # Override Claude data directory
```

Prune removes:
- The session directory in `~/.claude/projects/`
- The project entry in `~/.claude.json`
- Matching lines in `~/.claude/history.jsonl`
- Matching files in `~/.claude/usage-data/session-meta/`

### `claude-ls inspect <path>` - coming soon

Show project properties (settings, MCPs, CLAUDE.md, memory, sessions).

## Status

| Command   | Status      |
|-----------|-------------|
| `list`    | done        |
| `mv`      | done        |
| `remap`   | done        |
| `search`  | done (path search) |
| `prune`   | done        |
| `inspect` | coming soon |

## Licence

MIT
