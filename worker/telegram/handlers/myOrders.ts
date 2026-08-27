import { Order } from '../../db/Order';
import { orderListKeyboard, orderDetailKeyboard, ITEMS_PER_PAGE, mainMenuKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';
import {
    BOT_FLOWS,
    clearFlowSession,
    getFlowSession,
    setFlowSession,
} from '../flowSession';

/** Soft cap so one user cannot force huge Telegram DB scans forever. */
const MAX_USER_ORDERS_HISTORY = 200;

export type MyOrdersStep = 'list' | 'detail';

export interface MyOrdersData {
    page: number;
    selectedOrderId?: number;
}

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

async function getMyOrdersSession(db: D1Database, chatId: number) {
    return getFlowSession<MyOrdersData>(db, chatId, BOT_FLOWS.MY_ORDERS);
}

async function saveMyOrdersSession(
    db: D1Database,
    chatId: number,
    step: MyOrdersStep,
    data: MyOrdersData
) {
    return setFlowSession(db, chatId, BOT_FLOWS.MY_ORDERS, step, data);
}

export async function handleMyOrders(ctx: any, db: D1Database, userId: number) {
    const { orders, total, totalPages, page } = await loadOrdersPage(db, userId, 0);

    if (total === 0) {
        await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
        await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
        return;
    }

    await saveMyOrdersSession(db, userId, 'list', { page });

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
    const session = await getMyOrdersSession(db, userId);
    if (session && session.step !== 'list') return false;

    let targetPage = session?.data?.page ?? 0;
    if (direction === 'next') targetPage += 1;
    else if (direction === 'prev') targetPage -= 1;

    const { orders, total, totalPages, page: newPage } = await loadOrdersPage(db, userId, targetPage);
    if (total === 0) {
        await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
        await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    await saveMyOrdersSession(db, userId, 'list', { page: newPage });
    await ctx.reply(MESSAGES.MY_ORDERS_PAGE(newPage + 1, totalPages), {
        reply_markup: orderListKeyboard(orders as any, newPage, total),
    });
    return true;
}

export async function handleMyOrderSelect(ctx: any, db: D1Database, userId: number, text: string) {
    if (!looksLikeOrderListButton(text)) return false;

    let session = await getMyOrdersSession(db, userId);
    if (!session) {
        // Keyboard may still be visible after isolate recycle; re-open flow from D1
        session = await saveMyOrdersSession(db, userId, 'list', { page: 0 });
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

    const page = session.data?.page ?? 0;
    await saveMyOrdersSession(db, userId, 'detail', { page, selectedOrderId: orderId });

    const statusPersian = statusLabels[order.status] || order.status;
    const date = order.created_at ? formatPersianDate(order.created_at) : '-';

    await ctx.reply(
        MESSAGES.MY_ORDER_DETAIL(
            orderId,
            escapeHtml(String(order.service_name || 'سرویس')),
            escapeHtml(String(order.link || '-')),
            order.quantity || 'پکیج',
            statusPersian,
            date,
            order.api_provider_order_id
        ),
        { parse_mode: 'HTML', reply_markup: orderDetailKeyboard() }
    );
    return true;
}

export async function handleMyOrdersBack(ctx: any, db: D1Database, userId: number) {
    const session = await getMyOrdersSession(db, userId);

    if (!session || session.step === 'detail') {
        const page = session?.data?.page ?? 0;
        const { orders, total, totalPages, page: safePage } = await loadOrdersPage(db, userId, page);
        if (total === 0) {
            await clearFlowSession(db, userId, BOT_FLOWS.MY_ORDERS);
            await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
            return true;
        }
        await saveMyOrdersSession(db, userId, 'list', { page: safePage });
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

/** True when user has an active my_orders flow in D1. */
export async function hasMyOrdersFlow(db: D1Database, chatId: number): Promise<boolean> {
    const session = await getMyOrdersSession(db, chatId);
    return Boolean(session);
}

export async function getMyOrdersStep(db: D1Database, chatId: number): Promise<MyOrdersStep | null> {
    const session = await getMyOrdersSession(db, chatId);
    if (!session) return null;
    return session.step as MyOrdersStep;
}
