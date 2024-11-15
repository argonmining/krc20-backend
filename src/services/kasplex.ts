import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

const PRICE_API_URL = 'https://storage.googleapis.com/kspr-api-v1/marketplace/marketplace.json';

// Maximum number of transactions per API call (set according to the API limit)
const MAX_BATCH_SIZE = 50;

// Maximum number of retries for API calls
const MAX_RETRIES = 5;

// Delay between retries (in milliseconds)
const RETRY_DELAY = 2000;

// Helper function to pause execution
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function fetchTokenList(next?: string): Promise<{ tokens: TokenListItem[], next?: string }> {
  return retryApiCall(async () => {
    const url = new URL(`${process.env.KASPLEX_API_BASE_URL}/krc20/tokenlist`);
    if (next) url.searchParams.append('next', next);
    
    const response = await axios.get(url.toString());
    return {
      tokens: response.data.result,
      next: response.data.next
    };
  });
}

async function fetchTokenInfo(tick: string): Promise<TokenInfo> {
  return retryApiCall(async () => {
    const response = await axios.get(`${process.env.KASPLEX_API_BASE_URL}/krc20/token/${tick}`);
    return response.data.result[0];
  });
}

async function fetchTransactions(tick: string, next?: string): Promise<Transaction[]> {
  return retryApiCall(async () => {
    const url = new URL(`${process.env.KASPLEX_API_BASE_URL}/krc20/oplist`);
    url.searchParams.append('tick', tick);
    if (next) url.searchParams.append('next', next); // Pagination

    const response = await axios.get(url.toString());
    return response.data.result;
  });
}

async function fetchAndStorePriceData() {
  try {
    const response = await axios.get(PRICE_API_URL);
    const priceData = response.data;

    const kasFloorPrice = priceData['KAS'].floor_price;

    // Iterate over the tokens from the price data API
    for (const tick in priceData) {
      if (tick === 'KAS') continue;

      const tokenData = priceData[tick];
      const valueKAS = tokenData.floor_price;
      const valueUSD = valueKAS * kasFloorPrice; // Convert to USD
      const change24h = tokenData.change_24h;

      // Check if the token exists in the Token table
      let tokenExists = await prisma.token.findUnique({
        where: { tick }
      });

      // If the token doesn't exist, create it in the Token table
      if (!tokenExists) {
        logger.warn(`Token ${tick} does not exist in the Token table. Adding it now.`);
        tokenExists = await prisma.token.create({
          data: {
            tick,
            max: "Unknown",  // Adjust these fields as necessary
            lim: "Unknown",
            pre: "Unknown",
            to: "Unknown",
            dec: "0",
            minted: "0",
            opScoreAdd: "0",
            opScoreMod: "0",
            state: "Unknown",
            hashRev: "0",
            mtsAdd: "0",
            holderTotal: 0,
            transferTotal: 0,
            mintTotal: 0,
            lastUpdated: new Date(),
          },
        });
      }

      // Store the price data in the database
      await prisma.priceData.create({
        data: {
          tick,
          timestamp: new Date(),
          valueKAS,
          valueUSD,
          change24h,
        },
      });

      logger.info(`Stored price data for ${tick}: KAS value = ${valueKAS}, USD value = ${valueUSD}`);
    }
  } catch (error) {
    logger.error('Error fetching or storing price data:', error);
  }
}



async function fetchTokenHoldings(address: string): Promise<{ tick: string; balance: string }[]> {
  return retryApiCall(async () => {
    const response = await axios.get(`${process.env.KASPLEX_API_BASE_URL}/krc20/address/${address}/tokenlist`);
    return response.data.result.map((item: { tick: string; balance: string }) => ({
      tick: item.tick,
      balance: item.balance,
    }));
  });
}

async function fetchAndStoreTransactions(tick: string) {
  let next: string | undefined = undefined;
  let totalFetchedTransactions = 0;

  do {
    // Fetch transactions from the API
    const transactions = await retryApiCall(async () => {
      const url = new URL(`${process.env.KASPLEX_API_BASE_URL}/krc20/oplist`);
      url.searchParams.append('tick', tick);
      if (next) url.searchParams.append('next', next); // Pagination

      const response = await axios.get(url.toString());
      return response.data.result;
    });

    if (transactions.length === 0) {
      logger.info(`No more transactions for ${tick}`);
      break; // Stop fetching if there are no more transactions
    }

    // Write transactions in batches to avoid memory overload
    for (const tx of transactions) {
      const existingTransaction = await prisma.transaction.findUnique({
        where: { hashRev: tx.hashRev },
      });

      if (!existingTransaction) {
        await prisma.transaction.create({
          data: {
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
            dec: tx.dec || null,
          },
        });
        totalFetchedTransactions++;
      }
    }

    // Log progress
    logger.info(`Fetched and stored ${transactions.length} transactions for ${tick}`);
    next = transactions.length === MAX_BATCH_SIZE ? transactions[transactions.length - 1].opScore : undefined;

  } while (next); // Continue if there's a 'next' page of transactions

  logger.info(`Finished fetching transactions for ${tick}, total: ${totalFetchedTransactions}`);
}

