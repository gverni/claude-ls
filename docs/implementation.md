# Implementation Details

## Source of truth

The official Claude Code directory structure is documented at:
https://code.claude.com/docs/en/claude-directory

This document maps that structure to what `claude-ls` handles. If the official docs change, compare with this document to identify new data locations that may need updating.

---

## Claude Code data layout (from official docs)

### Global state

| Location | Keyed by | `mv`/`remap` | `inspect` | `search` |
|----------|----------|--------------|-----------|----------|
| `~/.claude.json` | - (has `projects` object keyed by path) | **Handled** - project keys renamed | Useful (permissions, MCPs) | - |
| `~/.claude/settings.json` | - | No path refs | Useful (global vs project comparison) | Searchable |
| `~/.claude/CLAUDE.md` | - | No path refs | Useful (global instructions) | Searchable |
| `~/.claude/history.jsonl` | - (lines have `project` field) | **Handled** | - | Searchable |
| `~/.claude/stats-cache.json` | - | No path refs | - | - |
| `~/.claude/keybindings.json` | - | No path refs | - | - |
| `~/.claude/plugins/` | - | No path refs | Useful (installed plugins) | - |
| `~/.claude/themes/` | - | No path refs | - | - |
| `~/.claude/rules/` | - | No path refs | Useful (global rules) | Searchable |
| `~/.claude/skills/` | - | No path refs | Useful (global skills) | Searchable |
| `~/.claude/commands/` | - | No path refs | Useful (global commands) | Searchable |
| `~/.claude/output-styles/` | - | No path refs | - | - |
| `~/.claude/agents/` | - | No path refs | Useful (global agents) | Searchable |
| `~/.claude/agent-memory/` | - | No path refs | Useful (global memory) | Searchable |

### Per-project data (encoded path)

| Location | Keyed by | `mv`/`remap` | `inspect` | `search` | `list` |
|----------|----------|--------------|-----------|----------|--------|
| `~/.claude/projects/{encoded}/` | Encoded path | **Handled** - directory renamed | - | - | Used for discovery |
| `~/.claude/projects/{encoded}/sessions-index.json` | Encoded path | **Handled** - fields updated (see note below) | Useful (session count, last active) | - | Used for metadata |
| `~/.claude/projects/{encoded}/<session>.jsonl` | Session ID within encoded dir | Not updated (transcripts only) | - | Searchable (with `--sessions`) | - |
| `~/.claude/projects/{encoded}/<session>/tool-results/` | Session ID within encoded dir | **Handled** - moved with directory rename | - | - | - |
| `~/.claude/projects/{encoded}/memory/` | Encoded path | **Handled** - moved with directory rename | Useful (project memory) | Searchable | - |

