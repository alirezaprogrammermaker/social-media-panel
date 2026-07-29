import { TelegramUser } from '../../db/TelegramUser';
import { Order } from '../../db/Order';
import { helpKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';

function toPersianDigits(num: number | string): string {
    const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return String(num).replace(/\d/g, (d) => persianDigits[parseInt(d)]);
}

function formatPersianDate(dateStr: string): string {
    const date = new Date(dateStr);
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    };
    const formatted = date.toLocaleDateString('fa-IR', options);
    return toPersianDigits(formatted);
}

export async function handleProfile(ctx: any, db: D1Database, userId: number) {
    TelegramUser.use(db);
    const user = await TelegramUser.findByChatId(userId) as any;

    if (!user) {
        await ctx.reply('❌ پروفایل شما یافت نشد.', { reply_markup: helpKeyboard() });
        return;
    }

    Order.use(db);
    const orders = await Order.getUserOrders(userId);

    const totalOrders = orders.length;
    const pendingOrders = orders.filter((o: any) => o.status === 'Pending').length;
    const completedOrders = orders.filter((o: any) => o.status === 'Completed').length;
    const balance = user.balance || 0;

    const joinDate = user.created_at
        ? formatPersianDate(user.created_at)
        : '-';

    const message =
        `${MESSAGES.PROFILE_TITLE}\n` +
        `\n` +
        `${MESSAGES.PROFILE_DIVIDER}\n` +
        `\n` +
        `${MESSAGES.PROFILE_USER_ID} <code>${toPersianDigits(user.chat_id)}</code>\n` +
        `${MESSAGES.PROFILE_NAME} ${user.first_name || '-'}\n` +
        `${MESSAGES.PROFILE_USERNAME} ${user.username ? `@${user.username}` : '-'}\n` +
        `${MESSAGES.PROFILE_BALANCE} ${toPersianDigits(Number(balance).toLocaleString())} ${MESSAGES.TOMAN}\n` +
        `${MESSAGES.PROFILE_JOIN_DATE} ${joinDate}\n` +
        `\n` +
        `${MESSAGES.PROFILE_DIVIDER}\n` +
        `\n` +
        `${MESSAGES.PROFILE_ORDERS_TITLE}\n` +
        `\n` +
        `${MESSAGES.PROFILE_ORDERS_TOTAL} ${toPersianDigits(totalOrders)}\n` +
        `${MESSAGES.PROFILE_ORDERS_PENDING} ${toPersianDigits(pendingOrders)}\n` +
        `${MESSAGES.PROFILE_ORDERS_COMPLETED} ${toPersianDigits(completedOrders)}\n` +
        `\n` +
        `${MESSAGES.PROFILE_DIVIDER}`;

    await ctx.reply(message, {
        parse_mode: 'HTML',
        reply_markup: helpKeyboard(),
    });
}
