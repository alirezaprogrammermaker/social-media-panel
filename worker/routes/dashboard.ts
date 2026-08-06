import { Hono } from 'hono';
import { Api } from 'grammy';
import { TelegramUser } from '../db/TelegramUser';
import { TelegramUserSession } from '../db/TelegramUserSession';
import { BotChannel } from '../db/BotChannel';
import { BotHelp } from '../db/BotHelp';
import { Setting } from '../db/Setting';
import { AiUsageLog } from '../db/AiSetting';
import { PaymentMethod } from '../db/PaymentMethod';
import { Payment } from '../db/Payment';
import { sendStatsReportOnDemand } from '../cron/statsReporter';
import { requireAuth, requireAdmin } from '../middleware';
import type { Bindings, Variables } from '../types';

const dashboard = new Hono<{ Bindings: Bindings; Variables: Variables }>();

dashboard.use('*', requireAuth);

dashboard.get('/me', (c) => {
    return c.json(c.get('user'));
});

dashboard.use('*', requireAdmin);

// --- Telegram Users ---

dashboard.get('/telegram-users', async (c) => {
    TelegramUser.use(c.env.DB);
    const users = await TelegramUser.all();
    return c.json(users);
});

dashboard.delete('/telegram-users/:chatId', async (c) => {
    TelegramUser.use(c.env.DB);
    const chatId = Number(c.req.param('chatId'));
    const user = await TelegramUser.findByChatId(chatId);
    if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);
    await TelegramUser.deleteByChatId(chatId);
    return c.json({ ok: true });
});

dashboard.put('/telegram-users/:chatId/role', async (c) => {
    const { role } = await c.req.json<{ role: string }>();
    if (role !== 'admin' && role !== 'user') {
        return c.json({ error: 'نقش نامعتبر است' }, 400);
    }
    TelegramUser.use(c.env.DB);
    const chatId = Number(c.req.param('chatId'));
    await TelegramUser.updateRoleByChatId(chatId, role);
    return c.json({ ok: true });
});

dashboard.put('/telegram-users/:chatId/block', async (c) => {
    const chatId = Number(c.req.param('chatId'));
    const { reason, duration_minutes } = await c.req.json<{ reason?: string; duration_minutes?: number }>();
    TelegramUser.use(c.env.DB);
    const user = await TelegramUser.findByChatId(chatId);
    if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);
    await TelegramUser.blockByChatId(chatId, reason, duration_minutes);
    return c.json({ ok: true });
});

dashboard.put('/telegram-users/:chatId/unblock', async (c) => {
    const chatId = Number(c.req.param('chatId'));
    TelegramUser.use(c.env.DB);
    const user = await TelegramUser.findByChatId(chatId);
    if (!user) return c.json({ error: 'کاربر یافت نشد' }, 404);
    await TelegramUser.unblockByChatId(chatId);
    return c.json({ ok: true });
});

