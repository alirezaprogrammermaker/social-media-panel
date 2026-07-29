import { Hono } from 'hono';
import authRoutes from './routes/auth';
import telegramBot from './telegram';
import dashboardRoutes from './routes/dashboard';
import aiRoutes from './routes/ai';
import smmRoutes from './routes/smm';
import { checkOrderStatuses } from './cron/orderStatusChecker';
import { syncServicesFromProviders, syncProviderBalance } from './cron/serviceChecker';
import { sendDailyStatsReport } from './cron/statsReporter';
import { Setting } from './db/Setting';
import type { Bindings, Variables } from './types';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.route('/api/auth', authRoutes);
app.route('/api/telegram', telegramBot);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api/smm', smmRoutes);

app.get('/api/test-ai', async (c) => {
    try {
        const response = await c.env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            messages: [
                { role: 'system', content: 'تو یک دستیار فارسی هستی. فقط به فارسی پاسخ بده.' },
                { role: 'user', content: 'سلام، حالت چطوره؟' },
            ],
            max_tokens: 100,
        });
        return c.json({ ok: true, response });
    } catch (e: any) {
        return c.json({ error: e.message }, 500);
    }
});

export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
        try {
            const now = new Date(event.scheduledTime);
            const minute = now.getMinutes();
            const hour = now.getHours();

            if (minute % 5 === 0) {
                console.log('Checking order statuses...');
                const result = await checkOrderStatuses(env.DB);
                console.log(`Order check: ${result.checked} checked, ${result.updated} updated, ${result.refunded} refunded`);
            }

            if (minute === 0) {
                console.log('Syncing services and balances...');
                const syncResult = await syncServicesFromProviders(env.DB);
                console.log(`Service sync: ${syncResult.map(r => `${r.providerName}: +${r.added} added, ${r.updated} updated`).join(', ')}`);

                await syncProviderBalance(env.DB);
                console.log('Balance sync completed');

                // Check for daily stats report
                Setting.use(env.DB);
                const statsReportEnabled = await Setting.get('stats_report_enabled');
                const statsReportTime = await Setting.get('stats_report_time') || '20:00';
                const [reportHour, reportMinute] = statsReportTime.split(':').map(Number);

                if (statsReportEnabled !== 'false' && hour === reportHour && minute === reportMinute) {
                    console.log('Sending daily stats report...');
                    const sent = await sendDailyStatsReport(env.DB);
                    console.log(`Stats report ${sent ? 'sent' : 'failed'}`);
                }
            }
        } catch (error: any) {
            console.error('Cron job error:', error.message);
        }
    },
};
