import { Hono } from 'hono';
import { ApiProvider } from '../db/ApiProvider';
import { Category } from '../db/Category';
import { Service } from '../db/Service';
import { Order } from '../db/Order';
import { SmmApiProvider } from '../api/SmmApiProvider';
import { applyOrderRefund, checkOrderStatuses } from '../cron/orderStatusChecker';
import { manualSyncServicesFromProviders, syncProviderBalance } from '../cron/serviceChecker';
import { requireAuth, requireAdmin } from '../middleware';
import { TelegramUser } from '../db/TelegramUser';
import { nowTehran } from '../utils/date';
import { calculateCustomerCharge } from '../utils/pricing';
import type { Bindings, Variables } from '../types';

const smm = new Hono<{ Bindings: Bindings; Variables: Variables }>();

smm.use('*', requireAuth);
smm.use('*', requireAdmin);

// --- API Providers ---

smm.get('/api-providers', async (c) => {
    ApiProvider.use(c.env.DB);
    const providers = await ApiProvider.all();
    return c.json(providers);
});

smm.post('/api-providers', async (c) => {
    try {
        const { name, api_url, api_key } = await c.req.json<{ name: string; api_url: string; api_key: string }>();

        if (!name || !api_url || !api_key) {
            return c.json({ error: 'نام، آدرس API و کلید API الزامی است' }, 400);
        }

        ApiProvider.use(c.env.DB);

        const api = new SmmApiProvider({ apiUrl: api_url, apiKey: api_key });
        const balance = await api.getBalance();

        const provider = await ApiProvider.create({
            name,
            api_url,
            api_key,
            balance: balance.balance,
            currency: balance.currency,
            is_active: 1,
        });

        return c.json({ ok: true, provider });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد ارائه‌دهنده' }, 500);
    }
});

