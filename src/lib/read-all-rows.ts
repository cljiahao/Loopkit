type ReadResult<T> = { data: T[] | null; error: { message: string } | null };
const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;
/** Read ordered pages to exhaustion, including servers with a lower response cap. */
export async function readAllRows<T>(
  fetchPage: (start: number, end: number) => PromiseLike<ReadResult<T>>,
): Promise<ReadResult<T>> {
  const rows: T[] = [];
  for (;;) {
    const result = await fetchPage(rows.length, rows.length + PAGE_SIZE - 1);
    if (result.error) return { data: null, error: result.error };
    if (!result.data?.length) return { data: rows, error: null };
    rows.push(...result.data);
  }
}
/** Bound IN filters while preserving complete per-ID results. */
export async function readRowsForIds<T>(
  ids: string[],
  fetchPage: (
    batch: string[],
    start: number,
    end: number,
  ) => PromiseLike<ReadResult<T>>,
): Promise<ReadResult<T>> {
  const unique = [...new Set(ids)];
  const rows: T[] = [];
  for (let i = 0; i < unique.length; i += ID_BATCH_SIZE) {
    const batch = unique.slice(i, i + ID_BATCH_SIZE);
    const result = await readAllRows((start, end) =>
      fetchPage(batch, start, end),
    );
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
  }
  return { data: rows, error: null };
}
