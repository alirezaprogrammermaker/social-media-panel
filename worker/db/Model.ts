import { nowTehran } from '../utils/date';

export class Model<T extends Record<string, any>> {
    protected static table: string;
    protected static db: D1Database;

    static use(db: D1Database) {
        this.db = db;
        return this;
    }

    static async find<T>(this: any, id: string): Promise<T | null> {
        return this.db
            .prepare(`SELECT * FROM ${this.table} WHERE id = ?`)
            .bind(id)
            .first() as Promise<T | null>;
    }

    static async findBy<T>(this: any, column: string, value: any): Promise<T | null> {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
            throw new Error(`نام ستون نامعتبر: ${column}`);
        }
        return this.db
            .prepare(`SELECT * FROM ${this.table} WHERE ${column} = ?`)
            .bind(value)
            .first() as Promise<T | null>;
    }

    static async all<T>(this: any): Promise<T[]> {
        const { results } = await this.db.prepare(`SELECT * FROM ${this.table}`).all();
        return results as T[];
    }

    static async paginate<T>(this: any, page: number = 1, pageSize: number = 50): Promise<{ data: T[]; total: number }> {
        const countResult = await this.db.prepare(`SELECT COUNT(*) as count FROM ${this.table}`).first() as { count: number };
        const total = countResult.count;
        const offset = (page - 1) * pageSize;
        const { results } = await this.db
            .prepare(`SELECT * FROM ${this.table} LIMIT ? OFFSET ?`)
            .bind(pageSize, offset)
            .all();
        return { data: results as T[], total };
    }

    static async where<T>(this: any, column: string, value: any): Promise<T[]> {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
            throw new Error(`نام ستون نامعتبر: ${column}`);
        }
        const { results } = await this.db
            .prepare(`SELECT * FROM ${this.table} WHERE ${column} = ?`)
            .bind(value)
            .all();
        return results as T[];
    }

    static async create<T extends Record<string, any>>(this: any, data: T): Promise<T & { lastInsertRowid: number }> {
        const columns = Object.keys(data);
        const placeholders = columns.map(() => '?').join(', ');
        const result = await this.db
            .prepare(`INSERT INTO ${this.table} (${columns.join(', ')}) VALUES (${placeholders})`)
            .bind(...Object.values(data))
            .run();
        return { ...data, lastInsertRowid: result.meta?.last_row_id ?? 0 };
    }

    static async update(this: any, id: string, data: Record<string, any>) {
        const columns = Object.keys(data);
        for (const c of columns) {
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(c)) {
                throw new Error(`نام ستون نامعتبر: ${c}`);
            }
        }
        const setClause = columns.map((c) => `${c} = ?`).join(', ');
        await this.db
            .prepare(`UPDATE ${this.table} SET ${setClause} WHERE id = ?`)
            .bind(...Object.values(data), id)
            .run();
    }

    static async delete(this: any, id: string) {
        await this.db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).bind(id).run();
    }

    static async toggleActive(this: any, id: number, isActive: boolean): Promise<void> {
        await this.raw(
            `UPDATE ${this.table} SET is_active = ?, updated_at = ? WHERE id = ?`,
            isActive ? 1 : 0,
            nowTehran(),
            id
        );
    }

    static async raw<T>(this: any, sql: string, ...params: any[]): Promise<T[]> {
        const { results } = await this.db.prepare(sql).bind(...params).all();
        return results as T[];
    }

    static async rawFirst<T>(this: any, sql: string, ...params: any[]): Promise<T | null> {
        return this.db.prepare(sql).bind(...params).first() as Promise<T | null>;
    }

    static async count(this: any, where?: string, ...params: any[]): Promise<number> {
        const sql = where
            ? `SELECT COUNT(*) as count FROM ${this.table} WHERE ${where}`
            : `SELECT COUNT(*) as count FROM ${this.table}`;
        const result = await this.db.prepare(sql).bind(...params).first() as { count: number };
        return result.count;
    }

    static async sum(this: any, column: string, where?: string, ...params: any[]): Promise<number> {
        const sql = where
            ? `SELECT COALESCE(SUM(${column}), 0) as total FROM ${this.table} WHERE ${where}`
            : `SELECT COALESCE(SUM(${column}), 0) as total FROM ${this.table}`;
        const result = await this.db.prepare(sql).bind(...params).first() as { total: number };
        return result.total;
    }

    static async getBasicStats(this: any): Promise<{ total: number; active: number }> {
        const result = await this.db.prepare(
            `SELECT COUNT(*) as total, SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active FROM ${this.table}`
        ).first() as { total: number; active: number };
        return { total: result.total, active: result.active ?? 0 };
    }
}
