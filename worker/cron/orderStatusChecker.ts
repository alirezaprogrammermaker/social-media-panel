import { Order } from '../db/Order';
import type { OrderStatus } from '../db/Order';
import { ApiProvider } from '../db/ApiProvider';
import { TelegramUser } from '../db/TelegramUser';
import { Setting } from '../db/Setting';
import { SmmApiProvider } from '../api/SmmApiProvider';
import type { SmmOrderStatus } from '../api/SmmApiProvider';
import { Api } from 'grammy';
import { nowTehran } from '../utils/date';

interface CheckResult {
    checked: number;
    updated: number;
    refunded: number;
    errors: string[];
    batchSize: number;
    cursorBefore: number;
    cursorAfter: number;
}

export interface CheckOrderStatusesOptions {
    /** Max open orders to fetch this run (capped at 500). */
    limit?: number;
    /** Persist keyset cursor so subsequent runs continue fairly. Default true. */
    advanceCursor?: boolean;
}

const TERMINAL_REFUND_STATUSES: OrderStatus[] = ['Canceled', 'Partial'];
const CURSOR_SETTING_KEY = 'order_status_check_cursor';
const DEFAULT_CRON_LIMIT = 200;
const BATCH_WRITE_CHUNK = 40;

export async function checkOrderStatuses(
    db: D1Database,
    options: CheckOrderStatusesOptions = {}
): Promise<CheckResult> {
    Order.use(db);
    ApiProvider.use(db);
    TelegramUser.use(db);
    Setting.use(db);

    const limit = Math.min(Math.max(1, options.limit ?? DEFAULT_CRON_LIMIT), 500);
    const advanceCursor = options.advanceCursor !== false;

    const errors: string[] = [];
    let checked = 0;
    let updated = 0;
    let refunded = 0;

    // Recover orders charged locally but never submitted (legacy silent provider failures)
    const orphaned = await Order.raw<any>(
        `SELECT * FROM orders
         WHERE status IN ('Pending', 'Processing')
           AND api_provider_id IS NOT NULL
           AND api_provider_order_id IS NULL
           AND CAST(charge AS REAL) > 0
         LIMIT 50`
    );
    for (const order of orphaned) {
        try {
            const amount = await applyOrderRefund(db, order, 'Canceled');
            if (amount > 0) {
                refunded++;
                updated++;
            } else {
                await Order.updateStatus(order.id!, 'Canceled', {
                    error_message: order.error_message || 'provider_submit_missing',
                });
                updated++;
            }
        } catch (error: any) {
            errors.push(`Orphan order ${order.id}: ${error.message}`);
        }
    }

    const cursorRaw = await Setting.get(CURSOR_SETTING_KEY);
    const cursorBefore = Math.max(0, parseInt(cursorRaw || '0', 10) || 0);
    const pendingOrders = await Order.findPendingApiOrders(limit, cursorBefore);

    let cursorAfter = cursorBefore;
    if (pendingOrders.length === 0) {
        if (advanceCursor && cursorBefore > 0) {
            await Setting.set(CURSOR_SETTING_KEY, '0');
            cursorAfter = 0;
        }
        return { checked, updated, refunded, errors, batchSize: limit, cursorBefore, cursorAfter };
    }

    const lastId = pendingOrders[pendingOrders.length - 1].id ?? cursorBefore;
    cursorAfter = pendingOrders.length < limit ? 0 : lastId;

    const ordersByProvider = new Map<number, { order: any; apiUrl: string; apiKey: string }[]>();

    for (const order of pendingOrders) {
        if (!order.api_provider_id || !order.api_provider_order_id) continue;

        const key = order.api_provider_id;
        if (!ordersByProvider.has(key)) {
            ordersByProvider.set(key, []);
        }
        ordersByProvider.get(key)!.push({
            order,
            apiUrl: order.provider_api_url!,
            apiKey: order.provider_api_key!,
        });
    }

    for (const [providerId, orders] of ordersByProvider) {
        const { apiUrl, apiKey } = orders[0];
        const api = new SmmApiProvider({ apiUrl, apiKey });

        // Chunk to avoid provider multi-status limits
        const chunks: typeof orders[] = [];
        for (let i = 0; i < orders.length; i += 100) {
            chunks.push(orders.slice(i, i + 100));
        }

        for (const chunk of chunks) {
            const orderIds = chunk.map((o) => o.order.api_provider_order_id!);

            try {
                const statuses = await api.getMultiOrderStatus(orderIds);
                const simpleUpdates: D1PreparedStatement[] = [];

                for (const { order } of chunk) {
                    const providerOrderId = order.api_provider_order_id!;
                    const statusData =
                        statuses[String(providerOrderId)] ??
                        statuses[providerOrderId as unknown as string];

                    if (!statusData || (statusData as any).error) {
                        errors.push(`Order ${order.id}: ${(statusData as any)?.error || 'No status data'}`);
                        continue;
                    }

                    checked++;
                    const newStatus = SmmApiProvider.mapApiStatus(statusData.status);

                    if (newStatus === order.status) {
                        continue;
                    }

                    const needsRefund = TERMINAL_REFUND_STATUSES.includes(newStatus)
                        && !TERMINAL_REFUND_STATUSES.includes(order.status as OrderStatus)
                        && !isRefundMarked(order.error_message);

                    if (needsRefund) {
                        const refundAmount = await applyOrderRefund(db, order, newStatus, statusData);
                        if (refundAmount > 0) {
                            updated++;
                            refunded++;
                        } else {
                            simpleUpdates.push(
                                Order.prepareStatusUpdate(order.id!, newStatus, {
                                    start_count: statusData.start_count,
                                    remains: statusData.remains,
                                    currency: order.currency || 'toman',
                                })
                            );
                            updated++;
                        }
                    } else {
                        simpleUpdates.push(
                            Order.prepareStatusUpdate(order.id!, newStatus, {
                                start_count: statusData.start_count,
                                remains: statusData.remains,
                                currency: order.currency || 'toman',
                            })
                        );
                        updated++;
                    }
                }

                for (let i = 0; i < simpleUpdates.length; i += BATCH_WRITE_CHUNK) {
                    await db.batch(simpleUpdates.slice(i, i + BATCH_WRITE_CHUNK));
                }
            } catch (error: any) {
                errors.push(`Provider ${providerId}: ${error.message}`);
            }
        }
    }

    // Advance keyset only after this page was attempted (fair rotation across backlog)
    if (advanceCursor) {
        await Setting.set(CURSOR_SETTING_KEY, String(cursorAfter));
    }

    return { checked, updated, refunded, errors, batchSize: limit, cursorBefore, cursorAfter };
}

