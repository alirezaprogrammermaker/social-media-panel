import { Model } from './Model';
import { dateTehran, nowTehran } from '../utils/date';

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

export class Order extends Model<OrderData> {
    protected static table = 'orders';

    static async getOrdersWithDetails(): Promise<(OrderData & { service_name?: string; provider_name?: string })[]> {
        return this.raw(
            `SELECT o.*, s.name as service_name, p.name as provider_name 
             FROM orders o 
             LEFT JOIN services s ON o.service_id = s.id 
             LEFT JOIN api_providers p ON o.api_provider_id = p.id 
             ORDER BY o.created_at DESC`
        );
    }

    static async findByStatus(status: OrderStatus): Promise<OrderData[]> {
        return this.where('status', status);
    }

    static async findPendingApiOrders(): Promise<(OrderData & { provider_api_url?: string; provider_api_key?: string })[]> {
        return this.raw(
            `SELECT o.*, p.api_url as provider_api_url, p.api_key as provider_api_key 
             FROM orders o 
             INNER JOIN api_providers p ON o.api_provider_id = p.id 
             WHERE o.status IN ('Pending', 'In progress', 'Processing') 
             AND o.api_provider_order_id IS NOT NULL 
             AND p.is_active = 1`
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

    static async getUserOrders(chatId: number): Promise<(OrderData & { service_name?: string })[]> {
        return this.raw(
            `SELECT o.*, s.name as service_name 
             FROM orders o 
             LEFT JOIN services s ON o.service_id = s.id 
             WHERE o.user_chat_id = ? 
             ORDER BY o.created_at DESC`,
            chatId
        );
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
