import { Model } from './Model';
import { nowTehran } from '../utils/date';

export interface BotChannelRow {
    id: number;
    channel_id: number;
    channel_username: string;
    channel_title: string;
    is_mandatory: number;
    created_at: string;
}

export class BotChannel extends Model<BotChannelRow> {
    protected static table = 'bot_channels';

    static async findMandatory(this: any): Promise<BotChannelRow[]> {
        return this.where('is_mandatory', 1);
    }

    static async setMandatory(this: any, id: number, isMandatory: boolean): Promise<void> {
        const now = nowTehran();
        await this.raw(
            `UPDATE ${this.table} SET is_mandatory = ?, updated_at = ? WHERE id = ?`,
            isMandatory ? 1 : 0,
            now,
            id
        );
    }
}
