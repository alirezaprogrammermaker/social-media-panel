import { AiSetting } from './AiSetting';

export interface TableInfo {
    tableName: string;
    columns: string[];
    rowCount: number;
}

export interface QueryResult {
    table: string;
    data: any[];
    count: number;
}

/**
 * Provides controlled database access for AI based on configured allowed tables.
 */
export class AiDatabaseAccess {
    private db: D1Database;
    private role: string;

    constructor(db: D1Database, role: string) {
        this.db = db;
        this.role = role;
    }

    /**
     * Get the list of allowed tables for the current role
     */
    async getAllowedTables(): Promise<string[]> {
        AiSetting.use(this.db);
        const settingKey = `ai_allowed_tables`;
        const rolePrefix = `${this.role}_`;
        const value = await AiSetting.get(`ai${rolePrefix}allowed_tables`);

        if (!value) {
            return [];
        }

        try {
            return JSON.parse(value);
        } catch {
            return [];
        }
    }

    /**
     * Get schema information for allowed tables
     */
    async getTableSchema(): Promise<TableInfo[]> {
        const allowedTables = await this.getAllowedTables();
        const tables: TableInfo[] = [];

        for (const tableName of allowedTables) {
            // Validate table name is a safe identifier
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
                continue;
            }
            try {
                // Get table info from sqlite_master
                const { results: columns } = await this.db
                    .prepare(`PRAGMA table_info(${tableName})`)
                    .all();

                // Get row count
                const countResult = await this.db
                    .prepare(`SELECT COUNT(*) as count FROM ${tableName}`)
                    .first() as { count: number } | null;

                tables.push({
                    tableName,
                    columns: columns.map((col: any) => col.name),
                    rowCount: countResult?.count ?? 0,
                });
            } catch {
                // Table might not exist or no access
            }
        }

        return tables;
    }

    /**
     * Query an allowed table with basic filtering.
     * WHERE clauses must use parameterized conditions (e.g., "column = ?").
     */
    async queryTable(
        tableName: string,
        options: {
            columns?: string[];
            where?: string;
            params?: any[];
            limit?: number;
            offset?: number;
            orderBy?: string;
        } = {}
    ): Promise<QueryResult> {
        const allowedTables = await this.getAllowedTables();

        if (!allowedTables.includes(tableName)) {
            throw new Error(`جدول ${tableName} مجاز نیست`);
        }

        // Validate table name is a safe identifier
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
            throw new Error('نام جدول نامعتبر است');
        }

        const {
            columns = ['*'],
            where,
            params = [],
            limit = 100,
            offset = 0,
            orderBy,
        } = options;

        // Validate column names (prevent SQL injection)
        const safeColumns = columns.map((col) => {
            if (col === '*') return '*';
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
                throw new Error(`نام ستون نامعتبر: ${col}`);
            }
            return col;
        });

        let query = `SELECT ${safeColumns.join(', ')} FROM ${tableName}`;

        if (where) {
            // Strict where clause validation:
            // Only allow simple conditions with parameterized values (e.g., "column = ?", "column > ?")
            // Block: semicolons, quotes, comments, UNION, SELECT, DROP, INSERT, UPDATE, DELETE, parentheses
            const dangerousPattern = /[;'"\\\-]|(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|COMMENT|--|\/\*|\*\/|\(|\))/i;
            if (dangerousPattern.test(where)) {
                throw new Error('شرط WHERE نامعتبر است');
            }
            // Only allow patterns like: "column = ?", "column > ?", "column LIKE ?", "column IS NULL", etc.
            if (!/^[a-zA-Z_][a-zA-Z0-9_.]*\s*(=|!=|<>|>|<|>=|<=|LIKE|IS|IS NOT)\s*(\?|NULL|TRUE|FALSE)$/i.test(where.trim())) {
                throw new Error('شرط WHERE نامعتبر است. فقط شرط‌های ساده مثل "column = ?" مجاز است');
            }
            query += ` WHERE ${where}`;
        }

        if (orderBy) {
            // Validate order by
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\s+(ASC|DESC))?$/i.test(orderBy)) {
                throw new Error('شرط ORDER BY نامعتبر است');
            }
            query += ` ORDER BY ${orderBy}`;
        }

        const safeLimit = Math.min(Math.max(1, Math.floor(Number(limit) || 100)), 100);
        query += ` LIMIT ${safeLimit}`;

        const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));
        if (safeOffset > 0) {
            query += ` OFFSET ${safeOffset}`;
        }

        const { results } = await this.db
            .prepare(query)
            .bind(...params)
            .all();

        return {
            table: tableName,
            data: results,
            count: results.length,
        };
    }

    /**
     * Get summary statistics for allowed tables
     */
    async getSummary(): Promise<Record<string, any>> {
        const tables = await this.getTableSchema();
        const summary: Record<string, any> = {};

        for (const table of tables) {
            summary[table.tableName] = {
                columns: table.columns,
                rowCount: table.rowCount,
            };
        }

        return summary;
    }

    /**
     * Get actual data from allowed tables for AI context
     * Only includes telegram_bot_helps data (most relevant for user questions)
     */
    async getTableDataForContext(maxRowsPerTable: number = 50): Promise<string> {
        const allowedTables = await this.getAllowedTables();
        let context = '';

        for (const tableName of allowedTables) {
            // Validate table name is a safe identifier
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
                continue;
            }
            try {
                // Only include data from telegram_bot_helps (contains rules/help)
                if (tableName === 'telegram_bot_helps') {
                    const { results } = await this.db
                        .prepare(`SELECT name, description FROM ${tableName} LIMIT ?`)
                        .bind(maxRowsPerTable)
                        .all();

                    if (results.length > 0) {
                        context += '\n\nقوانین و راهنمای ربات:\n';
                        for (const row of results) {
                            context += `\n${row.name}:\n${row.description}\n`;
                        }
                    }
                }
            } catch {
                // Table might not exist
            }
        }

        return context;
    }
}
