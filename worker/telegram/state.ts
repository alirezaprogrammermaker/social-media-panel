import { Api } from 'grammy';

const MEMBER_STATUSES = ['member', 'administrator', 'owner', 'creator'];

// Anti-spam
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

// Payment state
export const paymentState = new Map<number, {
    step: 'method' | 'crypto_network' | 'amount' | 'receipt' | 'crypto_waiting';
    methodId?: number;
    methodName?: string;
    cardNumber?: string;
    cardHolder?: string;
    minAmount?: number;
    maxAmount?: number;
    amount?: number;
    isCrypto?: boolean;
    networkId?: string;
    localPaymentId?: number;
}>();

// AI chat state
export const aiChatState = new Map<number, { step: 'waiting_question' }>();

// My Orders state
export const myOrdersState = new Map<number, { step: 'list' | 'detail'; page: number; selectedOrderId?: number }>();

// Order state
export const orderState = new Map<number, {
    step: 'select_category' | 'select_service' | 'enter_link' | 'enter_quantity';
    categoryId?: number;
    categoryName?: string;
    serviceId?: number;
    serviceName?: string;
    serviceType?: string;
    serviceMin?: number;
    serviceMax?: number;
    link?: string;
    categoryPage?: number;
    servicePage?: number;
}>();

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
