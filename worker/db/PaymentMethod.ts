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
}
