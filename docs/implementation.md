# Implementation Details

## Source of truth

The official Claude Code directory structure is documented at:
https://code.claude.com/docs/en/claude-directory

Claude Code stores project data in two main locations:

| Location | What it stores | Keyed by |
|----------|---------------|----------|
| `~/.claude.json` | Project permissions, MCP configs, session metrics | Absolute path (git root) |
| `~/.claude/projects/{encoded}/` | Session transcripts, tool results, memory | Encoded path (exact cwd) |
| `~/.claude/history.jsonl` | Command history | Line-by-line, each with `project` field |
| `~/.claude/usage-data/session-meta/*.json` | Token usage, costs | Session ID (file has `project_path`) |

The full data layout with all files and their relevance to each command is in the [Appendix](#appendix-full-data-layout).

---

## Commands

### `list`

`src/commands/list.js` calls `listProjects` in `src/lib/scanner.js`.

**Project discovery:**

1. Read `~/.claude.json` `projects` keys (primary source, authoritative paths)
2. For each key, look for a matching `~/.claude/projects/{encoded}/` directory to get session count and last active date
3. Check if the path has a `.git` on disk (used to identify git projects)
4. Scan remaining `~/.claude/projects/` directories not matched in step 2:
   - Read `cwd` from the `.jsonl` file to determine the actual path
   - Last resort: decode directory name (lossy - dashes are ambiguous)
5. For git projects, group unmatched directories whose `cwd` starts with the project path as subfolders. We do this because Claude Code creates separate `~/.claude/projects/` directories for each subdirectory you run Claude from, but stores a single `.claude.json` entry at the git root. Without grouping, these subfolders would appear as standalone "potentially orphaned" projects.

**Display:**

- Green dot: project exists on disk
- Red dot + "orphaned": path from `.claude.json` but doesn't exist on disk
- Red dot + "potentially orphaned": path from `.jsonl`/decoder, doesn't exist on disk
- `(git)` indicator for git projects
- Subfolders shown nested under parent
- "no sessions" in yellow for projects with `.claude.json` entry but no session data

**Flags:** `--sort` (recent/oldest/alpha), `--orphaned`, `--json`, `--claude-dir`

---

### `mv`

`src/commands/mv.js` calls `classifyProject` then `moveProject` in `src/lib/mover.js`.

**Classification (before move):**

The command first classifies the source path using `classifyProject`:

1. **tracked** - path is a key in `~/.claude.json`. Proceed normally.
2. **subfolder** - path is a child of a `~/.claude.json` key (git project). Show warning that permissions/MCP configs won't transfer, ask confirmation. If confirmed, also updates `cwd` fields in session `.jsonl` files.
3. **worktree** - `.git` file contains `gitdir:`. Refuse with error, suggest `git worktree move` + `claude-ls remap`.
4. **untracked** - not in `~/.claude.json` and no project directory. Refuse with error.

**Steps (once classified):**

1. **Move directory on disk** - `cpSync` + `rmSync` from old to new path
2. **Rename encoded project directory** - `~/.claude/projects/-old-path/` to `~/.claude/projects/-new-path/`. Errors if destination already exists.
3. **Update `~/.claude.json`** - rename project keys (exact match and sub-path keys)
4. **Update `history.jsonl`** - replace path in JSON values (exact match or prefix)
5. **Update usage-data** - replace `project_path` in `session-meta/*.json` files
6. **Update `cwd` in session files** (subfolder case only) - updates `cwd` field in `.jsonl` session files

If any step fails, the directory is copied back (rollback).

**Not updated:** session `.jsonl` content (other than `cwd`). These are conversation transcripts with no functional impact on Claude Code.

**Flags:** `--dry-run`, `--no-backup`, `--yes`, `--verbose`, `--claude-dir`

---

### `remap`

`src/commands/remap.js` calls `classifyProject` then `remapProject` in `src/lib/mover.js`.

Same classification and handling as `mv`, but skips the filesystem move (directory already moved manually). Validates that the new path exists before proceeding.

**Flags:** same as `mv`

---

### `inspect` - not yet implemented

Show project properties (settings, MCPs, CLAUDE.md, memory, sessions).

---

### `search` - not yet implemented

Search across all projects (CLAUDE.md, settings, session content).

---

## Common modules

### `src/lib/encoder.js`

Path encoding: replaces every `/` with `-`.

```
/Users/gverni/devai/claude-move  ->  -Users-gverni-devai-claude-move
```

Note: decoding is lossy because dashes in the original path are indistinguishable from encoded slashes.

### `src/lib/scanner.js`

- `findClaudeDir()` - returns `CLAUDE_CONFIG_DIR` env var or `~/.claude`
- `findProjectDir(claudeDir, path)` - finds encoded project directory for a given path
- `listProjects(claudeDir)` - discovers all projects using the strategy described in the `list` command section

### `src/lib/updaters.js`

- `updateClaudeJson(path, oldPath, newPath)` - renames project keys in `.claude.json`
- `updateHistory(historyPath, oldPath, newPath)` - replaces paths in `history.jsonl`
- `updateUsageData(claudeDir, oldPath, newPath)` - replaces `project_path` in session-meta files
- `updateJsonlCwd(projectDir, oldPath, newPath)` - updates only `cwd` fields in session `.jsonl` files (used for subfolder moves)
- `replacePathValues(obj, oldPath, newPath)` - recursive JSON path replacement (exact match or prefix, avoids substring corruption)

### `src/lib/mover.js`

- `classifyProject(oldPath, claudeDir)` - returns `{ type, parentPath }` where type is "tracked", "subfolder", "worktree", or "untracked"
- `moveProject(oldPath, newPath, opts)` - orchestrates full move with rollback
- `remapProject(oldPath, newPath, opts)` - updates references only (no filesystem move)
- `previewOperation(oldPath)` - returns what would be affected

---

## Key behaviours

### Git subfolders

Claude Code stores the `.claude.json` key at the **git root** level, but creates `~/.claude/projects/` directories for the **exact cwd**. Running Claude from `/project/src/frontend` when `/project` is the git root creates:

- `.claude.json` key: `/project`
- `~/.claude/projects/-project-src-frontend/`

The subfolder shares the parent's permissions and MCP configs.

### Git worktrees

Claude follows `gitdir:` back to the main repo and stores the `.claude.json` key under the main repo path. The worktree gets its own `~/.claude/projects/` directory but no `.claude.json` entry.

Worktrees are NOT grouped as subfolders because their path doesn't start with the parent path (e.g. `/stripe/mint-webclipper/` is not a child of `/stripe/mint`).

### Path resolution reliability

| Source | Reliability | When used |
|--------|-------------|-----------|
| `~/.claude.json` key | Authoritative | Most projects |
| `.jsonl` `cwd` field | Correct at session creation, stale after manual moves | Subfolders, worktrees |
| Decoded directory name | Lossy (dashes ambiguous) | Last resort only |

---

## Implementation log

### Done

- [x] `list` command with project discovery from `.claude.json` and `.jsonl` fallback
- [x] `mv` command with full move and reference updates
- [x] `remap` command for already-moved directories
- [x] `~/.claude.json` project key renaming during move
- [x] `CLAUDE_CONFIG_DIR` environment variable support
- [x] Subfolder grouping under git projects
- [x] Dry-run mode
- [x] Rollback on failure

### Removed

- `--merge` flag - too dangerous, errors if destination exists instead
- `.jsonl` file updating during move - transcripts only, no functional impact
- `sessions-index.json` handling - legacy file from claudepath, not created by current Claude Code

### TODO

- [ ] `inspect` command
- [ ] `search` command
- [ ] Warn when moving git worktrees (suggest `git worktree move` + `remap`)
- [ ] Update `.jsonl` `cwd` fields during move for projects not in `.claude.json`

---

## Appendix: full data layout

Reference from https://code.claude.com/docs/en/claude-directory

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
| `~/.claude/projects/{encoded}/<session>.jsonl` | Session ID within encoded dir | Not updated (transcripts only) | - | Searchable (with `--sessions`) | `cwd` used as path fallback |
| `~/.claude/projects/{encoded}/<session>/tool-results/` | Session ID within encoded dir | Moved with directory rename | - | - | - |
| `~/.claude/projects/{encoded}/memory/` | Encoded path | Moved with directory rename | Useful (project memory) | Searchable | - |

### Per-session data (session ID)

| Location | Keyed by | `mv`/`remap` |
|----------|----------|--------------|
| `~/.claude/file-history/{session}/` | Session ID | No action needed |
| `~/.claude/tasks/{session}/` | Session ID | No action needed |
| `~/.claude/debug/` | Session ID | No action needed |
| `~/.claude/plans/` | Auto-generated slug (e.g. `my-plan-title.md`) | No action needed - see note below |
| `~/.claude/paste-cache/` | Session ID | No action needed |
| `~/.claude/image-cache/` | Session ID | No action needed |
| `~/.claude/session-env/` | Session ID | No action needed |
| `~/.claude/shell-snapshots/` | Session ID | No action needed |
| `~/.claude/backups/` | Timestamp | No action needed |

### Per-session stats

| Location | Keyed by | `mv`/`remap` |
|----------|----------|--------------|
| `~/.claude/usage-data/session-meta/*.json` | Session ID (file has `project_path`) | **Handled** - project_path replaced |

### Project-level files (in the project directory itself)

These live inside the project directory and move with it during `mv`.

| Location | `inspect` | `search` |
|----------|-----------|----------|
| `CLAUDE.md` | Useful (project instructions) | Searchable |
| `.mcp.json` | Useful (project MCP servers) | Searchable |
| `.claude/settings.json` | Useful (permissions, hooks) | Searchable |
| `.claude/settings.local.json` | Useful (local overrides) | Searchable |
| `.claude/rules/` | Useful (project rules) | Searchable |
| `.claude/skills/` | Useful (project skills) | Searchable |
| `.claude/commands/` | Useful (project commands) | Searchable |
| `.claude/agents/` | Useful (project agents) | Searchable |
| `.claude/agent-memory/` | Useful (project agent memory) | Searchable |
| `.claude/agent-memory-local/` | Useful (local agent memory) | - |

### Plans and project linking

Plan files (`~/.claude/plans/*.md`) are pure markdown with auto-generated slug filenames. They contain **no structured metadata** (no frontmatter, no session ID, no project path field). The only way to link a plan to a project is to search the file content for the project path.

This means:
- If a project is moved or renamed, the content-based link breaks.
- The `inspect` command uses `content.includes(projectPath)` as a best-effort match - this works because the path appears naturally in the plan body wherever it was mentioned.

A feature request exists to add `plansDirectory` support in `settings.json` (per-project plan storage), which would solve this properly: **[GitHub issue #13748](https://github.com/anthropics/claude-code/issues/13748)**. Watch this for future improvement.

A more reliable (but complex) alternative: cross-reference via session files. Session `.jsonl` files record `EnterPlanMode`/`ExitPlanMode` events, so in principle you could find which sessions belong to a project and then determine which plan was created in each session. Not currently implemented.

### Config directory override

`CLAUDE_CONFIG_DIR` environment variable redirects `~/.claude` entirely. Supported by `findClaudeDir()`.

---

## References

1. **[claudepath](https://github.com/Mahiler1909/claudepath)** - Python tool, initial source for move logic
2. **[Official `~/.claude` directory docs](https://code.claude.com/docs/en/claude-directory)** - complete reference for data locations
3. **[`claude project purge` docs](https://docs.anthropic.com/en/docs/claude-code/cli-reference)** - confirmed project-scoped locations
4. **[GitHub issue #13748](https://github.com/anthropics/claude-code/issues/13748)** - feature request for `plansDirectory` in `settings.json` (per-project plan storage)
