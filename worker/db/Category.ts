import { Model } from './Model';

export interface CategoryData {
    id?: number;
    name: string;
    sort_order?: number;
    is_active?: number;
    created_at?: string;
    updated_at?: string;
}

const DEFAULT_CATEGORY_NAME = 'بدون دسته‌بندی';

export class Category extends Model<CategoryData> {
    protected static table = 'categories';

    static async getActiveCategories(): Promise<CategoryData[]> {
        return this.raw(
            `SELECT c.* FROM categories c
             INNER JOIN services s ON s.category_id = c.id
             WHERE c.is_active = 1 AND s.is_active = 1
             GROUP BY c.id
             ORDER BY c.sort_order, c.name`
        );
    }

    static async findActiveByName(name: string): Promise<CategoryData | null> {
        return this.rawFirst(
            'SELECT * FROM categories WHERE name = ? AND is_active = 1',
            name
        );
    }

    static async ensureDefaultCategory(): Promise<number> {
        const existing = await this.rawFirst<{ id: number }>(
            'SELECT id FROM categories WHERE name = ?',
            DEFAULT_CATEGORY_NAME
        );
        if (existing) return existing.id;

        await this.raw(
            'INSERT INTO categories (name, sort_order, is_active) VALUES (?, -1, 0)',
            DEFAULT_CATEGORY_NAME
        );
        const created = await this.rawFirst<{ id: number }>(
            'SELECT id FROM categories WHERE name = ?',
            DEFAULT_CATEGORY_NAME
        );
        return created!.id;
    }
}
