import { Hono } from 'hono';
import { Api } from 'grammy';
import { ApiProvider } from '../db/ApiProvider';
import { Category } from '../db/Category';
import type { CategoryData } from '../db/Category';
import { Service } from '../db/Service';
import { Order } from '../db/Order';
import type { OrderStatus } from '../db/Order';
import { Payment } from '../db/Payment';
import { TelegramUser } from '../db/TelegramUser';
import { Setting } from '../db/Setting';
import { SmmApiProvider } from '../api/SmmApiProvider';
import type { SmmService } from '../api/SmmApiProvider';
import { applyOrderRefund, checkOrderStatuses, notifyCustomerOrderStatus } from '../cron/orderStatusChecker';
import { dateRangeSql, dateTehran, normalizeRangeDate } from '../utils/date';
import { parsePagination } from '../utils/pagination';
import { usdToToman } from '../utils/pricing';
import { requireAuth, requireAdmin } from '../middleware';
import type { Bindings, Variables } from '../types';

const agent = new Hono<{ Bindings: Bindings; Variables: Variables }>();

agent.use('*', requireAuth);
agent.use('*', requireAdmin);

interface ProviderRow {
    id: number;
    name: string;
    api_url: string;
    api_key: string;
    balance?: string;
    currency?: string;
    is_active?: number;
}

interface PricingInfo {
    provider_name: string;
    provider_service_id: number;
    provider_rate_usd: string;
    dollar_rate: string | null;
    markup_percent: number;
    sell_rate_toman: number;
}

