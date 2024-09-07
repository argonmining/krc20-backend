import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { updateDatabase } from './services/kasplex';
import logger from './utils/logger';
import { z } from 'zod';
import cors from 'cors';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors({
  origin: '*', // This allows all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Allow all methods
  allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// Run the update function every hour if HISTORICAL_UPDATE is false
setInterval(async () => {
  if (process.env.HISTORICAL_UPDATE === 'false' && !isUpdating) {
    await runDatabaseUpdate();
  }
}, UPDATE_INTERVAL);

// Initial log for time until first update
const initialNextUpdate = new Date(Math.ceil(new Date().getTime() / UPDATE_INTERVAL) * UPDATE_INTERVAL);
const initialTimeUntilNextUpdate = initialNextUpdate.getTime() - new Date().getTime();
const initialMinutesUntilNextUpdate = Math.round(initialTimeUntilNextUpdate / 60000);
logger.info(`Time until first database update: ${initialMinutesUntilNextUpdate} minutes`);

runDatabaseUpdate();

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

  try {
    isUpdating = true;
    await updateDatabase();
    logger.info('Manual database update completed successfully');
    res.json({ message: 'Database update completed successfully' });
  } catch (error) {
    logger.error('Error updating database:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    isUpdating = false;
  }
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