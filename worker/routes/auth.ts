import { Hono } from 'hono';
import { setCookie, deleteCookie, getCookie } from 'hono/cookie';
import { User } from '../db/User';
import { Session } from '../db/Session';
import { Setting } from '../db/Setting';
import { hashPassword, verifyPassword } from '../hash';
import type { Bindings } from '../types';

const auth = new Hono<{ Bindings: Bindings }>();

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const LOGIN_RATE_LIMIT = 5; // max attempts
const LOGIN_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const LOGIN_BLOCK_DURATION = 30 * 60 * 1000; // 30 minutes block

function isLoginBlocked(email: string): boolean {
    const record = loginAttempts.get(email);
    if (!record) return false;
    if (record.blockedUntil > 0 && Date.now() > record.blockedUntil) {
        loginAttempts.delete(email);
        return false;
    }
    return record.count >= LOGIN_RATE_LIMIT;
}

function recordLoginAttempt(email: string): void {
    const record = loginAttempts.get(email) || { count: 0, blockedUntil: 0 };
    record.count++;
    if (record.count >= LOGIN_RATE_LIMIT) {
        record.blockedUntil = Date.now() + LOGIN_BLOCK_DURATION;
    }
    loginAttempts.set(email, record);
}

function resetLoginAttempts(email: string): void {
    loginAttempts.delete(email);
}

auth.post('/signup', async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password || password.length < 8) {
            return c.json({ error: 'ایمیل و رمز (حداقل ۸ کاراکتر) الزامی است' }, 400);
        }

        Setting.use(c.env.DB);
        const regDisabled = await Setting.get('registration_disabled');
        if (regDisabled === 'true') {
            return c.json({ error: 'ثبت نام غیرفعال است' }, 403);
        }

        User.use(c.env.DB);
        Session.use(c.env.DB);

        if (await User.findBy('email', email)) {
            return c.json({ error: 'این ایمیل قبلا ثبت شده' }, 400);
        }

        const userId = crypto.randomUUID();
        await User.create({
            id: userId,
            email,
            password_hash: await hashPassword(password),
            role: 'admin',
        });

        const sessionId = crypto.randomUUID();
        await Session.create({
            id: sessionId,
            user_id: userId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        setCookie(c, 'session', sessionId, {
            httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: 60 * 60 * 24 * 7,
        });
        return c.json({ ok: true });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطای سرور' }, 500);
    }
});

auth.post('/login', async (c) => {
    try {
        const { email, password } = await c.req.json();
        if (!email || !password) {
            return c.json({ error: 'ایمیل و رمز الزامی است' }, 400);
        }

        // Rate limiting
        if (isLoginBlocked(email)) {
            return c.json({ error: 'تلاش‌های زیادی انجام شد. لطفاً ۳۰ دقیقه دیگر تلاش کنید.' }, 429);
        }

        User.use(c.env.DB);
        Session.use(c.env.DB);

        const user = await User.findBy<{ id: string; password_hash: string; role: string }>('email', email);
        if (!user || !(await verifyPassword(password, user.password_hash))) {
            recordLoginAttempt(email);
            return c.json({ error: 'ایمیل یا رمز اشتباه است' }, 401);
        }

        resetLoginAttempts(email);

        const sessionId = crypto.randomUUID();
        await Session.create({
            id: sessionId,
            user_id: user.id,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

        setCookie(c, 'session', sessionId, {
            httpOnly: true, secure: true, sameSite: 'Strict', path: '/', maxAge: 60 * 60 * 24 * 7,
        });
        return c.json({ ok: true, role: user.role });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطای سرور' }, 500);
    }
});

auth.post('/seed-admin', async (c) => {
    try {
        const { email, password, secret } = await c.req.json<{ email: string; password: string; secret: string }>();

        // Require a secret key to prevent unauthorized admin creation
        const expectedSecret = c.env.SEED_ADMIN_SECRET;
        if (!expectedSecret || secret !== expectedSecret) {
            return c.json({ error: 'کلید مجوز نامعتبر است' }, 403);
        }

        if (!email || !password || password.length < 8) {
            return c.json({ error: 'ایمیل و رمز (حداقل ۸ کاراکتر) الزامی است' }, 400);
        }

        User.use(c.env.DB);

        const existing = await User.findBy('email', email);
        if (existing) {
            return c.json({ error: 'این ایمیل قبلا ثبت شده' }, 400);
        }

        await User.create({
            id: crypto.randomUUID(),
            email,
            password_hash: await hashPassword(password),
            role: 'admin',
        });

        return c.json({ ok: true, message: 'Admin user created' });
    } catch (e: any) {
        return c.json({ error: e?.message || 'خطای سرور' }, 500);
    }
});

auth.post('/logout', async (c) => {
    const sessionId = getCookie(c, 'session');
    if (sessionId) {
        Session.use(c.env.DB);
        await Session.delete(sessionId);
    }
    deleteCookie(c, 'session', { path: '/' });
    return c.json({ ok: true });
});

export default auth;