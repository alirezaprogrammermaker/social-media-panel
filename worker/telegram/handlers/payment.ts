import { Api } from 'grammy';
import { PaymentMethod } from '../../db/PaymentMethod';
import { Payment } from '../../db/Payment';
import { TelegramUser } from '../../db/TelegramUser';
import { Setting } from '../../db/Setting';
import { getPaymentFlow, setPaymentFlow, clearPaymentFlow, startPaymentFlow } from '../botFlows';
import {
    helpKeyboard,
    mainMenuKeyboard,
    paymentMethodKeyboard,
    paymentAmountKeyboard,
    paymentReceiptKeyboard,
    cryptoNetworkKeyboard,
    cryptoWaitingKeyboard,
} from '../keyboards';
import { MESSAGES } from '../constants';
import {
    CRYPTO_NETWORKS,
    DEFAULT_CRYPTO_NETWORK,
    createPayment as createGatewayPayment,
    gatewayConfigFromSettings,
    isCryptoGatewayConfigured,
    networkLabel,
    CryptoGatewayError,
} from '../../api/CryptoGateway';
import { refreshLocalCryptoPayment } from '../../services/cryptoPayment';
import type { Bindings } from '../../types';
import { nowTehran } from '../../utils/date';

// Track invalid receipt attempts per user
const invalidReceiptAttempts = new Map<number, { count: number; bannedUntil: number }>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

async function analyzeReceiptWithAI(AI: Ai, fileUrl: string, customPrompt?: string): Promise<string> {
    try {
        const imageRes = await fetch(fileUrl);
        if (!imageRes.ok) return 'خطا در دریافت تصویر';

        const imageBuffer = await imageRes.arrayBuffer();
        const base64 = arrayBufferToBase64(imageBuffer);
        const mimeType = imageRes.headers.get('content-type') || 'image/jpeg';
        const dataUrl = `data:${mimeType};base64,${base64}`;

        const systemPrompt = customPrompt || 'تو یک کارشناس بررسی رسید پرداخت هستی. تصویر ارسال شده رو بررسی کن و بگو آیا رسید پرداخت معتبری هست یا نه. فقط با فارسی پاسخ بده و خیلی کوتاه توضیح بده.';

        const response = await AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
            messages: [
                { role: 'system', content: systemPrompt },
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'آیا این تصویر یک رسید پرداخت معتبر است؟' },
                        { type: 'image_url', image_url: { url: dataUrl } },
                    ],
                },
            ],
            max_tokens: 256,
            temperature: 0.3,
        });

        return (response as any).response || 'پاسخی دریافت نشد';
    } catch (e: any) {
        return `خطا در تحلیل: ${e.message}`;
    }
}

function isReceiptInvalid(aiAnalysis: string): boolean {
    const lowerAnalysis = aiAnalysis.toLowerCase();

    const negativePatterns = [
        /نیست/, /نامعتبر/, /غلط/, /اشتباه/, /بی ربط/,
        /تصویر نیست/, /عکس نیست/, /رسید نیست/,
        /اسکرین شات/, /selfie/, /سلفی/, /تصویر شخص/,
        /unrelated/, /not.*receipt/, /invalid/, /fake/,
        /not valid/, /no receipt/, /screenshot/,
        /پس زمینه/, /تصویر زمینه/, /عکس پروفایل/,
        /لوگو/, /تبلیغ/, /آگهی/, /تبليغ/,
    ];

    if (negativePatterns.some(p => p.test(lowerAnalysis))) return true;

    const positivePatterns = [
        /رسید/, /پرداخت/, /واریز/, /کارت به کارت/, /انتقال/,
        /مبلغ/, /تومان/, /ریال/, /بانک/, /حساب/,
        /succesful/, /successful/, /payment/, /transfer/, /receipt/,
        /تأیید/, /تایید/, /انجام شد/,
    ];

    if (!positivePatterns.some(p => p.test(lowerAnalysis)) && aiAnalysis.length < 100) return true;

    return false;
}

