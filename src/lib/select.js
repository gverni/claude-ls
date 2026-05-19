import chalk from "chalk";

/**
 * Interactive terminal selector using arrow keys.
 *
 * @param {any[]} items - Items to display and select from.
 * @param {object} opts
 * @param {(item: any) => string} opts.label - How to display each item. Defaults to String().
 * @param {boolean} opts.multi - Multi-select (Space to toggle) vs single-select (Enter picks). Defaults to true.
 * @returns {Promise<any[]|any|null>}
 *   Multi-select: resolves with array of selected items, or null if aborted.
 *   Single-select: resolves with the selected item, or null if aborted.
 */
export function interactiveSelect(items, { label = String, multi = true } = {}) {
  if (!process.stdin.isTTY) return Promise.resolve(null);
  if (items.length === 0) return Promise.resolve(multi ? [] : null);

  let cursor = 0;
  const selected = new Set(); // only used in multi mode

  const hint = multi
    ? "↑↓ navigate  Space select  Enter confirm  Ctrl+C abort"
    : "↑↓ navigate  Enter confirm  Ctrl+C abort";

  // LIST_LINES = items + status line. render() always outputs exactly this many lines.
  const LIST_LINES = items.length + 1;

  process.stdout.write(chalk.dim("  " + hint + "\n\n"));
  for (const item of items) process.stdout.write("   " + chalk.dim("○") + "  " + label(item) + "\n");
  process.stdout.write(chalk.dim(multi ? "  nothing selected" : "  ") + "\n");

  function render() {
    process.stdout.write("\x1b[" + LIST_LINES + "A");
    for (let i = 0; i < items.length; i++) {
      const active = i === cursor;
      const arrow = active ? chalk.cyan("›") : " ";
      let check;
      if (multi) {
        check = selected.has(i) ? chalk.green("◉") : chalk.dim("○");
      } else {
        check = active ? chalk.cyan("◉") : chalk.dim("○");
      }
      const text = active ? chalk.bold(label(items[i])) : label(items[i]);
      process.stdout.write("\x1b[2K\r " + arrow + " " + check + "  " + text + "\n");
    }
    let status = "";
    if (multi) {
      const n = selected.size;
      status = n > 0 ? chalk.dim(n + " selected") : chalk.dim("nothing selected");
    }
    process.stdout.write("\x1b[2K\r  " + status + "\n");
  }

  render();

  return new Promise((resolvePromise) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf-8");

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", handler);
    }

    function handler(key) {
      if (key === "\x03" || key === "\x1b") {   // Ctrl+C / Escape
        cleanup();
        process.stdout.write("\n");
        resolvePromise(null);
      } else if (key === "\x1b[A") {            // Up arrow
        cursor = (cursor - 1 + items.length) % items.length;
        render();
      } else if (key === "\x1b[B") {            // Down arrow
        cursor = (cursor + 1) % items.length;
        render();
      } else if (key === " " && multi) {        // Space - toggle (multi only)
        if (selected.has(cursor)) selected.delete(cursor);
        else selected.add(cursor);
        render();
      } else if (key === "\r") {                // Enter - confirm
        cleanup();
        process.stdout.write("\n");
        if (multi) {
          resolvePromise([...selected].map((i) => items[i]));
        } else {
          resolvePromise(items[cursor]);
        }
      }
    }

    process.stdin.on("data", handler);
  });
}
