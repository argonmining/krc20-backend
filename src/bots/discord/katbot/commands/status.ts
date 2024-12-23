import { Message } from 'discord.js';
import { getTokenInfo } from '../utils/tokenInfo';
import { Network } from '../utils/userSettings';
import { Logger } from '../utils/logger';
import { handleError, AppError } from '../utils/errorHandler';

export const handleStatusCommand = async (message: Message, args: string[]) => {
	if (args.length !== 1) {
		await message.reply('Please provide a valid token ticker. Usage: !status <TICKER>');
		return;
	}

	const ticker = args[0].toUpperCase();
	const network: Network = 'Mainnet';

	try {
		Logger.info(`Status command triggered for ticker: ${ticker} on network: ${network}`);
		const tokenInfoEmbed = await getTokenInfo(ticker);
		await message.reply({ embeds: [tokenInfoEmbed] });
	} catch (error) {
		await handleError(error, message.channel, 'handleStatusCommand');
	}
};