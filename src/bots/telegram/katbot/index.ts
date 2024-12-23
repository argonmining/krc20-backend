import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
import { handleBalanceCommand } from './commands/balance';
import { handleStatusCommand } from './commands/status';
import { handleMintCommand } from './commands/mint'; // Add this line

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN as string);

bot.start((ctx) => ctx.reply('Welcome to the Kat Bot! Use /help to see available commands.'));
bot.help((ctx) => {
  const helpMessage = `
Available commands:
/balance <WALLET_ADDRESS> - Check KRC20 token balances for a wallet
/status <TOKEN_TICKER> - Get information about a specific KRC20 token
/mint - Get a link to mint KRC20 tokens
`;
  ctx.reply(helpMessage);
});

// Register the /balance command
bot.command('balance', handleBalanceCommand);

// Register the /status command
bot.command('status', handleStatusCommand);

// Register the /mint command
bot.command('mint', handleMintCommand);

bot.launch()
  .then(() => {
    console.log('Bot is up and running...');
  })
  .catch((error) => {
    console.error('Error starting the bot:', error);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});