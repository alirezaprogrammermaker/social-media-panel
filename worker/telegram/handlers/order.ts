import { Category } from '../../db/Category';
import { Service } from '../../db/Service';
import { Order } from '../../db/Order';
import { ApiProvider } from '../../db/ApiProvider';
import { TelegramUser } from '../../db/TelegramUser';
import { SmmApiProvider } from '../../api/SmmApiProvider';
import { getOrderFlow, setOrderFlow, clearOrderFlow, startOrderFlow } from '../botFlows';
import { categoryKeyboard, serviceKeyboard, orderBackKeyboard, ITEMS_PER_PAGE, mainMenuKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';
import { nowTehran } from '../../utils/date';
import { calculateCustomerCharge } from '../../utils/pricing';

export async function handleOrderStart(ctx: any, db: D1Database, userId: number) {
    Category.use(db);
    const categories = await Category.getActiveCategories();

    if (categories.length === 0) {
        await ctx.reply(MESSAGES.NO_CATEGORIES, { reply_markup: await mainMenuKeyboard(db, userId) });
        return;
    }

    await startOrderFlow(db, userId, { step: 'select_category', categoryPage: 0 });
    await ctx.reply(MESSAGES.SELECT_CATEGORY, {
        reply_markup: categoryKeyboard(categories, 0),
    });
}

export async function handleOrderCancel(ctx: any, db: D1Database, userId: number) {
    if (await getOrderFlow(db, userId)) {
        await clearOrderFlow(db, userId);
        await ctx.reply(MESSAGES.ORDER_CANCELLED, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }
    return false;
}

export async function handleOrderBack(ctx: any, db: D1Database, userId: number) {
    const state = await getOrderFlow(db, userId);
    if (!state) return false;

    if (state.step === 'select_category') {
        await clearOrderFlow(db, userId);
        await ctx.reply(MESSAGES.AI_EXIT, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    if (state.step === 'select_service') {
        Category.use(db);
        const categories = await Category.getActiveCategories();
        await setOrderFlow(db, userId, { step: 'select_category', categoryPage: state.categoryPage || 0 });
        await ctx.reply(MESSAGES.SELECT_CATEGORY, {
            reply_markup: categoryKeyboard(categories, state.categoryPage || 0),
        });
        return true;
    }

    if (state.step === 'enter_link') {
        Service.use(db);
        const services = await Service.getActiveByCategory(state.categoryId!);
        await setOrderFlow(db, userId, { step: 'select_service', categoryId: state.categoryId, categoryName: state.categoryName, servicePage: state.servicePage || 0 });
        await ctx.reply(MESSAGES.SELECT_SERVICE(state.categoryName!), {
            reply_markup: serviceKeyboard(services, state.servicePage || 0),
        });
        return true;
    }

    if (state.step === 'enter_quantity') {
        await setOrderFlow(db, userId, { ...state, step: 'enter_link' });
        await ctx.reply(MESSAGES.ENTER_LINK, {
            reply_markup: orderBackKeyboard(),
        });
        return true;
    }

    return false;
}

export async function handleCategoryPagination(ctx: any, db: D1Database, userId: number, direction: 'next' | 'prev') {
    const state = await getOrderFlow(db, userId);
    if (!state || state.step !== 'select_category') return false;

    Category.use(db);
    const categories = await Category.getActiveCategories();
    const currentPage = state.categoryPage || 0;
    const totalPages = Math.ceil(categories.length / ITEMS_PER_PAGE);

    let newPage = currentPage;
    if (direction === 'next' && currentPage < totalPages - 1) {
        newPage = currentPage + 1;
    } else if (direction === 'prev' && currentPage > 0) {
        newPage = currentPage - 1;
    }

    await setOrderFlow(db, userId, { ...state, categoryPage: newPage });
    await ctx.reply(MESSAGES.SELECT_CATEGORY, {
        reply_markup: categoryKeyboard(categories, newPage),
    });
    return true;
}

export async function handleServicePagination(ctx: any, db: D1Database, userId: number, direction: 'next' | 'prev') {
    const state = await getOrderFlow(db, userId);
    if (!state || state.step !== 'select_service') return false;

    Service.use(db);
    const services = await Service.getActiveByCategory(state.categoryId!);
    const currentPage = state.servicePage || 0;
    const totalPages = Math.ceil(services.length / ITEMS_PER_PAGE);

    let newPage = currentPage;
    if (direction === 'next' && currentPage < totalPages - 1) {
        newPage = currentPage + 1;
    } else if (direction === 'prev' && currentPage > 0) {
        newPage = currentPage - 1;
    }

    await setOrderFlow(db, userId, { ...state, servicePage: newPage });
    await ctx.reply(MESSAGES.SELECT_SERVICE(state.categoryName!), {
        reply_markup: serviceKeyboard(services, newPage),
    });
    return true;
}

export async function handleCategorySelect(ctx: any, db: D1Database, userId: number, text: string) {
    Category.use(db);
    const category = await Category.findActiveByName(text);

    if (!category) {
        await ctx.reply(MESSAGES.CATEGORY_NOT_FOUND);
        return;
    }

    // Set state early to prevent race conditions with quick consecutive messages
    await setOrderFlow(db, userId, { step: 'select_service', categoryId: category.id, categoryName: category.name, servicePage: 0 });

    Service.use(db);
    const services = await Service.getActiveByCategory(category.id!);

    if (services.length === 0) {
        await ctx.reply(MESSAGES.NO_SERVICES, { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearOrderFlow(db, userId);
        return;
    }

    await ctx.reply(MESSAGES.SELECT_SERVICE(category.name!), {
        reply_markup: serviceKeyboard(services, 0),
    });
}

export async function handleServiceSelect(ctx: any, db: D1Database, userId: number, text: string) {
    const state = await getOrderFlow(db, userId);
    if (!state) {
        console.log('No state found for user:', userId);
        return;
    }

    console.log('handleServiceSelect called:', { userId, text, state });

    Service.use(db);

    interface ServiceData {
        id: number; name: string; type: string; description?: string;
        rate: string; min: string; max: string; category_id: number;
    }

    // Extract service ID from button text (format: "id|name")
    let service: ServiceData | null = null;
    const idMatch = text.match(/^(\d+)\|/);

    if (idMatch) {
        const serviceId = idMatch[1];
        console.log('Found service ID from button:', serviceId);
        service = await Service.find<ServiceData>(serviceId);

        // If not found by ID, try to find by ID and category
        if (!service) {
            service = await Service.rawFirst<ServiceData>(
                'SELECT * FROM services WHERE id = ? AND category_id = ? AND is_active = 1',
                serviceId,
                state.categoryId
            );
        }
    }

    // Fallback: search by name and category
    if (!service) {
        // Extract name from "id|name" format if present
        const nameMatch = text.match(/^\d+\|(.+)$/);
        const serviceName = nameMatch ? nameMatch[1] : text.trim();

        console.log('Looking for service by name:', { serviceName, categoryId: state.categoryId });

        // Try exact match first
        service = await Service.findByNameAndCategory(serviceName, state.categoryId!) as ServiceData | null;

        // If not found, try to find any service with this name in any category
        if (!service) {
            service = await Service.rawFirst<ServiceData>(
                'SELECT * FROM services WHERE name = ? AND is_active = 1',
                serviceName
            );
        }

        // If still not found, try LIKE match
        if (!service) {
            service = await Service.rawFirst<ServiceData>(
                'SELECT * FROM services WHERE name LIKE ? AND is_active = 1',
                `%${serviceName}%`
            );
        }
    }

    if (!service) {
        // Debug: show what services exist in this category
        const categoryServices = await Service.raw<{ id: number; name: string }>(
            'SELECT id, name FROM services WHERE category_id = ? AND is_active = 1',
            state.categoryId
        );
        console.log('Available services in category:', categoryServices);
        console.log('Looking for text:', text);

        // If there's only one service in the category, auto-select it
        if (categoryServices.length === 1) {
            service = await Service.find<ServiceData>(String(categoryServices[0].id));
            if (service) {
                console.log('Auto-selected single service:', service.name);
            }
        }

        if (!service) {
            // Show a more helpful error message
            const serviceList = categoryServices.map(s => `• ${s.name}`).join('\n');
            await ctx.reply(
                `${MESSAGES.SERVICE_NOT_FOUND}\n\nسرویس‌های موجود:\n${serviceList}\n\nلطفاً روی دکمه سرویس مورد نظر کلیک کنید.`
            );
            return;
        }
    }

    console.log('Service found:', { id: service.id, name: service.name, categoryId: service.category_id });

    await promptEnterLinkAfterService(ctx, db, userId, state, service);
}

/**
 * Shared entry after a service is chosen (normal select or «تکرار سفارش»).
 * Puts the user on `enter_link` with a durable D1 order session.
 */
export async function promptEnterLinkAfterService(
    ctx: any,
    db: D1Database,
    userId: number,
    prior: { categoryId?: number; categoryName?: string; categoryPage?: number; servicePage?: number },
    service: {
        id: number;
        name: string;
        type?: string;
        description?: string;
        rate?: string;
        min?: string;
        max?: string;
        category_id: number;
        category_name?: string;
    },
    options?: { exclusive?: boolean }
) {
    const categoryId = service.category_id ?? prior.categoryId;
    const categoryName = service.category_name || prior.categoryName || '';
    const typeLabel = service.type || 'Default';

    const nextState = {
        step: 'enter_link' as const,
        categoryId,
        categoryName,
        categoryPage: prior.categoryPage || 0,
        servicePage: prior.servicePage || 0,
        serviceId: service.id,
        serviceName: service.name,
        serviceType: service.type,
        serviceMin: parseInt(service.min || '1', 10),
        serviceMax: parseInt(service.max || '100000', 10),
    };

    if (options?.exclusive) {
        await startOrderFlow(db, userId, nextState);
    } else {
        await setOrderFlow(db, userId, nextState);
    }

    let message = `📦 ${service.name}\n\n📊 نوع: ${typeLabel}`;
    if (service.description) {
        message += `\n\n📝 ${service.description}`;
    }
    const isPackageService = (service.type || 'Default') === 'Package';
    if (isPackageService) {
        message += `\n\n💰 قیمت پکیج: ${Number(service.rate || 0).toLocaleString()} تومان`;
    } else {
        message += `\n\n💰 قیمت: ${service.rate} تومان به ازای هر ۱۰۰۰\n📈 حداقل: ${service.min} | حداکثر: ${service.max}`;
    }
    message += `\n\n🔗 لینک پست را وارد کنید:`;

    await ctx.reply(message, { reply_markup: orderBackKeyboard() });
}

export async function handleLinkInput(ctx: any, db: D1Database, userId: number, text: string) {
    const state = await getOrderFlow(db, userId);
    if (!state) return;

    // Only Package services skip quantity; Default (likes/followers/etc) must send quantity to provider
    const isPackage = state.serviceType === 'Package';

    if (isPackage) {
        await createOrder(db, ctx, userId, { ...state, link: text }, undefined);
        return;
    }

    await ctx.reply(
        MESSAGES.ENTER_LINK_CONFIRM(text, state.serviceMin!, state.serviceMax!),
        { reply_markup: orderBackKeyboard() }
    );

    await setOrderFlow(db, userId, { ...state, step: 'enter_quantity', link: text });
}

export async function handleQuantityInput(ctx: any, db: D1Database, userId: number, text: string) {
    const state = await getOrderFlow(db, userId);
    if (!state) return;

    const quantity = parseInt(text.replace(/[^\d]/g, ''), 10);

    if (isNaN(quantity) || quantity <= 0) {
        await ctx.reply(MESSAGES.INVALID_NUMBER);
        return;
    }

    if (quantity < state.serviceMin!) {
        await ctx.reply(MESSAGES.MIN_QUANTITY(state.serviceMin!));
        return;
    }

    if (quantity > state.serviceMax!) {
        await ctx.reply(MESSAGES.MAX_QUANTITY(state.serviceMax!));
        return;
    }

    await createOrder(db, ctx, userId, state, quantity);
}

async function createOrder(
    db: D1Database,
    ctx: any,
    userId: number,
    state: any,
    quantity?: number
) {
    Service.use(db);
    const service = await Service.find<{ id: number; name: string; type: string; rate: string; api_provider_id: number; api_provider_service_id: number }>(
        String(state.serviceId)
    );

    if (!service) {
        await ctx.reply(MESSAGES.SERVICE_NOT_FOUND_SIMPLE, { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearOrderFlow(db, userId);
        return;
    }

    const serviceType = service.type || 'Default';
    const isPackage = serviceType === 'Package';
    const quantityValue = isPackage ? 1 : (quantity || 0);

    if (!isPackage && (!quantityValue || quantityValue <= 0)) {
        await ctx.reply(MESSAGES.INVALID_NUMBER, { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearOrderFlow(db, userId);
        return;
    }

    const totalCost = calculateCustomerCharge(service.rate, quantityValue, serviceType);
    const storedQuantity = isPackage ? 1 : quantityValue;

    TelegramUser.use(db);
    const user = await TelegramUser.findBy<{ id: number; balance: number }>('chat_id', userId);

    if (totalCost > 0 && (!user || (user.balance || 0) < totalCost)) {
        await ctx.reply(
            MESSAGES.INSUFFICIENT_BALANCE(totalCost, user?.balance || 0),
            { reply_markup: await mainMenuKeyboard(db, userId) }
        );
        await clearOrderFlow(db, userId);
        return;
    }

    let apiOrderId: number | null = null;
    let apiProviderId: number | null = null;

    // Linked services must be submitted to the provider; never charge for a silent local-only order
    if (service.api_provider_id && service.api_provider_service_id) {
        ApiProvider.use(db);
        const provider = await ApiProvider.findActiveById(service.api_provider_id);

        if (!provider) {
            await ctx.reply(MESSAGES.PROVIDER_ERROR('ارائه‌دهنده غیرفعال یا یافت نشد'), { reply_markup: await mainMenuKeyboard(db, userId) });
            await clearOrderFlow(db, userId);
            return;
        }

        try {
            const api = new SmmApiProvider({
                apiUrl: provider.api_url,
                apiKey: provider.api_key,
            });

            const orderData: {
                service: number;
                link: string;
                quantity?: number;
            } = {
                service: service.api_provider_service_id,
                link: state.link || '',
            };
            if (!isPackage) {
                orderData.quantity = quantityValue;
            }

            const result = await api.addOrder(orderData);

            if (result.order) {
                apiOrderId = Number(result.order);
                apiProviderId = provider.id ?? null;
            } else {
                await ctx.reply(
                    MESSAGES.PROVIDER_ERROR(result.error || 'پاسخ نامعتبر از ارائه‌دهنده'),
                    { reply_markup: await mainMenuKeyboard(db, userId) }
                );
                await clearOrderFlow(db, userId);
                return;
            }
        } catch (error: any) {
            console.error('API order error:', error);
            await ctx.reply(
                MESSAGES.PROVIDER_ERROR(error?.message || 'خطا در ارتباط با ارائه‌دهنده'),
                { reply_markup: await mainMenuKeyboard(db, userId) }
            );
            await clearOrderFlow(db, userId);
            return;
        }
    }

    Order.use(db);
    const charge = String(totalCost);
    const createdAt = nowTehran();

    try {
        if (totalCost > 0) {
            const batchResult = await db.batch([
                db.prepare(
                    `INSERT INTO orders (user_chat_id, user_username, service_id, link, quantity, status, api_provider_id, api_provider_order_id, charge, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                ).bind(
                    userId,
                    ctx.from?.username ?? null,
                    state.serviceId,
                    state.link || '',
                    storedQuantity,
                    'Pending',
                    apiProviderId,
                    apiOrderId,
                    charge,
                    'toman',
                    createdAt,
                    createdAt
                ),
                db.prepare(
                    'UPDATE telegram_users SET balance = balance - ?, updated_at = ? WHERE chat_id = ? AND balance >= ?'
                ).bind(totalCost, createdAt, userId, totalCost),
            ]);

            const balanceUpdated = batchResult[1]?.meta?.changes ?? 0;
            if (balanceUpdated < 1) {
                // Order row may have been inserted; best-effort cleanup to avoid unpaid fulfillment
                await db.prepare(
                    `DELETE FROM orders WHERE user_chat_id = ? AND api_provider_order_id IS ? AND created_at = ?`
                ).bind(userId, apiOrderId, createdAt).run();

                if (apiProviderId && apiOrderId) {
                    try {
                        const provider = await ApiProvider.findActiveById(apiProviderId);
                        if (provider) {
                            const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
                            await api.cancel([apiOrderId]);
                        }
                    } catch (cancelError: any) {
                        console.error('Failed to cancel provider order after balance race:', cancelError);
                    }
                }

                await ctx.reply(
                    MESSAGES.INSUFFICIENT_BALANCE(totalCost, user?.balance || 0),
                    { reply_markup: await mainMenuKeyboard(db, userId) }
                );
                await clearOrderFlow(db, userId);
                return;
            }
        } else {
            await Order.create({
                user_chat_id: userId,
                user_username: ctx.from?.username ?? null,
                service_id: state.serviceId,
                link: state.link || '',
                quantity: storedQuantity,
                status: 'Pending',
                api_provider_id: apiProviderId,
                api_provider_order_id: apiOrderId,
                charge,
                currency: 'toman',
                created_at: createdAt,
                updated_at: createdAt,
            });
        }
    } catch (error: any) {
        console.error('Atomic order creation failed:', error);
        if (apiProviderId && apiOrderId) {
            try {
                ApiProvider.use(db);
                const provider = await ApiProvider.findActiveById(apiProviderId);
                if (provider) {
                    const api = new SmmApiProvider({ apiUrl: provider.api_url, apiKey: provider.api_key });
                    await api.cancel([apiOrderId]);
                }
            } catch (cancelError: any) {
                console.error('Failed to cancel provider order after DB failure:', cancelError);
            }
        }
        await ctx.reply('❌ خطا در ایجاد سفارش. لطفا دوباره تلاش کنید.', { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearOrderFlow(db, userId);
        return;
    }

    const latestOrder = await Order.rawFirst<{ id: number }>(
        'SELECT id FROM orders WHERE user_chat_id = ? ORDER BY id DESC LIMIT 1',
        userId
    );
    const dbOrderId = latestOrder?.id;

    await clearOrderFlow(db, userId);

    await ctx.reply(
        MESSAGES.ORDER_SUCCESS(state.serviceName, state.link, isPackage ? 'پکیج' : storedQuantity, dbOrderId),
        { parse_mode: 'HTML', reply_markup: await mainMenuKeyboard(db, userId) }
    );
}