dashboard.post('/telegram-users/:chatId/send-message', async (c) => {
    const chatId = Number(c.req.param('chatId'));
    const { text, parse_mode } = await c.req.json<{ text: string; parse_mode?: string }>();

    if (!text || text.trim().length === 0) {
        return c.json({ error: 'متن پیام الزامی است' }, 400);
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
});

dashboard.get('/stats', async (c) => {
    TelegramUser.use(c.env.DB);
    const stats = await TelegramUser.getStats();
    return c.json(stats);
});

dashboard.get('/stats/daily', async (c) => {
    const days = Number(c.req.query('days')) || 30;
    TelegramUser.use(c.env.DB);
    const daily = await TelegramUser.getDailyStats(days);
    return c.json(daily);
});

// --- Telegram User Sessions ---

dashboard.get('/telegram-sessions', async (c) => {
    TelegramUserSession.use(c.env.DB);
    const status = c.req.query('status');
    const sessions = status
        ? await TelegramUserSession.findByStatusWithUser(status)
        : await TelegramUserSession.allWithUser();
    return c.json(sessions);
});

dashboard.delete('/telegram-sessions/:id', async (c) => {
    TelegramUserSession.use(c.env.DB);
    const id = Number(c.req.param('id'));
    const session = await TelegramUserSession.find<{ id: number }>(String(id));
    if (!session) return c.json({ error: 'نشست یافت نشد' }, 404);
    await TelegramUserSession.delete(String(id));
    return c.json({ ok: true });
});

dashboard.put('/telegram-sessions/:id/cancel', async (c) => {
    TelegramUserSession.use(c.env.DB);
    const id = Number(c.req.param('id'));
    await TelegramUserSession.cancel(id);
    return c.json({ ok: true });
});

// --- Settings ---

dashboard.get('/settings', async (c) => {
    try {
        Setting.use(c.env.DB);
        const keys = [
            'telegram_token', 'telegram_bot_info', 'registration_disabled',
            'bot_name', 'bot_short_description', 'bot_description', 'bot_commands', 'dollar_rate',
            'admin_chat_id', 'support_message', 'receipt_analysis_prompt', 'receipt_analysis_enabled',
            'receipt_verification_required', 'receipt_max_invalid_attempts', 'receipt_ban_hours',
            'stats_report_enabled', 'stats_report_time',
            'crypto_gateway_api_key', 'crypto_gateway_webhook_secret', 'crypto_gateway_base_url',
        ];
        const values = await Promise.all(keys.map((k) => Setting.get(k)));
        const map = Object.fromEntries(keys.map((k, i) => [k, values[i]]));

        const {
            CRYPTO_GATEWAY_DEFAULT_BASE,
            maskSecret,
            resolveCryptoGatewaySettings,
        } = await import('../api/CryptoGateway');

        const resolved = await resolveCryptoGatewaySettings(c.env.DB, c.env);
        const reqUrl = new URL(c.req.url);
        const webhookUrl = `${reqUrl.protocol}//${reqUrl.host}/api/crypto-gateway/webhook`;

        // Prefer stored setting for base URL display; fall back to resolved (env/default)
        const storedBaseUrl = map.crypto_gateway_base_url?.trim() || '';

        return c.json({
            botInfo: map.telegram_bot_info ? JSON.parse(map.telegram_bot_info) : null,
            registrationDisabled: map.registration_disabled === 'true',
            botName: map.bot_name ?? '',
            botShortDescription: map.bot_short_description ?? '',
            botDescription: map.bot_description ?? '',
            botCommands: map.bot_commands ? JSON.parse(map.bot_commands) : [],
            dollarRate: map.dollar_rate ?? '50000',
            adminChatId: map.admin_chat_id ?? '',
            supportMessage: map.support_message ?? '',
            receiptAnalysisPrompt: map.receipt_analysis_prompt ?? '',
            receiptAnalysisEnabled: map.receipt_analysis_enabled ?? 'true',
            receiptVerificationRequired: map.receipt_verification_required ?? 'true',
            receiptMaxInvalidAttempts: map.receipt_max_invalid_attempts ?? '2',
            receiptBanHours: map.receipt_ban_hours ?? '3',
            statsReportEnabled: map.stats_report_enabled !== 'false',
            statsReportTime: map.stats_report_time ?? '20:00',
            hasToken: !!map.telegram_token,
            cryptoGateway: {
                hasApiKey: !!resolved.apiKey,
                apiKeyHint: maskSecret(resolved.apiKey),
                hasWebhookSecret: !!resolved.webhookSecret,
                webhookSecretHint: maskSecret(resolved.webhookSecret),
                baseUrl: storedBaseUrl || resolved.baseUrl,
                defaultBaseUrl: CRYPTO_GATEWAY_DEFAULT_BASE,
                webhookUrl,
                configured: !!resolved.apiKey,
            },
        });
    } catch (e) {
        return c.json({ error: 'خطا در دریافت تنظیمات' }, 500);
    }
});

dashboard.put('/settings/token', async (c) => {
    try {
        const { token } = await c.req.json<{ token: string }>();
        if (!token) return c.json({ error: 'توکن الزامی است' }, 400);

        Setting.use(c.env.DB);

        const api = new Api(token);
        const botInfo = await api.getMe();

        await Setting.set('telegram_token', token);
        await Setting.set('telegram_bot_info', JSON.stringify(botInfo));

        return c.json({ ok: true, botInfo });
    } catch (e: any) {
        const msg = e?.response?.description || e?.message || 'خطای ناشناخته';
        return c.json({ error: msg }, 400);
    }
});

dashboard.post('/settings/webhook/set', async (c) => {
    try {
        const { url: webhookUrl } = await c.req.json<{ url: string }>();
        if (!webhookUrl) return c.json({ error: 'آدرس وب‌هوک الزامی است' }, 400);

        const cleanUrl = webhookUrl.trim();
        if (!cleanUrl.startsWith('https://')) {
            return c.json({ error: 'آدرس وب‌هوک باید با https:// شروع شود' }, 400);
        }

        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.json({ error: 'ابتدا توکن را تنظیم کنید' }, 400);

        // Generate and store a webhook secret for validation
        let webhookSecret = await Setting.get('telegram_webhook_secret');
        if (!webhookSecret) {
            const secretArray = new Uint8Array(32);
            crypto.getRandomValues(secretArray);
            webhookSecret = [...secretArray].map(b => b.toString(16).padStart(2, '0')).join('');
            await Setting.set('telegram_webhook_secret', webhookSecret);
        }

        const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: cleanUrl, secret_token: webhookSecret }),
        });
        const result = await res.json() as { ok: boolean; description?: string };

        if (!result.ok) {
            return c.json({ error: result.description || 'خطا در تنظیم وب‌هوک', sent_url: cleanUrl }, 400);
        }

        return c.json({ ok: true, url: cleanUrl });
    } catch (e: any) {
        const msg = e?.message || 'خطا در تنظیم وب‌هوک';
        return c.json({ error: msg }, 500);
    }
});