function isUserBanned(userId: number): boolean {
    const record = invalidReceiptAttempts.get(userId);
    if (!record || record.bannedUntil === 0) return false;
    if (Date.now() > record.bannedUntil) {
        invalidReceiptAttempts.delete(userId);
        return false;
    }
    return true;
}

function getBanRemaining(userId: number): number {
    const record = invalidReceiptAttempts.get(userId);
    if (!record || record.bannedUntil === 0) return 0;
    return Math.max(0, Math.ceil((record.bannedUntil - Date.now()) / 60000));
}

// Step 1: Show payment methods
export async function handleAddBalance(ctx: any, db: D1Database, env?: Bindings) {
    const userId = ctx.from?.id;
    if (!userId) return;

    if (isUserBanned(userId)) {
        const remaining = getBanRemaining(userId);
        await ctx.reply(`🚫 شما به مدت ${remaining} دقیقه از ارسال رسید محروم هستید.`, { reply_markup: await mainMenuKeyboard(db, userId) });
        return;
    }

    PaymentMethod.use(db);
    const cryptoEnabled = env ? await isCryptoGatewayConfigured(db, env) : false;

    // Keep CRYPTO row in sync when gateway is configured (create + activate if needed)
    if (cryptoEnabled) {
        try {
            await PaymentMethod.activateCryptoMethodForGateway();
        } catch (e: any) {
            console.error('ensure crypto payment method failed:', e?.message);
        }
    }

    let methods = await PaymentMethod.getActiveMethods();
    // Never show CRYPTO via generic active list alone — only when gateway has an API key
    methods = methods.filter((m) => !PaymentMethod.isCryptoMethod(m));

    if (cryptoEnabled) {
        const cryptoMethod = await PaymentMethod.findCryptoMethod();
        if (cryptoMethod?.is_active) {
            methods = [cryptoMethod, ...methods];
        }
    }

    if (methods.length === 0) {
        await ctx.reply(MESSAGES.NO_PAYMENT_METHODS, { reply_markup: await mainMenuKeyboard(db, userId) });
        return;
    }

    await startPaymentFlow(db, userId, { step: 'method' });
    await ctx.reply(MESSAGES.SELECT_PAYMENT_METHOD, { reply_markup: paymentMethodKeyboard(methods) });
}

// Step 2: Handle payment method selection
export async function handlePaymentMethodSelect(ctx: any, db: D1Database, userId: number, text: string, env?: Bindings) {
    const state = await getPaymentFlow(db, userId);
    if (!state || state.step !== 'method') return false;

    PaymentMethod.use(db);
    const cryptoEnabled = env ? await isCryptoGatewayConfigured(db, env) : false;
    let methods = await PaymentMethod.getActiveMethods();
    methods = methods.filter((m) => !PaymentMethod.isCryptoMethod(m));
    if (cryptoEnabled) {
        const cryptoMethod = await PaymentMethod.findCryptoMethod();
        if (cryptoMethod?.is_active) {
            methods = [cryptoMethod, ...methods];
        }
    }

    const selected = methods.find((m) => text === m.name);

    if (!selected) {
        await ctx.reply('لطفاً یک روش پرداخت انتخاب کنید.', { reply_markup: paymentMethodKeyboard(methods) });
        return true;
    }

    if (PaymentMethod.isCryptoMethod(selected)) {
        if (!env || !(await isCryptoGatewayConfigured(db, env))) {
            await ctx.reply(MESSAGES.CRYPTO_GATEWAY_NOT_CONFIGURED, { reply_markup: await mainMenuKeyboard(db, userId) });
            await clearPaymentFlow(db, userId);
            return true;
        }

        await setPaymentFlow(db, userId, {
            step: 'crypto_network',
            methodId: selected.id,
            methodName: selected.name,
            cardNumber: selected.card_number,
            cardHolder: selected.card_holder,
            minAmount: selected.min_amount,
            maxAmount: selected.max_amount,
            isCrypto: true,
            networkId: DEFAULT_CRYPTO_NETWORK,
        });

        await ctx.reply(MESSAGES.SELECT_CRYPTO_NETWORK, {
            reply_markup: cryptoNetworkKeyboard([...CRYPTO_NETWORKS]),
        });
        return true;
    }

    await setPaymentFlow(db, userId, {
        step: 'amount',
        methodId: selected.id,
        methodName: selected.name,
        cardNumber: selected.card_number,
        cardHolder: selected.card_holder,
        minAmount: selected.min_amount,
        maxAmount: selected.max_amount,
        isCrypto: false,
    });

    await ctx.reply(
        MESSAGES.ENTER_AMOUNT(selected.card_number, selected.card_holder),
        { parse_mode: 'HTML', reply_markup: paymentAmountKeyboard() }
    );
    return true;
}

