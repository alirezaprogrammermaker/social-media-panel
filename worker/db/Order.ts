import { Model } from './Model';
import { dateTehran, dateRangeSql, nowTehran } from '../utils/date';
import type { PaginatedResult } from '../utils/pagination';
import { paginatedResult } from '../utils/pagination';

export type OrderStatus = 'Pending' | 'In progress' | 'Completed' | 'Partial' | 'Processing' | 'Canceled';

export interface OrderData {
    id?: number;
    user_chat_id: number;
    user_username?: string;
    service_id: number;
    link: string;
    quantity?: number;
    status?: OrderStatus;
    api_provider_id?: number | null;
    api_provider_order_id?: number | null;
    charge?: string;
    start_count?: string;
    remains?: string;
    currency?: string;
    error_message?: string;
    created_at?: string;
    updated_at?: string;
}

export type OrderWithDetails = OrderData & { service_name?: string; provider_name?: string };
export type OrderDetail = OrderWithDetails & { user_first_name?: string | null };
export type PendingApiOrder = OrderData & { provider_api_url?: string; provider_api_key?: string };

export interface OrderListFilters {
    status?: string | null;
    /** Inclusive lower bound on created_at — 'YYYY-MM-DD' (whole day) or 'YYYY-MM-DDTHH:MM:SS', Tehran-local. */
    from?: string | null;
    /** Inclusive upper bound on created_at — same formats as `from`. */
    to?: string | null;
    userChatId?: number | null;
    serviceId?: number | null;
    providerId?: number | null;
    /** Substring search over link / username / provider order id. */
    q?: string | null;
}

const OPEN_API_STATUS_SQL = `o.status IN ('Pending', 'In progress', 'Processing')
             AND o.api_provider_order_id IS NOT NULL`;

export class Order extends Model<OrderData> {
    protected static table = 'orders';

    /** @deprecated Prefer getOrdersWithDetailsPaginated for dashboard lists. */
    static async getOrdersWithDetails(): Promise<OrderWithDetails[]> {
        return this.raw(
            `SELECT o.*, s.name as service_name, p.name as provider_name 
             FROM orders o 
             LEFT JOIN services s ON o.service_id = s.id 
             LEFT JOIN api_providers p ON o.api_provider_id = p.id 
             ORDER BY o.created_at DESC`
        );
    }

    static async getOrdersWithDetailsPaginated(
        page: number,
        pageSize: number,
        status?: OrderStatus | string | null
    ): Promise<PaginatedResult<OrderWithDetails>> {
        const offset = (page - 1) * pageSize;
        const hasStatus = Boolean(status);

        const total = hasStatus
            ? await this.count('status = ?', status)
            : await this.count();

        const data = hasStatus
            ? await this.raw<OrderWithDetails>(
                `SELECT o.*, s.name as service_name, p.name as provider_name
                 FROM orders o
                 LEFT JOIN services s ON o.service_id = s.id
                 LEFT JOIN api_providers p ON o.api_provider_id = p.id
                 WHERE o.status = ?
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                status,
                pageSize,
                offset
            )
            : await this.raw<OrderWithDetails>(
                `SELECT o.*, s.name as service_name, p.name as provider_name
                 FROM orders o
                 LEFT JOIN services s ON o.service_id = s.id
                 LEFT JOIN api_providers p ON o.api_provider_id = p.id
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                pageSize,
                offset
            );

        return paginatedResult(data, total, page, pageSize);
    }

    static async findByStatus(status: OrderStatus): Promise<OrderData[]> {
        return this.where('status', status);
    }

