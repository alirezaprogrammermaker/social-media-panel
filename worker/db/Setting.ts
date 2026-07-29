import { Model } from './Model';

export interface SettingRow {
    key: string;
    value: string;
}

export class Setting extends Model<SettingRow> {
    protected static table = 'settings';

    static async get(key: string): Promise<string | null> {
        const row = await this.findBy<SettingRow>('key', key);
        return row?.value ?? null;
    }

    static async set(key: string, value: string): Promise<void> {
        const existing = await this.findBy<SettingRow>('key', key);
        if (existing) {
            await this.raw(`UPDATE ${this.table} SET value = ? WHERE key = ?`, value, key);
        } else {
            await this.create({ key, value });
        }
    }

    static async remove(key: string): Promise<void> {
        await this.raw(`DELETE FROM ${this.table} WHERE key = ?`, key);
    }
}
