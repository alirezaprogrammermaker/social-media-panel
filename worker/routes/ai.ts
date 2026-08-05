import { Hono } from 'hono';
import { AiSetting, AiUsageLog } from '../db/AiSetting';
import { BotHelp } from '../db/BotHelp';
import { AiDatabaseAccess } from '../db/AiDatabaseAccess';
import { requireAuth, requireAdmin } from '../middleware';
import type { Bindings, Variables } from '../types';

const ai = new Hono<{ Bindings: Bindings; Variables: Variables }>();

ai.use('*', requireAuth);
ai.use('*', requireAdmin);

// --- AI Settings CRUD (Dashboard) ---

ai.get('/settings', async (c) => {
    try {
        AiSetting.use(c.env.DB);
        const adminSettings = await AiSetting.getAdminSettings();
        const userSettings = await AiSetting.getUserSettings();
        return c.json({ admin: adminSettings, user: userSettings });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت تنظیمات هوش مصنوعی' }, 500);
    }
});

ai.put('/settings', async (c) => {
    try {
        const body = await c.req.json<{
            admin?: Record<string, string>;
            user?: Record<string, string>;
        }>();
        AiSetting.use(c.env.DB);

        if (body.admin) {
            for (const [key, value] of Object.entries(body.admin)) {
                await AiSetting.set(`ai_admin_${key}`, value);
            }
        }
        if (body.user) {
            for (const [key, value] of Object.entries(body.user)) {
                await AiSetting.set(`ai_user_${key}`, value);
            }
        }

        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی تنظیمات' }, 500);
    }
});

// --- AI Usage Stats ---

ai.get('/usage', async (c) => {
    try {
        AiUsageLog.use(c.env.DB);
        const stats = await AiUsageLog.getStats();
        return c.json(stats);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت آمار' }, 500);
    }
});

ai.get('/usage/today', async (c) => {
    try {
        const role = c.req.query('role') || 'admin';
        AiUsageLog.use(c.env.DB);
        const usage = await AiUsageLog.getTodayUsage(role);
        return c.json(usage);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت آمار امروز' }, 500);
    }
});

// --- Database Access for AI ---

ai.get('/db/schema', async (c) => {
    try {
        const role = c.req.query('role') || 'admin';
        const dbAccess = new AiDatabaseAccess(c.env.DB, role);
        const schema = await dbAccess.getTableSchema();
        return c.json(schema);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت اسکیما' }, 500);
    }
});

ai.get('/db/summary', async (c) => {
    try {
        const role = c.req.query('role') || 'admin';
        const dbAccess = new AiDatabaseAccess(c.env.DB, role);
        const summary = await dbAccess.getSummary();
        return c.json(summary);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت خلاصه' }, 500);
    }
});

ai.post('/db/query', async (c) => {
    try {
        const { table, columns, where, params, limit, offset, orderBy, role } = await c.req.json<{
            table: string;
            columns?: string[];
            where?: string;
            params?: any[];
            limit?: number;
            offset?: number;
            orderBy?: string;
            role?: string;
        }>();

        if (!table) {
            return c.json({ error: 'نام جدول الزامی است' }, 400);
        }

        const userRole = role || 'admin';
        const dbAccess = new AiDatabaseAccess(c.env.DB, userRole);
        const result = await dbAccess.queryTable(table, {
            columns,
            where,
            params,
            limit,
            offset,
            orderBy,
        });

        return c.json(result);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در اجرای کوئری' }, 500);
    }
});

// --- AI Chat (for testing from dashboard) ---

ai.post('/chat', async (c) => {
    try {
        const { message, role } = await c.req.json<{ message: string; role?: string }>();

        if (!message || message.trim().length === 0) {
            return c.json({ error: 'پیام الزامی است' }, 400);
        }

        const userRole = role || 'admin';

        AiSetting.use(c.env.DB);
        const settings = userRole === 'admin'
            ? await AiSetting.getAdminSettings()
            : await AiSetting.getUserSettings();

        if (settings.enabled !== 'true') {
            return c.json({ error: 'هوش مصنوعی برای این نقش غیرفعال است' }, 403);
        }

        // Check daily limit
        const dailyLimit = parseInt(settings.daily_limit || '0', 10);
        if (dailyLimit > 0) {
            AiUsageLog.use(c.env.DB);
            const todayUsage = await AiUsageLog.getTodayUsage(userRole);
            if (todayUsage.totalRequests >= dailyLimit) {
                return c.json({ error: `سقف استفاده روزانه (${dailyLimit} درخواست) رسیده است` }, 429);
            }
        }

        const model = settings.model || '@cf/meta/llama-4-scout-17b-16e-instruct';
        const systemPrompt = settings.system_prompt || 'شما یک دستیار مفید هستید.';
        const maxTokens = parseInt(settings.max_tokens || '512', 10);
        const temperature = parseFloat(settings.temperature || '0.7');

        // Get rules from telegram_bot_helps table
        let rulesContext = '';
        try {
            BotHelp.use(c.env.DB);
            const helps = await BotHelp.all<{ name: string; description: string }>();
            if (helps.length > 0) {
                rulesContext = '\n\nقوانین و راهنمای ربات:\n';
                for (const h of helps) {
                    rulesContext += `\n${h.name}:\n${h.description}\n`;
                }
            }
        } catch {}

        const fullSystemPrompt = systemPrompt + rulesContext;

        const response = await c.env.AI.run(model, {
            messages: [
                { role: 'system', content: fullSystemPrompt },
                { role: 'user', content: message },
            ],
            max_tokens: maxTokens,
            temperature,
        });

        const responseText = (response as any).response || '';

        // Log usage
        AiUsageLog.use(c.env.DB);
        await AiUsageLog.logUsage(userRole, null, maxTokens);

        return c.json({ ok: true, response: responseText });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در پردازش درخواست هوش مصنوعی' }, 500);
    }
});

export default ai;