export async function handleCryptoNetworkSelect(ctx: any, db: D1Database, userId: number, text: string) {
    const state = await getPaymentFlow(db, userId);
    if (!state || state.step !== 'crypto_network' || !state.isCrypto) return false;

    const selected = CRYPTO_NETWORKS.find((n) => n.label === text || n.id === text);
    if (!selected) {
        await ctx.reply(MESSAGES.SELECT_CRYPTO_NETWORK, {
            reply_markup: cryptoNetworkKeyboard([...CRYPTO_NETWORKS]),
        });
        return true;
    }

    await setPaymentFlow(db, userId, {
        ...state,
        step: 'amount',
        networkId: selected.id,
    });

    await ctx.reply(
        `🌐 شبکه: <b>${selected.label}</b>\n\nلطفاً مبلغ شارژ را به <b>تومان</b> وارد کنید:`,
        { parse_mode: 'HTML', reply_markup: paymentAmountKeyboard() }
    );
    return true;
}

// Step 3: Handle amount input
export async function handlePaymentAmount(ctx: any, userId: number, text: string, db: D1Database, env?: Bindings) {
    const state = await getPaymentFlow(db, userId);
    if (!state || state.step !== 'amount') return false;

    const amount = parseInt(text.replace(/[^\d]/g, ''), 10);
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply(MESSAGES.INVALID_AMOUNT, { reply_markup: paymentAmountKeyboard() });
        return true;
    }

    if (state.minAmount && amount < state.minAmount) {
        await ctx.reply(MESSAGES.MIN_AMOUNT(state.minAmount), { reply_markup: paymentAmountKeyboard() });
        return true;
    }

    if (state.maxAmount && amount > state.maxAmount) {
        await ctx.reply(MESSAGES.MAX_AMOUNT(state.maxAmount), { reply_markup: paymentAmountKeyboard() });
        return true;
    }

    if (state.isCrypto) {
        if (!env) {
            await ctx.reply(MESSAGES.CRYPTO_GATEWAY_NOT_CONFIGURED, { reply_markup: helpKeyboard(false) });
            await clearPaymentFlow(db, userId);
            return true;
        }
        await createCryptoTopUp(ctx, db, env, userId, { ...state, amount });
        return true;
    }

    await setPaymentFlow(db, userId, { ...state, step: 'receipt', amount });

    await ctx.reply(
        MESSAGES.AMOUNT_RECEIVED(amount, state.cardNumber || '', state.cardHolder || ''),
        { parse_mode: 'HTML', reply_markup: paymentReceiptKeyboard() }
    );
    return true;
}

