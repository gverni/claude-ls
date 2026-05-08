# claude-ls

CLI tool for managing Claude Code projects. List, inspect, move, search, and prune your `~/.claude/projects/` directory.

## Install

```bash
npm install -g claude-ls
```

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

### `claude-ls mv <old-path> <new-path>`

Move a project directory and update all Claude Code internal references.

```bash
claude-ls mv ~/projects/old ~/projects/new
claude-ls mv ~/old ~/new --dry-run          # Preview without changes
claude-ls mv ~/old ~/new --yes              # Skip confirmation
claude-ls mv ~/old ~/new --merge            # Merge if destination has data
claude-ls mv ~/old ~/new --no-backup        # Skip backup
claude-ls mv ~/old ~/new --verbose          # Detailed output
claude-ls mv ~/old ~/new --claude-dir <path>
```

### `claude-ls remap <old-path> <new-path>`

Update Claude Code references only (directory already moved manually).

```bash
claude-ls remap ~/old/path ~/new/path
claude-ls remap ~/old ~/new --dry-run
claude-ls remap ~/old ~/new --yes
claude-ls remap ~/old ~/new --merge
claude-ls remap ~/old ~/new --no-backup
claude-ls remap ~/old ~/new --verbose
claude-ls remap ~/old ~/new --claude-dir <path>
```

### `claude-ls inspect <path>` - coming soon

Show project properties (settings, MCPs, CLAUDE.md, memory, sessions).

### `claude-ls search <query>` - coming soon

Search across all projects (CLAUDE.md, settings, session content).

## Status

| Command   | Status      |
|-----------|-------------|
| `list`    | done        |
| `mv`      | done        |
| `remap`   | done        |
| `inspect` | coming soon |
| `search`  | coming soon |

## Licence

MIT
