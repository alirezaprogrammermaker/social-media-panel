import { Model } from './Model';

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
}
