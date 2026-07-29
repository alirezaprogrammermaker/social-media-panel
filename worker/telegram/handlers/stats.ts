import { Context } from 'grammy';
import { TelegramUser } from '../../db/TelegramUser';
import { generateDailyStats, formatStatsMessage } from '../../cron/statsReporter';
import { helpKeyboard } from '../keyboards';

export async function handleStats(ctx: Context, db: D1Database, userId: number): Promise<void> {
    try {
        // Check if user is admin
        TelegramUser.use(db);
        const user = await TelegramUser.findByChatId(userId) as any;

        if (!user || user.role !== 'admin') {
            await ctx.reply('⛔ این قابلیت فقط برای مدیران در دسترس است.');
            return;
        }

        // Generate and send stats
        const stats = await generateDailyStats(db);
        const message = formatStatsMessage(stats);

        await ctx.reply(message, { reply_markup: helpKeyboard() });
    } catch (error: any) {
        console.error('Error in handleStats:', error);
        await ctx.reply('❌ خطا در دریافت آمار. لطفاً دوباره تلاش کنید.');
    }
}
