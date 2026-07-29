import { Model } from './Model';
import { nowTehran } from '../utils/date';

export interface TelegramUserSessionRow {
    id: number;
    telegram_user_id: number;
    flow: string;
    step: string;
    data: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export class TelegramUserSession extends Model<TelegramUserSessionRow> {
    protected static table = 'telegram_user_sessions';

    static async findActiveByUserId(this: any, userId: number): Promise<TelegramUserSessionRow | null> {
        return this.rawFirst(
            `SELECT * FROM ${this.table} WHERE telegram_user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
            userId,
        );
    }

    static async findActiveByFlow(this: any, flow: string): Promise<TelegramUserSessionRow[]> {
        return this.raw(
            `SELECT * FROM ${this.table} WHERE flow = ? AND status = 'active'`,
            flow,
        );
    }

    static async allWithUser(this: any): Promise<any[]> {
        return this.raw(
            `SELECT s.*, u.chat_id, u.username, u.first_name
             FROM ${this.table} s
             JOIN telegram_users u ON u.id = s.telegram_user_id
             ORDER BY s.id DESC`,
        );
    }

    static async findByStatusWithUser(this: any, status: string): Promise<any[]> {
        return this.raw(
            `SELECT s.*, u.chat_id, u.username, u.first_name
             FROM ${this.table} s
             JOIN telegram_users u ON u.id = s.telegram_user_id
             WHERE s.status = ?
             ORDER BY s.id DESC`,
            status,
        );
    }

    static async complete(this: any, id: number): Promise<void> {
        const now = nowTehran();
        await this.raw(
            `UPDATE ${this.table} SET status = 'completed', updated_at = ? WHERE id = ?`,
            now,
            id,
        );
    }

    static async cancel(this: any, id: number): Promise<void> {
        const now = nowTehran();
        await this.raw(
            `UPDATE ${this.table} SET status = 'cancelled', updated_at = ? WHERE id = ?`,
            now,
            id,
        );
    }

    static async advanceStep(this: any, id: number, step: string, data: Record<string, any>): Promise<void> {
        const now = nowTehran();
        await this.raw(
            `UPDATE ${this.table} SET step = ?, data = ?, updated_at = ? WHERE id = ?`,
            step,
            JSON.stringify(data),
            now,
            id,
        );
    }

    static async getActiveCount(): Promise<number> {
        const result = await this.rawFirst<{ count: number }>(
            `SELECT COUNT(*) as count FROM ${this.table} WHERE status = 'active'`
        );
        return result?.count ?? 0;
    }
}
