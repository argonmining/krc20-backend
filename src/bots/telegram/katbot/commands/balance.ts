import { Context } from 'telegraf';
import { fetchKRC20Balances, formatBalance } from '../utils';
import { isTextMessage } from '../utils';

export const handleBalanceCommand = async (ctx: Context) => {
  if (ctx.message && isTextMessage(ctx.message)) {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length !== 1) {
      return ctx.reply('Please provide a valid Kaspa wallet address. Usage: /balance <KASPA_WALLET_ADDRESS>');
    }

    const address = args[0].trim();

    // Kaspa address format: kaspa:q...
    if (!/^kaspa:[a-z0-9]{61,63}$/.test(address)) {
      return ctx.reply('Invalid Kaspa wallet address format. Please provide a valid Kaspa address starting with "kaspa:".');
    }

    try {
      const balances = await fetchKRC20Balances(address);

      if (balances.length === 0) {
        return ctx.reply(`No KRC20 tokens found for address: ${address}`);
      }

      let response = `KRC20 Balances for ${address}:\n`;
      balances.forEach((token) => {
        response += `${token.tick}: ${formatBalance(token.balance, parseInt(token.dec))}\n`;
      });

      ctx.reply(response);
    } catch (error) {
      console.error(`Error handling balance command: ${error}`);
      ctx.reply('Failed to retrieve balances. Please try again later or contact support if the issue persists.');
    }
  } else {
    ctx.reply('This command only works with text messages.');
  }
};