function parsePositiveInt(value: string | number | null | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/** Any integer — chat ids from Telegram can be negative (groups/channels). */
function parseInteger(value: string | number | null | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isInteger(n) ? n : null;
}

const RANGE_PARAM_HINT = 'from/to باید به فرمت YYYY-MM-DD یا YYYY-MM-DDTHH:MM باشد';

/** Read optional JSON body without failing on empty/invalid JSON. */
async function readJson(c: any): Promise<any> {
    try {
        return (await c.req.json()) ?? {};
    } catch {
        return {};
    }
}

function parseNumber(value: string | number | null | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function maskApiKey(key: string | undefined | null): string | null {
    if (!key) return null;
    return key.length <= 4 ? '****' : `…${key.slice(-4)}`;
}

function mapRemoteService(s: SmmService) {
    return {
        service: s.service,
        name: s.name,
        type: s.type,
        category: s.category,
        rate: s.rate,
        min: s.min,
        max: s.max,
        refill: !!s.refill,
        cancel: !!s.cancel,
    };
}

async function fetchLiveProviderService(provider: ProviderRow, providerServiceId: number): Promise<SmmService | null> {
    const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
    const services = await api.getServices();
    return services.find((s) => s.service === providerServiceId) ?? null;
}

/** Reprice a linked local service from the live provider rate × dollar_rate × markup. Throws on provider/config errors. */
async function repriceFromProvider(db: D1Database, service: any, markupPercent: number): Promise<PricingInfo | null> {
    if (!service.api_provider_id || !service.api_provider_service_id) return null;

    ApiProvider.use(db);
    Setting.use(db);
    const provider = await ApiProvider.find<ProviderRow>(String(service.api_provider_id));
    if (!provider) return null;

    const providerServiceId = Number(service.api_provider_service_id);
    const remote = await fetchLiveProviderService(provider, providerServiceId);
    if (!remote) {
        throw new Error(`سرویس ${providerServiceId} در ارائه‌دهنده «${provider.name}» دیگر موجود نیست`);
    }

    const dollarRate = await Setting.get('dollar_rate');
    const sellRate = usdToToman(remote.rate, dollarRate, markupPercent);
    if (sellRate <= 0) {
        throw new Error('نرخ دلار نامعتبر است؛ ابتدا PUT /api/agent/settings/dollar-rate را اجرا کنید');
    }

    return {
        provider_name: provider.name,
        provider_service_id: providerServiceId,
        provider_rate_usd: remote.rate,
        dollar_rate: dollarRate,
        markup_percent: markupPercent,
        sell_rate_toman: sellRate,
    };
}

// --- Health ---

agent.get('/health', (c) => c.json({ ok: true, ts: new Date().toISOString() }));

// --- Settings ---

const AGENT_SETTING_KEYS = [
    'dollar_rate',
    'registration_disabled',
    'support_message',
    'stats_report_enabled',
    'stats_report_time',
];

agent.get('/settings', async (c) => {
    try {
        Setting.use(c.env.DB);
        const values = await Promise.all(AGENT_SETTING_KEYS.map((k) => Setting.get(k)));
        const settings = Object.fromEntries(AGENT_SETTING_KEYS.map((k, i) => [k, values[i]]));
        return c.json({ ok: true, settings });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت تنظیمات' }, 500);
    }
});

agent.put('/settings/dollar-rate', async (c) => {
    try {
        const body = await c.req.json<{ dollar_rate?: number | string }>();
        const rate = parseNumber(body.dollar_rate);
        if (rate === null || rate <= 0) {
            return c.json({ error: 'dollar_rate باید عددی بزرگ‌تر از صفر باشد' }, 400);
        }
        // Same persistence as the dashboard dollar-rate setter
        Setting.use(c.env.DB);
        await Setting.set('dollar_rate', String(rate));
        return c.json({ ok: true, dollar_rate: String(rate) });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی نرخ دلار' }, 500);
    }
});

// --- Providers ---

agent.get('/providers', async (c) => {
    try {
        ApiProvider.use(c.env.DB);
        const providers = await ApiProvider.all<ProviderRow>();
        return c.json({
            ok: true,
            providers: providers.map((p) => ({
                id: p.id,
                name: p.name,
                balance: p.balance ?? null,
                currency: p.currency ?? null,
                is_active: p.is_active === 1,
                api_key_last4: maskApiKey(p.api_key),
            })),
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت ارائه‌دهندگان' }, 500);
    }
});

agent.get('/provider-services', async (c) => {
    try {
        ApiProvider.use(c.env.DB);
        const providerIdRaw = c.req.query('provider_id');
        const providerNameRaw = c.req.query('provider_name')?.trim();
        const q = c.req.query('q')?.trim().toLowerCase() || null;
        const serviceId = parsePositiveInt(c.req.query('service_id'));
        const limit = Math.min(parsePositiveInt(c.req.query('limit')) ?? 50, 200);

        if (!providerIdRaw && !providerNameRaw) {
            return c.json({ error: 'provider_id یا provider_name الزامی است' }, 400);
        }

        let provider: ProviderRow | null = null;
        if (providerIdRaw) {
            const id = parsePositiveInt(providerIdRaw);
            if (id === null) return c.json({ error: 'provider_id نامعتبر است' }, 400);
            provider = await ApiProvider.find<ProviderRow>(String(id));
        } else if (providerNameRaw) {
            provider = await ApiProvider.rawFirst<ProviderRow>(
                'SELECT * FROM api_providers WHERE LOWER(name) = LOWER(?) LIMIT 1',
                providerNameRaw
            );
        }
        if (!provider) return c.json({ error: 'ارائه‌دهنده یافت نشد' }, 404);

        const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
        const remoteServices = await api.getServices();

        if (serviceId !== null) {
            const one = remoteServices.find((s) => s.service === serviceId);
            if (!one) {
                return c.json({
                    ok: false,
                    error: `سرویس ${serviceId} در ارائه‌دهنده «${provider.name}» یافت نشد`,
                }, 404);
            }
            return c.json({
                ok: true,
                provider: { id: provider.id, name: provider.name },
                count: 1,
                services: [mapRemoteService(one)],
            });
        }

        const filtered = remoteServices.filter((s) =>
            !q || String(s.name || '').toLowerCase().includes(q) || String(s.category || '').toLowerCase().includes(q)
        );
        return c.json({
            ok: true,
            provider: { id: provider.id, name: provider.name },
            total: filtered.length,
            count: Math.min(filtered.length, limit),
            services: filtered.slice(0, limit).map(mapRemoteService),
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت سرویس‌های ارائه‌دهنده' }, 500);
    }
});

// --- Categories ---

agent.get('/categories', async (c) => {
    try {
        Category.use(c.env.DB);
        const categories = await Category.all<CategoryData>();
        return c.json({ ok: true, categories });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت دسته‌بندی‌ها' }, 500);
    }
});

agent.post('/categories', async (c) => {
    try {
        const body = await c.req.json<{ name?: string; is_active?: boolean }>();
        if (!body.name || !body.name.trim()) {
            return c.json({ error: 'نام دسته‌بندی الزامی است' }, 400);
        }
        const name = body.name.trim();

        Category.use(c.env.DB);
        const existing = await Category.rawFirst<CategoryData>(
            'SELECT * FROM categories WHERE name = ? LIMIT 1',
            name
        );
        if (existing) {
            return c.json({ ok: true, created: false, category: existing });
        }

        const category = await Category.create({
            name,
            sort_order: 0,
            is_active: body.is_active === false ? 0 : 1,
        });
        return c.json({ ok: true, created: true, category });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد دسته‌بندی' }, 500);
    }
});

// --- Services (local catalog) ---

agent.get('/services', async (c) => {
    try {
        Service.use(c.env.DB);
        const q = c.req.query('q')?.trim() || null;
        const categoryId = parsePositiveInt(c.req.query('category_id'));
        const providerId = parsePositiveInt(c.req.query('provider_id'));
        const isActiveRaw = c.req.query('is_active');
        const limit = Math.min(parsePositiveInt(c.req.query('limit')) ?? 100, 500);

        const where: string[] = [];
        const params: any[] = [];
        if (q) {
            where.push("(s.name LIKE ? OR IFNULL(s.description, '') LIKE ?)");
            params.push(`%${q}%`, `%${q}%`);
        }
        if (categoryId !== null) {
            where.push('s.category_id = ?');
            params.push(categoryId);
        }
        if (providerId !== null) {
            where.push('s.api_provider_id = ?');
            params.push(providerId);
        }
        if (isActiveRaw === 'true' || isActiveRaw === '1') {
            where.push('s.is_active = 1');
        } else if (isActiveRaw === 'false' || isActiveRaw === '0') {
            where.push('s.is_active = 0');
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const total = (await Service.rawFirst<{ count: number }>(
            `SELECT COUNT(*) as count FROM services s ${whereSql}`,
            ...params
        ))?.count ?? 0;

        const services = await Service.raw(
            `SELECT s.id, s.name, s.category_id, c.name as category_name, s.type, s.rate, s.min, s.max,
                    s.is_active, s.description,
                    s.api_provider_id as provider_id,
                    s.api_provider_service_id as provider_service_id,
                    s.api_provider_service_price as provider_rate_usd
             FROM services s
             LEFT JOIN categories c ON s.category_id = c.id
             ${whereSql}
             ORDER BY c.sort_order, c.name, s.name
             LIMIT ?`,
            ...params,
            limit
        );
        return c.json({ ok: true, total, count: services.length, services });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت سرویس‌ها' }, 500);
    }
});

agent.post('/services', async (c) => {
    try {
        const body = await c.req.json<{
            provider_id?: number | string;
            provider_service_id?: number | string;
            name?: string;
            category_id?: number | string;
            markup_percent?: number | string;
            is_active?: boolean;
            description?: string;
        }>();

        const providerId = parsePositiveInt(body.provider_id);
        const providerServiceId = parsePositiveInt(body.provider_service_id);
        const categoryId = parsePositiveInt(body.category_id);
        const markupPercent = parseNumber(body.markup_percent);
        if (providerId === null) return c.json({ error: 'provider_id نامعتبر است' }, 400);
        if (providerServiceId === null) return c.json({ error: 'provider_service_id نامعتبر است' }, 400);
        if (categoryId === null) return c.json({ error: 'category_id نامعتبر است' }, 400);
        if (markupPercent === null || markupPercent < 0) {
            return c.json({ error: 'markup_percent باید عددی >= 0 باشد' }, 400);
        }

        ApiProvider.use(c.env.DB);
        Category.use(c.env.DB);
        Service.use(c.env.DB);
        Setting.use(c.env.DB);

        const provider = await ApiProvider.find<ProviderRow>(String(providerId));
        if (!provider) return c.json({ error: 'ارائه‌دهنده یافت نشد' }, 404);

        const category = await Category.find<CategoryData>(String(categoryId));
        if (!category) return c.json({ error: 'دسته‌بندی یافت نشد' }, 404);

        const remote = await fetchLiveProviderService(provider, providerServiceId);
        if (!remote) {
            return c.json({
                ok: false,
                error: `سرویس ${providerServiceId} در ارائه‌دهنده «${provider.name}» یافت نشد؛ ابتدا GET /api/agent/provider-services?provider_id=${providerId} را بررسی کنید`,
            }, 404);
        }

        const dollarRate = await Setting.get('dollar_rate');
        const sellRate = usdToToman(remote.rate, dollarRate, markupPercent);
        if (sellRate <= 0) {
            return c.json({ error: 'نرخ دلار نامعتبر است؛ ابتدا PUT /api/agent/settings/dollar-rate را اجرا کنید' }, 400);
        }

        // Same metadata shape as dashboard sync / add-from-api
        const providerMeta = {
            type: remote.type || 'Default',
            min: String(remote.min ?? '1'),
            max: String(remote.max ?? '1000'),
            refill: remote.refill ? 1 : 0,
            cancel: remote.cancel ? 1 : 0,
            api_provider_service_price: remote.rate,
        };

        const pricing: PricingInfo = {
            provider_name: provider.name,
            provider_service_id: providerServiceId,
            provider_rate_usd: remote.rate,
            dollar_rate: dollarRate,
            markup_percent: markupPercent,
            sell_rate_toman: sellRate,
        };

        // Upsert by (provider_id, provider_service_id)
        const existing = await Service.findByApiProviderServiceId(providerId, providerServiceId);
        let service: any;
        let created: boolean;
        if (existing) {
            const updates: Record<string, any> = {
                rate: String(sellRate),
                ...providerMeta,
            };
            if (body.name !== undefined && body.name.trim()) updates.name = body.name.trim();
            if (body.description !== undefined) updates.description = body.description;
            updates.category_id = categoryId;
            if (body.is_active !== undefined) updates.is_active = body.is_active ? 1 : 0;
            await Service.update(String(existing.id), updates);
            service = await Service.find(String(existing.id));
            created = false;
        } else {
            service = await Service.create({
                name: body.name?.trim() || remote.name,
                description: body.description ?? '',
                category_id: categoryId,
                ...providerMeta,
                rate: String(sellRate),
                api_provider_id: providerId,
                api_provider_service_id: providerServiceId,
                is_active: body.is_active === false ? 0 : 1,
            });
            created = true;
        }

        return c.json({ ok: true, created, service, pricing });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد سرویس' }, 500);
    }
});

agent.patch('/services/:id', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه سرویس نامعتبر است' }, 400);

        const body = await c.req.json<{
            name?: string;
            description?: string;
            category_id?: number | string;
            is_active?: boolean;
            markup_percent?: number | string;
            rate?: number | string;
            expected_provider_service_id?: number | string;
        }>();

        Service.use(c.env.DB);
        Category.use(c.env.DB);
        const service = await Service.find<any>(String(id));
        if (!service) return c.json({ error: 'سرویس یافت نشد' }, 404);

        if (body.expected_provider_service_id !== undefined) {
            const expected = parsePositiveInt(body.expected_provider_service_id);
            if (expected === null || Number(service.api_provider_service_id) !== expected) {
                return c.json({
                    ok: false,
                    error: 'شناسه سرویس ارائه‌دهنده با سرویس محلی مطابقت ندارد؛ برای اطمینان، GET /api/agent/provider-services?service_id=... را بررسی کنید',
                    actual_provider_service_id: service.api_provider_service_id,
                }, 409);
            }
        }

        if (body.markup_percent !== undefined && body.rate !== undefined) {
            return c.json({ error: 'markup_percent و rate را هم‌زمان نفرستید' }, 400);
        }

        const updates: Record<string, any> = {};
        if (body.name !== undefined && body.name.trim()) updates.name = body.name.trim();
        if (body.description !== undefined) updates.description = body.description;
        if (body.category_id !== undefined) {
            const categoryId = parsePositiveInt(body.category_id);
            if (categoryId === null) return c.json({ error: 'category_id نامعتبر است' }, 400);
            const category = await Category.find<CategoryData>(String(categoryId));
            if (!category) return c.json({ error: 'دسته‌بندی یافت نشد' }, 404);
            updates.category_id = categoryId;
        }
        if (body.is_active !== undefined) updates.is_active = body.is_active ? 1 : 0;

        let pricing: PricingInfo | null = null;
        if (body.rate !== undefined) {
            const rate = parseNumber(body.rate);
            if (rate === null || rate <= 0) return c.json({ error: 'rate باید عددی بزرگ‌تر از صفر باشد' }, 400);
            updates.rate = String(rate);
        } else if (body.markup_percent !== undefined) {
            const markupPercent = parseNumber(body.markup_percent);
            if (markupPercent === null || markupPercent < 0) {
                return c.json({ error: 'markup_percent باید عددی >= 0 باشد' }, 400);
            }
            pricing = await repriceFromProvider(c.env.DB, service, markupPercent);
            if (pricing === null) return c.json({ error: 'این سرویس به ارائه‌دهنده‌ای متصل نیست' }, 400);
            updates.rate = String(pricing.sell_rate_toman);
            updates.api_provider_service_price = pricing.provider_rate_usd;
        }

        if (Object.keys(updates).length > 0) {
            await Service.update(String(id), updates);
        }
        const updated = await Service.find<any>(String(id));
        return c.json({ ok: true, service: updated, pricing });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی سرویس' }, 500);
    }
});

agent.post('/services/:id/reprice', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه سرویس نامعتبر است' }, 400);

        const body = await c.req.json<{ markup_percent?: number | string }>();
        const markupPercent = parseNumber(body.markup_percent);
        if (markupPercent === null || markupPercent < 0) {
            return c.json({ error: 'markup_percent باید عددی >= 0 باشد' }, 400);
        }

        Service.use(c.env.DB);
        const service = await Service.find<any>(String(id));
        if (!service) return c.json({ error: 'سرویس یافت نشد' }, 404);

        const pricing = await repriceFromProvider(c.env.DB, service, markupPercent);
        if (pricing === null) return c.json({ error: 'این سرویس به ارائه‌دهنده‌ای متصل نیست' }, 400);

        await Service.update(String(id), {
            rate: String(pricing.sell_rate_toman),
            api_provider_service_price: pricing.provider_rate_usd,
        });
        const updated = await Service.find<any>(String(id));
        return c.json({ ok: true, service: updated, pricing });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در محاسبه مجدد قیمت' }, 500);
    }
});

// --- Orders (operational) ---

const VALID_ORDER_STATUSES = ['Pending', 'In progress', 'Completed', 'Partial', 'Processing', 'Canceled'];

agent.get('/orders', async (c) => {
    try {
        const from = normalizeRangeDate(c.req.query('from'));
        const to = normalizeRangeDate(c.req.query('to'));
        if (from === null || to === null) return c.json({ error: RANGE_PARAM_HINT }, 400);

        const userChatId = parseInteger(c.req.query('user_chat_id'));
        if (c.req.query('user_chat_id') && userChatId === null) {
            return c.json({ error: 'user_chat_id نامعتبر است' }, 400);
        }
        const serviceId = parsePositiveInt(c.req.query('service_id'));
        if (c.req.query('service_id') && serviceId === null) {
            return c.json({ error: 'service_id نامعتبر است' }, 400);
        }
        const providerId = parsePositiveInt(c.req.query('provider_id'));
        if (c.req.query('provider_id') && providerId === null) {
            return c.json({ error: 'provider_id نامعتبر است' }, 400);
        }

        const { page, pageSize } = parsePagination(
            { page: c.req.query('page'), pageSize: c.req.query('pageSize') },
            { pageSize: 20, maxPageSize: 100 }
        );

        Order.use(c.env.DB);
        const result = await Order.getOrdersFilteredPaginated(page, pageSize, {
            status: c.req.query('status')?.trim() || null,
            from: from ?? null,
            to: to ?? null,
            userChatId,
            serviceId,
            providerId,
            q: c.req.query('q')?.trim() || null,
        });
        return c.json({
            ok: true,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            orders: result.data,
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت سفارشات' }, 500);
    }
});

agent.get('/orders/:id', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه سفارش نامعتبر است' }, 400);

        Order.use(c.env.DB);
        const order = await Order.findDetailById(id);
        if (!order) return c.json({ error: 'سفارش یافت نشد' }, 404);
        return c.json({ ok: true, order });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت سفارش' }, 500);
    }
});

agent.put('/orders/:id/status', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه سفارش نامعتبر است' }, 400);

        const body = await readJson(c);
        const status = body?.status;
        if (!VALID_ORDER_STATUSES.includes(status)) {
            return c.json({ error: 'وضعیت نامعتبر است' }, 400);
        }

        Order.use(c.env.DB);
        const order = await Order.find(String(id)) as any;
        if (!order) return c.json({ error: 'سفارش یافت نشد' }, 404);

        const prevStatus = order.status;
        if (status === prevStatus) {
            return c.json({ ok: true, unchanged: true });
        }

        if (status === 'Canceled' || status === 'Partial') {
            const refunded = await applyOrderRefund(c.env.DB, order, status as OrderStatus);
            if (refunded > 0) {
                return c.json({ ok: true, refunded });
            }
        }

        await Order.updateStatus(id, status as OrderStatus);
        if (status === 'Completed' || status === 'Partial' || status === 'Canceled') {
            await notifyCustomerOrderStatus(c.env.DB, order, status as OrderStatus);
        }
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی وضعیت' }, 500);
    }
});

agent.put('/orders/:id/cancel', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه سفارش نامعتبر است' }, 400);

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
            await notifyCustomerOrderStatus(c.env.DB, order, 'Canceled');
        }
        return c.json({ ok: true, refunded });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در لغو سفارش' }, 500);
    }
});