smm.put('/api-providers/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { name, api_url, api_key } = await c.req.json<{ name?: string; api_url?: string; api_key?: string }>();

        ApiProvider.use(c.env.DB);
        const existing = await ApiProvider.find(String(id));
        if (!existing) return c.json({ error: 'ارائه‌دهنده یافت نشد' }, 404);

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (api_url !== undefined) updates.api_url = api_url;
        if (api_key !== undefined) updates.api_key = api_key;

        if (Object.keys(updates).length > 0) {
            await ApiProvider.update(String(id), updates);
        }
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

smm.put('/api-providers/:id/toggle', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { is_active } = await c.req.json<{ is_active: boolean }>();

        ApiProvider.use(c.env.DB);
        await ApiProvider.toggleActive(id, is_active);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

smm.delete('/api-providers/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        ApiProvider.use(c.env.DB);
        Service.use(c.env.DB);

        await Service.unlinkByProviderId(id);
        await ApiProvider.delete(String(id));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

smm.post('/api-providers/:id/sync', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        ApiProvider.use(c.env.DB);
        const existing = await ApiProvider.find(String(id));
        if (!existing) return c.json({ error: 'ارائه‌دهنده یافت نشد' }, 404);

        const api = new SmmApiProvider({
            apiUrl: (existing as any).api_url,
            apiKey: (existing as any).api_key,
        });

        const balance = await api.getBalance();
        await ApiProvider.updateBalance(id, balance.balance, balance.currency);

        return c.json({ ok: true, balance });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در همگام‌سازی' }, 500);
    }
});

smm.post('/api-providers/sync-all', async (c) => {
    try {
        const results = await syncProviderBalance(c.env.DB);
        return c.json({ ok: true, results });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در همگام‌سازی' }, 500);
    }
});

// --- Categories ---

smm.get('/categories', async (c) => {
    Category.use(c.env.DB);
    const categories = await Category.all();
    return c.json(categories);
});

smm.post('/categories', async (c) => {
    try {
        const { name, sort_order } = await c.req.json<{ name: string; sort_order?: number }>();

        if (!name) {
            return c.json({ error: 'نام دسته‌بندی الزامی است' }, 400);
        }

        Category.use(c.env.DB);
        const category = await Category.create({
            name,
            sort_order: sort_order ?? 0,
            is_active: 1,
        });
        return c.json({ ok: true, category });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد دسته‌بندی' }, 500);
    }
});

smm.put('/categories/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { name, sort_order } = await c.req.json<{ name?: string; sort_order?: number }>();

        Category.use(c.env.DB);
        const existing = await Category.find(String(id));
        if (!existing) return c.json({ error: 'دسته‌بندی یافت نشد' }, 404);

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        if (Object.keys(updates).length > 0) {
            await Category.update(String(id), updates);
        }
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

smm.put('/categories/:id/toggle', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { is_active } = await c.req.json<{ is_active: boolean }>();

        Category.use(c.env.DB);
        await Category.toggleActive(id, is_active);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

smm.delete('/categories/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        Category.use(c.env.DB);
        Service.use(c.env.DB);

        const defaultCategoryId = await Category.ensureDefaultCategory();
        await Service.moveToCategory(id, defaultCategoryId);
        await Category.delete(String(id));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

// --- Services ---

smm.get('/services', async (c) => {
    Service.use(c.env.DB);
    const services = await Service.getServicesWithCategory();
    return c.json(services);
});

smm.post('/services', async (c) => {
    try {
        const {
            name, category_id, type, rate, min, max, description,
            api_provider_id, api_provider_service_id, api_provider_service_price,
        } = await c.req.json<{
            name: string;
            category_id: number;
            type?: string;
            rate?: string;
            min?: string;
            max?: string;
            description?: string;
            api_provider_id?: number | null;
            api_provider_service_id?: number | string | null;
            api_provider_service_price?: string | null;
        }>();

        if (!name || !category_id) {
            return c.json({ error: 'نام و دسته‌بندی الزامی است' }, 400);
        }

        const providerServiceId = api_provider_service_id != null && api_provider_service_id !== ''
            ? Number(api_provider_service_id)
            : null;

        Service.use(c.env.DB);
        const service = await Service.create({
            name,
            description: description ?? '',
            category_id: Number(category_id),
            type: type || 'Default',
            rate: rate != null && rate !== '' ? String(rate) : '0',
            min: min != null && min !== '' ? String(min) : '1',
            max: max != null && max !== '' ? String(max) : '1000',
            api_provider_id: api_provider_id != null ? Number(api_provider_id) : null,
            api_provider_service_id: providerServiceId != null && !Number.isNaN(providerServiceId) ? providerServiceId : null,
            api_provider_service_price: api_provider_service_price != null && api_provider_service_price !== ''
                ? String(api_provider_service_price)
                : null,
            is_active: 1,
        });
        return c.json({ ok: true, service });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد سرویس' }, 500);
    }
});

smm.put('/services/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { name, category_id, type, rate, min, max, description, is_active, api_provider_id, api_provider_service_id, api_provider_service_price } = await c.req.json<{
            name?: string;
            category_id?: number;
            type?: string;
            rate?: string;
            min?: string;
            max?: string;
            description?: string;
            is_active?: number;
            api_provider_id?: number | null;
            api_provider_service_id?: number | string | null;
            api_provider_service_price?: string | null;
        }>();

        Service.use(c.env.DB);
        const existing = await Service.find(String(id));
        if (!existing) return c.json({ error: 'سرویس یافت نشد' }, 404);

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (category_id !== undefined) updates.category_id = category_id;
        if (type !== undefined) updates.type = type;
        if (rate !== undefined) updates.rate = rate;
        if (min !== undefined) updates.min = min;
        if (max !== undefined) updates.max = max;
        if (description !== undefined) updates.description = description;
        if (is_active !== undefined) updates.is_active = is_active;
        if (api_provider_id !== undefined) updates.api_provider_id = api_provider_id;
        if (api_provider_service_id !== undefined) {
            updates.api_provider_service_id = api_provider_service_id != null && api_provider_service_id !== ''
                ? Number(api_provider_service_id)
                : null;
        }
        if (api_provider_service_price !== undefined) updates.api_provider_service_price = api_provider_service_price;

        if (Object.keys(updates).length > 0) {
            await Service.update(String(id), updates);
        }
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

smm.put('/services/:id/toggle', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { is_active } = await c.req.json<{ is_active: boolean }>();

        Service.use(c.env.DB);
        await Service.toggleActive(id, is_active);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

smm.delete('/services/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        Service.use(c.env.DB);
        await Service.deleteById(id);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

smm.post('/services/sync', async (c) => {
    try {
        const results = await manualSyncServicesFromProviders(c.env.DB);
        return c.json({ ok: true, results });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در همگام‌سازی سرویس‌ها' }, 500);
    }
});

smm.post('/services/add-from-api', async (c) => {
    try {
        const { api_provider_id, service_id } = await c.req.json<{ api_provider_id: number; service_id: number }>();

        if (!api_provider_id || !service_id) {
            return c.json({ error: 'ارائه‌دهنده و شناسه سرویس الزامی است' }, 400);
        }

        ApiProvider.use(c.env.DB);
        const provider = await ApiProvider.find(String(api_provider_id)) as any;
        if (!provider) {
            return c.json({ error: 'ارائه‌دهنده یافت نشد' }, 404);
        }

        const api = new SmmApiProvider({
            apiUrl: provider.api_url,
            apiKey: provider.api_key,
        });

        const remoteServices = await api.getServices();
        const remoteService = remoteServices.find((s) => s.service === service_id);

        if (!remoteService) {
            return c.json({ error: 'سرویس در ارائه‌دهنده یافت نشد' }, 404);
        }

        // Return service data for form pre-fill (don't create yet)
        return c.json({
            ok: true,
            service: {
                name: remoteService.name,
                type: remoteService.type,
                rate: remoteService.rate,
                min: remoteService.min,
                max: remoteService.max,
                api_provider_id: api_provider_id,
                api_provider_service_id: service_id,
                api_provider_service_price: remoteService.rate,
                category_name: remoteService.category,
            },
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت اطلاعات سرویس' }, 500);
    }
});

// --- Orders ---

smm.get('/orders', async (c) => {
    Order.use(c.env.DB);
    const status = c.req.query('status');
    const orders = status
        ? await Order.findByStatus(status as any)
        : await Order.getOrdersWithDetails();
    return c.json(orders);
});

smm.get('/orders/stats', async (c) => {
    Order.use(c.env.DB);
    const stats = await Order.getOrderStats();
    return c.json(stats);
});

smm.get('/orders/stats/daily', async (c) => {
    const days = Math.min(Number(c.req.query('days')) || 7, 365);
    Order.use(c.env.DB);
    const daily = await Order.getDailyStats(days);
    return c.json(daily);
});

smm.get('/orders/stats/revenue', async (c) => {
    Order.use(c.env.DB);
    const revenue = await Order.getRevenueStats();
    return c.json(revenue);
});

smm.get('/services/stats', async (c) => {
    Service.use(c.env.DB);
    const stats = await Service.getStats();
    return c.json(stats);
});

smm.get('/categories/stats', async (c) => {
    Category.use(c.env.DB);
    const stats = await Category.getBasicStats();
    return c.json(stats);
});

smm.get('/api-providers/stats', async (c) => {
    ApiProvider.use(c.env.DB);
    const stats = await ApiProvider.getStats();
    return c.json(stats);
});

smm.post('/orders', async (c) => {
    try {
        const { user_chat_id, service_id, link, quantity } = await c.req.json<{
            user_chat_id: number;
            service_id: number;
            link: string;
            quantity?: number;
        }>();

        if (!user_chat_id || !service_id || !link) {
            return c.json({ error: 'کاربر، سرویس و لینک الزامی است' }, 400);
        }

        Service.use(c.env.DB);
        const service = await Service.find(String(service_id)) as any;
        if (!service) return c.json({ error: 'سرویس یافت نشد' }, 404);

        const isPackage = (service.type || 'Default') === 'Package';
        if (!isPackage && (!quantity || quantity <= 0)) {
            return c.json({ error: 'تعداد برای این سرویس الزامی است' }, 400);
        }

        const quantityValue = isPackage ? 1 : Number(quantity);
        const charge = calculateCustomerCharge(service.rate, quantityValue, service.type);

        TelegramUser.use(c.env.DB);
        const user = await TelegramUser.findBy<{ chat_id: number; balance: number }>('chat_id', user_chat_id);
        if (!user) {
            return c.json({ error: 'کاربر تلگرام یافت نشد' }, 404);
        }
        if (charge > 0 && (user.balance || 0) < charge) {
            return c.json({ error: 'موجودی کاربر کافی نیست' }, 400);
        }

        let apiOrderId: number | null = null;
        let apiProviderId: number | null = null;

        if (service.api_provider_id && service.api_provider_service_id) {
            ApiProvider.use(c.env.DB);
            const provider = await ApiProvider.findActiveById(service.api_provider_id);
            if (!provider) {
                return c.json({ error: 'ارائه‌دهنده غیرفعال یا یافت نشد' }, 400);
            }

            const api = new SmmApiProvider({
                apiUrl: provider.api_url,
                apiKey: provider.api_key,
            });

            const orderData: {
                service: number;
                link: string;
                quantity?: number;
            } = {
                service: service.api_provider_service_id,
                link,
            };
            if (!isPackage && quantity) {
                orderData.quantity = quantity;
            }

            const result = await api.addOrder(orderData);

            if (result.order) {
                apiOrderId = Number(result.order);
                apiProviderId = provider.id ?? null;
            } else {
                return c.json({ error: `خطا از ارائه‌دهنده: ${result.error || 'پاسخ نامعتبر'}` }, 400);
            }
        }

        Order.use(c.env.DB);
        const createdAt = nowTehran();

        try {
            if (charge > 0) {
                const batchResult = await c.env.DB.batch([
                    c.env.DB.prepare(
                        `INSERT INTO orders (user_chat_id, service_id, link, quantity, status, api_provider_id, api_provider_order_id, charge, currency, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                    ).bind(
                        user_chat_id,
                        service_id,
                        link,
                        quantityValue,
                        'Pending',
                        apiProviderId,
                        apiOrderId,
                        String(charge),
                        'toman',
                        createdAt,
                        createdAt
                    ),
                    c.env.DB.prepare(
                        'UPDATE telegram_users SET balance = balance - ?, updated_at = ? WHERE chat_id = ? AND balance >= ?'
                    ).bind(charge, createdAt, user_chat_id, charge),
                ]);

                if ((batchResult[1]?.meta?.changes ?? 0) < 1) {
                    await c.env.DB.prepare(
                        `DELETE FROM orders WHERE user_chat_id = ? AND api_provider_order_id IS ? AND created_at = ?`
                    ).bind(user_chat_id, apiOrderId, createdAt).run();

                    if (apiProviderId && apiOrderId) {
                        try {
                            const provider = await ApiProvider.findActiveById(apiProviderId);
                            if (provider) {
                                const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
                                await api.cancel([apiOrderId]);
                            }
                        } catch (cancelError: any) {
                            console.error('Failed to cancel provider order after balance race:', cancelError);
                        }
                    }
                    return c.json({ error: 'موجودی کاربر کافی نیست' }, 400);
                }
            } else {
                await Order.create({
                    user_chat_id,
                    service_id,
                    link,
                    quantity: quantityValue,
                    status: 'Pending',
                    api_provider_id: apiProviderId,
                    api_provider_order_id: apiOrderId,
                    charge: String(charge),
                    currency: 'toman',
                    created_at: createdAt,
                    updated_at: createdAt,
                });
            }
        } catch (dbError: any) {
            if (apiProviderId && apiOrderId) {
                try {
                    ApiProvider.use(c.env.DB);
                    const provider = await ApiProvider.findActiveById(apiProviderId);
                    if (provider) {
                        const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
                        await api.cancel([apiOrderId]);
                    }
                } catch (cancelError: any) {
                    console.error('Failed to cancel provider order after DB failure:', cancelError);
                }
            }
            throw dbError;
        }

        const order = await Order.rawFirst(
            'SELECT * FROM orders WHERE user_chat_id = ? ORDER BY id DESC LIMIT 1',
            user_chat_id
        );

        return c.json({ ok: true, order });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد سفارش' }, 500);
    }
});

smm.put('/orders/:id/status', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { status } = await c.req.json<{ status: string }>();

        const validStatuses = ['Pending', 'In progress', 'Completed', 'Partial', 'Processing', 'Canceled'];
        if (!validStatuses.includes(status)) {
            return c.json({ error: 'وضعیت نامعتبر است' }, 400);
        }

        Order.use(c.env.DB);
        const order = await Order.find(String(id)) as any;
        if (!order) return c.json({ error: 'سفارش یافت نشد' }, 404);

        if (status === 'Canceled' || status === 'Partial') {
            const refunded = await applyOrderRefund(c.env.DB, order, status as any);
            if (refunded > 0) {
                return c.json({ ok: true, refunded });
            }
        }

        await Order.updateStatus(id, status as any);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی وضعیت' }, 500);
    }
});

smm.put('/orders/:id/cancel', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        Order.use(c.env.DB);
        const order = await Order.find(String(id)) as any;
        if (!order) return c.json({ error: 'سفارش یافت نشد' }, 404);

        if (order.status === 'Canceled') {
            return c.json({ ok: true, already: true });
        }

        if (order.api_provider_id && order.api_provider_order_id) {
            ApiProvider.use(c.env.DB);
            const provider = await ApiProvider.find(String(order.api_provider_id)) as any;
            if (provider) {
                const api = new SmmApiProvider({
                    apiUrl: provider.api_url,
                    apiKey: provider.api_key,
                });
                try {
                    await api.cancel([order.api_provider_order_id]);
                } catch (cancelError: any) {
                    console.error('Provider cancel failed:', cancelError?.message);
                }
            }
        }

        const refunded = await applyOrderRefund(c.env.DB, order, 'Canceled');
        if (refunded <= 0) {
            await Order.updateStatus(id, 'Canceled');
        }
        return c.json({ ok: true, refunded });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در لغو سفارش' }, 500);
    }
});

smm.post('/orders/check-status', async (c) => {
    try {
        const result = await checkOrderStatuses(c.env.DB);
        return c.json({ ok: true, ...result });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بررسی وضعیت سفارشات' }, 500);
    }
});

smm.get('/orders/user/:chatId', async (c) => {
    try {
        const chatId = Number(c.req.param('chatId'));
        Order.use(c.env.DB);
        const orders = await Order.getUserOrders(chatId);
        return c.json(orders);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت سفارشات' }, 500);
    }
});

export default smm;
