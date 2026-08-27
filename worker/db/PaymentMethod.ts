import { Model } from './Model';
import { CRYPTO_METHOD_CARD } from '../api/CryptoGateway';

export interface PaymentMethodRow {
    id: number;
    name: string;
    card_number: string;
    card_holder: string;
    min_amount: number;
    max_amount: number;
    is_active: number;
    created_at: string;
    updated_at: string;
}

export class PaymentMethod extends Model<PaymentMethodRow> {
    protected static table = 'payment_methods';

    static async getActiveMethods(this: any): Promise<PaymentMethodRow[]> {
        return this.raw(`SELECT * FROM ${this.table} WHERE is_active = 1 ORDER BY created_at DESC`);
    }

    static async findCryptoMethod(this: any): Promise<PaymentMethodRow | null> {
        return this.rawFirst(
            `SELECT * FROM ${this.table} WHERE card_number = ? LIMIT 1`,
            CRYPTO_METHOD_CARD,
        );
    }

    static isCryptoMethod(method: { card_number?: string | null } | null | undefined): boolean {
        return method?.card_number === CRYPTO_METHOD_CARD;
    }

    /** Create the sentinel CRYPTO row if missing. Does not change is_active of an existing row. */
    static async ensureCryptoMethod(this: any): Promise<PaymentMethodRow> {
        const existing = await this.findCryptoMethod();
        if (existing) return existing;

        await this.create({
            name: '💎 پرداخت کریپتو',
            card_number: CRYPTO_METHOD_CARD,
            card_holder: 'Crypto Gateway',
            min_amount: 10000,
            max_amount: 500000000,
            is_active: 1,
        });

        const created = await this.findCryptoMethod();
        if (!created) {
            throw new Error('ایجاد روش پرداخت کریپتو ناموفق بود');
        }
        return created;
    }

    /**
     * When gateway API key is saved: ensure CRYPTO method exists and is active
     * so the Telegram bot can list it immediately.
     */
    static async activateCryptoMethodForGateway(this: any): Promise<PaymentMethodRow> {
        const method = await this.ensureCryptoMethod();
        if (!method.is_active) {
            await this.update(String(method.id), { is_active: 1 });
            return { ...method, is_active: 1 };
        }
        return method;
    }
}
