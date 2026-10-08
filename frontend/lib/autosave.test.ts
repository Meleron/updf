import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveDelay, autosaver } from "./autosave";
import type { TextEdit } from "./edits";

const edits = (text: string) => [{ id: text, lines: [text] }] as unknown as TextEdit[];

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosaver", () => {
  it("saves a second after the last change, once", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = autosaver(save, vi.fn());

    autosave.schedule(edits("a"));
    await vi.advanceTimersByTimeAsync(autosaveDelay - 1);
    autosave.schedule(edits("ab"));
    await vi.advanceTimersByTimeAsync(autosaveDelay - 1);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith({ version: 1, edits: edits("ab") });
  });

  it("saves a waiting change at once when flushed, and nothing when there's none", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const autosave = autosaver(save, vi.fn());

    autosave.schedule(edits("a"));
    autosave.flush();
    autosave.flush();
    await vi.runAllTimersAsync();

    expect(save).toHaveBeenCalledExactlyOnceWith({ version: 1, edits: edits("a") });
  });

  it("turns off after a failed save", async () => {
    const save = vi.fn().mockRejectedValue(new DOMException("Quota exceeded", "QuotaExceededError"));
    const onFail = vi.fn();
    const autosave = autosaver(save, onFail);

    autosave.schedule(edits("a"));
    await vi.advanceTimersByTimeAsync(autosaveDelay);
    autosave.schedule(edits("ab"));
    await vi.advanceTimersByTimeAsync(autosaveDelay);

    expect(onFail).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });
});
