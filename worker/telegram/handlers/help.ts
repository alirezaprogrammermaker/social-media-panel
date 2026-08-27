import { InlineKeyboard } from 'grammy';
import { BotHelp } from '../../db/BotHelp';
import { helpKeyboard, mainMenuKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';

export async function handleHelp(ctx: any, db: D1Database) {
    const userId = ctx.from?.id;
    BotHelp.use(db);
    const helps = await BotHelp.all<{ id: number; name: string; description: string; sort_order: number }>();
    helps.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    if (helps.length === 0) {
        await ctx.reply(
            MESSAGES.NO_HELP,
            { reply_markup: userId ? await mainMenuKeyboard(db, userId) : helpKeyboard(false) },
        );
        return;
    }

    const kb = new InlineKeyboard();
    for (const h of helps) {
        kb.text(h.name, `help_${h.id}`).row();
    }
    await ctx.reply(MESSAGES.SELECT_HELP, { reply_markup: kb });
}

export async function handleHelpCallback(ctx: any, db: D1Database, data: string) {
    const id = Number(data.slice(5));
    BotHelp.use(db);
    const help = await BotHelp.find<{ id: number; name: string; description: string }>(String(id));

    if (help) {
        await ctx.reply(help.description, { parse_mode: 'HTML' });
    } else {
        await ctx.reply(MESSAGES.HELP_NOT_FOUND);
    }
    await ctx.answerCallbackQuery();
}
