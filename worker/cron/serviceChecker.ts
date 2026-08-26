import { ApiProvider } from '../db/ApiProvider';
import { Service } from '../db/Service';
import { Category } from '../db/Category';
import { Setting } from '../db/Setting';
import { SmmApiProvider } from '../api/SmmApiProvider';
import type { SmmService } from '../api/SmmApiProvider';
import { usdToToman } from '../utils/pricing';
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

async function resolveCategoryId(
    categoryName: string,
    cache: Map<string, number>
): Promise<number> {
    const cached = cache.get(categoryName);
    if (cached !== undefined) return cached;

    let category = await Category.rawFirst<{ id: number }>(
        'SELECT id FROM categories WHERE name = ?',
        categoryName
    );
    let categoryId: number;
    if (!category) {
        const created = await Category.create({
            name: categoryName,
            sort_order: 0,
            is_active: 1,
        });
        categoryId = created.id ?? created.lastInsertRowid;
    } else {
        categoryId = category.id;
    }
    cache.set(categoryName, categoryId);
    return categoryId;
}

/**
 * Sync metadata/cost from provider without overwriting admin-controlled fields:
 * - keeps selling `rate` (toman)
 * - keeps local `name` (may be translated)
 * - keeps `category_id` (admin organization)
 */
async function updateLinkedServiceFromRemote(
    existing: { id?: number; name: string; api_provider_service_price?: string | null },
    remote: SmmService,
    providerCurrency: string,
    result: SyncResult,
    notifications: string[]
): Promise<void> {
    const oldPrice = parseFloat(existing.api_provider_service_price || '0');
    const newPrice = parseFloat(remote.rate || '0');

    if (Number.isFinite(newPrice) && newPrice > 0 && oldPrice !== newPrice) {
        notifications.push(
            `💰 ${existing.name}: ${oldPrice} → ${newPrice} ${providerCurrency}`
        );
        result.priceChanged++;
    }

    await Service.update(String(existing.id!), {
        type: remote.type,
        min: String(remote.min ?? '1'),
        max: String(remote.max ?? '1000'),
        refill: remote.refill ? 1 : 0,
        cancel: remote.cancel ? 1 : 0,
        api_provider_service_price: remote.rate,
    });
    result.updated++;
}

export async function syncServicesFromProviders(db: D1Database): Promise<SyncResult[]> {
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
            const existingServices = await Service.getServicesByProvider(provider.id!);
            const notifications: string[] = [];
            const currency = provider.currency || 'USD';

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

                await updateLinkedServiceFromRemote(existing, remote, currency, result, notifications);
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
        const maxLines = 40;
        const lines = notifications.slice(0, maxLines);
        const more = notifications.length > maxLines
            ? `\n… و ${notifications.length - maxLines} مورد دیگر`
            : '';
        const message = `🔄 بروزرسانی سرویس‌های ${providerName}:\n\n${lines.join('\n')}${more}`;
        await api.sendMessage(adminChatId, message);
    } catch (error: any) {
        console.error('Failed to send sync notification:', error.message);
    }
}

/** Manual sync: update existing + add missing services (with USD→toman selling rate). */
export async function manualSyncServicesFromProviders(db: D1Database): Promise<SyncResult[]> {
    ApiProvider.use(db);
    Service.use(db);
    Category.use(db);
    Setting.use(db);

    const results: SyncResult[] = [];
    const activeProviders = await ApiProvider.getActiveProviders();
    const adminChatId = await Setting.get('admin_chat_id');
    const dollarRate = await Setting.get('dollar_rate');

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
            const existingServices = await Service.getServicesByProvider(provider.id!);
            const existingMap = new Map(
                existingServices.map((s) => [s.api_provider_service_id, s])
            );

            const categoryCache = new Map<string, number>();
            const notifications: string[] = [];
            const currency = provider.currency || 'USD';

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

                await updateLinkedServiceFromRemote(existing, remote, currency, result, notifications);
            }

            for (const remote of remoteServices) {
                if (existingMap.has(remote.service)) continue;

                const categoryId = await resolveCategoryId(remote.category || 'سایر', categoryCache);
                const sellingRate = usdToToman(remote.rate, dollarRate);

                await Service.create({
                    name: remote.name,
                    category_id: categoryId,
                    type: remote.type || 'Default',
                    // Selling price in toman; never store raw provider USD in `rate`
                    rate: String(sellingRate),
                    min: String(remote.min ?? '1'),
                    max: String(remote.max ?? '1000'),
                    refill: remote.refill ? 1 : 0,
                    cancel: remote.cancel ? 1 : 0,
                    api_provider_id: provider.id,
                    api_provider_service_id: remote.service,
                    api_provider_service_price: remote.rate,
                    is_active: 1,
                });
                result.added++;
                notifications.push(
                    sellingRate > 0
                        ? `✅ ${remote.name} (اضافه شد — ${sellingRate.toLocaleString()} تومان)`
                        : `✅ ${remote.name} (اضافه شد — قیمت فروش ۰؛ نرخ دلار را چک کنید)`
                );
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
