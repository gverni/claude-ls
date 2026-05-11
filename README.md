# claude-ls

CLI tool for managing Claude Code projects.

> **Disclaimer**: This is not an official Anthropic tool. The logic has been implemented by reverse-engineering the documentation and the `~/.claude` directory structure. Use at your own risk.

## Why

You're working in the terminal, you create a new folder, start a Claude Code session, build out your project... and then realise the folder name is wrong. Maybe it's a typo, maybe the scope changed, maybe you just want to reorganise.

Normally you'd just `mv` the folder. But Claude Code stores session history, permissions, and settings in `~/.claude/` keyed by the project path. Rename the folder and Claude loses track: your conversation history, your approved tools, your MCP configs all become orphaned.

`claude-ls` was born to fix this. It moves your project directory and updates all the internal references, so you keep your full context and chat history intact.

But it grew from there. `claude-ls` is the project management CLI that Claude Code doesn't have yet: list your projects, inspect their settings, search across them.

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
claude-ls mv ~/old ~/new --no-backup        # Skip backup
claude-ls mv ~/old ~/new --verbose          # Detailed output
claude-ls mv ~/old ~/new --claude-dir <path>
```

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