agent.post('/orders/check-status', async (c) => {
    try {
        const body = await readJson(c);

        // Optional targeting: { "id": 1 } or { "ids": [1,2,3] }. Without them, sweep like the dashboard.
        let ids: number[] | undefined;
        if (body?.id !== undefined || body?.ids !== undefined) {
            const rawIds: unknown[] = Array.isArray(body.ids)
                ? body.ids
                : body.id !== undefined
                    ? [body.id]
                    : [];
            if (rawIds.length === 0) {
                return c.json({ error: 'ids باید آرایه‌ای از شناسه سفارش باشد' }, 400);
            }
            ids = rawIds.map((v) => Number(v));
            if (ids.some((n) => !Number.isInteger(n) || n <= 0)) {
                return c.json({ error: 'شناسه‌های سفارش نامعتبر است' }, 400);
            }
            ids = ids.slice(0, 500);
        }

        const result = ids
            ? await checkOrderStatuses(c.env.DB, { ids, advanceCursor: false })
            : await checkOrderStatuses(c.env.DB, { limit: 500, advanceCursor: true });
        return c.json({ ok: true, ...result });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بررسی وضعیت سفارشات' }, 500);
    }
});

agent.post('/orders/:id/refill', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه سفارش نامعتبر است' }, 400);

        Order.use(c.env.DB);
        const order = await Order.find(String(id)) as any;
        if (!order) return c.json({ error: 'سفارش یافت نشد' }, 404);

        if (!order.api_provider_id || !order.api_provider_order_id) {
            return c.json({ error: 'این سفارش به ارائه‌دهنده‌ای متصل نیست' }, 400);
        }

        ApiProvider.use(c.env.DB);
        const provider = await ApiProvider.find(String(order.api_provider_id)) as any;
        if (!provider) return c.json({ error: 'ارائه‌دهنده یافت نشد' }, 404);

        const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
        const result = await api.refill(Number(order.api_provider_order_id));
        if (result && typeof result.refill === 'object' && result.refill !== null && 'error' in (result.refill as any)) {
            return c.json({ error: `خطای refill از ارائه‌دهنده: ${(result.refill as any).error}` }, 400);
        }
        return c.json({ ok: true, refill: result?.refill ?? null });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در درخواست refill' }, 500);
    }
});

