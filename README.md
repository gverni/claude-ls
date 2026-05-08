# claude-ls

CLI tool for managing Claude Code projects. List, inspect, move, search, and prune your `~/.claude/projects/` directory.

## Install

```bash
npm install -g claude-ls
```

Requires Node.js >= 18.

## Usage

```bash
claude-ls list                        # List all projects
claude-ls list --sort recent          # Sort by last used
claude-ls list --orphaned             # Show only orphaned projects
claude-ls inspect <path>              # Show project settings, MCPs, CLAUDE.md
claude-ls mv <old> <new>              # Move project and update references
claude-ls remap <old> <new>           # Update references (dir already moved)
claude-ls search <query>              # Search across projects
claude-ls prune                       # Remove orphaned projects
```

## Status

Work in progress. `list` is implemented, other commands coming soon.

## Licence

MIT
