import { Order } from '../../db/Order';
import { Service } from '../../db/Service';
import { orderListKeyboard, orderDetailInlineKeyboard, ITEMS_PER_PAGE, mainMenuKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';
import {
    clearFlowSession,
    BOT_FLOWS,
} from '../flowSession';
import {
    getMyOrdersFlow,
    startMyOrdersFlow,
    type MyOrdersFlowData,
    type MyOrdersStep,
} from '../botFlows';
import { setFlowState } from '../flowSession';
import { promptEnterLinkAfterService } from './order';

/** Soft cap so one user cannot force huge Telegram DB scans forever. */
const MAX_USER_ORDERS_HISTORY = 200;

const statusLabels: Record<string, string> = {
    'Pending': 'در انتظار',
    'In progress': 'در حال انجام',
    'Completed': 'تکمیل شده',
    'Partial': 'جزئی',
    'Processing': 'پردازش',
    'Canceled': 'لغو شده',
};

/** Reply-keyboard order rows look like: "✅ #12 - Service name" */
export function looksLikeOrderListButton(text: string): boolean {
    if (!text) return false;
    return /[#＃]\d+/.test(text) && (/\s-\s/.test(text) || /[⏳🔄✅⚠️⚙️❌📋]/.test(text));
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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

async function loadOrdersPage(db: D1Database, userId: number, page: number) {
    Order.use(db);
    const totalAll = await Order.countUserOrders(userId);
    const total = Math.min(totalAll, MAX_USER_ORDERS_HISTORY);
    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const orders = await Order.getUserOrders(userId, {
        limit: ITEMS_PER_PAGE,
        offset: safePage * ITEMS_PER_PAGE,
    });
    return { orders, total, totalPages, page: safePage };
}

async function saveMyOrders(
    db: D1Database,
    chatId: number,
    step: MyOrdersStep,
    data: MyOrdersFlowData
) {
    return setFlowState(db, chatId, BOT_FLOWS.MY_ORDERS, { step, ...data });
}

export async function handleMyOrders(ctx: any, db: D1Database, userId: number) {
    const { orders, total, totalPages, page } = await loadOrdersPage(db, userId, 0);

    if (total === 0) {
        await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
        await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
        return;
    }

    await startMyOrdersFlow(db, userId, { step: 'list', page });

    await ctx.reply(MESSAGES.MY_ORDERS_PAGE(1, totalPages), {
        reply_markup: orderListKeyboard(orders as any, page, total),
    });
}

export async function handleMyOrdersPagination(
    ctx: any,
    db: D1Database,
    userId: number,
    direction: 'next' | 'prev'
) {
    const session = await getMyOrdersFlow(db, userId);
    if (session && session.step !== 'list') return false;

    let targetPage = session?.page ?? 0;
    if (direction === 'next') targetPage += 1;
    else if (direction === 'prev') targetPage -= 1;

    const { orders, total, totalPages, page: newPage } = await loadOrdersPage(db, userId, targetPage);
    if (total === 0) {
        await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
        await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    await saveMyOrders(db, userId, 'list', { page: newPage });
    await ctx.reply(MESSAGES.MY_ORDERS_PAGE(newPage + 1, totalPages), {
        reply_markup: orderListKeyboard(orders as any, newPage, total),
    });
    return true;
}

export async function handleMyOrderSelect(ctx: any, db: D1Database, userId: number, text: string) {
    if (!looksLikeOrderListButton(text)) return false;

    let session = await getMyOrdersFlow(db, userId);
    if (!session) {
        await saveMyOrders(db, userId, 'list', { page: 0 });
        session = await getMyOrdersFlow(db, userId);
        if (!session) return false;
    }

    const orderIdStr = text.match(/[#＃](\d+)/);
    if (!orderIdStr) return false;

    const orderId = parseInt(orderIdStr[1], 10);
    if (isNaN(orderId)) return false;

    Order.use(db);
    const order = await Order.findUserOrderById(userId, orderId) as any;

    if (!order) {
        await ctx.reply(MESSAGES.ORDER_NOT_FOUND);
        return true;
    }

    const page = session.page ?? 0;
    await saveMyOrders(db, userId, 'detail', { page, selectedOrderId: orderId });

    const statusPersian = statusLabels[order.status] || order.status;
    const date = order.created_at ? formatPersianDate(order.created_at) : '-';
    const chargeNum = Number(order.charge ?? 0);
    const chargeFormatted = Number.isFinite(chargeNum)
        ? chargeNum.toLocaleString('fa-IR')
        : String(order.charge ?? '0');

    // Inline «تکرار سفارش» + «بازگشت به لیست» under the detail message.
    await ctx.reply(
        MESSAGES.MY_ORDER_DETAIL({
            orderId,
            serviceId: order.service_id ?? '-',
            serviceName: escapeHtml(String(order.service_name || 'سرویس')),
            link: escapeHtml(String(order.link || '-')),
            quantity: order.quantity || 'پکیج',
            charge: chargeFormatted,
            status: statusPersian,
            date,
        }),
        {
            parse_mode: 'HTML',
            reply_markup: orderDetailInlineKeyboard(orderId),
        }
    );
    return true;
}

/**
 * Callback: `repeat_order:{orderId}`
 * Validates ownership + that the service (and its category) are still active,
 * then jumps into the order flow at `enter_link` (after service selection).
 */
export async function handleRepeatOrderCallback(ctx: any, db: D1Database, userId: number, data: string) {
    const match = data.match(/^repeat_order:(\d+)$/);
    if (!match) {
        await ctx.answerCallbackQuery({ text: 'درخواست نامعتبر است', show_alert: true });
        return;
    }

    const orderId = parseInt(match[1], 10);
    if (!Number.isFinite(orderId) || orderId <= 0) {
        await ctx.answerCallbackQuery({ text: 'شناسه سفارش نامعتبر است', show_alert: true });
        return;
    }

    Order.use(db);
    const order = await Order.findUserOrderById(userId, orderId) as any;
    if (!order) {
        await ctx.answerCallbackQuery({ text: MESSAGES.ORDER_NOT_FOUND, show_alert: true });
        return;
    }

    const serviceId = Number(order.service_id);
    if (!Number.isFinite(serviceId) || serviceId <= 0) {
        await ctx.answerCallbackQuery({ text: 'سرویس این سفارش یافت نشد', show_alert: true });
        return;
    }

    Service.use(db);
    const service = await Service.findActiveOrderable(serviceId);
    if (!service || !service.id) {
        await ctx.answerCallbackQuery({ text: 'سرویس غیرفعال است', show_alert: true });
        await ctx.reply(MESSAGES.REPEAT_SERVICE_UNAVAILABLE, {
            reply_markup: await mainMenuKeyboard(db, userId),
        });
        await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
        return;
    }

    await ctx.answerCallbackQuery({ text: 'در حال آماده‌سازی تکرار سفارش…' });
    await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);

    await promptEnterLinkAfterService(
        ctx,
        db,
        userId,
        {
            categoryId: service.category_id,
            categoryName: service.category_name,
            categoryPage: 0,
            servicePage: 0,
        },
        {
            id: service.id,
            name: service.name,
            type: service.type,
            description: service.description,
            rate: service.rate,
            min: service.min,
            max: service.max,
            category_id: service.category_id,
            category_name: service.category_name,
        },
        { exclusive: true }
    );
}

/** Inline «بازگشت به لیست» from order detail. */
export async function handleMyOrdersBackCallback(ctx: any, db: D1Database, userId: number) {
    await ctx.answerCallbackQuery();
    await handleMyOrdersBack(ctx, db, userId);
}

export async function handleMyOrdersBack(ctx: any, db: D1Database, userId: number) {
    const session = await getMyOrdersFlow(db, userId);

    if (!session || session.step === 'detail') {
        const page = session?.page ?? 0;
        const { orders, total, totalPages, page: safePage } = await loadOrdersPage(db, userId, page);
        if (total === 0) {
            await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
            await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
            return true;
        }
        await saveMyOrders(db, userId, 'list', { page: safePage });
        await ctx.reply(MESSAGES.MY_ORDERS_PAGE(safePage + 1, totalPages), {
            reply_markup: orderListKeyboard(orders as any, safePage, total),
        });
        return true;
    }

    if (session.step === 'list') {
        await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
        await ctx.reply(MESSAGES.AI_EXIT, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    return false;
}

export async function handleMyOrdersExit(db: D1Database, userId: number) {
    await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
}

export async function getMyOrdersStep(db: D1Database, chatId: number): Promise<MyOrdersStep | null> {
    const session = await getMyOrdersFlow(db, chatId);
    return session?.step ?? null;
}
