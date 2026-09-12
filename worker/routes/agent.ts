import { Hono } from 'hono';
import { ApiProvider } from '../db/ApiProvider';
import { Category } from '../db/Category';
import type { CategoryData } from '../db/Category';
import { Service } from '../db/Service';
import { Setting } from '../db/Setting';
import { SmmApiProvider } from '../api/SmmApiProvider';
import type { SmmService } from '../api/SmmApiProvider';
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

export default agent;