**Note on `sessions-index.json`**: This file was referenced in the [claudepath](https://github.com/Mahiler1909/claudepath) Python tool, but is not mentioned in the official Claude Code documentation. It may be a legacy file from older versions of Claude Code. Our code handles it defensively - updates it if present, falls back to scanning `.jsonl` files if absent.

### Per-session data (session ID)

| Location | Keyed by | `mv`/`remap` | `inspect` | `search` | `list` |
|----------|----------|--------------|-----------|----------|--------|
| `~/.claude/file-history/{session}/` | Session ID | No action needed | - | - | - |
| `~/.claude/tasks/{session}/` | Session ID | No action needed | - | - | - |
| `~/.claude/debug/` | Session ID | No action needed | - | - | - |
| `~/.claude/plans/` | Session ID | No action needed | - | - | - |
| `~/.claude/paste-cache/` | Session ID | No action needed | - | - | - |
| `~/.claude/image-cache/` | Session ID | No action needed | - | - | - |
| `~/.claude/session-env/` | Session ID | No action needed | - | - | - |
| `~/.claude/shell-snapshots/` | Session ID | No action needed | - | - | - |
| `~/.claude/backups/` | Timestamp | No action needed | - | - | - |

### Per-session stats

| Location | Keyed by | `mv`/`remap` | `inspect` | `search` | `list` |
|----------|----------|--------------|-----------|----------|--------|
| `~/.claude/usage-data/session-meta/*.json` | Session ID (file has `project_path`) | **Handled** - project_path replaced | Useful (cost, token usage) | - | - |

### Project-level files (in the project directory itself)

These live inside the project directory and move with it during `mv`. They are relevant to `inspect` and `search`.

| Location | `mv`/`remap` | `inspect` | `search` |
|----------|--------------|-----------|----------|
| `CLAUDE.md` | Moves with project dir | Useful (project instructions) | Searchable |
| `.mcp.json` | Moves with project dir | Useful (project MCP servers) | Searchable |
| `.claude/settings.json` | Moves with project dir | Useful (permissions, hooks) | Searchable |
| `.claude/settings.local.json` | Moves with project dir | Useful (local overrides) | Searchable |
| `.claude/rules/` | Moves with project dir | Useful (project rules) | Searchable |
| `.claude/skills/` | Moves with project dir | Useful (project skills) | Searchable |
| `.claude/commands/` | Moves with project dir | Useful (project commands) | Searchable |
| `.claude/agents/` | Moves with project dir | Useful (project agents) | Searchable |
| `.claude/agent-memory/` | Moves with project dir | Useful (project agent memory) | Searchable |
| `.claude/agent-memory-local/` | Moves with project dir | Useful (local agent memory) | - |

### Config directory override

The official docs mention `CLAUDE_CONFIG_DIR` environment variable which redirects `~/.claude` entirely. Our `findClaudeDir()` should respect this.

**Status**: not yet handled.

---

## What we learned from

1. **[claudepath](https://github.com/Mahiler1909/claudepath)** (Python tool by Fernando Chullo) - initial source for the move logic and the data locations it updates
2. **Inspecting `~/.claude/` directory** - discovered `tasks/`, `debug/`, `file-history/` structure and `~/.claude.json` projects entry
3. **[`claude project purge` documentation](https://docs.anthropic.com/en/docs/claude-code/cli-reference)** - confirmed which locations are project-scoped
4. **[Official `~/.claude` directory docs](https://code.claude.com/docs/en/claude-directory)** - complete reference for all data locations and their purpose

---

## Path encoding

Claude Code encodes project paths by replacing every `/` with `-`:

```
/Users/gverni/devai/claude-move  ->  -Users-gverni-devai-claude-move
```

Implemented in `src/lib/encoder.js`.

---

## How we find a project

Used by both `list` and `mv`/`remap`. Implemented in `src/lib/scanner.js`.

### Lookup by encoded path (`findProjectDir`)

1. **Primary**: compute the encoded name from the given path, check if `~/.claude/projects/{encoded}/` exists
2. **Fallback**: scan all `~/.claude/projects/*/sessions-index.json` files and match by `originalPath` or `entries[0].projectPath`

The fallback handles edge cases where the encoded directory name diverged from the path.

### Listing all projects (`listProjects`)

Iterates all directories in `~/.claude/projects/` and for each:

1. Reads `sessions-index.json` to get `originalPath`, session count, and last modified date
2. If no sessions-index, counts `.jsonl` files and reads the `cwd` field from the first line
3. If still no path found, attempts to decode the directory name back to a path

---

## `list` command

`src/commands/list.js`

Calls `listProjects` to get all projects with metadata, then:

1. Checks if each project's source directory still exists on disk
2. Marks as existing (green dot) or orphaned (red dot)
3. Supports sorting by `recent`, `oldest`, or `alpha` (default)
4. Supports `--orphaned` filter and `--json` output

---

## `mv` command

`src/commands/mv.js` calls `moveProject` in `src/lib/mover.js`.

### Step 1: Move the actual directory on disk

Uses `cpSync` + `rmSync` to move `/old/path` to `/new/path`.

### Step 2: Rename the encoded project directory

```
~/.claude/projects/-old-path/  ->  ~/.claude/projects/-new-path/
```

If the destination already exists, the command errors out.

### Step 3: Update `~/.claude.json`

Renames project keys in the `projects` object. Both exact matches and sub-path keys (e.g. `/old/path/sub`) are renamed.

### Step 4: Update `sessions-index.json`

Fields updated:
- `originalPath`
- `entries[*].projectPath`
- `entries[*].fullPath`

### Step 5: Update `history.jsonl`

Each line is parsed as JSON. Any string value that exactly equals the old path or starts with `old_path/` is replaced. This avoids substring corruption (e.g. `/Users/foo` won't match `/Users/foobar`).

### Step 6: Update usage-data

Files: `~/.claude/usage-data/session-meta/*.json`. If `project_path` matches the old path (exact or prefix), it's replaced.

### Not updated: session `.jsonl` files

Session `.jsonl` files are conversation transcripts only. They have no functional impact on Claude Code, so paths inside them are left unchanged.

---

## `remap` command

`src/commands/remap.js` calls `remapProject` in `src/lib/mover.js`.

Same as `mv` but skips Step 1 (directory already moved manually). Validates that the new path exists before proceeding.

---

## Rollback strategy

If any step fails during `mv`, the directory is copied back from new to old.

---

## Dry-run mode

When `--dry-run` is passed, all steps compute what would change but write nothing to disk.

---

## TODO

- [x] Handle `~/.claude.json` `projects` entry (rename key from old path to new path)
- [x] Respect `CLAUDE_CONFIG_DIR` environment variable in `findClaudeDir()`
