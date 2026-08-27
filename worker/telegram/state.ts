import { Api } from 'grammy';

const MEMBER_STATUSES = ['member', 'administrator', 'owner', 'creator'];

// Short-lived anti-spam only (safe in-memory; not a multi-step UI flow)
const spamCache = new Map<number, number[]>();
const SPAM_WINDOW = 5000;
const SPAM_LIMIT = 5;

export function isSpamming(userId: number): boolean {
    const now = Date.now();
    const timestamps = spamCache.get(userId) || [];
    const recent = timestamps.filter((t) => now - t < SPAM_WINDOW);
    if (recent.length >= SPAM_LIMIT) {
        return true;
    }
    recent.push(now);
    spamCache.set(userId, recent);

    if (spamCache.size > 10000) {
        for (const [key, ts] of spamCache) {
            const valid = ts.filter((t) => now - t < SPAM_WINDOW);
            if (valid.length === 0) {
                spamCache.delete(key);
            } else {
                spamCache.set(key, valid);
            }
        }
    }

    return false;
}

export async function checkMembership(
    api: Api,
    userId: number,
    channels: { channel_id: number; channel_username: string }[]
): Promise<number[]> {
    const unjoined: number[] = [];

    for (const ch of channels) {
        try {
            const member = await api.getChatMember(`@${ch.channel_username}`, userId);
            if (!MEMBER_STATUSES.includes(member.status)) {
                unjoined.push(ch.channel_id);
            }
        } catch {
            unjoined.push(ch.channel_id);
        }
    }

    return unjoined;
}
