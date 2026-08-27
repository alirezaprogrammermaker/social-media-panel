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

/** Combined shape used by handlers (step + payload), mirrors the old Map values. */
export type FlowState<T extends Record<string, any> = Record<string, any>> = T & { step: string };

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

function splitState<T extends Record<string, any>>(state: FlowState<T>): { step: string; data: T } {
    const { step, ...rest } = state;
    return { step, data: rest as unknown as T };
}

/** Active session for a chat + flow (durable across Worker isolates via D1). */
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

/** Handler-friendly view: `{ step, ...data }`. */
export async function getFlowState<T extends Record<string, any>>(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string
): Promise<FlowState<T> | null> {
    const session = await getFlowSession<T>(db, chatId, flow);
    if (!session) return null;
    return { step: session.step, ...session.data };
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

/** Replace full flow state (step + fields), same semantics as Map.set. */
export async function setFlowState<T extends Record<string, any>>(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string,
    state: FlowState<T>
): Promise<FlowSession<T> | null> {
    const { step, data } = splitState(state);
    return setFlowSession(db, chatId, flow, step, data);
}

/** Patch current flow state (keeps unspecified fields). */
export async function patchFlowState<T extends Record<string, any>>(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string,
    patch: Partial<FlowState<T>>
): Promise<FlowSession<T> | null> {
    const current = (await getFlowState<T>(db, chatId, flow)) || ({ step: 'unknown' } as FlowState<T>);
    const next = { ...current, ...patch } as FlowState<T>;
    if (!next.step || next.step === 'unknown') return null;
    return setFlowState(db, chatId, flow, next);
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

/** End every active bot flow for this chat. */
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

/**
 * Start a UI flow exclusively: closes other bot flows, then opens this one.
 * Prevents BACK/pagination collisions across menus.
 */
export async function startExclusiveFlow<T extends Record<string, any>>(
    db: D1Database,
    chatId: number,
    flow: BotFlow | string,
    state: FlowState<T>
): Promise<FlowSession<T> | null> {
    await clearAllActiveFlows(db, chatId);
    return setFlowState(db, chatId, flow, state);
}

/** Load all active flows for a chat in one query (for router). */
export async function getActiveFlowMap(
    db: D1Database,
    chatId: number
): Promise<Map<string, FlowSession>> {
    TelegramUserSession.use(db);
    const rows = await TelegramUserSession.raw<{
        id: number;
        telegram_user_id: number;
        flow: string;
        step: string;
        data: string;
    }>(
        `SELECT s.id, s.telegram_user_id, s.flow, s.step, s.data
         FROM telegram_user_sessions s
         INNER JOIN telegram_users u ON u.id = s.telegram_user_id
         WHERE u.chat_id = ? AND s.status = 'active'
         ORDER BY s.id DESC`,
        chatId
    );

    const map = new Map<string, FlowSession>();
    for (const row of rows) {
        // First row per flow wins (newest due to ORDER BY id DESC)
        if (map.has(row.flow)) continue;
        map.set(row.flow, {
            id: row.id,
            telegramUserId: row.telegram_user_id,
            flow: row.flow,
            step: row.step,
            data: parseData(row.data),
        });
    }
    return map;
}

export function flowStateFromSession<T extends Record<string, any>>(
    session: FlowSession<T> | undefined | null
): FlowState<T> | null {
    if (!session) return null;
    return { step: session.step, ...session.data };
}
