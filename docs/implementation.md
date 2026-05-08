# Implementation Details

## How we learned about Claude Code's data layout

The initial implementation is based on the Python tool [claudepath](https://github.com/Mahiler1909/claudepath) by Fernando Chullo. That tool handles moving/renaming Claude Code projects and documents which files need updating. We migrated its logic to Node.js.

The data locations that `claudepath` handles:
- `~/.claude/projects/{encoded}/` - session transcripts and sessions-index.json
- `~/.claude/projects/{encoded}/sessions-index.json` - project path references
- `~/.claude/projects/{encoded}/**/*.jsonl` - session files with path references
- `~/.claude/history.jsonl` - prompt history with project paths
- `~/.claude/usage-data/session-meta/*.json` - session stats with project_path

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

If the destination already exists and `--merge` is passed, session files are merged instead.

### Step 3: Update `sessions-index.json`

Fields updated:
- `originalPath`
- `entries[*].projectPath`
- `entries[*].fullPath`

### Step 4: Update all `.jsonl` session files

Each line is parsed as JSON. Any string value that exactly equals the old path or starts with `old_path/` is replaced. This avoids substring corruption (e.g. `/Users/foo` won't match `/Users/foobar`).

### Step 5: Update `history.jsonl`

Same line-by-line JSON replacement as Step 4.

### Step 6: Update usage-data

Files: `~/.claude/usage-data/session-meta/*.json`. If `project_path` matches the old path (exact or prefix), it's replaced.

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

