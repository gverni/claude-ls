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
- `[jsonl]` or `[decoded]` label when a project was not found in `~/.claude.json`

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

### `inspect`

`src/commands/inspect.js` loads project data from multiple sources and displays it.

If no path is given, shows an interactive single-select picker (via `src/lib/select.js`) listing all projects including orphans.

**Data sources:**

| Source | What it provides |
|--------|-----------------|
| `~/.claude.json` entry | MCP servers (global), allowed tools |
| `<project>/.mcp.json` | MCP servers (project-level) |
| `<project>/.claude/settings.json` | Allowed tools (project-level) |
| `<project>/.claude/settings.local.json` | Allowed tools (local overrides) |
| `~/.claude/projects/{encoded}/*.jsonl` | Session list with created/last interaction timestamps |
| `<project>/CLAUDE.md` | First heading shown as title |
| `~/.claude/plans/*.md` | Plans whose content contains the project path |

**Display sections:** CLAUDE.md, Plans, MCPs, Allowed tools, Sessions

**Flags:** `--json`, `--claude-dir`

---

### `search`

`src/commands/search.js` matches projects by path name.

Searches all projects (including orphans, including subfolders) for the query string in the project path. Case-insensitive. No file content search - path only.

**Flags:** `--json`, `--claude-dir`

---

### `prune`

`src/commands/prune.js` deletes Claude Code data for orphaned projects.

If no path and no `--all` flag, shows an interactive multi-select picker (via `src/lib/select.js`) of all orphaned projects.

**What it deletes:**

1. `~/.claude/projects/{encoded}/` directory
2. Project key(s) from `~/.claude.json`
3. Matching lines from `~/.claude/history.jsonl`
4. Matching files from `~/.claude/usage-data/session-meta/`

Shows a disclaimer to try `claude project purge` first, and a preview of what will be deleted before prompting for confirmation.

**Flags:** `--all`, `--dry-run`, `--yes`, `--claude-dir`

---

## Common modules

### `src/lib/encoder.js`

Path encoding: replaces `/` and `.` with `-`.

```
/Users/gverni/devai/claude-move  ->  -Users-gverni-devai-claude-move
/Users/gv/dev/gverni.github.io   ->  -Users-gv-dev-gverni-github-io
```

Note: decoding is lossy because dashes in the original path are indistinguishable from encoded slashes or dots. This matches Claude Code's actual encoding behaviour (confirmed by inspecting `~/.claude/projects/` directory names).

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

### `src/lib/select.js`

Interactive terminal selector backed by `@clack/prompts`. Handles large lists with scrolling.

- `interactiveSelect(items, { label, multi, message })` - shows a scrollable list. Returns selected item(s) or `null` if aborted. `multi: true` (default) for multi-select with Space, `multi: false` for single-select.

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
- [x] `inspect` command - MCPs, tools, sessions, CLAUDE.md, plans
- [x] `search` command - path-based search across all projects
- [x] `prune` command - interactive multi-select, `--all`, `--dry-run`
- [x] `~/.claude.json` project key renaming during move
- [x] `CLAUDE_CONFIG_DIR` environment variable support
- [x] Subfolder grouping under git projects
- [x] Dry-run mode
- [x] Rollback on failure
- [x] `[jsonl]` / `[decoded]` source labels in `list` output
- [x] Encoder fix: dots encoded as dashes (matches Claude Code's actual behaviour)
- [x] Interactive selector via `@clack/prompts` (scrollable, used by `prune` and `inspect`)

### Removed

- `--merge` flag - too dangerous, errors if destination exists instead
- `.jsonl` file updating during move - transcripts only, no functional impact
- `sessions-index.json` handling - legacy file from claudepath, not created by current Claude Code

### TODO

- [ ] Warn when moving git worktrees (suggest `git worktree move` + `remap`)
- [ ] Update `.jsonl` `cwd` fields during move for projects not in `.claude.json`
- [ ] `search` content search (CLAUDE.md, settings, sessions) - currently path-only
- [ ] `inspect --section` flag to show one section at a time

---

## Appendix: full data layout

Reference from https://code.claude.com/docs/en/claude-directory

### Global state

| Location | Keyed by | `mv`/`remap` | `inspect` | `search` |
|----------|----------|--------------|-----------|----------|
| `~/.claude.json` | - (has `projects` object keyed by path) | **Handled** - project keys renamed | **Used** - MCPs, allowed tools | - |
| `~/.claude/settings.json` | - | No path refs | - | - |
| `~/.claude/CLAUDE.md` | - | No path refs | - | - |
| `~/.claude/history.jsonl` | - (lines have `project` field) | **Handled** | - | - |
| `~/.claude/stats-cache.json` | - | No path refs | - | - |
| `~/.claude/keybindings.json` | - | No path refs | - | - |
| `~/.claude/plugins/` | - | No path refs | - | - |
| `~/.claude/themes/` | - | No path refs | - | - |
| `~/.claude/rules/` | - | No path refs | - | - |
| `~/.claude/skills/` | - | No path refs | - | - |
| `~/.claude/commands/` | - | No path refs | - | - |
| `~/.claude/output-styles/` | - | No path refs | - | - |
| `~/.claude/agents/` | - | No path refs | - | - |
| `~/.claude/agent-memory/` | - | No path refs | - | - |
| `~/.claude/plans/` | Slug | No path refs | **Used** - matched by content | - |

### Per-project data (encoded path)

| Location | Keyed by | `mv`/`remap` | `inspect` | `search` | `list` |
|----------|----------|--------------|-----------|----------|--------|
| `~/.claude/projects/{encoded}/` | Encoded path | **Handled** - directory renamed | - | - | Used for discovery |
| `~/.claude/projects/{encoded}/<session>.jsonl` | Session ID within encoded dir | Not updated (transcripts only) | **Used** - session list | - | `cwd` used as path fallback |
| `~/.claude/projects/{encoded}/<session>/tool-results/` | Session ID within encoded dir | Moved with directory rename | - | - | - |
| `~/.claude/projects/{encoded}/memory/` | Encoded path | Moved with directory rename | - | - | - |

### Per-session data (session ID)

| Location | Keyed by | `mv`/`remap` |
|----------|----------|--------------|
| `~/.claude/file-history/{session}/` | Session ID | No action needed |
| `~/.claude/tasks/{session}/` | Session ID | No action needed |
| `~/.claude/debug/` | Session ID | No action needed |
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
| `CLAUDE.md` | **Used** - first heading shown as title | - |
| `.mcp.json` | **Used** - project MCP servers | - |
| `.claude/settings.json` | **Used** - allowed tools | - |
| `.claude/settings.local.json` | **Used** - local tool overrides | - |
| `.claude/rules/` | - | - |
| `.claude/skills/` | - | - |
| `.claude/commands/` | - | - |
| `.claude/agents/` | - | - |
| `.claude/agent-memory/` | - | - |
| `.claude/agent-memory-local/` | - | - |

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
