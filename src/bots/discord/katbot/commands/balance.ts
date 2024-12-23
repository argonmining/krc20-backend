import { Message, EmbedBuilder } from 'discord.js';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { handleError, AppError } from '../utils/errorHandler';

interface TokenBalance {
    tick: string;
    balance: string;
    dec: string;
}

function formatBalance(balance: string, decimals: number): string {
    const balanceBigInt = BigInt(balance);
    const divisor = BigInt(10 ** decimals);
    const integerPart = balanceBigInt / divisor;
    const fractionalPart = balanceBigInt % divisor;

    let formattedBalance = integerPart.toLocaleString('en-US');
    if (fractionalPart > 0) {
        const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
        const trimmedFractionalStr = fractionalStr.replace(/0+$/, '');
        if (trimmedFractionalStr.length > 0) {
            formattedBalance += '.' + trimmedFractionalStr;
        }
    }

    return formattedBalance;
}

async function fetchKRC20Balances(address: string): Promise<TokenBalance[]> {
    const apiBaseUrl = process.env.MAINNET_API_BASE_URL;
    if (!apiBaseUrl) {
        throw new AppError('Invalid Configuration', 'API base URL not found for Mainnet', 'INVALID_CONFIGURATION');
    }

    const url = `${apiBaseUrl}/address/${address}/tokenlist`;
    try {
        const response = await axios.get(url);
        return response.data.result;
    } catch (error) {
        Logger.error(`Failed to fetch KRC20 balances: ${error}`);
        throw new AppError('Balance Retrieval Failed', 'Failed to retrieve KRC20 balances', 'BALANCE_RETRIEVAL_FAILED');
    }
}

export const handleBalanceCommand = async (message: Message, args: string[]) => {
    if (args.length !== 1) {
        await message.reply('Please provide a valid wallet address. Usage: !balance <WALLET_ADDRESS>');
        return;
    }

    const address = args[0];

    try {
        Logger.info(`Balance command triggered for address: ${address} on Mainnet`);
        const balances = await fetchKRC20Balances(address);

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('KRC20 Balances')
            .setDescription(`${address}`)
            .setTimestamp();

        balances.forEach((token) => {
            const formattedBalance = formatBalance(token.balance, parseInt(token.dec));
            embed.addFields({ name: token.tick, value: formattedBalance, inline: true });
        });

        embed.setFooter({ text: 'Built with ❤️ by the Nacho the 𐤊at Community', iconURL: 'https://media.discordapp.net/attachments/1262092990273294458/1278406148235460709/NACHO_best_final.png?ex=66d0b001&is=66cf5e81&hm=0b93b66600c0b2f4b1146bedca819ef85c198f4a5dc9999ec1842d22cecf0c94&=&format=webp&quality=lossless' });

        await message.reply({ embeds: [embed] });
    } catch (error) {
        await handleError(error, message.channel, 'handleBalanceCommand');
    }
};