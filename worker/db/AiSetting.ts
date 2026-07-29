import { Model } from './Model';
import { nowTehran } from '../utils/date';

export interface AiSettingRow {
    id: number;
    setting_key: string;
    setting_value: string;
    created_at: string;
    updated_at: string;
}

export interface AiUsageLogRow {
    id: number;
    user_role: string;
    chat_id: number | null;
    tokens_used: number;
    request_count: number;
    created_at: string;
}

export interface AiUsageStatsRow {
    user_role: string;
    date: string;
    total_tokens: number;
    total_requests: number;
}

export class AiSetting extends Model<AiSettingRow> {
    protected static table = 'ai_settings';

    static async get(key: string): Promise<string | null> {
        const row = await this.findBy<AiSettingRow>('setting_key', key);
        return row?.setting_value ?? null;
    }

    static async set(key: string, value: string): Promise<void> {
        const now = nowTehran();
        const existing = await this.findBy<AiSettingRow>('setting_key', key);
        if (existing) {
            await this.raw(
                `UPDATE ${this.table} SET setting_value = ?, updated_at = ? WHERE setting_key = ?`,
                value,
                now,
                key,
            );
        } else {
            await this.create({ setting_key: key, setting_value: value } as any);
        }
    }

    static async getAll(): Promise<Record<string, string>> {
        const rows = await this.all<AiSettingRow>();
        const result: Record<string, string> = {};
        for (const row of rows) {
            result[row.setting_key] = row.setting_value;
        }
        return result;
    }

    static async getAdminSettings(): Promise<Record<string, string>> {
        const all = await this.getAll();
        const admin: Record<string, string> = {};
        for (const [key, value] of Object.entries(all)) {
            if (key.startsWith('ai_admin_')) {
                admin[key.replace('ai_admin_', '')] = value;
            }
        }
        return admin;
    }

    static async getUserSettings(): Promise<Record<string, string>> {
        const all = await this.getAll();
        const user: Record<string, string> = {};
        for (const [key, value] of Object.entries(all)) {
            if (key.startsWith('ai_user_')) {
                user[key.replace('ai_user_', '')] = value;
            }
        }
        return user;
    }
}

export class AiUsageLog extends Model<AiUsageLogRow> {
    protected static table = 'ai_usage_log';

    static async logUsage(userRole: string, chatId: number | null, tokensUsed: number): Promise<void> {
        await this.create({
            user_role: userRole,
            chat_id: chatId,
            tokens_used: tokensUsed,
            request_count: 1,
        } as any);
    }

    static async getTodayUsage(userRole: string): Promise<{ totalTokens: number; totalRequests: number }> {
        const result = await this.rawFirst<{ total_tokens: number; total_requests: number }>(
            `SELECT SUM(tokens_used) as total_tokens, SUM(request_count) as total_requests
             FROM ${this.table}
             WHERE user_role = ? AND date(created_at) = date('now')`,
            userRole,
        );
        return {
            totalTokens: result?.total_tokens ?? 0,
            totalRequests: result?.total_requests ?? 0,
        };
    }

    static async getTodayUsageByChatId(chatId: number): Promise<{ totalTokens: number; totalRequests: number }> {
        const result = await this.rawFirst<{ total_tokens: number; total_requests: number }>(
            `SELECT SUM(tokens_used) as total_tokens, SUM(request_count) as total_requests
             FROM ${this.table}
             WHERE chat_id = ? AND date(created_at) = date('now')`,
            chatId,
        );
        return {
            totalTokens: result?.total_tokens ?? 0,
            totalRequests: result?.total_requests ?? 0,
        };
    }

    static async getStats(): Promise<AiUsageStatsRow[]> {
        const { results } = await this.db.prepare(
            `SELECT user_role, date(created_at) as date, SUM(tokens_used) as total_tokens, SUM(request_count) as total_requests
             FROM ${this.table}
             WHERE created_at >= datetime('now', '-30 days')
             GROUP BY user_role, date(created_at)
             ORDER BY date(created_at) DESC`
        ).all();
        return results as unknown as AiUsageStatsRow[];
    }
}
