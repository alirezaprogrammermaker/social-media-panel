import { Order } from '../db/Order';
import type { OrderStatus } from '../db/Order';
import { ApiProvider } from '../db/ApiProvider';
import { TelegramUser } from '../db/TelegramUser';
import { Service } from '../db/Service';
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
}

export async function checkOrderStatuses(db: D1Database): Promise<CheckResult> {
    Order.use(db);
    ApiProvider.use(db);
    Service.use(db);
    TelegramUser.use(db);

    const errors: string[] = [];
    let checked = 0;
    let updated = 0;
    let refunded = 0;

    const pendingOrders = await Order.findPendingApiOrders();

    if (pendingOrders.length === 0) {
        return { checked: 0, updated: 0, refunded: 0, errors: [] };
    }

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

        const orderIds = orders.map((o) => o.order.api_provider_order_id!);

        try {
            const statuses = await api.getMultiOrderStatus(orderIds);

            for (const { order } of orders) {
                const providerOrderId = order.api_provider_order_id!;
                const statusData = statuses[providerOrderId];

                if (!statusData || (statusData as any).error) {
                    errors.push(`Order ${order.id}: ${(statusData as any)?.error || 'No status data'}`);
                    continue;
                }

                checked++;
                const newStatus = SmmApiProvider.mapApiStatus(statusData.status);

                if (newStatus !== order.status) {
                    await Order.updateStatus(order.id!, newStatus, {
                        charge: statusData.charge,
                        start_count: statusData.start_count,
                        remains: statusData.remains,
                        currency: statusData.currency,
                    });
                    updated++;

                    // Handle refund for canceled or partial orders
                    if (newStatus === 'Canceled' || newStatus === 'Partial') {
                        const refundAmount = await calculateRefund(db, order, newStatus, statusData);
                        if (refundAmount > 0) {
                            await TelegramUser.addBalance(order.user_chat_id, refundAmount);
                            refunded++;
                            await sendRefundNotification(db, order, newStatus, refundAmount);
                        }
                    }
                }
            }
        } catch (error: any) {
            errors.push(`Provider ${providerId}: ${error.message}`);
        }
    }

    return { checked, updated, refunded, errors };
}

async function calculateRefund(
    db: D1Database,
    order: any,
    status: OrderStatus,
    statusData: SmmOrderStatus
): Promise<number> {
    Service.use(db);
    const service = await Service.find<{ id: number; rate: string; type: string }>(
        String(order.service_id)
    );

    if (!service || !order.quantity) {
        return 0;
    }

    const rate = parseFloat(service.rate || '0');
    const quantity = order.quantity;

    if (status === 'Canceled') {
        // Full refund for canceled orders
        return Math.ceil((quantity * rate) / 1000);
    }

    if (status === 'Partial') {
        // Partial refund based on remains
        const remains = parseInt(statusData.remains || '0', 10);
        if (remains > 0) {
            return Math.ceil((remains * rate) / 1000);
        }
    }

    return 0;
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
