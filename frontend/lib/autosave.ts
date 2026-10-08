import type { EditDocument, TextEdit } from "./edits";

export const autosaveDelay = 1000;

/**
 * Saves the edits a second after the last change. A failed save turns autosave off: `onFail` is called once and
 * nothing more is saved.
 */
export function autosaver(save: (edits: EditDocument) => Promise<void>, onFail: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: TextEdit[] | null = null;
  let failed = false;

  function flush() {
    clearTimeout(timer);
    if (pending && !failed) {
      save({ version: 1, edits: pending }).catch(() => {
        failed = true;
        onFail();
      });
    }
    pending = null;
  }

  return {
    /** Saves these edits a second from now, unless there's another change first. */
    schedule(edits: TextEdit[]) {
      pending = edits;
      clearTimeout(timer);
      timer = setTimeout(flush, autosaveDelay);
    },
    /** Saves a change still waiting now, as the editor closes. */
    flush,
  };
}
