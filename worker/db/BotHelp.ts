import { Model } from './Model';

export interface BotHelpRow {
    id: number;
    name: string;
    description: string;
    sort_order: number;
    created_at: string;
}

export class BotHelp extends Model<BotHelpRow> {
    protected static table = 'telegram_bot_helps';
}
