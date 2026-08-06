import { Hono } from 'hono';
import {
    verifyWebhookSignature,
    healthCheck,
    CRYPTO_GATEWAY_DEFAULT_BASE,
    type GatewayWebhookPayload,
} from '../api/CryptoGateway';
import { applyWebhookEvent } from '../services/cryptoPayment';
import type { Bindings } from '../types';

const cryptoGateway = new Hono<{ Bindings: Bindings }>();

/**
 * Merchant webhook from Crypto Payment Gateway.
 * Register this URL in gateway /admin/webhooks:
 *   https://YOUR_WORKER.workers.dev/api/crypto-gateway/webhook
 * Events: payment.created | payment.confirmed | payment.expired | payment.failed
 * Header: X-Signature = HMAC-SHA256(rawBody, CRYPTO_GATEWAY_WEBHOOK_SECRET) hex
 */
cryptoGateway.post('/webhook', async (c) => {
    const secret = c.env.CRYPTO_GATEWAY_WEBHOOK_SECRET;
    if (!secret?.trim()) {
        console.error('CRYPTO_GATEWAY_WEBHOOK_SECRET not configured');
        return c.json({ error: 'webhook secret not configured' }, 503);
    }

    const rawBody = await c.req.text();
    const signature = c.req.header('X-Signature');
    const valid = await verifyWebhookSignature(secret, rawBody, signature);
    if (!valid) {
        return c.json({ error: 'invalid signature' }, 401);
    }

    let payload: GatewayWebhookPayload;
    try {
        payload = JSON.parse(rawBody) as GatewayWebhookPayload;
    } catch {
        return c.json({ error: 'invalid json' }, 400);
    }

    if (!payload?.event || !payload?.payment?.id) {
        return c.json({ error: 'invalid payload' }, 400);
    }

    try {
        const result = await applyWebhookEvent(c.env.DB, c.env, payload);
        return c.json({ ok: result.ok, reason: result.reason });
    } catch (e: any) {
        console.error('Crypto webhook handler error:', e?.message);
        return c.json({ error: e?.message || 'handler error' }, 500);
    }
});

/** Optional public proxy of gateway /health (no secrets). */
cryptoGateway.get('/health', async (c) => {
    const base = c.env.CRYPTO_GATEWAY_BASE_URL || CRYPTO_GATEWAY_DEFAULT_BASE;
    const result = await healthCheck(base);
    return c.json(result, result.ok ? 200 : 502);
});

export default cryptoGateway;
