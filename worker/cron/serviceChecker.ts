import { ApiProvider } from '../db/ApiProvider';
import { Service } from '../db/Service';
import { Category } from '../db/Category';
import { Setting } from '../db/Setting';
import { SmmApiProvider } from '../api/SmmApiProvider';
import type { SmmService } from '../api/SmmApiProvider';
import { Api } from 'grammy';

interface SyncResult {
    providerId: number;
    providerName: string;
    added: number;
    updated: number;
    deactivated: number;
    priceChanged: number;
    errors: string[];
}

export async function syncServicesFromProviders(db: D1Database): Promise<SyncResult[]> {
    ApiProvider.use(db);
    Service.use(db);
    Category.use(db);
    Setting.use(db);

    const results: SyncResult[] = [];
    const activeProviders = await ApiProvider.getActiveProviders();

    // Get admin chat_id for notifications
    const adminChatId = await Setting.get('admin_chat_id');

    for (const provider of activeProviders) {
        const result: SyncResult = {
            providerId: provider.id!,
            providerName: provider.name,
            added: 0,
            updated: 0,
            deactivated: 0,
            priceChanged: 0,
            errors: [],
        };

        try {
            const api = new SmmApiProvider({
                apiUrl: provider.api_url,
                apiKey: provider.api_key,
            });

            const remoteServices = await api.getServices();
            const remoteIds = new Set(remoteServices.map((s) => s.service));

            const existingServices = await Service.getServicesByProvider(provider.id!);
            const existingMap = new Map(
                existingServices.map((s) => [s.api_provider_service_id, s])
            );

            const categoryCache = new Map<string, number>();
            const notifications: string[] = [];

            // Update existing services and deactivate removed ones
            for (const existing of existingServices) {
                const remoteId = existing.api_provider_service_id;
                if (!remoteId) continue;

                const remote = remoteServices.find((s) => s.service === remoteId);

                if (!remote) {
                    // Service removed from provider - deactivate
                    await Service.toggleActive(existing.id!, false);
                    result.deactivated++;
                    notifications.push(`❌ ${existing.name} (غیرفعال - حذف شده از ارائه‌دهنده)`);
                    continue;
                }

                // Check if price changed
                const oldPrice = parseFloat(existing.api_provider_service_price || '0');
                const newPrice = parseFloat(remote.rate || '0');

                if (oldPrice !== newPrice && newPrice > 0) {
                    notifications.push(`💰 ${existing.name}: ${oldPrice} → ${newPrice} ${provider.currency || 'USD'}`);
                    result.priceChanged++;
                }

                // Update service details
                let categoryId = categoryCache.get(remote.category);
                if (categoryId === undefined) {
                    let category = await Category.rawFirst<{ id: number }>(
                        'SELECT id FROM categories WHERE name = ?',
                        remote.category
                    );
                    if (!category) {
                        const newCategory = await Category.create({
                            name: remote.category,
                            sort_order: 0,
                            is_active: 1,
                        });
                        categoryId = newCategory.lastInsertRowid;
                    } else {
                        categoryId = category.id;
                    }
                    categoryCache.set(remote.category, categoryId);
                }

                await Service.update(String(existing.id!), {
                    name: remote.name,
                    type: remote.type,
                    rate: remote.rate,
                    min: remote.min,
                    max: remote.max,
                    refill: remote.refill,
                    cancel: remote.cancel,
                    category_id: categoryId,
                    api_provider_service_price: remote.rate,
                });
                result.updated++;
            }

            // Send notification to admin
            if (notifications.length > 0 && adminChatId) {
                await sendSyncNotification(db, Number(adminChatId), provider.name, notifications);
            }
        } catch (error: any) {
            result.errors.push(`Failed to fetch services: ${error.message}`);
        }

        results.push(result);
    }

    return results;
}

async function sendSyncNotification(
    db: D1Database,
    adminChatId: number,
    providerName: string,
    notifications: string[]
): Promise<void> {
    try {
        Setting.use(db);
        const token = await Setting.get('telegram_token');
        if (!token) return;

        const api = new Api(token);
        const message = `🔄 بروزرسانی سرویس‌های ${providerName}:\n\n${notifications.join('\n')}`;
        await api.sendMessage(adminChatId, message);
    } catch (error: any) {
        console.error('Failed to send sync notification:', error.message);
    }
}

