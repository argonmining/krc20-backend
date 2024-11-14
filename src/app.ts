import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { updateDatabase, updateDatabaseForTicker, fetchAndStorePriceData } from './services/kasplex';
import logger from './utils/logger';
import { z } from 'zod';
import cors from 'cors';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;
const PRICE_UPDATE_INTERVAL = parseInt(process.env.PRICE_UPDATE_INTERVAL || '15') * 60 * 1000; // 15 minutes in milliseconds

// Use CORS middleware with options

app.use(express.json());

const dateSchema = z.string().datetime();
const tickSchema = z.string().min(1);

interface TransactionQuery {
  tick: string;
  startDate: string;
  endDate: string;
}

let isUpdating = false;

async function runDatabaseUpdate() {
  if (isUpdating) {
    logger.warn('Database update is already running');
    return;
  }

  try {
    isUpdating = true;
    await updateDatabase();
    logger.info('Database update completed successfully');
  } catch (error) {
    logger.error('Error updating database:', error);
  } finally {
    isUpdating = false;
  }
}

const UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour in milliseconds

// Instead, let's schedule the first update
const scheduleNextUpdate = () => {
  const now = new Date();
  const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0, 0);
  const delay = nextHour.getTime() - now.getTime();

  setTimeout(() => {
    if (process.env.HISTORICAL_UPDATE === 'false' && !isUpdating && process.env.UPDATING_SINGLE_TICKER === 'false') {
      runDatabaseUpdate();
    }
    scheduleNextUpdate(); // Schedule the next update
  }, delay);

  logger.info(`Next database update scheduled for ${nextHour.toISOString()}`);
};

// Start the scheduling
scheduleNextUpdate();

// Initial log for time until first update
const initialNextUpdate = new Date(Math.ceil(new Date().getTime() / UPDATE_INTERVAL) * UPDATE_INTERVAL);
const initialTimeUntilNextUpdate = initialNextUpdate.getTime() - new Date().getTime();
const initialMinutesUntilNextUpdate = Math.round(initialTimeUntilNextUpdate / 60000);
logger.info(`Time until first database update: ${initialMinutesUntilNextUpdate} minutes`);

