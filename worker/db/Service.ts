import { Model } from './Model';
import type { PaginatedResult } from '../utils/pagination';
import { paginatedResult } from '../utils/pagination';

export interface ServiceData {
    id?: number;
    name: string;
    description?: string;
    category_id: number;
    type?: string;
    rate?: string;
    min?: string;
    max?: string;
    refill?: boolean;
    cancel?: boolean;
    api_provider_id?: number | null;
    api_provider_service_id?: number | null;
    api_provider_service_price?: string | null;
    is_active?: number;
    created_at?: string;
    updated_at?: string;
}

export type ServiceWithCategory = ServiceData & { category_name?: string };

export class Service extends Model<ServiceData> {
    protected static table = 'services';

    static async getActiveServices(): Promise<ServiceData[]> {
        return this.raw(
            `SELECT s.* FROM services s
             INNER JOIN categories c ON s.category_id = c.id
             WHERE s.is_active = 1 AND c.is_active = 1
             ORDER BY c.sort_order, c.name, s.name`
        );
    }

    /** @deprecated Prefer getServicesWithCategoryPaginated for dashboard lists. */
    static async getServicesWithCategory(): Promise<ServiceWithCategory[]> {
        return this.raw(
            `SELECT s.*, c.name as category_name
             FROM services s
             LEFT JOIN categories c ON s.category_id = c.id
             ORDER BY c.sort_order, c.name, s.name`
        );
    }

    static async getServicesWithCategoryPaginated(
        page: number,
        pageSize: number,
        filters?: { q?: string | null }
    ): Promise<PaginatedResult<ServiceWithCategory>> {
        const offset = (page - 1) * pageSize;
        const q = filters?.q?.trim();
        const where: string[] = [];
        const params: any[] = [];

        if (q) {
            where.push('(s.name LIKE ? OR IFNULL(c.name, \'\') LIKE ? OR IFNULL(s.description, \'\') LIKE ?)');
            const like = `%${q}%`;
            params.push(like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const countRow = await this.rawFirst<{ count: number }>(
            `SELECT COUNT(*) as count
             FROM services s
             LEFT JOIN categories c ON s.category_id = c.id
             ${whereSql}`,
            ...params
        );
        const total = countRow?.count ?? 0;
        const data = await this.raw<ServiceWithCategory>(
            `SELECT s.*, c.name as category_name
             FROM services s
             LEFT JOIN categories c ON s.category_id = c.id
             ${whereSql}
             ORDER BY c.sort_order, c.name, s.name
             LIMIT ? OFFSET ?`,
            ...params,
            pageSize,
            offset
        );
        return paginatedResult(data, total, page, pageSize);
    }

    static async findByApiProviderServiceId(providerId: number, serviceId: number): Promise<ServiceData | null> {
        return this.rawFirst(
            'SELECT * FROM services WHERE api_provider_id = ? AND api_provider_service_id = ?',
            providerId,
            serviceId
        );
    }

    static async getServicesByProvider(providerId: number): Promise<ServiceData[]> {
        return this.where('api_provider_id', providerId);
    }

    static async getActiveByCategory(categoryId: number): Promise<ServiceData[]> {
        return this.raw(
            `SELECT s.* FROM services s
             INNER JOIN categories c ON s.category_id = c.id
             WHERE s.category_id = ? AND s.is_active = 1 AND c.is_active = 1`,
            categoryId
        );
    }

    /** Active service whose category is also active — safe for placing a new order. */
    static async findActiveOrderable(serviceId: number): Promise<(ServiceData & { category_name?: string }) | null> {
        return this.rawFirst(
            `SELECT s.*, c.name as category_name
             FROM services s
             INNER JOIN categories c ON s.category_id = c.id
             WHERE s.id = ? AND s.is_active = 1 AND c.is_active = 1
             LIMIT 1`,
            serviceId
        );
    }

    static async findByNameAndCategory(name: string, categoryId: number): Promise<ServiceData | null> {
        // First try exact match
        const exact = await this.rawFirst<ServiceData>(
            'SELECT * FROM services WHERE category_id = ? AND name = ? AND is_active = 1',
            categoryId,
            name
        );
        if (exact) return exact;

        // Try case-insensitive match with trimmed whitespace
        const trimmed = name.trim();
        const caseInsensitive = await this.rawFirst<ServiceData>(
            'SELECT * FROM services WHERE category_id = ? AND TRIM(name) = ? AND is_active = 1',
            categoryId,
            trimmed
        );
        if (caseInsensitive) return caseInsensitive;

        // Try LIKE match for partial matching
        const likeMatch = await this.rawFirst<ServiceData>(
            'SELECT * FROM services WHERE category_id = ? AND name LIKE ? AND is_active = 1',
            categoryId,
            `%${trimmed}%`
        );
        if (likeMatch) return likeMatch;

        // Try finding by name only (ignore category) as last resort
        return this.rawFirst<ServiceData>(
            'SELECT * FROM services WHERE name = ? AND is_active = 1',
            trimmed
        );
    }

    static async toggleActive(id: number, isActive: boolean): Promise<void> {
        await this.raw(
            'UPDATE services SET is_active = ?, updated_at = datetime(\'now\') WHERE id = ?',
            isActive ? 1 : 0,
            id
        );
    }

    static async unlinkByProviderId(providerId: number): Promise<void> {
        await this.raw(
            'UPDATE services SET api_provider_id = NULL, api_provider_service_id = NULL, updated_at = datetime(\'now\') WHERE api_provider_id = ?',
            providerId
        );
    }

    static async moveToCategory(oldCategoryId: number, newCategoryId: number): Promise<void> {
        await this.raw(
            'UPDATE services SET category_id = ?, updated_at = datetime(\'now\') WHERE category_id = ?',
            newCategoryId,
            oldCategoryId
        );
    }

    static async deleteById(serviceId: number): Promise<void> {
        await this.db.prepare('DELETE FROM services WHERE id = ?').bind(serviceId).run();
    }

    static async getStats(): Promise<{ total: number; active: number; linked: number }> {
        const result = await this.rawFirst<any>(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN api_provider_id IS NOT NULL THEN 1 ELSE 0 END) as linked
             FROM services`
        );
        return result || { total: 0, active: 0, linked: 0 };
    }
}
