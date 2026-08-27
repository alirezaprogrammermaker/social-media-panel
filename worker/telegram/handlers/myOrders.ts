import { Order } from '../../db/Order';
import { myOrdersState } from '../state';
import { orderListKeyboard, orderDetailKeyboard, ITEMS_PER_PAGE, mainMenuKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';

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

export async function handleMyOrders(ctx: any, db: D1Database, userId: number) {
    const { orders, total, totalPages, page } = await loadOrdersPage(db, userId, 0);

    if (total === 0) {
        await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
        return;
    }

    myOrdersState.set(userId, { step: 'list', page });

    await ctx.reply(MESSAGES.MY_ORDERS_PAGE(1, totalPages), {
        reply_markup: orderListKeyboard(orders as any, page, total),
    });
}

export async function handleMyOrdersPagination(ctx: any, db: D1Database, userId: number, direction: 'next' | 'prev') {
    const state = myOrdersState.get(userId);
    if (!state || state.step !== 'list') return false;

    let targetPage = state.page;
    if (direction === 'next') targetPage = state.page + 1;
    else if (direction === 'prev') targetPage = state.page - 1;

    const { orders, total, totalPages, page: newPage } = await loadOrdersPage(db, userId, targetPage);
    if (total === 0) {
        myOrdersState.delete(userId);
        await ctx.reply(MESSAGES.MY_ORDERS_EMPTY, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    myOrdersState.set(userId, { ...state, page: newPage });
    await ctx.reply(MESSAGES.MY_ORDERS_PAGE(newPage + 1, totalPages), {
        reply_markup: orderListKeyboard(orders as any, newPage, total),
    });
    return true;
}

export async function handleMyOrderSelect(ctx: any, db: D1Database, userId: number, text: string) {
    const state = myOrdersState.get(userId);
    if (!state || state.step !== 'list') return false;

    // Extract order ID from button text (format: "emoji #ID - ServiceName")
    const orderIdStr = text.match(/#(\d+)/);
    if (!orderIdStr) return false;

    const orderId = parseInt(orderIdStr[1], 10);
    if (isNaN(orderId)) return false;

    Order.use(db);
    const order = await Order.findUserOrderById(userId, orderId) as any;

    if (!order) {
        await ctx.reply(MESSAGES.ORDER_NOT_FOUND);
        return true;
    }

    myOrdersState.set(userId, { step: 'detail', page: state.page, selectedOrderId: orderId });

    const statusPersian = statusLabels[order.status] || order.status;
    const date = order.created_at ? formatPersianDate(order.created_at) : '-';

    await ctx.reply(
        MESSAGES.MY_ORDER_DETAIL(
            orderId,
            order.service_name || 'سرویس',
            order.link || '-',
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
    const state = myOrdersState.get(userId);
    if (!state) return false;

    if (state.step === 'detail') {
        const { orders, total, totalPages, page } = await loadOrdersPage(db, userId, state.page);
        myOrdersState.set(userId, { step: 'list', page });
        await ctx.reply(MESSAGES.MY_ORDERS_PAGE(page + 1, totalPages), {
            reply_markup: orderListKeyboard(orders as any, page, total),
        });
        return true;
    }

    if (state.step === 'list') {
        myOrdersState.delete(userId);
        await ctx.reply(MESSAGES.AI_EXIT, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    return false;
}

export async function handleMyOrdersExit(userId: number) {
    myOrdersState.delete(userId);
}
