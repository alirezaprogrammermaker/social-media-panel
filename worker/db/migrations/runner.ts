// Migrations are now managed by D1 migration system (migrations/ folder)
// This file is kept for backward compatibility with the /migrate endpoint

export async function runMigrations(db: D1Database): Promise<void> {
    console.log('Migrations are now managed by D1 migration system. No action needed.');
}
