import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { Session } from './db/Session';

export async function requireAuth(c: Context, next: Next) {
    const sessionId = getCookie(c, 'session');
    if (!sessionId) return c.json({ error: 'وارد نشده‌اید' }, 401);

    Session.use(c.env.DB);
    const session = await Session.findValid(sessionId);
    if (!session) return c.json({ error: 'نشست منقضی شده' }, 401);

    c.set('user', { id: session.user_id, email: session.email, role: session.role });
    await next();
}

export async function requireAdmin(c: Context, next: Next) {
    const user = c.get('user');
    if (!user || user.role !== 'admin') {
        return c.json({ error: 'دسترسی غیرمجاز' }, 403);
    }
    await next();
}