export type Bindings = {
    DB: D1Database;
    AI: Ai;
    SEED_ADMIN_SECRET?: string;
    /** Bearer API key for crypto-gateway (cg_...) — set via wrangler secret */
    CRYPTO_GATEWAY_API_KEY?: string;
    /** HMAC secret for verifying outgoing gateway webhooks — set via wrangler secret */
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
