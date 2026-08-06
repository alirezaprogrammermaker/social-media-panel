import { BaseApi } from './base';

class DashboardApi extends BaseApi {
    constructor() {
        super('/api/dashboard');
    }

    // Settings
    async getSettings() {
        return this.get<any>('/settings');
    }

    async updateSettings(endpoint: string, data: Record<string, any>) {
        return this.put<any>(`/settings/${endpoint}`, data);
    }

    async updateToken(token: string) {
        return this.put<any>('/settings/token', { token });
    }

    async setWebhook(url: string) {
        return this.post<any>('/settings/webhook/set', { url });
    }

    async deleteWebhook() {
        return this.post<any>('/settings/webhook/delete');
    }

    async getWebhookInfo() {
        return this.get<any>('/settings/webhook/info');
    }

    // Telegram Users
    async getTelegramUsers() {
        return this.get<any[]>('/telegram-users');
    }

    async deleteTelegramUser(chatId: number) {
        return this.delete<any>(`/telegram-users/${chatId}`);
    }

    async updateTelegramUserRole(chatId: number, role: string) {
        return this.put<any>(`/telegram-users/${chatId}/role`, { role });
    }

    async blockTelegramUser(chatId: number, reason?: string, durationMinutes?: number) {
        return this.put<any>(`/telegram-users/${chatId}/block`, { reason, duration_minutes: durationMinutes });
    }

    async unblockTelegramUser(chatId: number) {
        return this.put<any>(`/telegram-users/${chatId}/unblock`);
    }

    async sendTelegramMessage(chatId: number, text: string, parseMode?: string) {
        return this.post<any>(`/telegram-users/${chatId}/send-message`, { text, parse_mode: parseMode });
    }

    // Telegram Sessions
    async getTelegramSessions(status?: string) {
        const url = status ? `/telegram-sessions?status=${status}` : '/telegram-sessions';
        return this.get<any[]>(url);
    }

    async deleteTelegramSession(id: number) {
        return this.delete<any>(`/telegram-sessions/${id}`);
    }

    async cancelTelegramSession(id: number) {
        return this.put<any>(`/telegram-sessions/${id}/cancel`);
    }

    // Payment Methods
    async getPaymentMethods() {
        return this.get<any[]>('/payment-methods');
    }

    async createPaymentMethod(data: any) {
        return this.post<any>('/payment-methods', data);
    }

    async updatePaymentMethod(id: number, data: any) {
        return this.put<any>(`/payment-methods/${id}`, data);
    }

    async deletePaymentMethod(id: number) {
        return this.delete<any>(`/payment-methods/${id}`);
    }

    async togglePaymentMethod(id: number, isActive: boolean) {
        return this.put<any>(`/payment-methods/${id}/toggle`, { is_active: isActive });
    }

    // Payments
    async getPayments(status?: string, type?: string) {
        const params = new URLSearchParams();
        if (status) params.set('status', status);
        if (type) params.set('type', type);
        const qs = params.toString();
        const url = qs ? `/payments?${qs}` : '/payments';
        return this.get<any[]>(url);
    }

    async getPaymentStats() {
        return this.get<any>('/payments/stats');
    }

    async approvePayment(id: number) {
        return this.put<any>(`/payments/${id}/approve`);
    }

    async rejectPayment(id: number, reason?: string) {
        return this.put<any>(`/payments/${id}/reject`, { reason });
    }

    async deletePayment(id: number) {
        return this.delete<any>(`/payments/${id}`);
    }

    async refreshCryptoPayment(id: number) {
        return this.post<any>(`/payments/${id}/refresh-crypto`, {});
    }

    async getCryptoGatewayHealth() {
        return this.get<any>('/crypto-gateway/health');
    }

    // Bot Channels
    async getBotChannels() {
        return this.get<any[]>('/bot-channels');
    }

    async createBotChannel(channelUsername: string) {
        return this.post<any>('/bot-channels', { channel_username: channelUsername });
    }

    async updateBotChannel(id: number, data: any) {
        return this.put<any>(`/bot-channels/${id}`, data);
    }

    async deleteBotChannel(id: number) {
        return this.delete<any>(`/bot-channels/${id}`);
    }

    // Bot Helps
    async getBotHelps() {
        return this.get<any[]>('/bot-helps');
    }

    async createBotHelp(data: any) {
        return this.post<any>('/bot-helps', data);
    }

    async updateBotHelp(id: number, data: any) {
        return this.put<any>(`/bot-helps/${id}`, data);
    }

    async deleteBotHelp(id: number) {
        return this.delete<any>(`/bot-helps/${id}`);
    }

    // Dashboard Summary
    async getSummary() {
        return this.get<any>('/summary');
    }

    async getRecentActivity() {
        return this.get<any>('/recent-activity');
    }

    async getStats() {
        return this.get<any>('/stats');
    }

    async getDailyStats(days: number) {
        return this.get<any[]>(`/stats/daily?days=${days}`);
    }

    // Export / Import
    async getExportableTables() {
        return this.get<string[]>('/export/tables');
    }

    async exportTable(table: string) {
        return this.get<any>(`/export/${table}`);
    }

    async importTable(table: string, data: any[], mode: 'insert' | 'replace' = 'insert') {
        return this.post<any>(`/import/${table}`, { data, mode });
    }
}

export const dashboardApi = new DashboardApi();