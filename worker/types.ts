export type Bindings = {
    DB: D1Database;
    AI: Ai;
    SEED_ADMIN_SECRET?: string;
    /** Bearer token for the Admin Agent API (/api/agent). Set via `wrangler secret put ADMIN_API_TOKEN`. */
    ADMIN_API_TOKEN?: string;
    /** Optional env fallback for crypto-gateway API key (prefer Settings UI) */
    CRYPTO_GATEWAY_API_KEY?: string;
    /** Optional env fallback for webhook HMAC secret (prefer Settings UI) */
    CRYPTO_GATEWAY_WEBHOOK_SECRET?: string;
    /** Gateway base URL (no trailing slash). Defaults to live crypto-gateway worker. */
    CRYPTO_GATEWAY_BASE_URL?: string;
};

export type Variables = {
    user: {
        id: string;
        email: string;
        role: string;
    };
};
