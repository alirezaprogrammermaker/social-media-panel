import { Hono } from 'hono';
import { Bot, Api, webhookCallback } from 'grammy';
import { TelegramUser } from '../db/TelegramUser';
import { Setting } from '../db/Setting';
import { isSpamming } from './state';
import { BUTTONS, MESSAGES } from './constants';
import { handleStart, checkChannelMembership } from './handlers/start';
import { handleHelp, handleHelpCallback } from './handlers/help';
import { handleAiEnter, handleAiExit, handleAiMessage } from './handlers/ai';
import { handleProfile } from './handlers/profile';
import { handleStats } from './handlers/stats';
import {
    handleOrderStart,
    handleOrderCancel,
    handleOrderBack,
    handleCategorySelect,
    handleServiceSelect,
    handleLinkInput,
    handleQuantityInput,
    handleCategoryPagination,
    handleServicePagination,
} from './handlers/order';
import {
    handleAddBalance,
    handlePaymentAmount,
    handlePaymentReceipt,
    handlePaymentMethodSelect,
    handlePaymentMethodCallback,
    handlePaymentBack,
    handlePaymentApprove,
    handlePaymentReject,
    handleCryptoNetworkSelect,
    handleCryptoStatusCheck,
} from './handlers/payment';
import {
    handleMyOrders,
    handleMyOrdersPagination,
    handleMyOrderSelect,
    handleMyOrdersBack,
    looksLikeOrderListButton,
} from './handlers/myOrders';
import { mainMenuKeyboard } from './keyboards';
import {
    BOT_FLOWS,
    clearFlowSession,
    flowStateFromSession,
    getActiveFlowMap,
} from './flowSession';
import type { Bindings } from '../types';
import type { AiFlowData, MyOrdersFlowData, OrderFlowData, PaymentFlowData } from './botFlows';

const telegram = new Hono<{ Bindings: Bindings }>();

