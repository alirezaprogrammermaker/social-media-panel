export interface SmmApiConfig {
    apiUrl: string;
    apiKey: string;
}

export interface SmmService {
    service: number;
    name: string;
    type: string;
    category: string;
    rate: string;
    min: string;
    max: string;
    refill: boolean;
    cancel: boolean;
}

export interface SmmOrderResponse {
    order: number;
    error?: string;
}

export interface SmmOrderStatus {
    charge: string;
    start_count: string;
    status: string;
    remains: string;
    currency: string;
    error?: string;
}

export interface SmmBalance {
    balance: string;
    currency: string;
}

export type SmmOrderStatusType = 'Pending' | 'In progress' | 'Completed' | 'Partial' | 'Processing' | 'Canceled';

export class SmmApiProvider {
    private apiUrl: string;
    private apiKey: string;

    constructor(config: SmmApiConfig) {
        this.apiUrl = config.apiUrl;
        this.apiKey = config.apiKey;
    }

    private async connect(params: Record<string, string | number>): Promise<any> {
        const body = new URLSearchParams();
        body.append('key', this.apiKey);
        for (const [key, value] of Object.entries(params)) {
            body.append(key, String(value));
        }

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return response.json();
    }

    async getServices(): Promise<SmmService[]> {
        return this.connect({ action: 'services' });
    }

    async addOrder(data: {
        service: number;
        link: string;
        quantity?: number;
        runs?: number;
        interval?: number;
        comments?: string;
        usernames?: string;
        hashtags?: string;
        username?: string;
        media?: string;
        country?: string;
        device?: string;
        type_of_traffic?: number;
        google_keyword?: string;
        referring_url?: string;
        groups?: string;
        min?: number;
        max?: number;
        delay?: number;
        expiry?: string;
        old_posts?: number;
    }): Promise<SmmOrderResponse> {
        return this.connect({ action: 'add', ...data });
    }

    async getOrderStatus(orderId: number): Promise<SmmOrderStatus> {
        return this.connect({ action: 'status', order: orderId });
    }

    async getMultiOrderStatus(orderIds: number[]): Promise<Record<string, SmmOrderStatus>> {
        return this.connect({ action: 'status', orders: orderIds.join(',') });
    }

    async refill(orderId: number): Promise<{ refill: number | { error: string } }> {
        return this.connect({ action: 'refill', order: orderId });
    }

    async multiRefill(orderIds: number[]): Promise<{ order: number; refill: number | { error: string } }[]> {
        return this.connect({ action: 'refill', orders: orderIds.join(',') });
    }

    async cancel(orderIds: number[]): Promise<{ order: number; cancel: number | { error: string } }[]> {
        return this.connect({ action: 'cancel', orders: orderIds.join(',') });
    }

    async getBalance(): Promise<SmmBalance> {
        return this.connect({ action: 'balance' });
    }

    static mapApiStatus(apiStatus: string): SmmOrderStatusType {
        const statusMap: Record<string, SmmOrderStatusType> = {
            'Pending': 'Pending',
            'In progress': 'In progress',
            'Completed': 'Completed',
            'Partial': 'Partial',
            'Processing': 'Processing',
            'Canceled': 'Canceled',
            'Cancelled': 'Canceled',
        };
        return statusMap[apiStatus] || 'Pending';
    }
}
