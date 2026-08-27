import { AiSetting, AiUsageLog } from '../../db/AiSetting';
import { BotHelp } from '../../db/BotHelp';
import { startAiFlow, clearAiFlow } from '../botFlows';
import { backKeyboard, mainMenuKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';

export async function handleAiEnter(ctx: any, db: D1Database, userId: number) {
    await startAiFlow(db, userId);
    await ctx.reply(MESSAGES.AI_ENTER, { reply_markup: backKeyboard() });
}

export async function handleAiExit(ctx: any, db: D1Database, userId: number) {
    await clearAiFlow(db, userId);
    await ctx.reply(MESSAGES.AI_EXIT, { reply_markup: await mainMenuKeyboard(db, userId) });
}

export async function handleAiMessage(
    ctx: any,
    db: D1Database,
    ai: Ai,
    userId: number,
    text: string
) {
    try {
        AiSetting.use(db);
        const aiEnabled = await AiSetting.get('ai_user_enabled');

        if (aiEnabled !== 'true') {
            await clearAiFlow(db, userId);
            await ctx.reply(MESSAGES.AI_DISABLED, { reply_markup: await mainMenuKeyboard(db, userId) });
            return;
        }

        const dailyLimitStr = await AiSetting.get('ai_user_daily_limit');
        const dailyLimit = parseInt(dailyLimitStr || '0', 10);

        if (dailyLimit > 0) {
            AiUsageLog.use(db);
            const todayUsage = await AiUsageLog.getTodayUsageByChatId(userId);
            if (todayUsage.totalRequests >= dailyLimit) {
                await clearAiFlow(db, userId);
                await ctx.reply(MESSAGES.AI_DAILY_LIMIT(dailyLimit), { reply_markup: await mainMenuKeyboard(db, userId) });
                return;
            }
        }

        const model = (await AiSetting.get('ai_user_model')) || '@cf/meta/llama-4-scout-17b-16e-instruct';
        const systemPrompt = (await AiSetting.get('ai_user_system_prompt')) || 'شما یک دستیار مفید هستید.';
        const maxTokens = parseInt((await AiSetting.get('ai_user_max_tokens')) || '512', 10);
        const temperature = parseFloat((await AiSetting.get('ai_user_temperature')) || '0.7');

        let rulesContext = '';
        try {
            BotHelp.use(db);
            const helps = await BotHelp.all<{ name: string; description: string }>();
            if (helps.length > 0) {
                rulesContext = '\n\nقوانین و راهنمای ربات:\n';
                for (const h of helps) {
                    rulesContext += `\n${h.name}:\n${h.description}\n`;
                }
            }
        } catch {}

        const fullSystemPrompt = systemPrompt + rulesContext;

        const aiResponse = await ai.run(model, {
            messages: [
                { role: 'system', content: fullSystemPrompt },
                { role: 'user', content: text },
            ],
            max_tokens: maxTokens,
            temperature,
        });

        const responseText = (aiResponse as any)?.response || 'پاسخی دریافت نشد.';

        AiUsageLog.use(db);
        await AiUsageLog.logUsage('user', userId, maxTokens);

        await clearAiFlow(db, userId);
        await ctx.reply(responseText, { reply_markup: await mainMenuKeyboard(db, userId) });
    } catch (aiError) {
        console.error('AI error:', aiError);
        await clearAiFlow(db, userId);
        await ctx.reply(MESSAGES.AI_ERROR, { reply_markup: await mainMenuKeyboard(db, userId) });
    }
}