telegram.post('/webhook', async (c) => {
    try {
        Setting.use(c.env.DB);
        const token = await Setting.get('telegram_token');
        if (!token) return c.text('no token', 400);

        // Validate webhook secret token (fail closed)
        const webhookSecret = await Setting.get('telegram_webhook_secret');
        if (!webhookSecret) {
            return c.text('webhook secret not configured', 403);
        }
        const requestSecret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
        if (requestSecret !== webhookSecret) {
            return c.text('unauthorized', 403);
        }

        const bot = new Bot(token);
        const api = new Api(token);

        bot.on('message', async (ctx) => {
            try {
                const userId = ctx.from?.id;
                if (!userId) return;

                TelegramUser.use(c.env.DB);
                if (await TelegramUser.isBlocked(userId)) {
                    const blockInfo = await TelegramUser.getBlockInfo(userId);
                    if (blockInfo?.reason) {
                        await ctx.reply(MESSAGES.BLOCKED(blockInfo.reason));
                    }
                    return;
                }

                if (isSpamming(userId)) {
                    await ctx.reply(MESSAGES.SPAM_WARNING);
                    return;
                }

                const text = ctx.message.text;

                if (text?.startsWith('/start')) {
                    await handleStart(ctx, api, c.env.DB, userId);
                    return;
                }

                const blocked = await checkChannelMembership(ctx, api, c.env.DB, userId);
                if (blocked) return;

                // One D1 round-trip for all active bot flows
                const flows = await getActiveFlowMap(c.env.DB, userId);
                const orderState = flowStateFromSession<OrderFlowData>(flows.get(BOT_FLOWS.ORDER) as any);
                const paymentState = flowStateFromSession<PaymentFlowData>(flows.get(BOT_FLOWS.PAYMENT) as any);
                const aiState = flowStateFromSession<AiFlowData>(flows.get(BOT_FLOWS.AI_CHAT) as any);
                const myOrdersState = flowStateFromSession<MyOrdersFlowData>(flows.get(BOT_FLOWS.MY_ORDERS) as any);

                if (text === BUTTONS.HELP) {
                    await handleHelp(ctx, c.env.DB);
                    return;
                }

                if (text === BUTTONS.AI_CHAT) {
                    await handleAiEnter(ctx, c.env.DB, userId);
                    return;
                }

                if (text === BUTTONS.BACK) {
                    if (aiState) {
                        await handleAiExit(ctx, c.env.DB, userId);
                        return;
                    }

                    if (myOrdersState) {
                        await handleMyOrdersBack(ctx, c.env.DB, userId);
                        return;
                    }

                    if (paymentState) {
                        const handled = await handlePaymentBack(ctx, c.env.DB, userId, c.env);
                        if (handled) return;
                    }

                    const handled = await handleOrderBack(ctx, c.env.DB, userId);
                    if (handled) return;
                }

                if (text && text.includes('لغو افزایش موجودی')) {
                    if (paymentState) {
                        await clearFlowSession(c.env.DB, userId, BOT_FLOWS.PAYMENT);
                        await ctx.reply('❌ افزایش موجودی لغو شد.', { reply_markup: await mainMenuKeyboard(c.env.DB, userId) });
                        return;
                    }
                }

                if (text === BUTTONS.NEW_ORDER) {
                    await handleOrderStart(ctx, c.env.DB, userId);
                    return;
                }

                if (text === BUTTONS.CANCEL_ORDER) {
                    const handled = await handleOrderCancel(ctx, c.env.DB, userId);
                    if (handled) return;
                }

                if (text === BUTTONS.ADD_BALANCE) {
                    await handleAddBalance(ctx, c.env.DB, c.env);
                    return;
                }

                if (text === BUTTONS.PROFILE) {
                    await handleProfile(ctx, c.env.DB, userId);
                    return;
                }

                if (text === BUTTONS.MY_ORDERS) {
                    await handleMyOrders(ctx, c.env.DB, userId);
                    return;
                }

                if (text === BUTTONS.SUPPORT) {
                    Setting.use(c.env.DB);
                    const supportText = await Setting.get('support_message');
                    if (supportText) {
                        await ctx.reply(supportText, { reply_markup: await mainMenuKeyboard(c.env.DB, userId) });
                    } else {
                        await ctx.reply('💬 پشتیبانی: با مدیر تماس بگیرید.', { reply_markup: await mainMenuKeyboard(c.env.DB, userId) });
                    }
                    return;
                }

                if (text === BUTTONS.STATS) {
                    await handleStats(ctx, c.env.DB, userId);
                    return;
                }

                if (text === BUTTONS.BACK_TO_ORDERS) {
                    await handleMyOrdersBack(ctx, c.env.DB, userId);
                    return;
                }

                // Pagination handlers
                if (text === '◀️ قبلی' || text === 'بعدی ▶️') {
                    const direction = text === 'بعدی ▶️' ? 'next' as const : 'prev' as const;

                    if (myOrdersState?.step === 'list') {
                        await handleMyOrdersPagination(ctx, c.env.DB, userId, direction);
                        return;
                    }

                    if (orderState?.step === 'select_category') {
                        await handleCategoryPagination(ctx, c.env.DB, userId, direction);
                        return;
                    }

                    if (orderState?.step === 'select_service') {
                        await handleServicePagination(ctx, c.env.DB, userId, direction);
                        return;
                    }
                }

                if (orderState?.step === 'select_category' && text && !aiState) {
                    await handleCategorySelect(ctx, c.env.DB, userId, text);
                    return;
                }

                if (orderState?.step === 'select_service' && text && !aiState) {
                    await handleServiceSelect(ctx, c.env.DB, userId, text);
                    return;
                }

                if (orderState?.step === 'enter_link' && text && !aiState) {
                    await handleLinkInput(ctx, c.env.DB, userId, text);
                    return;
                }

                if (orderState?.step === 'enter_quantity' && text && !aiState) {
                    await handleQuantityInput(ctx, c.env.DB, userId, text);
                    return;
                }

                if (text && looksLikeOrderListButton(text) && !aiState) {
                    const handled = await handleMyOrderSelect(ctx, c.env.DB, userId, text);
                    if (handled) return;
                }

                if (aiState && text) {
                    await handleAiMessage(ctx, c.env.DB, c.env.AI, userId, text);
                    return;
                }

                if (text === BUTTONS.CHECK_CRYPTO_STATUS) {
                    await handleCryptoStatusCheck(ctx, c.env.DB, c.env, userId);
                    return;
                }

                if (paymentState?.step === 'method' && text && !aiState) {
                    const handled = await handlePaymentMethodSelect(ctx, c.env.DB, userId, text, c.env);
                    if (handled) return;
                }

                if (paymentState?.step === 'crypto_network' && text && !aiState) {
                    const handled = await handleCryptoNetworkSelect(ctx, c.env.DB, userId, text);
                    if (handled) return;
                }

                if (paymentState?.step === 'amount' && text && !aiState) {
                    await handlePaymentAmount(ctx, userId, text, c.env.DB, c.env);
                    return;
                }

                if (paymentState?.step === 'receipt' && ctx.message.photo && !aiState) {
                    await handlePaymentReceipt(ctx, c.env.DB, userId, c.env.AI);
                    return;
                }

                if (text) {
                    await ctx.reply(MESSAGES.DEFAULT_REPLY);
                }
            } catch (error: any) {
                console.error('Error in message handler:', error);
                try {
                    await ctx.reply(MESSAGES.ERROR);
                } catch {}
            }
        });

        bot.on('callback_query:data', async (ctx) => {
            try {
                const data = ctx.callbackQuery.data;
                const userId = ctx.from?.id;

                if (data?.startsWith('help_')) {
                    await handleHelpCallback(ctx, c.env.DB, data);
                }

                if (data?.startsWith('pay_') && !data.startsWith('pay_approve_') && !data.startsWith('pay_reject_')) {
                    await handlePaymentMethodCallback(ctx, c.env.DB, userId, data);
                }

                if (data?.startsWith('pay_approve_')) {
                    await handlePaymentApprove(ctx, c.env.DB, api, data);
                }

                if (data?.startsWith('pay_reject_')) {
                    await handlePaymentReject(ctx, c.env.DB, api, data);
                }
            } catch (error: any) {
                console.error('Error in callback handler:', error);
            }
        });

        const callback = webhookCallback(bot, 'cloudflare-mod');
        return await callback(c.req.raw);
    } catch (error: any) {
        return c.text(`Webhook error: ${error.message}`, 500);
    }
});

export default telegram;
