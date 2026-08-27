import { Context } from 'grammy';
import { TelegramUser } from '../../db/TelegramUser';
import { generateDailyStats, formatStatsMessage } from '../../cron/statsReporter';
import { mainMenuKeyboard } from '../keyboards';

export async function handleStats(ctx: Context, db: D1Database, userId: number): Promise<void> {
    try {
        TelegramUser.use(db);
        const user = await TelegramUser.findByChatId(userId) as any;

        // Do not reveal that this is an admin feature
        if (!user || user.role !== 'admin') {
            return;
        }

        const stats = await generateDailyStats(db);
        const message = formatStatsMessage(stats);

        await ctx.reply(message, { reply_markup: await mainMenuKeyboard(db, userId) });
    } catch (error: any) {
        console.error('Error in handleStats:', error);
        await ctx.reply('❌ خطا در دریافت آمار. لطفاً دوباره تلاش کنید.');
    }
}
