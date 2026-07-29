import { message } from 'antd';

export class BaseApi {
    protected baseUrl: string;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const res = await fetch(`${this.baseUrl}${path}`, {
            credentials: 'include',
            ...options,
        });
        if (!res.ok) {
            // Try to parse error response as JSON, fallback to status text
            try {
                const errData = await res.json();
                throw new Error(errData.error || `خطای سرور (${res.status})`);
            } catch (e) {
                if (e instanceof Error && e.message.startsWith('خطای سرور')) throw e;
                throw new Error(`خطای سرور (${res.status})`);
            }
        }
        return res.json();
    }

    protected async get<T>(path: string): Promise<T> {
        return this.request<T>(path);
    }

    protected async post<T>(path: string, data?: any): Promise<T> {
        return this.request<T>(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    protected async put<T>(path: string, data?: any): Promise<T> {
        return this.request<T>(path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: data ? JSON.stringify(data) : undefined,
        });
    }

    protected async delete<T>(path: string): Promise<T> {
        return this.request<T>(path, { method: 'DELETE' });
    }

    protected handleError(error: any, fallbackMsg: string) {
        message.error(error?.message || fallbackMsg);
    }

    protected async handleCrud(
        action: () => Promise<any>,
        successMsg: string,
        errorMsg: string,
        onSuccess?: () => void
    ) {
        try {
            const data = await action();
            if (data.ok) {
                message.success(successMsg);
                onSuccess?.();
            } else {
                message.error(data.error || errorMsg);
            }
        } catch {
            message.error(errorMsg);
        }
    }
}