// --- Payments ---

agent.get('/payments', async (c) => {
    try {
        const from = normalizeRangeDate(c.req.query('from'));
        const to = normalizeRangeDate(c.req.query('to'));
        if (from === null || to === null) return c.json({ error: RANGE_PARAM_HINT }, 400);

        const userChatId = parseInteger(c.req.query('user_chat_id'));
        if (c.req.query('user_chat_id') && userChatId === null) {
            return c.json({ error: 'user_chat_id نامعتبر است' }, 400);
        }

        const { page, pageSize } = parsePagination(
            { page: c.req.query('page'), pageSize: c.req.query('pageSize') },
            { pageSize: 20, maxPageSize: 100 }
        );

        Payment.use(c.env.DB);
        const result = await Payment.listFilteredPaginated(page, pageSize, {
            status: c.req.query('status')?.trim() || null,
            type: c.req.query('type')?.trim() || null,
            from: from ?? null,
            to: to ?? null,
            userChatId,
        });
        return c.json({
            ok: true,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            payments: result.data,
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت پرداخت‌ها' }, 500);
    }
});

agent.get('/payments/:id', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه پرداخت نامعتبر است' }, 400);

        Payment.use(c.env.DB);
        const payment = await Payment.find(String(id)) as any;
        if (!payment) return c.json({ error: 'پرداخت یافت نشد' }, 404);

        // receipt_image_url stores the Telegram file id — expose it under an explicit name;
        // the bytes themselves stay behind GET /api/dashboard/payments/receipt/:fileId.
        return c.json({
            ok: true,
            payment: {
                ...payment,
                receipt_file_id: payment.receipt_image_url ?? null,
            },
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت پرداخت' }, 500);
    }
});

agent.put('/payments/:id/approve', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه پرداخت نامعتبر است' }, 400);

        Payment.use(c.env.DB);
        const payment = await Payment.find(String(id)) as any;
        if (!payment) return c.json({ error: 'پرداخت یافت نشد' }, 404);

        const approved = await Payment.approveAndCredit(id, payment.user_chat_id, payment.amount);
        if (!approved) {
            return c.json({ error: 'این پرداخت قبلا بررسی شده یا کاربر یافت نشد' }, 400);
        }

        // Notify user via Telegram (same as dashboard approve)
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (token) {
            const api = new Api(token);
            try {
                await api.sendMessage(
                    payment.user_chat_id,
                    `✅ پرداخت شما تایید شد!\n\nمبلغ: ${payment.amount.toLocaleString()} تومان\nموجودی جدید شما بروزرسانی شد.`,
                );
            } catch {}
        }

        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در تایید پرداخت' }, 500);
    }
});