app.get('/api/mint-Totals', async (req, res) => {
  try {
    const { startDate, endDate } = z.object({
      startDate: dateSchema.optional(),
      endDate: dateSchema.optional(),
    }).parse(req.query);

    const dateFilter: any = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate).getTime().toString();
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate).getTime().toString();
    }

    const tokens = await prisma.token.findMany({
      select: {
        tick: true,
        _count: {
          select: {
            transactions: {
              where: {
                op: 'mint',
                ...(Object.keys(dateFilter).length > 0 && { mtsAdd: dateFilter }),
              },
            },
          },
        },
      },
    });

    // Schedule price data updates every 15 minutes
    setInterval(fetchAndStorePriceData, PRICE_UPDATE_INTERVAL);

    // Initial fetch to avoid waiting 15 minutes
    fetchAndStorePriceData();

    const mintTotals = tokens.map(({ tick, _count }) => ({
      tick,
      mintTotal: _count.transactions,
    }));

    res.json(mintTotals);
  } catch (error) {
    logger.error('Error fetching mint totals:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else if (error instanceof Error) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/api/mintsovertime', async (req, res) => {
  try {
    const { tick } = z.object({
      tick: tickSchema,
    }).parse(req.query);

    const transactions = await prisma.transaction.findMany({
      where: {
        tick,
        op: 'mint',
      },
      select: {
        mtsAdd: true,
      },
    });

    const mintCounts = transactions.reduce((acc: Record<string, number>, { mtsAdd }) => {
      const date = new Date(parseInt(mtsAdd)).toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = 0;
      }
      acc[date]++;
      return acc;
    }, {});

    const result = Object.entries(mintCounts).map(([date, count]) => ({
      date,
      count,
    }));

    res.json(result);
  } catch (error) {
    logger.error('Error fetching mints over time:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else if (error instanceof Error) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const { tick, startDate, endDate } = z.object({
      tick: tickSchema,
      startDate: dateSchema,
      endDate: dateSchema,
    }).parse(req.query as unknown as TransactionQuery);

    const transactions = await prisma.transaction.findMany({
      where: {
        tick,
        mtsAdd: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    res.json(transactions);
  } catch (error) {
    logger.error('Error fetching transactions:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else if (error instanceof Error) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/api/holders', async (req, res) => {
  try {
    const holders = await prisma.token.findMany({
      select: {
        tick: true,
        holderTotal: true,
      },
    });
    res.json(holders);
  } catch (error) {
    logger.error('Error fetching holders:', error);
    if (error instanceof Error) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
});

app.post('/api/updateDatabase', async (req, res) => {
  if (isUpdating) {
    return res.status(400).json({ error: 'Database update is already running' });
  }

  // Respond immediately to the API call
  res.json({ message: 'Database update started successfully' });

  // Proceed with the update in the background
  setImmediate(async () => {
    try {
      isUpdating = true;
      await updateDatabase();
      logger.info('Database update completed successfully');
    } catch (error) {
      logger.error('Error updating database:', error);
    } finally {
      isUpdating = false;
    }
  });
});

app.get('/api/token/:tick', async (req, res) => {
  try {
    const { tick } = z.object({ tick: tickSchema }).parse(req.params);
    const token = await prisma.token.findUnique({ where: { tick } });
    if (!token) {
      res.status(404).json({ error: 'Token not found' });
    } else {
      res.json(token);
    }
  } catch (error) {
    logger.error('Error fetching token:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else if (error instanceof Error) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/api/topHolders', async (req, res) => {
  try {
    const holders = await prisma.holder.findMany({
      include: {
        balances: {
          select: {
            tokenTick: true,
            balance: true,
          },
        },
      },
    });

    const formattedHolders = holders.map(holder => ({
      address: holder.address,
      balances: holder.balances.map(balance => ({
        tick: balance.tokenTick,
        balance: balance.balance,
      })),
    }));

    res.json(formattedHolders);
  } catch (error) {
    logger.error('Error fetching top holders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/updateDatabaseForTicker', async (req, res) => {
  try {
    const { tick } = z.object({ tick: tickSchema }).parse(req.body);
    if (isUpdating) {
      return res.status(400).json({ error: 'Another update is already running' });
    }

    isUpdating = true;
    res.json({ message: `Database update for ticker ${tick} started successfully` });
    await updateDatabaseForTicker(tick);
  } catch (error) {
    logger.error(`Error updating database for ticker:`, error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    isUpdating = false;
  }
});

app.get('/api/TokenPriceData', async (req, res) => {
  try {
    const { tick, start, end } = z.object({
      tick: z.string().min(1),
      start: z.string().optional(),
      end: z.string().optional(),
    }).parse(req.query);

    const dateFilter: any = {};
    if (start) {
      dateFilter.gte = new Date(start);
    }
    if (end) {
      dateFilter.lte = new Date(end);
    }

    const priceData = await prisma.priceData.findMany({
      where: {
        tick,
        timestamp: Object.keys(dateFilter).length ? dateFilter : undefined,
      },
      orderBy: {
        timestamp: 'asc',
      }
    });

    res.json(priceData);
  } catch (error) {
    logger.error('Error fetching price data:', error);
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: error.errors });
    } else if (error instanceof Error) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

app.get('/api/tokens', async (req, res) => {
  try {
    const tokens = await prisma.token.findMany({
      select: {
        tick: true,
        max: true,
        lim: true,
        pre: true,
        to: true,
        dec: true,
        minted: true,
        opScoreAdd: true,
        opScoreMod: true,
        state: true,
        hashRev: true,
        mtsAdd: true,
        holderTotal: true,
        transferTotal: true,
        mintTotal: true,
        lastUpdated: true,
        PriceData: {
          select: {
            valueKAS: true,
            valueUSD: true,
            change24h: true,
          },
          orderBy: {
            timestamp: 'desc',
          },
          take: 1, // Get the latest price data
        },
      },
    });

    res.json(tokens);
  } catch (error) {
    logger.error('Error fetching tokens:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
