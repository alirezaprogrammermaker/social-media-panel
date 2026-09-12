export function nowTehran(): string {
    return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tehran' }).replace(' ', 'T');
}

export function dateTehran(offsetDays: number = 0): string {
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tehran' });
    if (offsetDays === 0) return todayStr;
    const [y, m, d] = todayStr.split('-').map(Number);
    // Calendar-day arithmetic in UTC to avoid timezone edge cases
    const shifted = new Date(Date.UTC(y, m - 1, d + offsetDays));
    return shifted.toISOString().slice(0, 10);
}

const RANGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const RANGE_DATETIME_RE = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Normalize a `from`/`to` query param for range filters.
 *
 * Accepted inputs:
 *  - `YYYY-MM-DD`                (whole day, inclusive)
 *  - `YYYY-MM-DD[T ]HH:MM[:SS]`  (point in time)
 *
 * DB timestamps are written Tehran-local (`nowTehran()` → `sv-SE` style), so range
 * comparisons are done as Tehran-local strings too — pass dates/times in Asia/Tehran.
 *
 * Returns:
 *  - the normalized string when the value is present and valid
 *  - `undefined` when the param is absent/empty (filter off)
 *  - `null` when the value is present but malformed (caller should answer 400)
 */
export function normalizeRangeDate(value: string | null | undefined): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value.trim() === '') return undefined;
    const v = value.trim();
    if (RANGE_DATE_RE.test(v)) return v;
    const m = v.match(RANGE_DATETIME_RE);
    if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? '00'}`;
    return null;
}

/**
 * SQL WHERE fragment for an inclusive `[from, to]` range over a TEXT timestamp column.
 * Day-only bounds compare on `date(col)` (whole-day inclusive); datetime bounds compare
 * lexicographically against the stored `YYYY-MM-DDTHH:MM:SS` format.
 * `column` must be a trusted literal (never user input).
 */
export function dateRangeSql(
    column: string,
    from: string | null,
    to: string | null
): { sql: string; params: any[] } {
    const conds: string[] = [];
    const params: any[] = [];
    if (from && RANGE_DATE_RE.test(from)) {
        conds.push(`date(${column}) >= ?`);
        params.push(from);
    } else if (from) {
        conds.push(`${column} >= ?`);
        params.push(from);
    }
    if (to && RANGE_DATE_RE.test(to)) {
        conds.push(`date(${column}) <= ?`);
        params.push(to);
    } else if (to) {
        conds.push(`${column} <= ?`);
        params.push(to);
    }
    return { sql: conds.join(' AND '), params };
}