    /**
     * Filtered + paginated join list for the Agent API.
     * Same shape as getOrdersWithDetailsPaginated, but supports date range,
     * user/service/provider filters and a free-text search over link / username / provider order id.
     */
    static async getOrdersFilteredPaginated(
        page: number,
        pageSize: number,
        filters: OrderListFilters = {}
    ): Promise<PaginatedResult<OrderWithDetails>> {
        const offset = (page - 1) * pageSize;
        const where: string[] = [];
        const params: any[] = [];

        if (filters.status) {
            where.push('o.status = ?');
            params.push(filters.status);
        }
        const range = dateRangeSql('o.created_at', filters.from ?? null, filters.to ?? null);
        if (range.sql) {
            where.push(range.sql);
            params.push(...range.params);
        }
        if (filters.userChatId !== null && filters.userChatId !== undefined) {
            where.push('o.user_chat_id = ?');
            params.push(filters.userChatId);
        }
        if (filters.serviceId !== null && filters.serviceId !== undefined) {
            where.push('o.service_id = ?');
            params.push(filters.serviceId);
        }
        if (filters.providerId !== null && filters.providerId !== undefined) {
            where.push('o.api_provider_id = ?');
            params.push(filters.providerId);
        }
        if (filters.q) {
            const like = `%${filters.q.trim()}%`;
            where.push(
                '(o.link LIKE ? OR o.user_username LIKE ? OR CAST(o.api_provider_order_id AS TEXT) LIKE ?)'
            );
            params.push(like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const total = (await this.rawFirst<{ count: number }>(
            `SELECT COUNT(*) as count FROM orders o ${whereSql}`,
            ...params
        ))?.count ?? 0;

        const data = await this.raw<OrderWithDetails>(
            `SELECT o.*, s.name as service_name, p.name as provider_name
             FROM orders o
             LEFT JOIN services s ON o.service_id = s.id
             LEFT JOIN api_providers p ON o.api_provider_id = p.id
             ${whereSql}
             ORDER BY o.created_at DESC, o.id DESC
             LIMIT ? OFFSET ?`,
            ...params,
            pageSize,
            offset
        );
        return paginatedResult(data, total, page, pageSize);
    }

    /** One order with joined service/provider/user fields for the Agent API detail view. */
    static async findDetailById(id: number): Promise<OrderDetail | null> {
        return this.rawFirst<OrderDetail>(
            `SELECT o.*,
                    s.name as service_name,
                    p.name as provider_name,
                    COALESCE(tu.username, o.user_username) as user_username,
                    tu.first_name as user_first_name
             FROM orders o
             LEFT JOIN services s ON o.service_id = s.id
             LEFT JOIN api_providers p ON o.api_provider_id = p.id
             LEFT JOIN telegram_users tu ON tu.chat_id = o.user_chat_id
             WHERE o.id = ?
             LIMIT 1`,
            id
        );
    }

    /**
     * Fetch specific open API-linked orders (joined with provider credentials) for targeted
     * status checks. Mirrors findPendingApiOrders filters: only open statuses, active providers.
     */
    static async findManyWithProviderByIds(ids: number[]): Promise<PendingApiOrder[]> {
        const clean = (ids || [])
            .map((n) => Math.floor(Number(n)))
            .filter((n) => Number.isInteger(n) && n > 0);
        if (clean.length === 0) return [];
        const placeholders = clean.map(() => '?').join(', ');
        return this.raw(
            `SELECT o.*, p.api_url as provider_api_url, p.api_key as provider_api_key
             FROM orders o
             INNER JOIN api_providers p ON o.api_provider_id = p.id
             WHERE ${OPEN_API_STATUS_SQL}
               AND p.is_active = 1
               AND o.id IN (${placeholders})
             ORDER BY o.id ASC
             LIMIT 500`,
            ...clean
        );
    }

    /**
     * Keyset page of open API-linked orders for cron/manual status sync.
     * Pass afterId=0 to start from the beginning.
     */
    static async findPendingApiOrders(
        limit: number = 200,
        afterId: number = 0
    ): Promise<PendingApiOrder[]> {
        const safeLimit = Math.min(Math.max(1, Math.floor(limit) || 200), 500);
        const cursor = Math.max(0, Math.floor(afterId) || 0);
        return this.raw(
            `SELECT o.*, p.api_url as provider_api_url, p.api_key as provider_api_key
             FROM orders o
             INNER JOIN api_providers p ON o.api_provider_id = p.id
             WHERE ${OPEN_API_STATUS_SQL}
               AND p.is_active = 1
               AND o.id > ?
             ORDER BY o.id ASC
             LIMIT ?`,
            cursor,
            safeLimit
        );
    }

    static async findByApiProviderOrderId(providerId: number, providerOrderId: number): Promise<OrderData | null> {
        return this.rawFirst(
            'SELECT * FROM orders WHERE api_provider_id = ? AND api_provider_order_id = ?',
            providerId,
            providerOrderId
        );
    }

    static async updateStatus(id: number, status: OrderStatus, data?: Partial<OrderData>): Promise<void> {
        const updates: Record<string, any> = { status, updated_at: nowTehran() };
        if (data?.charge !== undefined) updates.charge = data.charge;
        if (data?.start_count !== undefined) updates.start_count = data.start_count;
        if (data?.remains !== undefined) updates.remains = data.remains;
        if (data?.currency !== undefined) updates.currency = data.currency;
        if (data?.error_message !== undefined) updates.error_message = data.error_message;

        const columns = Object.keys(updates);
        const setClause = columns.map((c) => `${c} = ?`).join(', ');
        await this.raw(
            `UPDATE orders SET ${setClause} WHERE id = ?`,
            ...Object.values(updates),
            id
        );
    }

    /** Build a prepared UPDATE for batching simple (non-refund) status changes. */
    static prepareStatusUpdate(
        id: number,
        status: OrderStatus,
        data?: Partial<OrderData>
    ): D1PreparedStatement {
        const now = nowTehran();
        return this.db
            .prepare(
                `UPDATE orders
                 SET status = ?,
                     start_count = COALESCE(?, start_count),
                     remains = COALESCE(?, remains),
                     currency = COALESCE(?, currency),
                     updated_at = ?
                 WHERE id = ?`
            )
            .bind(
                status,
                data?.start_count ?? null,
                data?.remains ?? null,
                data?.currency ?? null,
                now,
                id
            );
    }

    static async getUserOrders(
        chatId: number,
        options?: { limit?: number; offset?: number }
    ): Promise<(OrderData & { service_name?: string })[]> {
        const limit = Math.min(Math.max(1, options?.limit ?? 50), 200);
        const offset = Math.max(0, options?.offset ?? 0);
        return this.raw(
            `SELECT o.*, s.name as service_name
             FROM orders o
             LEFT JOIN services s ON o.service_id = s.id
             WHERE o.user_chat_id = ?
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            chatId,
            limit,
            offset
        );
    }

    static async countUserOrders(chatId: number): Promise<number> {
        return this.count('user_chat_id = ?', chatId);
    }

    static async findUserOrderById(
        chatId: number,
        orderId: number
    ): Promise<(OrderData & { service_name?: string }) | null> {
        return this.rawFirst(
            `SELECT o.*, s.name as service_name
             FROM orders o
             LEFT JOIN services s ON o.service_id = s.id
             WHERE o.user_chat_id = ? AND o.id = ?
             LIMIT 1`,
            chatId,
            orderId
        );
    }

    static async getUserOrderStats(chatId: number): Promise<{
        total: number;
        pending: number;
        completed: number;
    }> {
        const row = await this.rawFirst<{ total: number; pending: number; completed: number }>(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
             FROM orders
             WHERE user_chat_id = ?`,
            chatId
        );
        return {
            total: row?.total ?? 0,
            pending: row?.pending ?? 0,
            completed: row?.completed ?? 0,
        };
    }

    static async getOrderStats(): Promise<{
        total: number;
        pending: number;
        in_progress: number;
        completed: number;
        partial: number;
        processing: number;
        canceled: number;
    }> {
        const results = await this.raw<{ status: string; count: number }>(
            `SELECT status, COUNT(*) as count FROM orders GROUP BY status`
        );

        const stats = {
            total: 0,
            pending: 0,
            in_progress: 0,
            completed: 0,
            partial: 0,
            processing: 0,
            canceled: 0,
        };

        for (const row of results) {
            stats.total += row.count;
            switch (row.status) {
                case 'Pending': stats.pending = row.count; break;
                case 'In progress': stats.in_progress = row.count; break;
                case 'Completed': stats.completed = row.count; break;
                case 'Partial': stats.partial = row.count; break;
                case 'Processing': stats.processing = row.count; break;
                case 'Canceled': stats.canceled = row.count; break;
            }
        }

        return stats;
    }

    static async getDailyStats(days: number = 7): Promise<{ date: string; count: number; completed: number }[]> {
        return this.raw(
            `SELECT date(created_at) as date, COUNT(*) as count, 
                    SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) as completed
             FROM orders 
             WHERE created_at >= datetime('now', '-' || ? || ' days')
             GROUP BY date(created_at)
             ORDER BY date ASC`,
            days
        );
    }

    static async getRevenueStats(): Promise<{
        total_revenue: number;
        today_revenue: number;
        today_orders: number;
        yesterday_orders: number;
    }> {
        const today = dateTehran();
        const yesterday = dateTehran(-1);
        const result = await this.rawFirst<any>(
            `SELECT 
                SUM(CASE WHEN status = 'Completed' THEN CAST(charge AS REAL) ELSE 0 END) as total_revenue,
                SUM(CASE WHEN status = 'Completed' AND date(created_at) = ? THEN CAST(charge AS REAL) ELSE 0 END) as today_revenue,
                COUNT(CASE WHEN date(created_at) = ? THEN 1 END) as today_orders,
                COUNT(CASE WHEN date(created_at) = ? THEN 1 END) as yesterday_orders
             FROM orders`,
            today,
            today,
            yesterday,
        );
        return result || { total_revenue: 0, today_revenue: 0, today_orders: 0, yesterday_orders: 0 };
    }
}