dashboard.post('/settings/webhook/delete', async (c) => {
    try {
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const api = new Api(token);
        const result = await api.deleteWebhook();

        return c.json({ ok: result });
    } catch (e: any) {
        const msg = e?.response?.description || e?.message || 'خطا در حذف وب‌هوک';
        return c.json({ error: msg }, 500);
    }
});

dashboard.put('/settings/registration', async (c) => {
    try {
        const { disabled } = await c.req.json<{ disabled: boolean }>();
        Setting.use(c.env.DB);
        await Setting.set('registration_disabled', String(disabled));
        return c.json({ ok: true, registrationDisabled: disabled });
    } catch (e) {
        return c.json({ error: 'خطا در بروزرسانی تنظیمات' }, 500);
    }
});

dashboard.put('/settings/dollar-rate', async (c) => {
    try {
        const { rate } = await c.req.json<{ rate: string }>();
        Setting.use(c.env.DB);
        await Setting.set('dollar_rate', rate);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در بروزرسانی نرخ دلار' }, 500);
    }
});

dashboard.put('/settings/crypto-gateway', async (c) => {
    try {
        const body = await c.req.json<{
            api_key?: string;
            webhook_secret?: string;
            base_url?: string;
        }>();

        const {
            SETTING_CRYPTO_GATEWAY_API_KEY,
            SETTING_CRYPTO_GATEWAY_WEBHOOK_SECRET,
            SETTING_CRYPTO_GATEWAY_BASE_URL,
            CRYPTO_GATEWAY_DEFAULT_BASE,
            maskSecret,
            resolveCryptoGatewaySettings,
        } = await import('../api/CryptoGateway');

        Setting.use(c.env.DB);

        if (typeof body.api_key === 'string' && body.api_key.trim()) {
            const key = body.api_key.trim();
            if (!key.startsWith('cg_')) {
                return c.json({ error: 'کلید API باید با cg_ شروع شود' }, 400);
            }
            await Setting.set(SETTING_CRYPTO_GATEWAY_API_KEY, key);
        }

        if (typeof body.webhook_secret === 'string' && body.webhook_secret.trim()) {
            await Setting.set(SETTING_CRYPTO_GATEWAY_WEBHOOK_SECRET, body.webhook_secret.trim());
        }

        if (typeof body.base_url === 'string') {
            const raw = body.base_url.trim().replace(/\/$/, '');
            if (!raw) {
                await Setting.remove(SETTING_CRYPTO_GATEWAY_BASE_URL);
            } else {
                if (!raw.startsWith('https://')) {
                    return c.json({ error: 'آدرس پایه باید با https:// شروع شود' }, 400);
                }
                await Setting.set(SETTING_CRYPTO_GATEWAY_BASE_URL, raw);
            }
        }

        const resolved = await resolveCryptoGatewaySettings(c.env.DB, c.env);
        const storedBase = await Setting.get(SETTING_CRYPTO_GATEWAY_BASE_URL);
        const reqUrl = new URL(c.req.url);
        const webhookUrl = `${reqUrl.protocol}//${reqUrl.host}/api/crypto-gateway/webhook`;

        return c.json({
            ok: true,
            cryptoGateway: {
                hasApiKey: !!resolved.apiKey,
                apiKeyHint: maskSecret(resolved.apiKey),
                hasWebhookSecret: !!resolved.webhookSecret,
                webhookSecretHint: maskSecret(resolved.webhookSecret),
                baseUrl: storedBase?.trim() || resolved.baseUrl,
                defaultBaseUrl: CRYPTO_GATEWAY_DEFAULT_BASE,
                webhookUrl,
                configured: !!resolved.apiKey,
            },
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ذخیره تنظیمات درگاه کریپتو' }, 500);
    }
});

dashboard.put('/settings/admin-chat-id', async (c) => {
    try {
        const { chat_id } = await c.req.json<{ chat_id: string }>();
        Setting.use(c.env.DB);
        await Setting.set('admin_chat_id', chat_id);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در بروزرسانی شناسه چت مدیر' }, 500);
    }
});

dashboard.put('/settings/support', async (c) => {
    try {
        const { support_message } = await c.req.json<{ support_message: string }>();
        Setting.use(c.env.DB);
        await Setting.set('support_message', support_message);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در ذخیره پیام پشتیبانی' }, 500);
    }
});

dashboard.put('/settings/receipt-analysis-prompt', async (c) => {
    try {
        const { prompt } = await c.req.json<{ prompt: string }>();
        Setting.use(c.env.DB);
        await Setting.set('receipt_analysis_prompt', prompt);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در ذخیره پرامپت' }, 500);
    }
});

dashboard.put('/settings/receipt-analysis-enabled', async (c) => {
    try {
        const { enabled } = await c.req.json<{ enabled: string }>();
        Setting.use(c.env.DB);
        await Setting.set('receipt_analysis_enabled', enabled);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در بروزرسانی' }, 500);
    }
});

dashboard.put('/settings/receipt-verification', async (c) => {
    try {
        const { required, max_attempts, ban_hours } = await c.req.json<{ required?: string; max_attempts?: string; ban_hours?: string }>();
        Setting.use(c.env.DB);
        if (required !== undefined) await Setting.set('receipt_verification_required', required);
        if (max_attempts !== undefined) await Setting.set('receipt_max_invalid_attempts', max_attempts);
        if (ban_hours !== undefined) await Setting.set('receipt_ban_hours', ban_hours);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در بروزرسانی' }, 500);
    }
});

// --- Stats Report Settings ---

dashboard.put('/settings/stats-report', async (c) => {
    try {
        const { enabled, time } = await c.req.json<{ enabled?: boolean; time?: string }>();
        Setting.use(c.env.DB);
        if (enabled !== undefined) await Setting.set('stats_report_enabled', String(enabled));
        if (time !== undefined) await Setting.set('stats_report_time', time);
        return c.json({ ok: true });
    } catch (e) {
        return c.json({ error: 'خطا در بروزرسانی تنظیمات گزارش' }, 500);
    }
});

dashboard.post('/settings/stats-report/test', async (c) => {
    try {
        const user = c.get('user');
        const success = await sendStatsReportOnDemand(c.env.DB, Number(user.id));
        if (success) {
            return c.json({ ok: true, message: 'گزارش آزمایشی ارسال شد' });
        }
        return c.json({ error: 'خطا در ارسال گزارش' }, 500);
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ارسال گزارش آزمایشی' }, 500);
    }
});

dashboard.get('/settings/webhook/info', async (c) => {
    try {
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const api = new Api(token);
        const info = await api.getWebhookInfo();

        return c.json(info);
    } catch (e: any) {
        const msg = e?.response?.description || e?.message || 'خطا در دریافت اطلاعات وب‌هوک';
        return c.json({ error: msg }, 500);
    }
});

// --- Bot Settings (setMyName, setMyShortDescription, setMyDescription, setMyCommands) ---

async function getTelegramToken(c: any): Promise<string | null> {
    Setting.use(c.env.DB);
    return Setting.get('telegram_token');
}

dashboard.put('/settings/bot-name', async (c) => {
    try {
        const token = await getTelegramToken(c);
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const { name } = await c.req.json<{ name: string }>();
        const res = await fetch(`https://api.telegram.org/bot${token}/setMyName`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        const result = await res.json() as { ok: boolean; description?: string };
        if (!result.ok) return c.json({ error: result.description }, 400);

        Setting.use(c.env.DB);
        await Setting.set('bot_name', name);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در تنظیم نام' }, 500);
    }
});

dashboard.put('/settings/bot-short-description', async (c) => {
    try {
        const token = await getTelegramToken(c);
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const { shortDescription } = await c.req.json<{ shortDescription: string }>();
        const res = await fetch(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ short_description: shortDescription }),
        });
        const result = await res.json() as { ok: boolean; description?: string };
        if (!result.ok) return c.json({ error: result.description }, 400);

        Setting.use(c.env.DB);
        await Setting.set('bot_short_description', shortDescription);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در تنظیم توضیح کوتاه' }, 500);
    }
});

