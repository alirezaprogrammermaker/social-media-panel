import { Model } from './Model';
import { nowTehran } from '../utils/date';

export interface PaymentRow {
    id: number;
    user_chat_id: number;
    user_username: string | null;
    user_first_name: string | null;
    payment_method_id: number;
    amount: number;
    card_number: string;
    card_holder: string;
    receipt_image_url: string | null;
    status: string;
    admin_note: string | null;
    created_at: string;
    updated_at: string;
}

export class Payment extends Model<PaymentRow> {
    protected static table = 'payments';

    static async findByUserChatId(this: any, chatId: number): Promise<PaymentRow[]> {
        return this.raw(
            `SELECT * FROM ${this.table} WHERE user_chat_id = ? ORDER BY created_at DESC`,
            chatId,
        );
    }

    static async findByStatus(this: any, status: string): Promise<PaymentRow[]> {
        return this.raw(
            `SELECT * FROM ${this.table} WHERE status = ? ORDER BY created_at DESC`,
            status,
        );
    }

    static async findAllOrdered(): Promise<PaymentRow[]> {
        return this.raw(
            `SELECT * FROM ${this.table} ORDER BY created_at DESC`
        );
    }

    static async findLatestByUserChatId(this: any, chatId: number): Promise<PaymentRow | null> {
        return this.rawFirst(
            'SELECT * FROM payments WHERE user_chat_id = ? ORDER BY id DESC LIMIT 1',
            chatId
        );
    }

    static async updateStatus(this: any, id: number, status: string, adminNote?: string): Promise<void> {
        const now = nowTehran();
        await this.raw(
            `UPDATE ${this.table} SET status = ?, admin_note = ?, updated_at = ? WHERE id = ?`,
            status,
            adminNote || null,
            now,
            id,
        );
    }

    /** Atomically transition a pending payment; returns false if already reviewed. */
    static async updatePendingStatus(this: any, id: number, status: string, adminNote?: string): Promise<boolean> {
        const now = nowTehran();
        const result = await this.db
            .prepare(
                `UPDATE ${this.table} SET status = ?, admin_note = ?, updated_at = ? WHERE id = ? AND status = 'pending'`
            )
            .bind(status, adminNote || null, now, id)
            .run();
        return (result.meta?.changes ?? 0) > 0;
    }

    /**
     * Approve a pending payment and credit balance in one D1 batch.
     * Returns false if already reviewed or the telegram user row is missing.
     */
    static async approveAndCredit(this: any, id: number, userChatId: number, amount: number): Promise<boolean> {
        const now = nowTehran();
        const results = await this.db.batch([
            this.db
                .prepare(
                    `UPDATE telegram_users SET balance = balance + ?, updated_at = ?
                     WHERE chat_id = ?
                       AND EXISTS (SELECT 1 FROM ${this.table} WHERE id = ? AND status = 'pending')`
                )
                .bind(amount, now, userChatId, id),
            this.db
                .prepare(
                    `UPDATE ${this.table} SET status = 'approved', updated_at = ?
                     WHERE id = ? AND status = 'pending'
                       AND EXISTS (SELECT 1 FROM telegram_users WHERE chat_id = ?)`
                )
                .bind(now, id, userChatId),
        ]);
        const credited = results[0]?.meta?.changes ?? 0;
        const approved = results[1]?.meta?.changes ?? 0;
        return credited > 0 && approved > 0;
    }

    static async getStats(this: any): Promise<{
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        totalAmount: number;
        approvedAmount: number;
    }> {
        const total = await this.raw('SELECT COUNT(*) as count FROM payments');
        const pending = await this.raw("SELECT COUNT(*) as count FROM payments WHERE status = 'pending'");
        const approved = await this.raw("SELECT COUNT(*) as count FROM payments WHERE status = 'approved'");
        const rejected = await this.raw("SELECT COUNT(*) as count FROM payments WHERE status = 'rejected'");
        const totalAmount = await this.raw('SELECT COALESCE(SUM(amount), 0) as total FROM payments');
        const approvedAmount = await this.raw("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'approved'");

        return {
            total: (total[0] as any)?.count ?? 0,
            pending: (pending[0] as any)?.count ?? 0,
            approved: (approved[0] as any)?.count ?? 0,
            rejected: (rejected[0] as any)?.count ?? 0,
            totalAmount: (totalAmount[0] as any)?.total ?? 0,
            approvedAmount: (approvedAmount[0] as any)?.total ?? 0,
        };
    }

    static async getRecent(limit: number = 5): Promise<any[]> {
        return this.raw(
            `SELECT id, user_chat_id, user_username, amount, status, created_at FROM ${this.table} ORDER BY created_at DESC LIMIT ?`,
            limit
        );
    }
}
