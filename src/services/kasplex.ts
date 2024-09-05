import axios from 'axios';
import { PrismaClient } from '@prisma/client';

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
  p: string;
  op: string;
  tick: string;
  from: string;
  to: string;
  opScore: string;
  hashRev: string;
  feeRev: string;
  txAccept: string;
  opAccept: string;
  opError: string;
  checkpoint: string;
  mtsAdd: string;
  mtsMod: string;
  max?: string;
  lim?: string;
  pre?: string;
  dec?: string;
}

async function fetchTokenList(): Promise<TokenListItem[]> {
  const response = await axios.get('https://api.kasplex.org/v1/krc20/tokenlist');
  return response.data.result;
}

async function fetchTokenInfo(tick: string): Promise<TokenInfo> {
  const response = await axios.get(`https://api.kasplex.org/v1/krc20/token/${tick}`);
  return response.data.result[0];
}

async function fetchTransactions(tick: string, next?: string, lastUpdateTime?: Date): Promise<Transaction[]> {
  const url = new URL(`${process.env.KASPLEX_API_BASE_URL}/krc20/oplist`);
  url.searchParams.append('tick', tick);
  if (next) url.searchParams.append('next', next);
  if (lastUpdateTime) url.searchParams.append('since', lastUpdateTime.toISOString());
  
  const response = await axios.get(url.toString());
  return response.data.result;
}

async function updateDatabase() {
  const lastUpdate = await prisma.lastUpdate.findFirst();
  const lastUpdateTime = lastUpdate ? lastUpdate.timestamp : new Date(0);

  const tokenList = await fetchTokenList();

  for (const token of tokenList) {
    const tokenInfo = await fetchTokenInfo(token.tick);
    const existingToken = await prisma.token.findUnique({ where: { tick: token.tick } });

    if (!existingToken || existingToken.mintTotal !== tokenInfo.mintTotal) {
      await prisma.token.upsert({
        where: { tick: token.tick },
        update: { ...tokenInfo, lastUpdated: new Date() },
        create: { ...tokenInfo, lastUpdated: new Date() },
      });

      let next: string | undefined;
      do {
        const transactions = await fetchTransactions(token.tick, next, lastUpdateTime);
        for (const tx of transactions) {
          await prisma.transaction.upsert({
            where: { hashRev: tx.hashRev },
            update: tx,
            create: tx,
          });
        }
        next = transactions.length === 50 ? transactions[transactions.length - 1].opScore : undefined;
      } while (next);
    }
  }

  await prisma.lastUpdate.upsert({
    where: { id: 1 },
    update: { timestamp: new Date() },
    create: { id: 1, timestamp: new Date() },
  });

  // Remove duplicate transactions
  await prisma.$executeRaw`
    DELETE FROM "Transaction" t1
    USING "Transaction" t2
    WHERE t1.id < t2.id
    AND t1.hashRev = t2.hashRev
  `;
}

export { updateDatabase };