import { Model } from './Model';

export interface ApiProviderData {
    id?: number;
    name: string;
    api_url: string;
    api_key: string;
    balance?: string;
    currency?: string;
    is_active?: number;
    last_sync_at?: string;
    created_at?: string;
    updated_at?: string;
}

export class ApiProvider extends Model<ApiProviderData> {
    protected static table = 'api_providers';

    static async getActiveProviders(): Promise<ApiProviderData[]> {
        return this.where('is_active', 1);
    }

    static async findActiveById(id: number): Promise<ApiProviderData | null> {
        return this.rawFirst(
            'SELECT * FROM api_providers WHERE id = ? AND is_active = 1',
            id
        );
    }

    static async updateBalance(id: number, balance: string, currency: string): Promise<void> {
        await this.raw(
            'UPDATE api_providers SET balance = ?, currency = ?, last_sync_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?',
            balance,
            currency,
            id
        );
    }

    static async getStats(): Promise<{ total: number; active: number; total_balance: number }> {
        const result = await this.rawFirst<any>(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
                SUM(CAST(balance AS REAL)) as total_balance
             FROM api_providers`
        );
        return result || { total: 0, active: 0, total_balance: 0 };
    }
}