function isRefundMarked(errorMessage?: string | null): boolean {
    return typeof errorMessage === 'string' && /^refunded:\d+/.test(errorMessage);
}

function calculateRefund(
    order: any,
    status: OrderStatus,
    statusData?: SmmOrderStatus
): number {
    const originalCharge = parseFloat(order.charge || '0');
    if (!Number.isFinite(originalCharge) || originalCharge <= 0) {
        return 0;
    }

    if (status === 'Canceled') {
        return Math.ceil(originalCharge);
    }

    if (status === 'Partial') {
        const remains = parseInt(statusData?.remains || order.remains || '0', 10);
        const quantity = parseInt(String(order.quantity || '0'), 10);
        if (remains > 0 && quantity > 0) {
            return Math.ceil((originalCharge * remains) / quantity);
        }
    }

    return 0;
}

/** Refund customer balance when an order becomes Canceled/Partial (idempotent via error_message mark). */
export async function applyOrderRefund(
    db: D1Database,
    order: any,
    newStatus: OrderStatus,
    statusData?: SmmOrderStatus
): Promise<number> {
    Order.use(db);
    TelegramUser.use(db);

    if (
        !TERMINAL_REFUND_STATUSES.includes(newStatus) ||
        TERMINAL_REFUND_STATUSES.includes(order.status as OrderStatus) ||
        isRefundMarked(order.error_message)
    ) {
        return 0;
    }

    const refundAmount = calculateRefund(order, newStatus, statusData);
    if (refundAmount <= 0) return 0;

    // Unique mark so a concurrent retry cannot credit against another txn's refund flag
    const refundMark = `refunded:${refundAmount}:${crypto.randomUUID()}`;
    const now = nowTehran();

    const batchResult = await db.batch([
        db.prepare(
            `UPDATE orders
             SET status = ?,
                 start_count = COALESCE(?, start_count),
                 remains = COALESCE(?, remains),
                 error_message = ?,
                 updated_at = ?
             WHERE id = ?
               AND status NOT IN ('Canceled', 'Partial')
               AND (error_message IS NULL OR error_message NOT LIKE 'refunded:%')`
        ).bind(
            newStatus,
            statusData?.start_count ?? null,
            statusData?.remains ?? null,
            refundMark,
            now,
            order.id!
        ),
        db.prepare(
            `UPDATE telegram_users SET balance = balance + ?, updated_at = ?
             WHERE chat_id = ?
               AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND error_message = ?)`
        ).bind(refundAmount, now, order.user_chat_id, order.id!, refundMark),
    ]);

    if ((batchResult[0]?.meta?.changes ?? 0) < 1) {
        return 0;
    }

    await sendRefundNotification(db, order, newStatus, refundAmount);
    return refundAmount;
}

async function sendRefundNotification(
    db: D1Database,
    order: any,
    status: OrderStatus,
    refundAmount: number
): Promise<void> {
    try {
        Setting.use(db);
        const token = await Setting.get('telegram_token');
        if (!token) return;

        const api = new Api(token);

        let message = '';
        if (status === 'Canceled') {
            message = `❌ سفارش شما (#${order.id}) لغو شد.\n\n💰 موجودی شما به مبلغ ${refundAmount.toLocaleString()} تومان برگردانده شد.`;
        } else if (status === 'Partial') {
            message = `⚠️ سفارش شما (#${order.id}) به صورت جزئی انجام شد.\n\n💰 موجودی شما به مبلغ ${refundAmount.toLocaleString()} تومان برگردانده شد.`;
        }

        if (message) {
            await api.sendMessage(order.user_chat_id, message);
        }
    } catch (error: any) {
        console.error('Failed to send refund notification:', error.message);
    }
}
