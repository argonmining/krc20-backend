import express from 'express';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import { updateDatabase } from './services/kasplex';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/mintTotals', async (req, res) => {
  const { startDate, endDate } = req.query;
  try {
    const mintTotals = await prisma.transaction.groupBy({
      by: ['tick'],
      where: {
        op: 'mint',
        mtsAdd: {
          gte: startDate as string,
          lte: endDate as string,
        },
      },
      _count: {
        op: true,
      },
    });

    res.json(mintTotals.map(({ tick, _count }: { tick: string; _count: { op: number } }) => ({ tick, mintTotal: _count.op })));
  } catch (error) {
    console.error('Error fetching mint totals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/transactions', async (req, res) => {
  const { tick, startDate, endDate } = req.query;
  const transactions = await prisma.transaction.findMany({
    where: {
      tick: tick as string,
      mtsAdd: {
        gte: startDate as string,
        lte: endDate as string,
      },
    },
  });

  res.json(transactions);
});

app.get('/api/holders', async (req, res) => {
  const holders = await prisma.token.findMany({
    select: {
      tick: true,
      holderTotal: true,
    },
  });

  res.json(holders);
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Run the update function every hour
setInterval(updateDatabase, 60 * 60 * 1000);