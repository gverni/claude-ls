import { select, multiselect, isCancel } from "@clack/prompts";

/**
 * Interactive terminal selector with scrolling support.
 *
 * @param {any[]} items - Items to display and select from.
 * @param {object} opts
 * @param {(item: any) => string} opts.label - How to display each item. Defaults to String().
 * @param {boolean} opts.multi - Multi-select vs single-select. Defaults to true.
 * @param {string} opts.message - Prompt message shown to the user.
 * @returns {Promise<any[]|any|null>}
 *   Multi: resolves with array of selected items, or null if aborted.
 *   Single: resolves with the selected item, or null if aborted.
 */
export async function interactiveSelect(items, { label = String, multi = true, message } = {}) {
  if (items.length === 0) return multi ? [] : null;

  const options = items.map((item) => ({ value: item, label: label(item) }));

  const defaultMessage = multi ? "Select projects (Space to toggle)" : "Select a project";
  const result = multi
    ? await multiselect({ message: message ?? defaultMessage, options, required: false })
    : await select({ message: message ?? defaultMessage, options });

  if (isCancel(result)) return null;
  return result;
}
