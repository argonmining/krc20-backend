import { Context } from 'telegraf';

export const handleMintCommand = async (ctx: Context) => {
  const mintLink = 'https://t.me/kspr_home_bot?start=nacho';
  const message = `To mint KRC20 tokens, please visit the following link:\n${mintLink}`;
  
  await ctx.reply(message, { disable_web_page_preview: true } as any);
};