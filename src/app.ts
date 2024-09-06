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
app.use(cors());

const dateSchema = z.string().datetime();
const tickSchema = z.string().min(1);

interface TransactionQuery {
  tick: string;
  startDate: string;
  endDate: string;
}

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
  await runDatabaseUpdate();
});

const UPDATE_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

// Run the update function every 30 minutes
setInterval(async () => {
  try {
    await updateDatabase();
    console.log('Database update completed successfully');
    
    // Log time until next update every 5 minutes
    const logInterval = setInterval(() => {
      const now = new Date();
      const nextUpdate = new Date(Math.ceil(now.getTime() / UPDATE_INTERVAL) * UPDATE_INTERVAL);
      const timeUntilNextUpdate = nextUpdate.getTime() - now.getTime();
      const minutesUntilNextUpdate = Math.round(timeUntilNextUpdate / 60000);
      logger.info(`Time until next database update: ${minutesUntilNextUpdate} minutes`);
    }, 5 * 60 * 1000); // Log every 5 minutes

    // Clear the logging interval just before the next update
    setTimeout(() => clearInterval(logInterval), UPDATE_INTERVAL - 1000);
  } catch (error) {
    console.error('Error updating database:', error);
  }
}, UPDATE_INTERVAL);

// Initial log for time until first update
const initialNextUpdate = new Date(Math.ceil(new Date().getTime() / UPDATE_INTERVAL) * UPDATE_INTERVAL);
const initialTimeUntilNextUpdate = initialNextUpdate.getTime() - new Date().getTime();
const initialMinutesUntilNextUpdate = Math.round(initialTimeUntilNextUpdate / 60000);
logger.info(`Time until first database update: ${initialMinutesUntilNextUpdate} minutes`);

app.post('/api/updateDatabase', async (req, res) => {
  try {
    await updateDatabase();
    logger.info('Manual database update completed successfully');
    res.json({ message: 'Database update completed successfully' });
  } catch (error) {
    logger.error('Error updating database:', error);
    res.status(500).json({ error: 'Internal server error' });
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

async function runDatabaseUpdate() {
  try {
    await updateDatabase();
    logger.info('Database update completed successfully');
  } catch (error) {
    logger.error('Error updating database:', error);
  }
}