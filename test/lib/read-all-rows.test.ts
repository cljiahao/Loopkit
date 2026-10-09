import { describe, expect, it, vi } from "vitest";
import { readAllRows, readRowsForIds } from "@/lib/read-all-rows";
describe("complete ordered reads", () => {
  it("continues after short server-capped pages", async () => {
    const pages = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: [3], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    expect(await readAllRows(pages)).toEqual({ data: [1, 2, 3], error: null });
    expect(pages.mock.calls).toEqual([
      [0, 499],
      [2, 501],
      [3, 502],
    ]);
  });
  it("rejects partial aggregates after later failure", async () => {
    const pages = vi
      .fn()
      .mockResolvedValueOnce({ data: [1], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect(await readAllRows(pages)).toEqual({
      data: null,
      error: { message: "offline" },
    });
  });
  it("deduplicates and bounds ID batches", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => String(i));
    const read = vi.fn(async (batch: string[], start: number) => ({
      data: start === 0 ? batch : [],
      error: null,
    }));
    const result = await readRowsForIds([...ids, "0"], read);
    expect(result.data).toEqual(ids);
    expect(
      read.mock.calls.filter((c) => c[1] === 0).map((c) => c[0].length),
    ).toEqual([100, 100, 5]);
  });
  it("does not query empty IDs", async () => {
    const read = vi.fn();
    expect(await readRowsForIds([], read)).toEqual({ data: [], error: null });
    expect(read).not.toHaveBeenCalled();
  });
  it("propagates a later batch failure", async () => {
    const ids = Array.from({ length: 101 }, (_, i) => String(i));
    const read = vi.fn(async (batch: string[]) =>
      batch[0] === "100"
        ? { data: null, error: { message: "later" } }
        : { data: [], error: null },
    );
    expect(await readRowsForIds(ids, read)).toEqual({
      data: null,
      error: { message: "later" },
    });
  });
});
