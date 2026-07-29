import { BaseApi } from './base';

class AiApi extends BaseApi {
    constructor() {
        super('/api/ai');
    }

    async getSettings() {
        return this.get<any>('/settings');
    }

    async updateSettings(data: { admin?: Record<string, string>; user?: Record<string, string> }) {
        return this.put<any>('/settings', data);
    }

    async getUsage() {
        return this.get<any>('/usage');
    }

    async getTodayUsage(role: string) {
        return this.get<any>(`/usage/today?role=${role}`);
    }

    async chat(message: string, role?: string) {
        return this.post<any>('/chat', { message, role });
    }

    async getDbSchema(role?: string) {
        return this.get<any>(`/db/schema?role=${role || 'admin'}`);
    }

    async getDbSummary(role?: string) {
        return this.get<any>(`/db/summary?role=${role || 'admin'}`);
    }

    async queryDb(data: any) {
        return this.post<any>('/db/query', data);
    }
}

export const aiApi = new AiApi();