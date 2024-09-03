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
  p: string;
  op: string;
  tick: string;
  amt: string;
  from: string;
  to: string;
  opScore: string;
  hashRev: string;
  txAccept: string;
  opAccept: string;
  mtsAdd: string;
}

export async function fetchTokenList(): Promise<TokenInfo[]> {
  try {
    const response = await axios.get('https://api.kasplex.org/v1/krc20/tokenlist');
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

    const response = await axios.get(url.toString());
    return response.data.result;
  } catch (error) {
    console.error(`Error fetching transactions for ${tick}:`, error);
    return [];
  }
}

export async function storeTransactions(transactions: Transaction[]): Promise<void> {
  for (const tx of transactions) {
    await prisma.kRC20Transaction.create({
      data: {
        txHash: tx.hashRev,
        ticker: tx.tick,
        from: tx.from,
        to: tx.to,
        amount: tx.amt,
        blockTime: new Date(parseInt(tx.mtsAdd)),
      },
    });
  }
}

export async function pollKasplexAPI(): Promise<void> {
  const tokens = await fetchTokenList();

  for (const token of tokens) {
    let next: string | undefined;
    do {
      const transactions = await fetchTransactions(token.tick, next);
      await storeTransactions(transactions);
      next = transactions.length > 0 ? transactions[transactions.length - 1].opScore : undefined;
    } while (next);
  }
}
