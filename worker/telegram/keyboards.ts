import { Keyboard, InlineKeyboard } from 'grammy';
import { BUTTONS } from './constants';

export const ITEMS_PER_PAGE = 8;

export function helpKeyboard(isAdmin = false) {
    const kb = new Keyboard()
        .text(BUTTONS.NEW_ORDER)
        .text(BUTTONS.MY_ORDERS)
        .row()
        .text(BUTTONS.ADD_BALANCE)
        .text(BUTTONS.PROFILE)
        .row()
        .text(BUTTONS.AI_CHAT)
        .text(BUTTONS.HELP)
        .row()
        .text(BUTTONS.SUPPORT);

    // Admin-only: never show to regular customers
    if (isAdmin) {
        kb.row().text(BUTTONS.STATS);
    }

    return kb.resized();
}

/** Main menu keyboard for a Telegram user (hides admin buttons for non-admins). */
export async function mainMenuKeyboard(db: D1Database, chatId: number) {
    const { TelegramUser } = await import('../db/TelegramUser');
    TelegramUser.use(db);
    const user = await TelegramUser.findBy<{ role?: string }>('chat_id', chatId);
    return helpKeyboard(user?.role === 'admin');
}

export function backKeyboard() {
    return new Keyboard()
        .text(BUTTONS.BACK)
        .resized();
}

export function orderBackKeyboard() {
    return new Keyboard()
        .row()
        .text(BUTTONS.BACK)
        .text(BUTTONS.CANCEL_ORDER)
        .resized();
}

export function paymentMethodKeyboard(methods: { name: string }[]) {
    const kb = new Keyboard();
    for (const m of methods) {
        kb.row().text(m.name);
    }
    kb.row().text(BUTTONS.BACK).text(BUTTONS.CANCEL_PAYMENT).resized();
    return kb;
}

export function paymentAmountKeyboard() {
    return new Keyboard()
        .text(BUTTONS.BACK)
        .text(BUTTONS.CANCEL_PAYMENT)
        .resized();
}

export function paymentReceiptKeyboard() {
    return new Keyboard()
        .text(BUTTONS.CANCEL_PAYMENT)
        .resized();
}

export function cryptoNetworkKeyboard(networks: { id: string; label: string }[]) {
    const kb = new Keyboard();
    for (const n of networks) {
        kb.row().text(n.label);
    }
    kb.row().text(BUTTONS.BACK).text(BUTTONS.CANCEL_PAYMENT).resized();
    return kb;
}

export function cryptoWaitingKeyboard() {
    return new Keyboard()
        .text(BUTTONS.CHECK_CRYPTO_STATUS)
        .row()
        .text(BUTTONS.CANCEL_PAYMENT)
        .resized();
}

export function categoryKeyboard(categories: { name: string }[], page: number = 0) {
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = categories.slice(start, end);
    const totalPages = Math.ceil(categories.length / ITEMS_PER_PAGE);

    const kb = new Keyboard();
    for (const cat of pageItems) {
        kb.row().text(cat.name);
    }

    const navRow: string[] = [];
    if (page > 0) navRow.push('◀️ قبلی');
    if (page < totalPages - 1) navRow.push('بعدی ▶️');

    if (navRow.length > 0) {
        kb.row();
        for (const btn of navRow) {
            kb.text(btn);
        }
    }

    kb.row().text(BUTTONS.CANCEL_ORDER).resized();
    return kb;
}

export function serviceKeyboard(services: { id?: number; name: string }[], page: number = 0) {
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = services.slice(start, end);
    const totalPages = Math.ceil(services.length / ITEMS_PER_PAGE);

    const kb = new Keyboard();
    for (const svc of pageItems) {
        // Only add service if it has a valid ID
        if (svc.id) {
            kb.row().text(`${svc.id}|${svc.name}`);
        }
    }

    const navRow: string[] = [];
    if (page > 0) navRow.push('◀️ قبلی');
    if (page < totalPages - 1) navRow.push('بعدی ▶️');

    if (navRow.length > 0) {
        kb.row();
        for (const btn of navRow) {
            kb.text(btn);
        }
    }

    kb.row().text(BUTTONS.BACK).text(BUTTONS.CANCEL_ORDER).resized();
    return kb;
}

export function orderListKeyboard(
    pageOrders: { id: number; service_name?: string; status: string; created_at: string }[],
    page: number = 0,
    totalCount?: number
) {
    const total = totalCount ?? pageOrders.length;
    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

    const kb = new Keyboard();
    for (const order of pageOrders) {
        // Telegram reply buttons max 64 chars — keep "#id" visible
        const emoji = getStatusEmoji(order.status);
        const prefix = `${emoji} #${order.id} - `;
        const maxNameLen = Math.max(1, 64 - prefix.length);
        let name = order.service_name || 'سرویس';
        if (name.length > maxNameLen) {
            name = `${name.slice(0, Math.max(1, maxNameLen - 1))}…`;
        }
        kb.row().text(`${prefix}${name}`);
    }

    const navRow: string[] = [];
    if (page > 0) navRow.push('◀️ قبلی');
    if (page < totalPages - 1) navRow.push('بعدی ▶️');

    if (navRow.length > 0) {
        kb.row();
        for (const btn of navRow) {
            kb.text(btn);
        }
    }

    kb.row().text(BUTTONS.BACK).resized();
    return kb;
}

function getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
        'Pending': '⏳',
        'In progress': '🔄',
        'Completed': '✅',
        'Partial': '⚠️',
        'Processing': '⚙️',
        'Canceled': '❌',
    };
    return emojis[status] || '📋';
}

export function orderDetailKeyboard() {
    return new Keyboard()
        .text(BUTTONS.BACK_TO_ORDERS)
        .row()
        .text(BUTTONS.BACK)
        .resized();
}

/** Inline actions under order detail. */
export function orderDetailInlineKeyboard(orderId: number) {
    return new InlineKeyboard()
        .text(BUTTONS.REPEAT_ORDER, `repeat_order:${orderId}`)
        .row()
        .text(BUTTONS.BACK_TO_ORDERS, 'my_orders_back');
}
