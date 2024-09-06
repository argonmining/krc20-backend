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
  logger.info('Starting database update');
  let totalNewTransactions = 0;

  const lastUpdate = await prisma.lastUpdate.findFirst();
  const lastUpdateTime = lastUpdate ? lastUpdate.timestamp : new Date(0);

  const tokenList = await fetchTokenList();
  logger.info(`Fetched ${tokenList.length} tokens from Kasplex API`);

  for (const token of tokenList) {
    logger.info(`Updating token: ${token.tick}`);
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
          logger.info(`Found existing transaction ${tx.hashRev} for ${token.tick}. Stopping fetch for this token.`);
          shouldContinue = false;
          break;
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

        await prisma.transaction.create({
          data: transactionData,
        });

        fetchedTransactions++;
      }

      if (!shouldContinue) break;

      next = transactions.length === 50 ? transactions[transactions.length - 1].opScore : undefined;
      logger.info(`Processed ${fetchedTransactions} new transactions for ${token.tick}`);
    } while (next);

    logger.info(`Finished updating token: ${token.tick}. Total new transactions processed: ${fetchedTransactions}`);
    totalNewTransactions += fetchedTransactions;
  }

  await prisma.lastUpdate.upsert({
    where: { id: 1 },
    update: { timestamp: new Date() },
    create: { id: 1, timestamp: new Date() },
  });

  logger.info(`Database update completed. Total new transactions across all tokens: ${totalNewTransactions}`);
}

export { updateDatabase };