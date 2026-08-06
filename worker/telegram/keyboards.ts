import { Keyboard } from 'grammy';
import { BUTTONS } from './constants';

export const ITEMS_PER_PAGE = 8;

export function helpKeyboard() {
    return new Keyboard()
        .text(BUTTONS.NEW_ORDER)
        .text(BUTTONS.MY_ORDERS)
        .row()
        .text(BUTTONS.ADD_BALANCE)
        .text(BUTTONS.PROFILE)
        .row()
        .text(BUTTONS.AI_CHAT)
        .text(BUTTONS.HELP)
        .row()
        .text(BUTTONS.STATS)
        .text(BUTTONS.SUPPORT)
        .resized()
        .persistent();
}

export function backKeyboard() {
    return new Keyboard()
        .text(BUTTONS.BACK)
        .resized()
        .persistent();
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

export function orderListKeyboard(orders: { id: number; service_name?: string; status: string; created_at: string }[], page: number = 0) {
    const start = page * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = orders.slice(start, end);
    const totalPages = Math.ceil(orders.length / ITEMS_PER_PAGE);

    const kb = new Keyboard();
    for (const order of pageItems) {
        const statusEmoji = getStatusEmoji(order.status);
        kb.row().text(`${statusEmoji} #${order.id} - ${order.service_name || 'سرویس'}`);
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
