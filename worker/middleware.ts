import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { Session } from './db/Session';

/** Length-independent, constant-time string comparison via SHA-256 digests. */
async function secureEqual(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const [aDigest, bDigest] = await Promise.all([
        crypto.subtle.digest('SHA-256', encoder.encode(a)),
        crypto.subtle.digest('SHA-256', encoder.encode(b)),
    ]);
    const aBytes = new Uint8Array(aDigest);
    const bBytes = new Uint8Array(bDigest);
    let diff = 0;
    for (let i = 0; i < aBytes.length; i++) {
        diff |= aBytes[i] ^ bBytes[i];
    }
    return diff === 0;
}

export async function requireAuth(c: Context, next: Next) {
    const authorization = c.req.header('Authorization');
    if (authorization?.startsWith('Bearer ')) {
        const token = authorization.slice('Bearer '.length).trim();
        const expected = c.env.ADMIN_API_TOKEN;
        // Fail closed when the secret is not configured
        if (!expected || !token || !(await secureEqual(token, expected))) {
            return c.json({ error: 'توکن ایجنت نامعتبر است' }, 401);
        }
        c.set('user', { id: 'agent', email: 'agent@local', role: 'admin' });
        await next();
        return;
    }

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
