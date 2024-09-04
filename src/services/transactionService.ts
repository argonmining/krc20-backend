import { PrismaClient } from '@prisma/client';
import NodeCache from 'node-cache';

const prisma = new PrismaClient();
const cache = new NodeCache({ stdTTL: 300 }); // Cache for 5 minutes

interface TransactionFilters {
  txHash?: string;
  tick?: string;
  from?: string;
  to?: string;
  op?: string;
  opError?: string;
}

interface PaginationOptions {
  page?: number;
  limit?: number;
}

export async function getTransactions(filters: TransactionFilters, pagination: PaginationOptions) {
  const { page = 1, limit = 10000 } = pagination;
  const skip = (page - 1) * limit;

  const cacheKey = `transactions:${JSON.stringify(filters)}:${page}:${limit}`;
  const cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    return cachedResult;
  }

  const where: any = {};
  if (filters.txHash) where.txHash = filters.txHash;
  if (filters.tick) where.tick = filters.tick;
  if (filters.from) where.from = filters.from;
  if (filters.to) where.to = filters.to;
  if (filters.op) where.op = filters.op;
  if (filters.opError) where.opError = filters.opError;

  const [transactions, totalCount] = await Promise.all([
    prisma.kRC20Transaction.findMany({
      where,
      skip,
      take: limit,
      orderBy: { blockTime: 'desc' },
    }),
    prisma.kRC20Transaction.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  const result = {
    transactions,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };

  cache.set(cacheKey, result);
  return result;
}
