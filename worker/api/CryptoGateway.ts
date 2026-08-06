/**
 * Public Crypto Payment Gateway client.
 * NEVER handles mnemonic / private keys — only merchant API (Bearer cg_...).
 */

export const CRYPTO_GATEWAY_DEFAULT_BASE =
    'https://crypto-gateway.social-panel.workers.dev';

/** Supported networks for the Telegram bot (excludes sol). */
export const CRYPTO_NETWORKS = [
    { id: 'usdt-trc20', label: 'USDT (TRC20)' },
    { id: 'btc', label: 'Bitcoin (BTC)' },
    { id: 'eth', label: 'Ethereum (ETH)' },
    { id: 'trx', label: 'TRON (TRX)' },
    { id: 'ltc', label: 'Litecoin (LTC)' },
    { id: 'bnb', label: 'BNB (BSC)' },
    { id: 'usdt-erc20', label: 'USDT (ERC20)' },
] as const;

export type CryptoNetworkId = (typeof CRYPTO_NETWORKS)[number]['id'];

export const DEFAULT_CRYPTO_NETWORK: CryptoNetworkId = 'usdt-trc20';

/** Sentinel card_number for the crypto payment method row. */
export const CRYPTO_METHOD_CARD = 'CRYPTO';

export type GatewayPaymentStatus =
    | 'pending'
    | 'confirming'
    | 'confirmed'
    | 'expired'
    | 'failed'
    | 'refunded';

export interface CreateGatewayPaymentInput {
    amount: number;
    network_id: string;
    title?: string;
    fiat_currency?: string;
    callback_url?: string;
    metadata?: Record<string, unknown>;
    expiration_minutes?: number;
}

export interface GatewayPayment {
    id: string;
    amount: number;
    fiat_currency: string;
    network_id: string;
    crypto_amount: number;
    crypto_amount_formatted?: string;
    exchange_rate?: number;
    wallet_address: string;
    status: GatewayPaymentStatus;
    expires_at: string;
    checkout_url: string;
    tx_hash?: string | null;
    confirmations?: number;
    fee_info?: { fee: number; estimated_time: string };
    network?: {
        id: string;
        name: string;
        currency: string;
        chain: string;
    };
}

export interface GatewayWebhookPayload {
    event: string;
    payment: {
        id: string;
        amount: number;
        fiat_currency: string;
        crypto_amount: number | null;
        currency: string;
        status: GatewayPaymentStatus;
        tx_hash: string | null;
        confirmations: number;
    };
}

export class CryptoGatewayError extends Error {
    constructor(
        message: string,
        public status?: number,
        public body?: unknown,
    ) {
        super(message);
        this.name = 'CryptoGatewayError';
    }
}

export type CryptoGatewayConfig = {
    apiKey: string;
    baseUrl?: string;
};

function resolveBaseUrl(baseUrl?: string): string {
    const raw = (baseUrl || CRYPTO_GATEWAY_DEFAULT_BASE).replace(/\/$/, '');
    return raw;
}

function apiBase(baseUrl?: string): string {
    return `${resolveBaseUrl(baseUrl)}/api/v1`;
}

async function parseError(res: Response): Promise<string> {
    try {
        const data = (await res.json()) as { error?: string; message?: string };
        return data.error || data.message || res.statusText || `HTTP ${res.status}`;
    } catch {
        return res.statusText || `HTTP ${res.status}`;
    }
}

function requireApiKey(apiKey: string | undefined): string {
    if (!apiKey?.trim()) {
        throw new CryptoGatewayError(
            'CRYPTO_GATEWAY_API_KEY تنظیم نشده است. کلید API درگاه را به عنوان secret تنظیم کنید.',
        );
    }
    return apiKey.trim();
}

export async function createPayment(
    config: CryptoGatewayConfig,
    input: CreateGatewayPaymentInput,
): Promise<GatewayPayment> {
    const apiKey = requireApiKey(config.apiKey);
    const res = await fetch(`${apiBase(config.baseUrl)}/payments`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount: input.amount,
            network_id: input.network_id,
            title: input.title,
            fiat_currency: input.fiat_currency || 'USD',
            callback_url: input.callback_url,
            metadata: input.metadata,
            expiration_minutes: input.expiration_minutes ?? 30,
        }),
    });

    if (!res.ok) {
        throw new CryptoGatewayError(await parseError(res), res.status);
    }

    return (await res.json()) as GatewayPayment;
}

export async function getPayment(
    config: CryptoGatewayConfig,
    paymentId: string,
): Promise<GatewayPayment> {
    const apiKey = requireApiKey(config.apiKey);
    const res = await fetch(`${apiBase(config.baseUrl)}/payments/${encodeURIComponent(paymentId)}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    if (!res.ok) {
        throw new CryptoGatewayError(await parseError(res), res.status);
    }

    return (await res.json()) as GatewayPayment;
}

/** Public health check (no API key required). */
export async function healthCheck(baseUrl?: string): Promise<{ ok: boolean; status: number; body?: unknown }> {
    const res = await fetch(`${resolveBaseUrl(baseUrl)}/health`);
    let body: unknown;
    try {
        body = await res.json();
    } catch {
        body = await res.text().catch(() => null);
    }
    return { ok: res.ok, status: res.status, body };
}

export async function verifyWebhookSignature(
    secret: string,
    rawBody: string,
    signature: string | null | undefined,
): Promise<boolean> {
    if (!secret || !signature) return false;

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
    const expected = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    if (expected.length !== signature.length) return false;
    let mismatch = 0;
    for (let i = 0; i < expected.length; i++) {
        mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return mismatch === 0;
}

export function isCryptoGatewayConfigured(env: {
    CRYPTO_GATEWAY_API_KEY?: string;
}): boolean {
    return !!env.CRYPTO_GATEWAY_API_KEY?.trim();
}

export function gatewayConfigFromEnv(env: {
    CRYPTO_GATEWAY_API_KEY?: string;
    CRYPTO_GATEWAY_BASE_URL?: string;
}): CryptoGatewayConfig {
    return {
        apiKey: requireApiKey(env.CRYPTO_GATEWAY_API_KEY),
        baseUrl: env.CRYPTO_GATEWAY_BASE_URL || CRYPTO_GATEWAY_DEFAULT_BASE,
    };
}

export function networkLabel(networkId: string): string {
    return CRYPTO_NETWORKS.find((n) => n.id === networkId)?.label || networkId;
}