agent.put('/payments/:id/reject', async (c) => {
    try {
        const id = parsePositiveInt(c.req.param('id'));
        if (id === null) return c.json({ error: 'شناسه پرداخت نامعتبر است' }, 400);

        const body = await readJson(c);
        const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined;

        Payment.use(c.env.DB);
        const payment = await Payment.find(String(id)) as any;
        if (!payment) return c.json({ error: 'پرداخت یافت نشد' }, 404);

        const rejected = await Payment.updatePendingStatus(id, 'rejected', reason);
        if (!rejected) return c.json({ error: 'این پرداخت قبلا بررسی شده' }, 400);

        // Notify user via Telegram (same as dashboard reject)
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (token) {
            const api = new Api(token);
            try {
                await api.sendMessage(
                    payment.user_chat_id,
                    `❌ پرداخت شما رد شد.\n\nمبلغ: ${payment.amount.toLocaleString()} تومان${reason ? `\nدلیل: ${reason}` : ''}`,
                );
            } catch {}
        }

        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در رد پرداخت' }, 500);
    }
});

// --- Telegram users ---

agent.get('/users', async (c) => {
    try {
        const { page, pageSize } = parsePagination(
            { page: c.req.query('page'), pageSize: c.req.query('pageSize') },
            { pageSize: 20, maxPageSize: 100 }
        );
        const blockedRaw = c.req.query('blocked');
        const blocked = blockedRaw === 'true' || blockedRaw === '1'
            ? true
            : blockedRaw === 'false' || blockedRaw === '0'
                ? false
                : null;

        TelegramUser.use(c.env.DB);
        const result = await TelegramUser.listFilteredPaginated(page, pageSize, {
            q: c.req.query('q')?.trim() || null,
            blocked,
        });
        return c.json({
            ok: true,
            total: result.total,
            page: result.page,
            pageSize: result.pageSize,
            users: result.data,
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت کاربران' }, 500);
    }
});

agent.get('/users/:chatId', async (c) => {
    try {
        const chatId = parseInteger(c.req.param('chatId'));
        if (chatId === null) return c.json({ error: 'chat_id نامعتبر است' }, 400);

        TelegramUser.use(c.env.DB);
        const user = await TelegramUser.findByChatId(chatId);
        if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);

        Order.use(c.env.DB);
        Payment.use(c.env.DB);
        const [ordersCount, paymentsCount] = await Promise.all([
            Order.countUserOrders(chatId),
            Payment.rawFirst<{ count: number }>(
                'SELECT COUNT(*) as count FROM payments WHERE user_chat_id = ?',
                chatId
            ),
        ]);

        return c.json({
            ok: true,
            user,
            stats: {
                orders_count: ordersCount,
                payments_count: paymentsCount?.count ?? 0,
            },
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت کاربر' }, 500);
    }
});

agent.post('/users/:chatId/message', async (c) => {
    try {
        const chatId = parseInteger(c.req.param('chatId'));
        if (chatId === null) return c.json({ error: 'chat_id نامعتبر است' }, 400);

        const { text, parse_mode } = await readJson(c);
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return c.json({ error: 'متن پیام الزامی است' }, 400);
        }
        if (text.length > 4000) {
            return c.json({ error: 'متن پیام حداکثر ۴۰۰۰ کاراکتر است' }, 400);
        }

        TelegramUser.use(c.env.DB);
        const user = await TelegramUser.findByChatId(chatId);
        if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);

        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const api = new Api(token);
        try {
            const options: Record<string, any> = {};
            if (parse_mode) options.parse_mode = parse_mode;
            await api.sendMessage(chatId, text, options);
            return c.json({ ok: true });
        } catch (error: any) {
            return c.json({ error: error?.message || 'خطا در ارسال پیام' }, 500);
        }
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ارسال پیام' }, 500);
    }
});

agent.put('/users/:chatId/balance', async (c) => {
    try {
        const chatId = parseInteger(c.req.param('chatId'));
        if (chatId === null) return c.json({ error: 'chat_id نامعتبر است' }, 400);

        const body = await readJson(c);
        const hasSet = body?.set !== undefined;
        const hasDelta = body?.delta !== undefined;
        if (hasSet === hasDelta) {
            return c.json({ error: 'دقیقا یکی از set یا delta را بفرستید' }, 400);
        }

        const set = hasSet ? Number(body.set) : null;
        const delta = hasDelta ? Number(body.delta) : null;
        if (hasSet && (!Number.isFinite(set) || (set as number) < 0)) {
            return c.json({ error: 'set باید عددی >= 0 باشد' }, 400);
        }
        if (hasDelta && !Number.isFinite(delta)) {
            return c.json({ error: 'delta باید عدد باشد' }, 400);
        }

        TelegramUser.use(c.env.DB);
        const user = await TelegramUser.findByChatId(chatId);
        if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);

        if (hasSet) {
            await TelegramUser.setBalanceByChatId(chatId, set as number);
        } else {
            const adjusted = await TelegramUser.adjustBalanceGuarded(chatId, delta as number);
            if (!adjusted) {
                return c.json({ error: 'این تغییر موجودی، موجودی را منفی می‌کند؛ مجاز نیست' }, 400);
            }
        }

        const updated = await TelegramUser.findByChatId(chatId);
        return c.json({ ok: true, balance: (updated as any)?.balance ?? null });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی موجودی' }, 500);
    }
});

