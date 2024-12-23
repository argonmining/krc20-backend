import { Context } from 'telegraf';
import { isTextMessage, fetchTokenInfo, formatNumber, formatNumberWithoutDecimals, calculatePercentage } from '../utils';

export const handleStatusCommand = async (ctx: Context) => { // Update function name
  if (ctx.message && isTextMessage(ctx.message)) {
    const args = ctx.message.text.split(' ').slice(1);

    if (args.length !== 1) {
      return ctx.reply('Please provide a valid token ticker. Usage: /status <TOKEN_TICKER>'); // Update usage message
    }

    const ticker = args[0].toUpperCase().trim();

    if (!/^[A-Z]{4,6}$/.test(ticker)) {
      return ctx.reply('Invalid KRC20 ticker format. Please provide a valid ticker (4 to 6 letters).');
    }

    try {
      const tokenInfo = await fetchTokenInfo(ticker);
      const state = tokenInfo.state.toLowerCase();

      if (state === 'unused' || state === 'ignored') {
        let message = `*${tokenInfo.tick} Token Information*\n\n`;
        if (state === 'unused') {
          message += `${tokenInfo.tick} has not been deployed as a KRC20 Token on Kasplex yet. No information available. Please try another ticker.`;
        } else if (state === 'ignored') {
          message += `${tokenInfo.tick} is an ignored ticker on Kasplex and cannot be deployed as a KRC20 token. No information available. Please try another ticker.`;
        }
        return ctx.reply(message, { parse_mode: 'Markdown' });
      }

      const decimals = parseInt(tokenInfo.dec, 10);
      const maxSupply = BigInt(tokenInfo.max);
      const minted = BigInt(tokenInfo.minted);
      const remaining = maxSupply - minted;
      const preMint = BigInt(tokenInfo.pre);

      const deploymentDate = new Date(parseInt(tokenInfo.mtsAdd)).toUTCString();
      const launchStatus = tokenInfo.pre === '0' ? '🚀 Fair Launch' : '⚠️ Has Pre-Mint';

      let message = `*${tokenInfo.tick} Token Information*\n\n`;
      message += `${launchStatus}\n`;
      message += `${tokenInfo.state.charAt(0).toUpperCase() + tokenInfo.state.slice(1)} on ${deploymentDate}\n\n`;
      message += `*Supply*\n`;
      message += `Maximum: \`${formatNumber(tokenInfo.max, decimals)}\`\n`;
      message += `Minted: \`${formatNumber(tokenInfo.minted, decimals)}\` (${calculatePercentage(minted, maxSupply)})\n`;
      message += `Remaining: \`${formatNumber(remaining.toString(), decimals)}\` (${calculatePercentage(remaining, maxSupply)})\n`;
      
      if (tokenInfo.pre !== '0') {
        message += `Pre-Minted: \`${formatNumber(tokenInfo.pre, decimals)}\` (${calculatePercentage(preMint, maxSupply)})\n`;
      }

      message += `\n*Minting*\n`;
      message += `Completed Mints: \`${formatNumberWithoutDecimals(tokenInfo.mintTotal)}\`\n`;
      message += `Tokens Per Mint: \`${formatNumber(tokenInfo.lim, decimals)}\`\n`;

      message += `\n*Holders*\n`;
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

      message += `Top Holder: \`${formatNumber(top1.total.toString(), decimals)}\` (${top1.percentage})\n`;
      message += `Top 5 Holders: \`${formatNumber(top5.total.toString(), decimals)}\` (${top5.percentage})\n`;
      message += `Top 10 Holders: \`${formatNumber(top10.total.toString(), decimals)}\` (${top10.percentage})\n`;
      message += `Top 20 Holders: \`${formatNumber(top20.total.toString(), decimals)}\` (${top20.percentage})\n`;

      message += `\n*Links*\n`;
      message += `[Reveal Transaction](https://explorer.kaspa.org/txs/${tokenInfo.hashRev})\n`;
      message += `[Token Explorer](https://mainnet.kasplex.org/detail?tick=${ticker})\n`;

      message += `\nBuilt with ❤️ by the Nacho the 𐤊at Community`;

      ctx.reply(message, { parse_mode: 'Markdown', disable_web_page_preview: true } as any);
    } catch (error) {
      console.error(`Error handling status command:`, error); // Update error message
      ctx.reply('Failed to retrieve token status. Please try again later or contact support if the issue persists.');
    }
  } else {
    ctx.reply('This command only works with text messages.');
  }
};
