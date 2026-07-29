import { Order } from '../db/Order';
import { TelegramUser } from '../db/TelegramUser';
import { Payment } from '../db/Payment';
import { Service } from '../db/Service';
import { ApiProvider } from '../db/ApiProvider';
import { Setting } from '../db/Setting';
import { Api } from 'grammy';
import { nowTehran, dateTehran } from '../utils/date';

interface DailyStats {
    date: string;
    orders: {
        total: number;
        completed: number;
        pending: number;
        canceled: number;
        partial: number;
    };
    revenue: {
        today: number;
        total: number;
    };
    users: {
        newToday: number;
        total: number;
    };
    payments: {
        pending: number;
        approvedToday: number;
        totalAmount: number;
    };
    services: {
        total: number;
        active: number;
    };
    providers: {
        total: number;
        active: number;
        totalBalance: number;
    };
}

export async function generateDailyStats(db: D1Database): Promise<DailyStats> {
    Order.use(db);
    TelegramUser.use(db);
    Payment.use(db);
    Service.use(db);
    ApiProvider.use(db);

    // Order stats
    const orderStats = await Order.getOrderStats();
    const revenueStats = await Order.getRevenueStats();

    // User stats
    const userStats = await TelegramUser.getStats();

    // Payment stats
    const paymentStats = await Payment.getStats();

    // Service stats
    const serviceStats = await Service.getBasicStats();

    // Provider stats
    const providerStats = await ApiProvider.getBasicStats();
    const providers = await ApiProvider.getActiveProviders();
    const totalBalance = providers.reduce((sum, p) => sum + parseFloat(p.balance || '0'), 0);

    return {
        date: dateTehran(),
        orders: {
            total: orderStats.total,
            completed: orderStats.completed,
            pending: orderStats.pending,
            canceled: orderStats.canceled,
            partial: orderStats.partial,
        },
        revenue: {
            today: revenueStats.today_revenue,
            total: revenueStats.total_revenue,
        },
        users: {
            newToday: userStats.today,
            total: userStats.total,
        },
        payments: {
            pending: paymentStats.pending,
            approvedToday: paymentStats.approved,
            totalAmount: paymentStats.approvedAmount,
        },
        services: {
            total: serviceStats.total,
            active: serviceStats.active,
        },
        providers: {
            total: providerStats.total,
            active: providerStats.active,
            totalBalance,
        },
    };
}

export function formatStatsMessage(stats: DailyStats): string {
    const completionRate = stats.orders.total > 0
        ? Math.round((stats.orders.completed / stats.orders.total) * 100)
        : 0;

    return `📊 گزارش روزانه پنل SMM
📅 تاریخ: ${stats.date}

🛍️ سفارشات:
├ کل: ${stats.orders.total}
├ تکمیل شده: ${stats.orders.completed} (${completionRate}%)
├ در انتظار: ${stats.orders.pending}
├ لغو شده: ${stats.orders.canceled}
└ جزئی: ${stats.orders.partial}

💰 درآمد:
├ امروز: ${stats.revenue.today.toLocaleString()} تومان
└ کل: ${stats.revenue.total.toLocaleString()} تومان

👥 کاربران:
├ جدید امروز: ${stats.users.newToday}
└ کل: ${stats.users.total}

💳 پرداخت‌ها:
├ در انتظار: ${stats.payments.pending}
├ تایید شده امروز: ${stats.payments.approvedToday}
└ مبلغ کل تایید شده: ${stats.payments.totalAmount.toLocaleString()} تومان

📦 سرویس‌ها:
├ کل: ${stats.services.total}
└ فعال: ${stats.services.active}

🔌 ارائه‌دهندگان:
├ کل: ${stats.providers.total}
├ فعال: ${stats.providers.active}
└ موجودی کل: ${stats.providers.totalBalance.toFixed(2)} USD`;
}

export async function sendDailyStatsReport(db: D1Database): Promise<boolean> {
    try {
        Setting.use(db);

        // Check if stats reporting is enabled
        const enabled = await Setting.get('stats_report_enabled');
        if (enabled === 'false') {
            console.log('Stats reporting is disabled');
            return false;
        }

        // Get admin chat ID
        const adminChatId = await Setting.get('admin_chat_id');
        if (!adminChatId) {
            console.log('No admin chat ID configured');
            return false;
        }

        // Get Telegram token
        const token = await Setting.get('telegram_token');
        if (!token) {
            console.log('No Telegram token configured');
            return false;
        }

        // Generate and send stats
        const stats = await generateDailyStats(db);
        const message = formatStatsMessage(stats);

        const api = new Api(token);
        await api.sendMessage(Number(adminChatId), message);

        console.log('Daily stats report sent successfully');
        return true;
    } catch (error: any) {
        console.error('Failed to send daily stats report:', error.message);
        return false;
    }
}

export async function sendStatsReportOnDemand(db: D1Database, chatId: number): Promise<boolean> {
    try {
        Setting.use(db);

        // Get Telegram token
        const token = await Setting.get('telegram_token');
        if (!token) {
            return false;
        }

        // Generate and send stats
        const stats = await generateDailyStats(db);
        const message = formatStatsMessage(stats);

        const api = new Api(token);
        await api.sendMessage(chatId, message);

        return true;
    } catch (error: any) {
        console.error('Failed to send stats report:', error.message);
        return false;
    }
}
