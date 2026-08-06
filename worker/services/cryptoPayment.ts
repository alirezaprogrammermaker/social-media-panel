import { Api } from 'grammy';
import { Payment } from '../db/Payment';
import { Setting } from '../db/Setting';
import {
    getPayment,
    gatewayConfigFromSettings,
    isCryptoGatewayConfigured,
    type GatewayPayment,
    type GatewayWebhookPayload,
} from '../api/CryptoGateway';
import { MESSAGES } from '../telegram/constants';
import type { Bindings } from '../types';

/**
 * Apply a gateway payment snapshot to a local pending crypto payment.
 * Confirmed → credit once; expired/failed → mark terminal; confirming → update fields.
 */
export async function applyGatewayPaymentStatus(
    db: D1Database,
    env: Bindings,
    local: {
        id: number;
        user_chat_id: number;
        amount: number;
        status: string;
        payment_type?: string | null;
    },
    gateway: {
        status: GatewayPayment['status'];
        tx_hash?: string | null;
        confirmations?: number | null;
        crypto_amount?: number | null;
        crypto_amount_formatted?: string | null;
    },
    notifyUser: boolean = true,
): Promise<{ changed: boolean; credited: boolean; terminal: boolean }> {
    Payment.use(db);

    if (local.status !== 'pending' || local.payment_type !== 'crypto') {
        return { changed: false, credited: false, terminal: false };
    }

    if (gateway.status === 'confirmed') {
        const credited = await Payment.confirmCryptoAndCredit(local.id, local.user_chat_id, local.amount, {
            crypto_status: 'confirmed',
            tx_hash: gateway.tx_hash ?? null,
            confirmations: gateway.confirmations ?? null,
            crypto_amount: gateway.crypto_amount ?? null,
            crypto_amount_formatted: gateway.crypto_amount_formatted ?? null,
        });

        if (credited && notifyUser) {
            await notifyTelegramUser(db, local.user_chat_id, MESSAGES.CRYPTO_PAYMENT_CONFIRMED(local.amount));
        }
        return { changed: credited, credited, terminal: credited };
    }

    if (gateway.status === 'expired' || gateway.status === 'failed' || gateway.status === 'refunded') {
        const terminalStatus = gateway.status === 'expired' ? 'expired' : 'failed';
        const updated = await Payment.markCryptoTerminal(local.id, terminalStatus, gateway.status);
        if (updated && notifyUser) {
            const msg =
                gateway.status === 'expired'
                    ? MESSAGES.CRYPTO_PAYMENT_EXPIRED
                    : MESSAGES.CRYPTO_PAYMENT_FAILED;
            await notifyTelegramUser(db, local.user_chat_id, msg);
        }
        return { changed: updated, credited: false, terminal: updated };
    }

    // pending / confirming — sync fields only
    await Payment.updateCryptoFields(local.id, {
        crypto_status: gateway.status,
        tx_hash: gateway.tx_hash ?? null,
        confirmations: gateway.confirmations ?? null,
        crypto_amount: gateway.crypto_amount ?? null,
        crypto_amount_formatted: gateway.crypto_amount_formatted ?? null,
    });
    return { changed: true, credited: false, terminal: false };
}

export async function applyWebhookEvent(
    db: D1Database,
    env: Bindings,
    payload: GatewayWebhookPayload,
): Promise<{ ok: boolean; reason?: string }> {
    const gatewayId = payload.payment?.id;
    if (!gatewayId) return { ok: false, reason: 'missing payment id' };

    Payment.use(db);
    const local = await Payment.findByGatewayPaymentId(gatewayId);
    if (!local) return { ok: false, reason: 'payment not found' };

    const gatewayLike: {
        status: GatewayPayment['status'];
        tx_hash?: string | null;
        confirmations?: number | null;
        crypto_amount?: number | null;
        crypto_amount_formatted?: string | null;
    } = {
        status: payload.payment.status || mapEventToStatus(payload.event),
        tx_hash: payload.payment.tx_hash,
        confirmations: payload.payment.confirmations,
        crypto_amount: payload.payment.crypto_amount,
        crypto_amount_formatted: payload.payment.crypto_amount != null
            ? String(payload.payment.crypto_amount)
            : null,
    };

    // payment.created is informational
    if (payload.event === 'payment.created' && gatewayLike.status === 'pending') {
        await Payment.updateCryptoFields(local.id, {
            crypto_status: 'pending',
            tx_hash: gatewayLike.tx_hash,
            confirmations: gatewayLike.confirmations,
        });
        return { ok: true };
    }

    await applyGatewayPaymentStatus(db, env, local, gatewayLike, true);
    return { ok: true };
}

export async function refreshLocalCryptoPayment(
    db: D1Database,
    env: Bindings,
    localPaymentId: number,
    notifyUser: boolean = false,
): Promise<{ ok: boolean; error?: string; payment?: any; result?: { changed: boolean; credited: boolean; terminal: boolean } }> {
    if (!(await isCryptoGatewayConfigured(db, env))) {
        return { ok: false, error: 'کلید API درگاه کریپتو در تنظیمات ذخیره نشده است' };
    }

    Payment.use(db);
    const local = await Payment.find<any>(String(localPaymentId));
    if (!local) return { ok: false, error: 'پرداخت یافت نشد' };
    if (local.payment_type !== 'crypto' || !local.gateway_payment_id) {
        return { ok: false, error: 'این پرداخت کریپتو نیست' };
    }

    try {
        const config = await gatewayConfigFromSettings(db, env);
        const gateway = await getPayment(config, local.gateway_payment_id);
        const result = await applyGatewayPaymentStatus(db, env, local, gateway, notifyUser);
        const updated = await Payment.find(String(localPaymentId));
        return { ok: true, payment: updated, result };
    } catch (e: any) {
        return { ok: false, error: e?.message || 'خطا در دریافت وضعیت از درگاه' };
    }
}

/** Poll pending crypto payments (cron fallback). */
export async function pollPendingCryptoPayments(env: Bindings): Promise<{ checked: number; credited: number; expired: number }> {
    if (!(await isCryptoGatewayConfigured(env.DB, env))) {
        return { checked: 0, credited: 0, expired: 0 };
    }

    Payment.use(env.DB);
    const pending = await Payment.findPendingCrypto(40);
    let credited = 0;
    let expired = 0;

    for (const local of pending) {
        try {
            const result = await refreshLocalCryptoPayment(env.DB, env, local.id, true);
            if (result.result?.credited) credited++;
            if (result.result?.terminal && !result.result.credited) expired++;
        } catch (e: any) {
            console.error(`Crypto poll failed for payment ${local.id}:`, e?.message);
        }
    }

    return { checked: pending.length, credited, expired };
}

function mapEventToStatus(event: string): GatewayPayment['status'] {
    switch (event) {
        case 'payment.confirmed':
            return 'confirmed';
        case 'payment.expired':
            return 'expired';
        case 'payment.failed':
            return 'failed';
        default:
            return 'pending';
    }
}

async function notifyTelegramUser(db: D1Database, chatId: number, text: string): Promise<void> {
    try {
        Setting.use(db);
        const token = await Setting.get('telegram_token');
        if (!token) return;
        const api = new Api(token);
        await api.sendMessage(chatId, text, { parse_mode: 'HTML' });
    } catch {
        // ignore notify failures
    }
}