export async function manualSyncServicesFromProviders(db: D1Database): Promise<SyncResult[]> {
    ApiProvider.use(db);
    Service.use(db);
    Category.use(db);
    Setting.use(db);

    const results: SyncResult[] = [];
    const activeProviders = await ApiProvider.getActiveProviders();
    const adminChatId = await Setting.get('admin_chat_id');

    for (const provider of activeProviders) {
        const result: SyncResult = {
            providerId: provider.id!,
            providerName: provider.name,
            added: 0,
            updated: 0,
            deactivated: 0,
            priceChanged: 0,
            errors: [],
        };

        try {
            const api = new SmmApiProvider({
                apiUrl: provider.api_url,
                apiKey: provider.api_key,
            });

            const remoteServices = await api.getServices();
            const remoteIds = new Set(remoteServices.map((s) => s.service));

            const existingServices = await Service.getServicesByProvider(provider.id!);
            const existingMap = new Map(
                existingServices.map((s) => [s.api_provider_service_id, s])
            );

            const categoryCache = new Map<string, number>();
            const notifications: string[] = [];

            // Update existing services and deactivate removed ones
            for (const existing of existingServices) {
                const remoteId = existing.api_provider_service_id;
                if (!remoteId) continue;

                const remote = remoteServices.find((s) => s.service === remoteId);

                if (!remote) {
                    await Service.toggleActive(existing.id!, false);
                    result.deactivated++;
                    notifications.push(`❌ ${existing.name} (غیرفعال - حذف شده از ارائه‌دهنده)`);
                    continue;
                }

                const oldPrice = parseFloat(existing.api_provider_service_price || '0');
                const newPrice = parseFloat(remote.rate || '0');

                if (oldPrice !== newPrice && newPrice > 0) {
                    notifications.push(`💰 ${existing.name}: ${oldPrice} → ${newPrice} ${provider.currency || 'USD'}`);
                    result.priceChanged++;
                }

                let categoryId = categoryCache.get(remote.category);
                if (categoryId === undefined) {
                    let category = await Category.rawFirst<{ id: number }>(
                        'SELECT id FROM categories WHERE name = ?',
                        remote.category
                    );
                    if (!category) {
                        const newCategory = await Category.create({
                            name: remote.category,
                            sort_order: 0,
                            is_active: 1,
                        });
                        categoryId = newCategory.lastInsertRowid;
                    } else {
                        categoryId = category.id;
                    }
                    categoryCache.set(remote.category, categoryId);
                }

                await Service.update(String(existing.id!), {
                    name: remote.name,
                    type: remote.type,
                    rate: remote.rate,
                    min: remote.min,
                    max: remote.max,
                    refill: remote.refill,
                    cancel: remote.cancel,
                    category_id: categoryId,
                    api_provider_service_price: remote.rate,
                });
                result.updated++;
            }

            // Add new services (manual sync only)
            for (const remote of remoteServices) {
                if (existingMap.has(remote.service)) continue;

                let categoryId = categoryCache.get(remote.category);
                if (categoryId === undefined) {
                    let category = await Category.rawFirst<{ id: number }>(
                        'SELECT id FROM categories WHERE name = ?',
                        remote.category
                    );
                    if (!category) {
                        const newCategory = await Category.create({
                            name: remote.category,
                            sort_order: 0,
                            is_active: 1,
                        });
                        categoryId = newCategory.lastInsertRowid;
                    } else {
                        categoryId = category.id;
                    }
                    categoryCache.set(remote.category, categoryId);
                }

                await Service.create({
                    name: remote.name,
                    category_id: categoryId,
                    type: remote.type,
                    rate: remote.rate,
                    min: remote.min,
                    max: remote.max,
                    refill: remote.refill,
                    cancel: remote.cancel,
                    api_provider_id: provider.id,
                    api_provider_service_id: remote.service,
                    api_provider_service_price: remote.rate,
                    is_active: 1,
                });
                result.added++;
                notifications.push(`✅ ${remote.name} (اضافه شد)`);
            }

            if (notifications.length > 0 && adminChatId) {
                await sendSyncNotification(db, Number(adminChatId), provider.name, notifications);
            }
        } catch (error: any) {
            result.errors.push(`Failed to fetch services: ${error.message}`);
        }

        results.push(result);
    }

    return results;
}

export async function syncProviderBalance(db: D1Database): Promise<{ providerId: number; balance: string; currency: string }[]> {
    ApiProvider.use(db);
    const results: { providerId: number; balance: string; currency: string }[] = [];
    const activeProviders = await ApiProvider.getActiveProviders();

    for (const provider of activeProviders) {
        try {
            const api = new SmmApiProvider({
                apiUrl: provider.api_url,
                apiKey: provider.api_key,
            });

            const balanceData = await api.getBalance();
            await ApiProvider.updateBalance(provider.id!, balanceData.balance, balanceData.currency);
            results.push({
                providerId: provider.id!,
                balance: balanceData.balance,
                currency: balanceData.currency,
            });
        } catch (error: any) {
            console.error(`Failed to sync balance for provider ${provider.id}: ${error.message}`);
        }
    }

    return results;
}
