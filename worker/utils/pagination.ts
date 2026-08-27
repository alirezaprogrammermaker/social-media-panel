export interface PaginationParams {
    page: number;
    pageSize: number;
    offset: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
}

/** Parse & clamp page/pageSize from query strings. */
export function parsePagination(
    input: { page?: string | null; pageSize?: string | null },
    defaults: { page?: number; pageSize?: number; maxPageSize?: number } = {}
): PaginationParams {
    const maxPageSize = defaults.maxPageSize ?? 100;
    const defaultPageSize = defaults.pageSize ?? 20;
    const page = Math.max(1, Math.floor(Number(input.page) || defaults.page || 1));
    const rawSize = Math.floor(Number(input.pageSize) || defaultPageSize);
    const pageSize = Math.min(maxPageSize, Math.max(1, rawSize || defaultPageSize));
    return { page, pageSize, offset: (page - 1) * pageSize };
}

export function paginatedResult<T>(
    data: T[],
    total: number,
    page: number,
    pageSize: number
): PaginatedResult<T> {
    return { data, total, page, pageSize };
}