agent.put('/users/:chatId/block', async (c) => {
    try {
        const chatId = parseInteger(c.req.param('chatId'));
        if (chatId === null) return c.json({ error: 'chat_id نامعتبر است' }, 400);

        const body = await readJson(c);
        TelegramUser.use(c.env.DB);
        const user = await TelegramUser.findByChatId(chatId);
        if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);

        await TelegramUser.blockByChatId(chatId, body?.reason, body?.duration_minutes);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در مسدودسازی کاربر' }, 500);
    }
});

agent.put('/users/:chatId/unblock', async (c) => {
    try {
        const chatId = parseInteger(c.req.param('chatId'));
        if (chatId === null) return c.json({ error: 'chat_id نامعتبر است' }, 400);

        TelegramUser.use(c.env.DB);
        const user = await TelegramUser.findByChatId(chatId);
        if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);

        await TelegramUser.unblockByChatId(chatId);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در رفع مسدودی کاربر' }, 500);
    }
});

// --- Ops stats snapshot ---

agent.get('/stats', async (c) => {
    try {
        const from = normalizeRangeDate(c.req.query('from'));
        const to = normalizeRangeDate(c.req.query('to'));
        if (from === null || to === null) return c.json({ error: RANGE_PARAM_HINT }, 400);

        // Default range: today (Tehran). Bounds are independent — each falls back to today.
        const today = dateTehran();
        const rangeFrom = from ?? today;
        const rangeTo = to ?? today;
        if (rangeFrom.slice(0, 10) > rangeTo.slice(0, 10)) {
            return c.json({ error: 'from نمی‌تواند بعد از to باشد' }, 400);
        }

        Order.use(c.env.DB);
        Payment.use(c.env.DB);
        TelegramUser.use(c.env.DB);
        Service.use(c.env.DB);
        Category.use(c.env.DB);
        ApiProvider.use(c.env.DB);

        // Orders in range
        const orderRange = dateRangeSql('created_at', rangeFrom, rangeTo);
        const orderConds = orderRange.sql ? [orderRange.sql] : [];
        const orderWhere = orderConds.length ? `WHERE ${orderConds.join(' AND ')}` : '';
        const orderAgg = await Order.rawFirst<any>(
            `SELECT COUNT(*) as count, COALESCE(SUM(CAST(charge AS REAL)), 0) as gross
             FROM orders ${orderWhere}`,
            ...orderRange.params
        );
        const byStatusRows = await Order.raw<{ status: string; count: number }>(
            `SELECT status, COUNT(*) as count FROM orders ${orderWhere} GROUP BY status`,
            ...orderRange.params
        );
        const completedConds = [...orderConds, "status = 'Completed'"];
        const completedAgg = await Order.rawFirst<any>(
            `SELECT COALESCE(SUM(CAST(charge AS REAL)), 0) as total
             FROM orders WHERE ${completedConds.join(' AND ')}`,
            ...orderRange.params
        );
        const byStatus: Record<string, number> = {};
        for (const row of byStatusRows) {
            byStatus[row.status] = row.count;
        }

        // Payments in range
        const paymentRange = dateRangeSql('created_at', rangeFrom, rangeTo);
        const paymentWhere = paymentRange.sql ? `WHERE ${paymentRange.sql}` : '';
        const paymentAgg = await Payment.rawFirst<any>(
            `SELECT COUNT(*) as count,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_amount,
                    COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END), 0) as approved_count,
                    COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending_count,
                    COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END), 0) as rejected_count
             FROM payments ${paymentWhere}`,
            ...paymentRange.params
        );

        // Users: total + created in range
        const usersTotal = await TelegramUser.count();
        const userRange = dateRangeSql('created_at', rangeFrom, rangeTo);
        const newUsers = (await TelegramUser.rawFirst<{ count: number }>(
            `SELECT COUNT(*) as count FROM telegram_users ${userRange.sql ? `WHERE ${userRange.sql}` : ''}`,
            ...userRange.params
        ))?.count ?? 0;

        // Catalog
        const activeServices = (await Service.rawFirst<{ count: number }>(
            'SELECT COUNT(*) as count FROM services WHERE is_active = 1'
        ))?.count ?? 0;
        const categoriesCount = await Category.count();

        // Providers (balance as last synced; never returns api_key)
        const providers = await ApiProvider.all<any>();
        const providerList = providers.map((p) => ({
            id: p.id,
            name: p.name,
            balance: p.balance ?? null,
            currency: p.currency ?? null,
            is_active: p.is_active === 1,
        }));

        return c.json({
            ok: true,
            range: { from: rangeFrom, to: rangeTo },
            orders: {
                count: orderAgg?.count ?? 0,
                by_status: byStatus,
                revenue_toman: Math.round(Number(orderAgg?.gross ?? 0)),
                completed_charge_toman: Math.round(Number(completedAgg?.total ?? 0)),
            },
            payments: {
                count: paymentAgg?.count ?? 0,
                approved_count: paymentAgg?.approved_count ?? 0,
                approved_toman: Math.round(Number(paymentAgg?.approved_amount ?? 0)),
                pending_count: paymentAgg?.pending_count ?? 0,
                rejected_count: paymentAgg?.rejected_count ?? 0,
            },
            users: {
                total: usersTotal,
                new_in_range: newUsers,
            },
            catalog: {
                active_services: activeServices,
                categories: categoriesCount,
            },
            providers: providerList,
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت آمار' }, 500);
    }
});

export default agent;