async function createCryptoTopUp(
    ctx: any,
    db: D1Database,
    env: Bindings,
    userId: number,
    state: {
        methodId?: number;
        methodName?: string;
        minAmount?: number;
        maxAmount?: number;
        amount?: number;
        networkId?: string;
    },
) {
    const amount = state.amount ?? 0;
    const networkId = state.networkId || DEFAULT_CRYPTO_NETWORK;

    if (!(await isCryptoGatewayConfigured(db, env))) {
        await ctx.reply(MESSAGES.CRYPTO_GATEWAY_NOT_CONFIGURED, { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearPaymentFlow(db, userId);
        return;
    }

    Setting.use(db);
    const dollarRateRaw = await Setting.get('dollar_rate');
    const dollarRate = parseFloat(dollarRateRaw || '0');
    if (!dollarRate || dollarRate <= 0) {
        await ctx.reply(MESSAGES.CRYPTO_DOLLAR_RATE_MISSING, { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearPaymentFlow(db, userId);
        return;
    }

    const usdAmount = Math.round((amount / dollarRate) * 1e8) / 1e8;
    if (usdAmount <= 0) {
        await ctx.reply(MESSAGES.INVALID_AMOUNT, { reply_markup: paymentAmountKeyboard() });
        return;
    }

    PaymentMethod.use(db);
    let methodId = state.methodId;
    if (!methodId) {
        const cryptoMethod = await PaymentMethod.findCryptoMethod();
        if (!cryptoMethod) {
            await ctx.reply(MESSAGES.CRYPTO_GATEWAY_NOT_CONFIGURED, { reply_markup: await mainMenuKeyboard(db, userId) });
            await clearPaymentFlow(db, userId);
            return;
        }
        methodId = cryptoMethod.id;
    }

    Payment.use(db);
    const created = await Payment.create({
        user_chat_id: userId,
        user_username: ctx.from?.username ?? null,
        user_first_name: ctx.from?.first_name ?? null,
        payment_method_id: methodId,
        amount,
        card_number: networkId,
        card_holder: 'Crypto Gateway',
        receipt_image_url: null,
        status: 'pending',
        payment_type: 'crypto',
        network_id: networkId,
        crypto_status: 'pending',
        fiat_currency: 'USD',
    });
    const localId = created.lastInsertRowid;

    try {
        const config = await gatewayConfigFromSettings(db, env);
        const gateway = await createGatewayPayment(config, {
            amount: usdAmount,
            network_id: networkId,
            title: `Telegram top-up #${localId}`,
            fiat_currency: 'USD',
            metadata: {
                payment_id: localId,
                telegram_user_id: userId,
            },
            expiration_minutes: 30,
        });

        const checkoutUrl =
            gateway.checkout_url ||
            `${(config.baseUrl || 'https://crypto-gateway.social-panel.workers.dev').replace(/\/$/, '')}/checkout/${gateway.id}`;

        await Payment.update(String(localId), {
            gateway_payment_id: gateway.id,
            wallet_address: gateway.wallet_address,
            crypto_amount: gateway.crypto_amount,
            crypto_amount_formatted: gateway.crypto_amount_formatted || String(gateway.crypto_amount),
            checkout_url: checkoutUrl,
            expires_at: gateway.expires_at,
            crypto_status: gateway.status || 'pending',
            fiat_currency: gateway.fiat_currency || 'USD',
            gateway_exchange_rate: gateway.exchange_rate ?? null,
            updated_at: nowTehran(),
        });

        await setPaymentFlow(db, userId, {
            step: 'crypto_waiting',
            isCrypto: true,
            amount,
            networkId,
            localPaymentId: localId,
            methodId,
        });

        const cryptoDisplay =
            gateway.crypto_amount_formatted ||
            `${gateway.crypto_amount} ${gateway.network?.currency || ''}`.trim();
        const expiresDisplay = gateway.expires_at
            ? new Date(gateway.expires_at).toLocaleString('fa-IR')
            : '-';

        await ctx.reply(
            MESSAGES.CRYPTO_PAYMENT_CREATED(
                amount,
                cryptoDisplay,
                networkLabel(networkId),
                gateway.wallet_address,
                checkoutUrl,
                expiresDisplay,
            ),
            { parse_mode: 'HTML', reply_markup: cryptoWaitingKeyboard() },
        );
    } catch (e: any) {
        const msg = e instanceof CryptoGatewayError ? e.message : (e?.message || 'خطای ناشناخته');
        await Payment.markCryptoTerminal(localId, 'failed', 'failed', msg);
        await clearPaymentFlow(db, userId);
        await ctx.reply(MESSAGES.CRYPTO_CREATE_FAILED(msg), { reply_markup: await mainMenuKeyboard(db, userId) });
    }
}

export async function handleCryptoStatusCheck(ctx: any, db: D1Database, env: Bindings, userId: number) {
    const state = await getPaymentFlow(db, userId);
    let localId = state?.localPaymentId;

    Payment.use(db);
    if (!localId) {
        const latest = await Payment.findLatestByUserChatId(userId);
        if (latest && latest.payment_type === 'crypto' && latest.status === 'pending') {
            localId = latest.id;
        }
    }

    if (!localId) {
        await ctx.reply(MESSAGES.CRYPTO_NO_PENDING, { reply_markup: await mainMenuKeyboard(db, userId) });
        await clearPaymentFlow(db, userId);
        return true;
    }

    const result = await refreshLocalCryptoPayment(db, env, localId, false);
    if (!result.ok) {
        await ctx.reply(MESSAGES.CRYPTO_CREATE_FAILED(result.error || 'خطا'), {
            reply_markup: cryptoWaitingKeyboard(),
        });
        return true;
    }

    const payment = result.payment as any;
    if (payment?.status === 'approved') {
        await clearPaymentFlow(db, userId);
        await ctx.reply(MESSAGES.CRYPTO_PAYMENT_CONFIRMED(payment.amount), { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    if (payment?.status === 'expired' || payment?.crypto_status === 'expired') {
        await clearPaymentFlow(db, userId);
        await ctx.reply(MESSAGES.CRYPTO_PAYMENT_EXPIRED, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    if (payment?.status === 'failed' || payment?.crypto_status === 'failed') {
        await clearPaymentFlow(db, userId);
        await ctx.reply(MESSAGES.CRYPTO_PAYMENT_FAILED, { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    await ctx.reply(MESSAGES.CRYPTO_STILL_PENDING(payment?.crypto_status || 'pending'), {
        parse_mode: 'HTML',
        reply_markup: cryptoWaitingKeyboard(),
    });
    return true;
}

// Step 4: Handle receipt image
export async function handlePaymentReceipt(ctx: any, db: D1Database, userId: number, AI?: Ai) {
    const state = await getPaymentFlow(db, userId);
    if (!state || state.step !== 'receipt') return false;

    if (isUserBanned(userId)) {
        const remaining = getBanRemaining(userId);
        await ctx.reply(`🚫 شما به مدت ${remaining} دقیقه از ارسال رسید محروم هستید.`, { reply_markup: paymentReceiptKeyboard() });
        return true;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const fileId = photo.file_id;

    // AI receipt analysis
    let aiAnalysis = '🔍 تحلیل هوش مصنوعی: بررسی نشد';
    let isReceiptValid = true;

    if (AI) {
        try {
            Setting.use(db);
            const receiptEnabled = await Setting.get('receipt_analysis_enabled');
            if (receiptEnabled === 'false') {
                aiAnalysis = '🔍 تحلیل هوش مصنوعی: غیرفعال';
            } else {
                const token = await Setting.get('telegram_token');
                const receiptPrompt = await Setting.get('receipt_analysis_prompt');
                if (token) {
                    const tempApi = new Api(token);
                    const file = await tempApi.getFile(fileId);
                    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

                    const paymentInfo = `مبلغ: ${(state.amount ?? 0).toLocaleString()} تومان، شماره کارت: ${state.cardNumber}، نام صاحب کارت: ${state.cardHolder}، روش پرداخت: ${state.methodName}`;
                    const finalPrompt = receiptPrompt
                        ? receiptPrompt.replace(/\{payment\}/g, paymentInfo)
                        : undefined;

                    aiAnalysis = await analyzeReceiptWithAI(AI, fileUrl, finalPrompt);

                    const verificationRequired = await Setting.get('receipt_verification_required');
                    if (verificationRequired !== 'false') {
                        isReceiptValid = !isReceiptInvalid(aiAnalysis);

                        if (!isReceiptValid) {
                            const maxAttempts = parseInt(await Setting.get('receipt_max_invalid_attempts') || '2', 10);
                            const banHours = parseInt(await Setting.get('receipt_ban_hours') || '3', 10);
                            const record = invalidReceiptAttempts.get(userId) || { count: 0, bannedUntil: 0 };
                            record.count++;

                            if (record.count >= maxAttempts) {
                                record.bannedUntil = Date.now() + (banHours * 60 * 60 * 1000);
                                record.count = 0;
                                invalidReceiptAttempts.set(userId, record);
                                await ctx.reply(
                                    `🚫 شما به مدت ${banHours} ساعت از ارسال رسید محروم شدید.\n\n` +
                                    `علت: ارسال عکس نامعتبر (${maxAttempts} بار متوالی)`,
                                    { reply_markup: await mainMenuKeyboard(db, userId) }
                                );
                                await clearPaymentFlow(db, userId);
                                return true;
                            } else {
                                invalidReceiptAttempts.set(userId, record);
                                await ctx.reply(
                                    `⚠️ تصویر ارسال شده به نظر رسید پرداخت نیست.\n\n` +
                                    `🤖 تحلیل هوش مصنوعی: ${aiAnalysis}\n\n` +
                                    `(تلاش ${record.count} از ${maxAttempts})`,
                                    { reply_markup: paymentReceiptKeyboard() }
                                );
                                return true;
                            }
                        }
                    }
                }
            }
        } catch (e: any) {
            aiAnalysis = `🔍 تحلیل هوش مصنوعی: خطا - ${e.message}`;
        }
    }

    // Reset invalid attempts
    invalidReceiptAttempts.delete(userId);

    // Save payment
    Payment.use(db);
    await Payment.create({
        user_chat_id: userId,
        user_username: ctx.from.username ?? null,
        user_first_name: ctx.from.first_name ?? null,
        payment_method_id: state.methodId,
        amount: state.amount,
        card_number: state.cardNumber,
        card_holder: state.cardHolder,
        receipt_image_url: fileId,
        status: 'pending',
    });

    const latestPayment = await Payment.findLatestByUserChatId(userId);
    const paymentId = latestPayment?.id;
    await clearPaymentFlow(db, userId);

    // Send to admin
    Setting.use(db);
    const token = await Setting.get('telegram_token');
    if (token) {
        const adminApi = new Api(token);
        TelegramUser.use(db);
        const admins = await TelegramUser.where('role', 'admin');

        for (const admin of admins) {
            try {
                const kb = new (await import('grammy')).InlineKeyboard()
                    .text('✅ تایید', `pay_approve_${paymentId}`)
                    .text('❌ رد', `pay_reject_${paymentId}`).row();

                await adminApi.sendPhoto(
                    (admin as any).chat_id,
                    fileId,
                    {
                        caption:
                            `💰 پرداخت جدید\n\n` +
                            `👤 کاربر: ${ctx.from.first_name} (${ctx.from.username || 'بدون نام کاربری'})\n` +
                            `💬 Chat ID: ${userId}\n` +
                            `💳 روش پرداخت: ${state.methodName}\n` +
                            `💰 مبلغ: ${(state.amount ?? 0).toLocaleString()} تومان\n` +
                            `🏦 شماره کارت: ${state.cardNumber}\n` +
                            `📝 نام صاحب کارت: ${state.cardHolder}\n\n` +
                            `🤖 ${aiAnalysis}`,
                        reply_markup: kb,
                    }
                );
            } catch {}
        }
    }

    await ctx.reply(MESSAGES.PAYMENT_SUBMITTED, { reply_markup: await mainMenuKeyboard(db, userId) });
    return true;
}

// Handle payment method callback (for admin approve/reject)
export async function handlePaymentMethodCallback(ctx: any, db: D1Database, userId: number, data: string) {
    const methodId = Number(data.slice(4));
    PaymentMethod.use(db);
    const method = await PaymentMethod.find<{ id: number; name: string; card_number: string; card_holder: string; min_amount: number; max_amount: number }>(String(methodId));

    if (!method) {
        await ctx.reply(MESSAGES.PAYMENT_NOT_FOUND);
        await ctx.answerCallbackQuery();
        return;
    }

    await setPaymentFlow(db, userId, {
        step: 'amount',
        methodId: method.id,
        methodName: method.name,
        cardNumber: method.card_number,
        cardHolder: method.card_holder,
        minAmount: method.min_amount,
        maxAmount: method.max_amount,
    });

    await ctx.reply(
        MESSAGES.ENTER_AMOUNT(method.card_number, method.card_holder),
        { parse_mode: 'HTML', reply_markup: paymentAmountKeyboard() }
    );
    await ctx.answerCallbackQuery();
}

// Handle back button in payment flow
export async function handlePaymentBack(ctx: any, db: D1Database, userId: number, env?: Bindings) {
    const state = await getPaymentFlow(db, userId);
    if (!state) return false;

    if (state.step === 'crypto_network') {
        await clearPaymentFlow(db, userId);
        await handleAddBalance(ctx, db, env);
        return true;
    }

    if (state.step === 'receipt' || state.step === 'amount' || state.step === 'crypto_waiting') {
        await clearPaymentFlow(db, userId);
        await ctx.reply('❌ افزایش موجودی لغو شد.', { reply_markup: await mainMenuKeyboard(db, userId) });
        return true;
    }

    return false;
}

export async function handlePaymentApprove(ctx: any, db: D1Database, api: Api, data: string) {
    const paymentId = Number(data.slice(12));

    // Verify that the user clicking is an admin
    const userId = ctx.from?.id;
    if (!userId) { await ctx.answerCallbackQuery(); return; }
    TelegramUser.use(db);
    const caller = await TelegramUser.findBy<{ role: string }>('chat_id', userId);
    if (!caller || caller.role !== 'admin') {
        await ctx.answerCallbackQuery({ text: '⛔ شما دسترسی ادمین ندارید', show_alert: true });
        return;
    }

    Payment.use(db);
    const payment = await Payment.find<{ id: number; status: string; user_chat_id: number; amount: number }>(String(paymentId));

    if (!payment) {
        await ctx.reply(MESSAGES.PAYMENT_NOT_FOUND);
        await ctx.answerCallbackQuery();
        return;
    }

    const approved = await Payment.approveAndCredit(paymentId, payment.user_chat_id, payment.amount);
    if (!approved) {
        await ctx.reply(MESSAGES.PAYMENT_ALREADY_REVIEWED);
        await ctx.answerCallbackQuery();
        return;
    }

    try {
        await api.sendMessage(payment.user_chat_id, MESSAGES.PAYMENT_APPROVED(payment.amount));
    } catch {}

    await ctx.editMessageCaption({
        caption: `✅ پرداخت تایید شد\n\nمبلغ: ${payment.amount.toLocaleString()} تومان`,
    });
    await ctx.answerCallbackQuery({ text: 'پرداخت تایید شد' });
}

export async function handlePaymentReject(ctx: any, db: D1Database, api: Api, data: string) {
    const paymentId = Number(data.slice(11));

    // Verify that the user clicking is an admin
    const userId = ctx.from?.id;
    if (!userId) { await ctx.answerCallbackQuery(); return; }
    TelegramUser.use(db);
    const caller = await TelegramUser.findBy<{ role: string }>('chat_id', userId);
    if (!caller || caller.role !== 'admin') {
        await ctx.answerCallbackQuery({ text: '⛔ شما دسترسی ادمین ندارید', show_alert: true });
        return;
    }

    Payment.use(db);
    const payment = await Payment.find<{ id: number; status: string; user_chat_id: number; amount: number }>(String(paymentId));

    if (!payment) {
        await ctx.reply(MESSAGES.PAYMENT_NOT_FOUND);
        await ctx.answerCallbackQuery();
        return;
    }

    const rejected = await Payment.updatePendingStatus(paymentId, 'rejected');
    if (!rejected) {
        await ctx.reply(MESSAGES.PAYMENT_ALREADY_REVIEWED);
        await ctx.answerCallbackQuery();
        return;
    }

    try {
        await api.sendMessage(payment.user_chat_id, MESSAGES.PAYMENT_REJECTED(payment.amount));
    } catch {}

    await ctx.editMessageCaption({
        caption: `❌ پرداخت رد شد\n\nمبلغ: ${payment.amount.toLocaleString()} تومان`,
    });
    await ctx.answerCallbackQuery({ text: 'پرداخت رد شد' });
}
