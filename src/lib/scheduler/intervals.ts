/** Half-open time interval `[start, end)` in epoch milliseconds. */
export type Interval = { start: number; end: number };

const byStart = (a: Interval, b: Interval) => a.start - b.start || a.end - b.end;

/** Sorts, drops empty intervals, and merges overlapping or touching ones. */
export function normalize(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter((iv) => iv.end > iv.start).sort(byStart);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv.start <= last.end) {
      last.end = Math.max(last.end, iv.end);
    } else {
      merged.push({ ...iv });
    }
  }
  return merged;
}

/** `base` minus every interval in `remove`. */
export function subtract(base: readonly Interval[], remove: readonly Interval[]): Interval[] {
  const cuts = normalize(remove);
  const result: Interval[] = [];
  for (const iv of normalize(base)) {
    let cursor = iv.start;
    for (const cut of cuts) {
      if (cut.end <= cursor) continue;
      if (cut.start >= iv.end) break;
      if (cut.start > cursor) result.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
      if (cursor >= iv.end) break;
    }
    if (cursor < iv.end) result.push({ start: cursor, end: iv.end });
  }
  return result;
}

/** Overlap of two interval sets. */
export function intersect(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const left = normalize(a);
  const right = normalize(b);
  const result: Interval[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const start = Math.max(left[i].start, right[j].start);
    const end = Math.min(left[i].end, right[j].end);
    if (end > start) result.push({ start, end });
    if (left[i].end < right[j].end) i++;
    else j++;
  }
  return result;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function expand(iv: Interval, byMs: number): Interval {
  return { start: iv.start - byMs, end: iv.end + byMs };
}

export function longest(intervals: readonly Interval[]): number {
  return intervals.reduce((max, iv) => Math.max(max, iv.end - iv.start), 0);
}
