import { BaseApi } from './base';

class SmmApi extends BaseApi {
    constructor() {
        super('/api/smm');
    }

    // API Providers
    async getApiProviders() {
        return this.get<any[]>('/api-providers');
    }

    async createApiProvider(data: { name: string; api_url: string; api_key: string }) {
        return this.post<any>('/api-providers', data);
    }

    async updateApiProvider(id: number, data: any) {
        return this.put<any>(`/api-providers/${id}`, data);
    }

    async deleteApiProvider(id: number) {
        return this.delete<any>(`/api-providers/${id}`);
    }

    async toggleApiProvider(id: number, isActive: boolean) {
        return this.put<any>(`/api-providers/${id}/toggle`, { is_active: isActive });
    }

    async syncApiProvider(id: number) {
        return this.post<any>(`/api-providers/${id}/sync`);
    }

    async syncAllApiProviders() {
        return this.post<any>('/api-providers/sync-all');
    }

    async getApiProviderStats() {
        return this.get<any>('/api-providers/stats');
    }

    // Categories
    async getCategories() {
        return this.get<any[]>('/categories');
    }

    async createCategory(data: { name: string; sort_order?: number }) {
        return this.post<any>('/categories', data);
    }

    async updateCategory(id: number, data: any) {
        return this.put<any>(`/categories/${id}`, data);
    }

    async deleteCategory(id: number) {
        return this.delete<any>(`/categories/${id}`);
    }

    async toggleCategory(id: number, isActive: boolean) {
        return this.put<any>(`/categories/${id}/toggle`, { is_active: isActive });
    }

    async getCategoryStats() {
        return this.get<any>('/categories/stats');
    }

    // Services
    async getServices() {
        return this.get<any[]>('/services');
    }

    async createService(data: any) {
        return this.post<any>('/services', data);
    }

    async updateService(id: number, data: any) {
        return this.put<any>(`/services/${id}`, data);
    }

    async deleteService(id: number) {
        return this.delete<any>(`/services/${id}`);
    }

    async toggleService(id: number, isActive: boolean) {
        return this.put<any>(`/services/${id}/toggle`, { is_active: isActive });
    }

    async syncServices() {
        return this.post<any>('/services/sync');
    }

    async addServiceFromApi(data: { api_provider_id: number; service_id: number }) {
        return this.post<any>('/services/add-from-api', data);
    }

    async getServiceStats() {
        return this.get<any>('/services/stats');
    }

    // Orders
    async getOrders(status?: string) {
        const url = status ? `/orders?status=${status}` : '/orders';
        return this.get<any[]>(url);
    }

    async createOrder(data: any) {
        return this.post<any>('/orders', data);
    }

    async updateOrderStatus(id: number, status: string) {
        return this.put<any>(`/orders/${id}/status`, { status });
    }

    async cancelOrder(id: number) {
        return this.put<any>(`/orders/${id}/cancel`);
    }

    async checkOrderStatuses() {
        return this.post<any>('/orders/check-status');
    }

    async getOrderStats() {
        return this.get<any>('/orders/stats');
    }

    async getDailyOrderStats(days: number) {
        return this.get<any[]>(`/orders/stats/daily?days=${days}`);
    }

    async getRevenueStats() {
        return this.get<any>('/orders/stats/revenue');
    }

    async getUserOrders(chatId: number) {
        return this.get<any[]>(`/orders/user/${chatId}`);
    }
}

export const smmApi = new SmmApi();