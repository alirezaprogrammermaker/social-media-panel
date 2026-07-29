import { InlineKeyboard } from 'grammy';
import { TelegramUser } from '../../db/TelegramUser';
import { BotChannel } from '../../db/BotChannel';
import { Setting } from '../../db/Setting';
import { helpKeyboard } from '../keyboards';
import { MESSAGES } from '../constants';
import { checkMembership } from '../state';
import type { Api } from 'grammy';

export async function handleStart(
    ctx: any,
    api: Api,
    db: D1Database,
    userId: number
) {
    TelegramUser.use(db);
    const { id: chat_id, username, first_name } = ctx.message.from;

    const existing = await TelegramUser.findBy<{ id: number }>('chat_id', chat_id);

    // Check if registration is disabled
    if (!existing) {
        Setting.use(db);
        const registrationDisabled = await Setting.get('registration_disabled');
        if (registrationDisabled === 'true') {
            await ctx.reply('⛔ ثبت‌نام در حال حاضر غیرفعال است.');
            return true;
        }

        await TelegramUser.create({
            chat_id,
            username: username ?? null,
            first_name: first_name ?? null,
        });
    }

    BotChannel.use(db);
    const mandatory = await BotChannel.findMandatory();

    if (mandatory.length > 0) {
        const unjoinedIds = await checkMembership(api, userId, mandatory);
        if (unjoinedIds.length > 0) {
            const unjoined = mandatory.filter((ch) => unjoinedIds.includes(ch.channel_id));
            const kb = new InlineKeyboard();
            for (const ch of unjoined) {
                kb.url(`📢 ${ch.channel_title || ch.channel_username}`, `https://t.me/${ch.channel_username}`).row();
            }
            await ctx.reply(MESSAGES.JOIN_CHANNELS, { reply_markup: kb });
            return true;
        }
    }

    await ctx.reply(MESSAGES.WELCOME(first_name), {
        reply_markup: helpKeyboard(),
    });
    return true;
}

export async function checkChannelMembership(
    ctx: any,
    api: Api,
    db: D1Database,
    userId: number
): Promise<boolean> {
    BotChannel.use(db);
    const mandatory = await BotChannel.findMandatory();
    if (mandatory.length > 0) {
        const unjoinedIds = await checkMembership(api, userId, mandatory);
        if (unjoinedIds.length > 0) {
            const unjoined = mandatory.filter((ch) => unjoinedIds.includes(ch.channel_id));
            const kb = new InlineKeyboard();
            for (const ch of unjoined) {
                kb.url(`📢 ${ch.channel_title || ch.channel_username}`, `https://t.me/${ch.channel_username}`).row();
            }
            await ctx.reply(MESSAGES.JOIN_CHANNELS_OTHER, { reply_markup: kb });
            return true;
        }
    }
    return false;
}