dashboard.put('/settings/bot-description', async (c) => {
    try {
        const token = await getTelegramToken(c);
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const { description } = await c.req.json<{ description: string }>();
        const res = await fetch(`https://api.telegram.org/bot${token}/setMyDescription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description }),
        });
        const result = await res.json() as { ok: boolean; description?: string };
        if (!result.ok) return c.json({ error: result.description }, 400);

        Setting.use(c.env.DB);
        await Setting.set('bot_description', description);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در تنظیم توضیحات' }, 500);
    }
});

dashboard.put('/settings/bot-commands', async (c) => {
    try {
        const token = await getTelegramToken(c);
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const { commands } = await c.req.json<{ commands: { command: string; description: string }[] }>();
        const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ commands }),
        });
        const result = await res.json() as { ok: boolean; description?: string };
        if (!result.ok) return c.json({ error: result.description }, 400);

        Setting.use(c.env.DB);
        await Setting.set('bot_commands', JSON.stringify(commands));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در تنظیم دستورات' }, 500);
    }
});

// --- Bot Channels ---

dashboard.get('/bot-channels', async (c) => {
    BotChannel.use(c.env.DB);
    const channels = await BotChannel.all();
    return c.json(channels);
});

dashboard.post('/bot-channels', async (c) => {
    try {
        const { channel_username } = await c.req.json<{ channel_username: string }>();
        if (!channel_username) return c.json({ error: 'نام کاربری کانال الزامی است' }, 400);

        const cleanUsername = channel_username.replace('@', '').trim();

        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const res = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: `@${cleanUsername}` }),
        });
        const result = await res.json() as { ok: boolean; description?: string; result: any };
        if (!result.ok) return c.json({ error: result.description || 'کانال یافت نشد' }, 400);

        const chat = result.result;
        if (chat.type !== 'channel' && chat.type !== 'supergroup') {
            return c.json({ error: 'فقط کانال یا سوپرگروپ مجاز است' }, 400);
        }
        BotChannel.use(c.env.DB);
        const existing = await BotChannel.findBy<{ id: number }>('channel_id', chat.id);
        if (existing) return c.json({ error: 'این کانال قبلا اضافه شده' }, 400);

        const channel = await BotChannel.create({
            channel_id: chat.id,
            channel_username: cleanUsername,
            channel_title: chat.title || cleanUsername,
            is_mandatory: 0,
        });
        return c.json({ ok: true, channel });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در افزودن کانال' }, 500);
    }
});

dashboard.put('/bot-channels/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { is_mandatory } = await c.req.json<{ is_mandatory: boolean }>();

        BotChannel.use(c.env.DB);
        const channel = await BotChannel.findBy<{ id: number; channel_username: string; channel_title: string }>('id', id);
        if (!channel) return c.json({ error: 'کانال یافت نشد' }, 404);

        // اگر فعال‌سازی عضویت الزامی است، بررسی کن بات مدیر کانال باشد
        if (is_mandatory) {
            Setting.use(c.env.DB);
            const token = await Setting.get('telegram_token');
            if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

            const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
            const me = await meRes.json() as { ok: boolean; result: { id: number } };
            if (!me.ok) return c.json({ error: 'خطا در دریافت اطلاعات بات' }, 500);

            const memberRes = await fetch(`https://api.telegram.org/bot${token}/getChatMember`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: `@${channel.channel_username}`, user_id: me.result.id }),
            });
            const memberResult = await memberRes.json() as { ok: boolean; result: { status: string }; description?: string };

            if (!memberResult.ok) {
                return c.json({ error: `بات در کانال @${channel.channel_username} عضو نیست. ابتدا بات را به کانال اضافه کنید.` }, 400);
            }

            const isAdmin = ['administrator', 'creator', 'owner'].includes(memberResult.result.status);
            if (!isAdmin) {
                return c.json({ error: `بات باید مدیر کانال @${channel.channel_username} باشد. سطح دسترسی فعلی: ${memberResult.result.status}` }, 400);
            }
        }

        await BotChannel.setMandatory(id, is_mandatory);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

dashboard.delete('/bot-channels/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        BotChannel.use(c.env.DB);
        await BotChannel.delete(String(id));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

// --- Bot Helps ---

dashboard.get('/bot-helps', async (c) => {
    BotHelp.use(c.env.DB);
    const helps = await BotHelp.all();
    helps.sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    return c.json(helps);
});

dashboard.post('/bot-helps', async (c) => {
    try {
        const { name, description, sort_order } = await c.req.json<{ name: string; description: string; sort_order?: number }>();
        if (!name || !description) {
            return c.json({ error: 'نام و توضیحات الزامی است' }, 400);
        }
        BotHelp.use(c.env.DB);
        const row = await BotHelp.create({
            name,
            description,
            sort_order: sort_order ?? 0,
        });
        return c.json({ ok: true, help: row });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد' }, 500);
    }
});

dashboard.put('/bot-helps/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { name, description, sort_order } = await c.req.json<{ name?: string; description?: string; sort_order?: number }>();
        BotHelp.use(c.env.DB);
        const existing = await BotHelp.find(String(id));
        if (!existing) return c.json({ error: 'راهنما یافت نشد' }, 404);

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (description !== undefined) updates.description = description;
        if (sort_order !== undefined) updates.sort_order = sort_order;

        if (Object.keys(updates).length > 0) {
            await BotHelp.update(String(id), updates);
        }
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

dashboard.delete('/bot-helps/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        BotHelp.use(c.env.DB);
        await BotHelp.delete(String(id));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

// --- Payment Methods ---

dashboard.get('/payment-methods', async (c) => {
    PaymentMethod.use(c.env.DB);
    const methods = await PaymentMethod.all();
    return c.json(methods);
});

dashboard.post('/payment-methods', async (c) => {
    try {
        const { name, card_number, card_holder, min_amount, max_amount } = await c.req.json<{
            name: string;
            card_number: string;
            card_holder: string;
            min_amount: number;
            max_amount: number;
        }>();

        if (!name || !card_number || !card_holder) {
            return c.json({ error: 'نام، شماره کارت و نام صاحب کارت الزامی است' }, 400);
        }

        if (min_amount <= 0 || max_amount <= 0 || min_amount > max_amount) {
            return c.json({ error: 'مقدار حداقل و حداکثر نامعتبر است' }, 400);
        }

        PaymentMethod.use(c.env.DB);
        const method = await PaymentMethod.create({
            name,
            card_number,
            card_holder,
            min_amount,
            max_amount,
            is_active: 1,
        });
        return c.json({ ok: true, method });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در ایجاد روش پرداخت' }, 500);
    }
});

dashboard.put('/payment-methods/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { name, card_number, card_holder, min_amount, max_amount } = await c.req.json<{
            name?: string;
            card_number?: string;
            card_holder?: string;
            min_amount?: number;
            max_amount?: number;
        }>();

        PaymentMethod.use(c.env.DB);
        const existing = await PaymentMethod.find(String(id));
        if (!existing) return c.json({ error: 'روش پرداخت یافت نشد' }, 404);

        const updates: Record<string, any> = {};
        if (name !== undefined) updates.name = name;
        if (card_number !== undefined) updates.card_number = card_number;
        if (card_holder !== undefined) updates.card_holder = card_holder;
        if (min_amount !== undefined) updates.min_amount = min_amount;
        if (max_amount !== undefined) updates.max_amount = max_amount;

        if (Object.keys(updates).length > 0) {
            await PaymentMethod.update(String(id), updates);
        }
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

dashboard.put('/payment-methods/:id/toggle', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { is_active } = await c.req.json<{ is_active: boolean }>();

        PaymentMethod.use(c.env.DB);
        await PaymentMethod.toggleActive(id, is_active);
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی' }, 500);
    }
});

dashboard.delete('/payment-methods/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        PaymentMethod.use(c.env.DB);
        await PaymentMethod.delete(String(id));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

// --- Payments ---

dashboard.get('/payments', async (c) => {
    Payment.use(c.env.DB);
    const status = c.req.query('status');
    const type = c.req.query('type');
    let payments = status
        ? await Payment.findByStatus(status)
        : await Payment.findAllOrdered();
    if (type === 'crypto') {
        payments = payments.filter((p: any) => p.payment_type === 'crypto');
    } else if (type === 'card') {
        payments = payments.filter((p: any) => (p.payment_type || 'card') === 'card');
    }
    return c.json(payments);
});

dashboard.get('/payments/stats', async (c) => {
    Payment.use(c.env.DB);
    const stats = await Payment.getStats();
    return c.json(stats);
});

dashboard.post('/payments/:id/refresh-crypto', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { refreshLocalCryptoPayment } = await import('../services/cryptoPayment');
        const result = await refreshLocalCryptoPayment(c.env.DB, c.env, id, false);
        if (!result.ok) return c.json({ error: result.error || 'خطا' }, 400);
        return c.json({ ok: true, payment: result.payment, result: result.result });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بروزرسانی وضعیت کریپتو' }, 500);
    }
});

dashboard.get('/crypto-gateway/health', async (c) => {
    try {
        const {
            healthCheck,
            resolveCryptoGatewaySettings,
            isCryptoGatewayConfigured,
        } = await import('../api/CryptoGateway');
        const resolved = await resolveCryptoGatewaySettings(c.env.DB, c.env);
        const health = await healthCheck(resolved.baseUrl);
        const reqUrl = new URL(c.req.url);
        return c.json({
            configured: await isCryptoGatewayConfigured(c.env.DB, c.env),
            hasWebhookSecret: !!resolved.webhookSecret,
            baseUrl: resolved.baseUrl,
            webhookUrl: `${reqUrl.protocol}//${reqUrl.host}/api/crypto-gateway/webhook`,
            webhookUrlHint: '/api/crypto-gateway/webhook',
            health,
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در بررسی درگاه' }, 500);
    }
});

dashboard.put('/payments/:id/approve', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        Payment.use(c.env.DB);
        const payment = await Payment.find(String(id)) as any;
        if (!payment) return c.json({ error: 'پرداخت یافت نشد' }, 404);

        const approved = await Payment.approveAndCredit(id, payment.user_chat_id, payment.amount);
        if (!approved) {
            return c.json({ error: 'این پرداخت قبلا بررسی شده یا کاربر یافت نشد' }, 400);
        }

        // Notify user via Telegram
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

dashboard.put('/payments/:id/reject', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        const { reason } = await c.req.json<{ reason?: string }>();
        Payment.use(c.env.DB);
        const payment = await Payment.find(String(id)) as any;
        if (!payment) return c.json({ error: 'پرداخت یافت نشد' }, 404);

        const rejected = await Payment.updatePendingStatus(id, 'rejected', reason);
        if (!rejected) return c.json({ error: 'این پرداخت قبلا بررسی شده' }, 400);

        // Notify user via Telegram
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

dashboard.delete('/payments/:id', async (c) => {
    try {
        const id = Number(c.req.param('id'));
        Payment.use(c.env.DB);
        await Payment.delete(String(id));
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در حذف' }, 500);
    }
});

dashboard.get('/payments/receipt/:fileId', async (c) => {
    try {
        const fileId = c.req.param('fileId');
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.json({ error: 'توکن تنظیم نشده' }, 400);

        const api = new Api(token);
        const file = await api.getFile(fileId);

        const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
        const imageRes = await fetch(fileUrl);

        if (!imageRes.ok) {
            return c.json({ error: 'خطا در دریافت عکس' }, 500);
        }

        const contentType = imageRes.headers.get('content-type') || 'image/jpeg';
        const imageBody = await imageRes.arrayBuffer();

        return new Response(imageBody, {
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت رسید' }, 500);
    }
});

// --- Dashboard Summary ---

dashboard.get('/summary', async (c) => {
    try {
        // User stats
        TelegramUser.use(c.env.DB);
        const userStats = await TelegramUser.getStats();

        // Payment stats
        Payment.use(c.env.DB);
        const paymentStats = await Payment.getStats();

        // Bot status
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        const botInfoStr = await Setting.get('telegram_bot_info');
        const botInfo = botInfoStr ? JSON.parse(botInfoStr) : null;

        // Bot channels count
        BotChannel.use(c.env.DB);
        const channels = await BotChannel.all();
        const mandatoryChannels = channels.filter((ch: any) => ch.is_mandatory === 1);

        // Bot helps count
        BotHelp.use(c.env.DB);
        const helps = await BotHelp.all();

        // AI usage today
        AiUsageLog.use(c.env.DB);
        const adminTodayUsage = await AiUsageLog.getTodayUsage('admin');
        const userTodayUsage = await AiUsageLog.getTodayUsage('user');

        return c.json({
            users: userStats,
            payments: paymentStats,
            bot: {
                hasToken: !!token,
                botInfo,
                totalChannels: channels.length,
                mandatoryChannels: mandatoryChannels.length,
                totalHelps: helps.length,
            },
            ai: {
                adminTodayTokens: adminTodayUsage.totalTokens,
                adminTodayRequests: adminTodayUsage.totalRequests,
                userTodayTokens: userTodayUsage.totalTokens,
                userTodayRequests: userTodayUsage.totalRequests,
            },
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت خلاصه داشبورد' }, 500);
    }
});

dashboard.get('/recent-activity', async (c) => {
    try {
        TelegramUser.use(c.env.DB);
        const recentUsers = await TelegramUser.getRecent(5);

        Payment.use(c.env.DB);
        const recentPayments = await Payment.getRecent(5);

        TelegramUserSession.use(c.env.DB);
        const activeSessions = await TelegramUserSession.getActiveCount();

        const blockedUsers = await TelegramUser.getBlockedCount();

        return c.json({
            recentUsers,
            recentPayments,
            activeSessions,
            blockedUsers,
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در دریافت فعالیت‌های اخیر' }, 500);
    }
});

// --- Export / Import ---

const EXPORTABLE_TABLES = [
    'categories', 'services', 'api_providers', 'orders',
    'payment_methods', 'payments', 'telegram_users', 'telegram_user_sessions',
    'bot_channels', 'telegram_bot_helps', 'settings', 'ai_settings',
];

dashboard.get('/export/tables', (c) => {
    return c.json(EXPORTABLE_TABLES);
});

dashboard.get('/export/:table', async (c) => {
    try {
        const table = c.req.param('table');
        if (!EXPORTABLE_TABLES.includes(table)) {
            return c.json({ error: 'جدول مجاز نیست' }, 400);
        }
        const { results } = await c.env.DB.prepare(`SELECT * FROM ${table}`).all();
        return c.json({ ok: true, table, count: results.length, data: results });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در خروجی گرفتن' }, 500);
    }
});

dashboard.post('/import/:table', async (c) => {
    try {
        const table = c.req.param('table');
        if (!EXPORTABLE_TABLES.includes(table)) {
            return c.json({ error: 'جدول مجاز نیست' }, 400);
        }

        const { data, mode = 'insert' } = await c.req.json<{ data: any[]; mode?: 'insert' | 'replace' }>();

        if (!Array.isArray(data) || data.length === 0) {
            return c.json({ error: 'داده‌ای ارسال نشد' }, 400);
        }

        if (mode === 'replace') {
            await c.env.DB.prepare(`DELETE FROM ${table}`).run();
        }

        let imported = 0;
        let errors = 0;
        const errorMessages: string[] = [];

        for (const row of data) {
            try {
                const columns = Object.keys(row);
                // Validate column names to prevent SQL injection
                const safeColumnPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
                const unsafeColumns = columns.filter(col => !safeColumnPattern.test(col));
                if (unsafeColumns.length > 0) {
                    errors++;
                    errorMessages.push(`ستون‌های نامعتبر: ${unsafeColumns.join(', ')}`);
                    continue;
                }
                const placeholders = columns.map(() => '?').join(', ');
                await c.env.DB.prepare(
                    `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
                ).bind(...Object.values(row)).run();
                imported++;
            } catch (e: any) {
                errors++;
                errorMessages.push(`ردیف ${imported + errors}: ${e.message}`);
            }
        }

        return c.json({
            ok: true,
            table,
            imported,
            errors,
            errorMessages: errorMessages.slice(0, 10),
        });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطا در وارد کردن' }, 500);
    }
});

export default dashboard;
