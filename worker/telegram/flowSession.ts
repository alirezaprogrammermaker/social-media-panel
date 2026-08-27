import { TelegramUser } from '../db/TelegramUser';
import { TelegramUserSession } from '../db/TelegramUserSession';
import { nowTehran } from '../utils/date';

/** Canonical bot flow names stored in telegram_user_sessions.flow */
export const BOT_FLOWS = {
    MY_ORDERS: 'my_orders',
    ORDER: 'order',
    PAYMENT: 'payment',
    AI_CHAT: 'ai_chat',
} as const;

export type BotFlow = (typeof BOT_FLOWS)[keyof typeof BOT_FLOWS];

export interface FlowSession<T extends Record<string, any> = Record<string, any>> {
    id: number;
    telegramUserId: number;
    flow: string;
    step: string;
    data: T;
}

async function resolveTelegramUserId(db: D1Database, chatId: number): Promise<number | null> {
    TelegramUser.use(db);
    const user = await TelegramUser.findByChatId(chatId);
    return user?.id ?? null;
}

function parseData<T extends Record<string, any>>(raw: string | null | undefined): T {
    try {
        return JSON.parse(raw || '{}') as T;
    } catch {
        return {} as T;
    }
}

/** Active session for a chat + flow (Durable across Worker isolates via D1). */
export async function getFlowSession<T extends Record<string, any>>(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string
): Promise<FlowSession<T> | null> {
    TelegramUserSession.use(db);
    const row = await TelegramUserSession.rawFirst<{
        id: number;
        telegram_user_id: number;
        flow: string;
        step: string;
        data: string;
    }>(
        `SELECT s.id, s.telegram_user_id, s.flow, s.step, s.data
         FROM telegram_user_sessions s
         INNER JOIN telegram_users u ON u.id = s.telegram_user_id
         WHERE u.chat_id = ? AND s.flow = ? AND s.status = 'active'
         ORDER BY s.id DESC
         LIMIT 1`,
        chatId,
        flow
    );
    if (!row) return null;
    return {
        id: row.id,
        telegramUserId: row.telegram_user_id,
        flow: row.flow,
        step: row.step,
        data: parseData<T>(row.data),
    };
}

/** Create or update the active session for this chat+flow. */
export async function setFlowSession<T extends Record<string, any>>(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string,
    step: string,
    data: T
): Promise<FlowSession<T> | null> {
    const telegramUserId = await resolveTelegramUserId(db, chatId);
    if (!telegramUserId) return null;

    TelegramUserSession.use(db);
    const existing = await getFlowSession<T>(db, chatId, flow);
    const now = nowTehran();
    const payload = JSON.stringify(data ?? {});

    if (existing) {
        await TelegramUserSession.raw(
            `UPDATE telegram_user_sessions
             SET step = ?, data = ?, updated_at = ?, status = 'active'
             WHERE id = ?`,
            step,
            payload,
            now,
            existing.id
        );
        return { ...existing, step, data };
    }

    const created = await TelegramUserSession.create({
        telegram_user_id: telegramUserId,
        flow,
        step,
        data: payload,
        status: 'active',
        created_at: now,
        updated_at: now,
    });

    return {
        id: created.id,
        telegramUserId,
        flow,
        step,
        data,
    };
}

/** Mark active session(s) for this chat+flow as completed. */
export async function clearFlowSession(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string
): Promise<void> {
    TelegramUserSession.use(db);
    const now = nowTehran();
    await TelegramUserSession.raw(
        `UPDATE telegram_user_sessions
         SET status = 'completed', updated_at = ?
         WHERE status = 'active'
           AND flow = ?
           AND telegram_user_id = (
             SELECT id FROM telegram_users WHERE chat_id = ? LIMIT 1
           )`,
        now,
        flow,
        chatId
    );
}

/** End every active bot flow for this chat (e.g. when entering a new exclusive flow). */
export async function clearAllActiveFlows(db: D1Database, chatId: number): Promise<void> {
    TelegramUserSession.use(db);
    const now = nowTehran();
    await TelegramUserSession.raw(
        `UPDATE telegram_user_sessions
         SET status = 'completed', updated_at = ?
         WHERE status = 'active'
           AND telegram_user_id = (
             SELECT id FROM telegram_users WHERE chat_id = ? LIMIT 1
           )`,
        now,
        chatId
    );
}
