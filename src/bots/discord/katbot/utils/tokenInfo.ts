import axios from 'axios';
import { EmbedBuilder } from 'discord.js';
import { Logger } from './logger';
import { AppError } from './errorHandler';

interface TokenInfo {
    tick: string;
    max: string;
    lim: string;
    pre: string;
    to: string;
    dec: string;
    minted: string;
    opScoreAdd: string;
    opScoreMod: string;
    state: string;
    hashRev: string;
    mtsAdd: string;
    holderTotal: string;
    transferTotal: string;
    mintTotal: string;
    holder: { address: string; amount: string }[];
}

function formatNumber(num: string, decimals: number): string {
    const parsedNum = BigInt(num);
    const divisor = BigInt(10 ** decimals);
    const integerPart = parsedNum / divisor;
    const fractionalPart = parsedNum % divisor;

    let formattedNum = integerPart.toLocaleString('en-US');

    if (fractionalPart > 0) {
        const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
        const trimmedFractionalStr = fractionalStr.replace(/0+$/, '');
        if (trimmedFractionalStr.length > 0) {
            formattedNum += '.' + trimmedFractionalStr;
        }
    }

    return formattedNum;
}

function formatNumberWithoutDecimals(num: string): string {
    return BigInt(num).toLocaleString('en-US');
}

function calculatePercentage(part: bigint, whole: bigint): string {
    return ((Number(part) / Number(whole)) * 100).toFixed(2) + '%';
}

async function fetchTokenInfo(ticker: string): Promise<TokenInfo> {
    const apiBaseUrl = process.env.MAINNET_API_BASE_URL;
    if (!apiBaseUrl) {
        throw new AppError('Invalid Configuration', 'API base URL not found for Mainnet', 'INVALID_CONFIGURATION');
    }

    const url = `${apiBaseUrl}/token/${ticker}`;
    try {
        const response = await axios.get(url);
        return response.data.result[0];
    } catch (error) {
        Logger.error(`Failed to fetch token info: ${error}`);
        throw new AppError('Token Info Retrieval Failed', 'Failed to retrieve token information', 'TOKEN_INFO_RETRIEVAL_FAILED');
    }
}

function createTokenInfoEmbed(tokenInfo: TokenInfo): EmbedBuilder {
    const state = tokenInfo.state.toLowerCase();

    if (state === 'unused' || state === 'ignored') {
        const embed = new EmbedBuilder()
            .setColor(0xFF0000) // Red color for warning
            .setTitle(`${tokenInfo.tick} Token Information`)
            .setTimestamp();

        if (state === 'unused') {
            embed.setDescription(`${tokenInfo.tick} has not been deployed as a KRC20 Token on Kasplex yet, I have no information to provide. Please try another ticker.`);
        } else if (state === 'ignored') {
            embed.setDescription(`${tokenInfo.tick} is an ignored ticker on Kasplex and cannot be deployed as a KRC20 token, I have no information to provide. Please try another ticker.`);
        }

        embed.setFooter({ 
            text: 'Built with ❤️ by the Nacho the 𐤊at Community', 
            iconURL: 'https://media.discordapp.net/attachments/1262092990273294458/1278406148235460709/NACHO_best_final.png?ex=66d0b001&is=66cf5e81&hm=0b93b66600c0b2f4b1146bedca819ef85c198f4a5dc9999ec1842d22cecf0c94&=&format=webp&quality=lossless' 
        });

        return embed;
    }

    // Existing code for 'deployed' and 'finished' states
    const decimals = parseInt(tokenInfo.dec, 10);
    const maxSupply = BigInt(tokenInfo.max);
    const minted = BigInt(tokenInfo.minted);
    const remaining = maxSupply - minted;
    const preMint = BigInt(tokenInfo.pre);

    const deploymentDate = new Date(parseInt(tokenInfo.mtsAdd)).toUTCString();
    const launchStatus = tokenInfo.pre === '0' ? '🚀  Fair Launch' : '⚠️  Has Pre-Mint';

    const embed = new EmbedBuilder()
        .setColor(tokenInfo.pre === '0' ? 0x00FF00 : 0xFFA500)
        .setTitle(`${tokenInfo.tick} Token Information`)
        .setDescription(`${launchStatus}\n\n${tokenInfo.state.charAt(0).toUpperCase() + tokenInfo.state.slice(1)} on ${deploymentDate}`)
        .addFields(
            { name: 'Maximum Supply', value: formatNumber(tokenInfo.max, decimals), inline: true },
            { name: 'Completed Mints', value: formatNumberWithoutDecimals(tokenInfo.mintTotal), inline: true },
            { name: 'Tokens Per Mint', value: formatNumber(tokenInfo.lim, decimals), inline: true },
            { name: 'Minted', value: `${formatNumber(tokenInfo.minted, decimals)} (${calculatePercentage(minted, maxSupply)})`, inline: true },
            { name: 'Mint Remaining', value: `${formatNumber(remaining.toString(), decimals)} (${calculatePercentage(remaining, maxSupply)})`, inline: true }
        );

    if (tokenInfo.pre !== '0') {
        embed.addFields(
            { name: 'Pre-Minted', value: `${formatNumber(tokenInfo.pre, decimals)} (${calculatePercentage(preMint, maxSupply)})`, inline: true }
        );
    }

    // Add top holders information
    const topHolders = tokenInfo.holder;
    const getTopHoldersInfo = (count: number) => {
        const holders = topHolders.slice(0, count);
        const total = holders.reduce((sum, holder) => sum + BigInt(holder.amount), BigInt(0));
        return {
            total,
            percentage: calculatePercentage(total, minted)
        };
    };

    const top1 = getTopHoldersInfo(1);
    const top5 = getTopHoldersInfo(5);
    const top10 = getTopHoldersInfo(10);
    const top20 = getTopHoldersInfo(20);

    embed.addFields(
        { name: 'Top Holder', value: `${formatNumber(top1.total.toString(), decimals)} (${top1.percentage})`, inline: true },
        { name: 'Top 5 Holders', value: `${formatNumber(top5.total.toString(), decimals)} (${top5.percentage})`, inline: true },
        { name: 'Top 10 Holders', value: `${formatNumber(top10.total.toString(), decimals)} (${top10.percentage})`, inline: true },
        { name: 'Top 20 Holders', value: `${formatNumber(top20.total.toString(), decimals)} (${top20.percentage})`, inline: true }
    );

    // Add a field with a clickable link to the explorer
    const explorerUrl = getExplorerUrl(tokenInfo.hashRev);
    embed.addFields(
        { name: 'Reveal Transaction', value: `[${tokenInfo.hashRev}](${explorerUrl})`, inline: false }
    );

    // Set a non-clickable footer
    embed.setFooter({ text: 'Built with ❤️ by the Nacho the 𐤊at Community', iconURL: 'https://media.discordapp.net/attachments/1262092990273294458/1278406148235460709/NACHO_best_final.png?ex=66d0b001&is=66cf5e81&hm=0b93b66600c0b2f4b1146bedca819ef85c198f4a5dc9999ec1842d22cecf0c94&=&format=webp&quality=lossless' });

    return embed;
}

// Update the getExplorerUrl function to always use Mainnet
function getExplorerUrl(txHash: string): string {
    return `https://explorer.kaspa.org/txs/${txHash}`;
}

export async function getTokenInfo(ticker: string): Promise<EmbedBuilder> {
    const tokenInfo = await fetchTokenInfo(ticker);
    return createTokenInfoEmbed(tokenInfo);
}