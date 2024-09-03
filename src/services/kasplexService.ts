import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TokenInfo {
  tick: string;
  max: string;
  lim: string;
  minted: string;
}

interface Transaction {
  op: string;
  tick: string;
  amt?: string;
  from: string;
  to: string;
  opScore: string;
  hashRev: string;
  feeRev: string;
  txAccept: string;
  opAccept: string;
  opError?: string;
  checkpoint?: string;
  mtsAdd: string;
  mtsMod: string;
  max?: string;
  lim?: string;
  pre?: string;
  dec?: string;
}

export async function fetchTokenList(): Promise<TokenInfo[]> {
  try {
    const response = await axios.get<{ result: TokenInfo[] } >('https://api.kasplex.org/v1/krc20/tokenlist');
    return response.data.result;
  } catch (error) {
    console.error('Error fetching token list:', error);
    return [];
  }
}

export async function fetchTransactions(tick: string, next?: string): Promise<Transaction[]> {
  try {
    const url = new URL('https://api.kasplex.org/v1/krc20/oplist');
    url.searchParams.append('tick', tick);
    if (next) {
      url.searchParams.append('next', next);
    }

    const response = await axios.get<{ result: Transaction[] }>(url.toString());
    return response.data.result;
  } catch (error) {
    console.error(`Error fetching transactions for ${tick}:`, error);
    return [];
  }
}

export async function storeTransactions(transactions: Transaction[]): Promise<void> {
  for (const tx of transactions) {
    try {
      await prisma.kRC20Transaction.upsert({
        where: { txHash: tx.hashRev },
        update: {}, // If it exists, don't update anything
        create: {
          txHash: tx.hashRev,
          op: tx.op,
          tick: tx.tick,
          amt: tx.amt,
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
          max: tx.max,
          lim: tx.lim,
          pre: tx.pre,
          dec: tx.dec,
          blockTime: new Date(parseInt(tx.mtsAdd)),
        },
      });
    } catch (error) {
      console.error(`Error storing transaction ${tx.hashRev}:`, error);
    }
  }
}

export async function fetchAllHistoricalData(): Promise<void> {
  console.log("Starting to fetch all historical data...");
  const tokens = await fetchTokenList();
  console.log(`Found ${tokens.length} tokens to process.`);

  for (const token of tokens) {
    console.log(`Processing token: ${token.tick}`);
    const latestTransaction = await prisma.kRC20Transaction.findFirst({
      where: { tick: token.tick },
      orderBy: { blockTime: 'desc' },
    });

    let next: string | undefined;
    let totalNewTransactions = 0;
    do {
      const transactions = await fetchTransactions(token.tick, next);
      const newTransactions = latestTransaction
        ? transactions.filter(tx => new Date(parseInt(tx.mtsAdd)) > latestTransaction.blockTime)
        : transactions;

      if (newTransactions.length === 0) break;

      await storeTransactions(newTransactions);
      totalNewTransactions += newTransactions.length;
      next = transactions.length > 0 ? transactions[transactions.length - 1].opScore : undefined;
      console.log(`Fetched and stored ${newTransactions.length} new transactions for ${token.tick}. Total new: ${totalNewTransactions}`);
    } while (next);
    console.log(`Completed processing for ${token.tick}. Total new transactions: ${totalNewTransactions}`);
  }
  console.log("Finished fetching all historical data.");
}

export async function fetchRecentData(): Promise<void> {
  console.log("Starting to fetch recent data...");
  const tokens = await fetchTokenList();
  console.log(`Found ${tokens.length} tokens to check for updates.`);

  for (const token of tokens) {
    console.log(`Checking for new transactions for token: ${token.tick}`);
    const latestTransaction = await prisma.kRC20Transaction.findFirst({
      where: { tick: token.tick },
      orderBy: { blockTime: 'desc' },
    });

    let next: string | undefined;
    let newTransactionsCount = 0;
    do {
      const transactions = await fetchTransactions(token.tick, next);
      const newTransactions = latestTransaction
        ? transactions.filter(tx => new Date(parseInt(tx.mtsAdd)) > latestTransaction.blockTime)
        : transactions;

      if (newTransactions.length === 0) break;

      await storeTransactions(newTransactions);
      newTransactionsCount += newTransactions.length;
      next = transactions.length > 0 ? transactions[transactions.length - 1].opScore : undefined;
      console.log(`Fetched and stored ${newTransactions.length} new transactions for ${token.tick}. Total new: ${newTransactionsCount}`);
    } while (next);
    console.log(`Completed update for ${token.tick}. Total new transactions: ${newTransactionsCount}`);
  }
  console.log("Finished fetching recent data.");
}

export async function pollKasplexAPI(): Promise<void> {
  console.log("Starting scheduled API poll...");
  await fetchRecentData();
  console.log("Finished scheduled API poll.");
}

export async function removeDuplicateTransactions(): Promise<void> {
  console.log("Starting to remove duplicate transactions...");

  const duplicates = await prisma.$queryRaw`
    SELECT "txHash", COUNT(*)
    FROM "KRC20Transaction"
    GROUP BY "txHash"
    HAVING COUNT(*) > 1
  `;

  for (const duplicate of duplicates as any[]) {
    const { txHash } = duplicate;
    const transactions = await prisma.kRC20Transaction.findMany({
      where: { txHash },
      orderBy: { createdAt: 'asc' },
    });

    // Keep the oldest transaction and delete the rest
    if (transactions.length > 1) {
      const [oldest, ...duplicatesToRemove] = transactions;
      const idsToRemove = duplicatesToRemove.map(t => t.id);

      await prisma.kRC20Transaction.deleteMany({
        where: { id: { in: idsToRemove } },
      });

      console.log(`Removed ${idsToRemove.length} duplicate(s) for txHash: ${txHash}`);
    }
  }

  console.log("Finished removing duplicate transactions.");
}