async function retryApiCall<T>(
  apiCall: () => Promise<T>, 
  retries = MAX_RETRIES, 
  delay = RETRY_DELAY
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await apiCall(); // Try the API call
    } catch (error) {
      attempt++;
      if (attempt >= retries) {
        throw error; // Re-throw if we've exceeded retries
      }
      logger.warn(`API call failed (attempt ${attempt}/${retries}). Retrying in ${delay}ms...`);
      await sleep(delay); // Wait before retrying
    }
  }
  throw new Error('Max retries reached');
}

async function updateDatabase() {
  if (isUpdating) {
    logger.warn('Database update is already running or ticker-specific update is in progress.');
    return;
  }

  isUpdating = true;
  try {
    logger.warn('Starting database update');
    let totalNewTransactions = 0;
    let next: string | undefined;

    // Fetch the last update time or set a default value if it doesn't exist
    const lastUpdate = await prisma.lastUpdate.findUnique({ where: { id: 1 } });
    const lastUpdateTime = lastUpdate ? new Date(lastUpdate.timestamp).getTime() : new Date('2024-09-20T00:00:00Z').getTime();

    // Update the lastUpdate entry in the database at the start
    await prisma.lastUpdate.upsert({
      where: { id: 1 },
      update: { timestamp: new Date() },
      create: { id: 1, timestamp: new Date() },
    });

    do {
      const { tokens, next: nextPage } = await fetchTokenList(next);
      logger.info(`Fetched ${tokens.length} tokens from Kasplex API`);

      for (const token of tokens) {
        logger.info(`Updating token: ${token.tick}`);

        // Step 2: Fetch token info and update the database
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

        // Step 4: Fetch transactions and update database using the helper function
        await fetchAndStoreTransactions(token.tick);
      }

      next = nextPage;
    } while (next);

    logger.warn(`Database update completed. Total new transactions across all tokens: ${totalNewTransactions}`);

    // Call the cleanup function
    await removeDuplicates();

  } catch (error) {
    logger.error('Error updating database:', error);
  } finally {
    isUpdating = false;
  }
}

const stateFilePath = path.join(__dirname, 'state.json');

function saveState(tick: string, nextTransaction: string | undefined, batchCount: number) {
  const state = { tick, nextTransaction, batchCount };
  fs.writeFileSync(stateFilePath, JSON.stringify(state));
}

function loadState() {
  if (fs.existsSync(stateFilePath)) {
    const state = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
    return state;
  }
  return null;
}

async function updateDatabaseForTicker(tick: string) {
  if (isUpdating) {
    logger.warn('Full database update is in progress. Skipping ticker-specific update.');
    return;
  }

  isUpdating = true;
  try {
    logger.info(`Updating database for ticker: ${tick}`);

    // Step 1: Fetch token info and update database
    const tokenInfo = await fetchTokenInfo(tick);
    logger.info(`Fetched token info for ${tick}: mintTotal = ${tokenInfo.mintTotal}`);
    
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
      where: { tick },
      update: tokenData,
      create: tokenData,
    });

    // Step 2: Fetch token holdings and update database
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
          logger.warn(`No valid balances for holder ${holder.address} for token ${tick}`);
        }
      }
    }

    // Step 3: Fetch transactions and update database using fetchAndStoreTransactions
    await fetchAndStoreTransactions(tick);

    logger.warn(`Finished updating token: ${tick}`);

    // Call the cleanup function
    await removeDuplicates();
  } catch (error) {
    logger.error(`Error updating database for ticker ${tick}:`, error);
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
  logger.warn(`Removed ${duplicateTokens} duplicate tokens`);

  // Remove duplicate transactions
  const duplicateTransactions = await prisma.$executeRaw`
    DELETE FROM "Transaction" t1
    USING "Transaction" t2
    WHERE t1.ctid < t2.ctid
    AND t1."hashRev" = t2."hashRev"
  `;
  logger.warn(`Removed ${duplicateTransactions} duplicate transactions`);

  // Remove duplicate holders
  const duplicateHolders = await prisma.$executeRaw`
    DELETE FROM "Holder" t1
    USING "Holder" t2
    WHERE t1.ctid < t2.ctid
    AND t1."address" = t2."address"
  `;
  logger.warn(`Removed ${duplicateHolders} duplicate holders`);

  logger.warn('Duplicate removal process completed');
}

export { updateDatabase, updateDatabaseForTicker, fetchAndStorePriceData };