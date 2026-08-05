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

function getTehranHourMinute(date: Date): { hour: number; minute: number } {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tehran',
        hour: 'numeric',
        minute: 'numeric',
        hourCycle: 'h23',
    }).formatToParts(date);
    return {
        hour: Number(parts.find((p) => p.type === 'hour')?.value ?? 0),
        minute: Number(parts.find((p) => p.type === 'minute')?.value ?? 0),
    };
}

export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: Bindings): Promise<void> {
        try {
            const { hour, minute } = getTehranHourMinute(new Date(event.scheduledTime));

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
            }

            // Stats report: check on every cron tick (*/5) so non-:00 times work
            Setting.use(env.DB);
            const statsReportEnabled = await Setting.get('stats_report_enabled');
            const statsReportTime = await Setting.get('stats_report_time') || '20:00';
            const [reportHour, reportMinute] = statsReportTime.split(':').map(Number);

            if (statsReportEnabled !== 'false' && hour === reportHour && minute === reportMinute) {
                console.log('Sending daily stats report...');
                const sent = await sendDailyStatsReport(env.DB);
                console.log(`Stats report ${sent ? 'sent' : 'failed'}`);
            }
        } catch (error: any) {
            console.error('Cron job error:', error.message);
        }
    },
};
