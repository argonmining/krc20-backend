import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';

const prisma = new PrismaClient();

interface TokenListItem {
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
}

interface Holder {
  address: string;
  amount: string;
}

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
  holderTotal: number;
  transferTotal: number;
  mintTotal: number;
  holder: Holder[];
}

interface Transaction {
  hashRev: string;
  p: string;
  op: string;
  tick: string;
  amt?: string | null;
  from: string;
  to: string;
  opScore: string;
  feeRev: string;
  txAccept: string;
  opAccept: string;
  opError: string;
  checkpoint: string;
  mtsAdd: string;
  mtsMod: string;
  max?: string | null;
  lim?: string | null;
  pre?: string | null;
  dec?: string | null;
}

let isUpdating = false;

async function fetchTokenList(): Promise<TokenListItem[]> {
  return retryApiCall(async () => {
    const response = await axios.get('https://api.kasplex.org/v1/krc20/tokenlist');
    return response.data.result;
  });
}

async function fetchTokenInfo(tick: string): Promise<TokenInfo> {
  return retryApiCall(async () => {
    const response = await axios.get(`https://api.kasplex.org/v1/krc20/token/${tick}`);
    return response.data.result[0];
  });
}

async function fetchTransactions(tick: string, next?: string): Promise<Transaction[]> {
  return retryApiCall(
    async () => {
      const url = new URL(`${process.env.KASPLEX_API_BASE_URL}/krc20/oplist`);
      url.searchParams.append('tick', tick);
      if (next) url.searchParams.append('next', next);
      
      const response = await axios.get(url.toString());
      return response.data.result;
    },
    3,
    1000,
    (error) => {
      logger.warn(`Failed to fetch transactions for token ${tick}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  );
}

async function fetchTokenHoldings(address: string): Promise<{ tick: string; balance: string }[]> {
  return retryApiCall(async () => {
    const response = await axios.get(`https://api.kasplex.org/v1/krc20/address/${address}/tokenlist`);
    return response.data.result.map((item: { tick: string; balance: string }) => ({
      tick: item.tick,
      balance: item.balance,
    }));
  });
}

async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries = 3,
  delay = 1000,
  errorHandler?: (error: unknown) => T
): Promise<T> {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;
      console.error(`API call failed (attempt ${i + 1}/${maxRetries}):`, error);
      if (i === maxRetries - 1 && errorHandler) {
        return errorHandler(error);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

async function updateDatabase() {
  if (isUpdating) {
    logger.warn('Database update is already running');
    return;
  }

  isUpdating = true;
  try {
    logger.warn('Starting database update');
    let totalNewTransactions = 0;

    const lastUpdate = await prisma.lastUpdate.findFirst();
    const lastUpdateTime = lastUpdate ? lastUpdate.timestamp : new Date(0);

    // Step 1: Fetch token list and update database
    const tokenList = await fetchTokenList();
    logger.info(`Fetched ${tokenList.length} tokens from Kasplex API`);

    for (const token of tokenList) {
      logger.info(`Updating token: ${token.tick}`);

      // Step 2: Fetch token info and update database
      const tokenInfo = await fetchTokenInfo(token.tick);
      logger.info(`Fetched token info for ${token.tick}: mintTotal = ${tokenInfo.mintTotal}`);
      
      const tokenData = {
        tick: tokenInfo.tick,
        max: tokenInfo.max,
        lim: tokenInfo.lim,
        pre: tokenInfo.pre,
        to: tokenInfo.to,
        dec: tokenInfo.dec,
        minted: tokenInfo.minted,
        opScoreAdd: tokenInfo.opScoreAdd,
        opScoreMod: tokenInfo.opScoreMod,
        state: tokenInfo.state,
        hashRev: tokenInfo.hashRev,
        mtsAdd: tokenInfo.mtsAdd,
        holderTotal: parseInt(String(tokenInfo.holderTotal), 10) || 0,
        transferTotal: parseInt(String(tokenInfo.transferTotal), 10) || 0,
        mintTotal: parseInt(String(tokenInfo.mintTotal), 10) || 0,
        lastUpdated: new Date()
      };

      await prisma.token.upsert({
        where: { tick: token.tick },
        update: tokenData,
        create: tokenData,
      });

      // Step 3: Fetch token holdings and update database
      if (tokenInfo.holder && tokenInfo.holder.length > 0) {
        for (const holder of tokenInfo.holder) {
          const tokenHoldings = await fetchTokenHoldings(holder.address);
          const balances = tokenHoldings.map(holding => ({
            tokenTick: holding.tick,
            balance: holding.balance,
          }));

          // Ensure all tokenTick values exist in the Token table
          const tokenTicks = balances.map(balance => balance.tokenTick);
          const existingTokens = await prisma.token.findMany({
            where: {
              tick: {
                in: tokenTicks,
              },
            },
            select: {
              tick: true,
            },
          });

          const existingTokenTicks = new Set(existingTokens.map(token => token.tick));
          const validBalances = balances.filter(balance => existingTokenTicks.has(balance.tokenTick));

          if (validBalances.length > 0) {
            await prisma.holder.upsert({
              where: { address: holder.address },
              update: {
                balances: {
                  deleteMany: {},
                  create: validBalances,
                },
              },
              create: {
                address: holder.address,
                balances: {
                  create: validBalances,
                },
              },
            });
          } else {
            logger.warn(`No valid balances for holder ${holder.address} for token ${token.tick}`);
          }
        }
      }

      // Step 4: Fetch transactions and update database
      let next: string | undefined;
      let fetchedTransactions = 0;
      let batchCount = 0;
      let shouldContinue = true;

      do {
        batchCount++;
        logger.info(`Fetching transactions batch #${batchCount} for ${token.tick}`);
        const transactions = await fetchTransactions(token.tick, next);
        if (transactions.length === 0) {
          logger.warn(`No transactions fetched for token ${token.tick} in batch #${batchCount}. Skipping to next token.`);
          break;
        }
        logger.info(`Fetched ${transactions.length} transactions for ${token.tick} in batch #${batchCount}`);

        for (const tx of transactions) {
          const existingTransaction = await prisma.transaction.findUnique({
            where: { hashRev: tx.hashRev },
          });

          if (existingTransaction) {
            const historicalUpdate = process.env.HISTORICAL_UPDATE;
            shouldContinue = historicalUpdate === "true";
            logger.info(`Found existing transaction ${tx.hashRev} for ${token.tick}. HISTORICAL_UPDATE is set to ${historicalUpdate}. shouldContinue is set to ${shouldContinue}. ${shouldContinue ? 'Continuing fetch for this token.' : 'Stopping fetch for this token.'}`);
            if (!shouldContinue) break;
          }

          const transactionData: Transaction = {
            hashRev: tx.hashRev,
            p: tx.p,
            op: tx.op,
            tick: tx.tick,
            amt: tx.amt || null,
            from: tx.from,
            to: tx.to,
            opScore: tx.opScore,
            feeRev: tx.feeRev,
            txAccept: tx.txAccept,
            opAccept: tx.opAccept,
            opError: tx.opError,
            checkpoint: tx.checkpoint,
            mtsAdd: tx.mtsAdd,
            mtsMod: tx.mtsMod,
            max: tx.max || null,
            lim: tx.lim || null,
            pre: tx.pre || null,
            dec: tx.dec || null
          };

          await prisma.transaction.upsert({
            where: { hashRev: tx.hashRev },
            update: transactionData,
            create: transactionData,
          });

          fetchedTransactions++;
        }
        if (!shouldContinue) break;

        next = transactions.length === 50 ? transactions[transactions.length - 1].opScore : undefined;
        logger.info(`Processed ${fetchedTransactions} new transactions for ${token.tick}`);
      } while (next);

      logger.warn(`Finished updating token: ${token.tick}. Total new transactions processed: ${fetchedTransactions}`);
      totalNewTransactions += fetchedTransactions;
    }

    await prisma.lastUpdate.upsert({
      where: { id: 1 },
      update: { timestamp: new Date() },
      create: { id: 1, timestamp: new Date() },
    });

    logger.warn(`Database update completed. Total new transactions across all tokens: ${totalNewTransactions}`);

    // Call the cleanup function
    await removeDuplicates();
  } catch (error) {
    logger.error('Error updating database:', error);
  } finally {
    isUpdating = false;
  }
}

async function removeDuplicates() {
  logger.warn('Starting duplicate removal process');

  // Remove duplicate tokens
  const duplicateTokens = await prisma.$executeRaw`
    DELETE FROM "Token" t1
    USING "Token" t2
    WHERE t1.ctid < t2.ctid
    AND t1."tick" = t2."tick"
  `;
  logger.info(`Removed ${duplicateTokens} duplicate tokens`);

  // Remove duplicate transactions
  const duplicateTransactions = await prisma.$executeRaw`
    DELETE FROM "Transaction" t1
    USING "Transaction" t2
    WHERE t1.ctid < t2.ctid
    AND t1."hashRev" = t2."hashRev"
  `;
  logger.info(`Removed ${duplicateTransactions} duplicate transactions`);

  // Remove duplicate holders
  const duplicateHolders = await prisma.$executeRaw`
    DELETE FROM "Holder" t1
    USING "Holder" t2
    WHERE t1.ctid < t2.ctid
    AND t1."address" = t2."address"
  `;
  logger.info(`Removed ${duplicateHolders} duplicate holders`);

  logger.warn('Duplicate removal process completed');
}

export { updateDatabase };