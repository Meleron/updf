/** Marks what belongs to the text edit in progress: the text box's textarea, the formatting bar and its menus. */
export const editUi = { "data-edit-ui": "" };

/**
 * Whether focus moving to `target` (a blur event's `relatedTarget`) leaves the edit, which finishes it. Switching to
 * another window doesn't, because the focus comes back on return.
 */
export function leavesEdit(target: EventTarget | null): boolean {
  return document.hasFocus() && !(target instanceof Element && target.closest("[data-edit-ui]"));
}
