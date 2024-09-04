import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { startScheduler } from './services/scheduler';
import { getTransactions } from './services/transactionService';
import cors from 'cors';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
app.use(cors());

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
});

app.use('/api/', apiLimiter);

app.get('/', (req: Request, res: Response) => {
  res.send('KRC20 Backend is running');
});

app.get('/api/transactions', async (req: Request, res: Response) => {
  try {
    const filters = {
      txHash: req.query.txHash as string | undefined,
      tick: req.query.tick as string | undefined,
      from: req.query.from as string | undefined,
      to: req.query.to as string | undefined,
      op: req.query.op as string | undefined,
      opError: req.query.opError as string | undefined,
    };

    const pagination = {
      page: req.query.page ? parseInt(req.query.page as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };

    const result = await getTransactions(filters, pagination);
    res.json(result);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  startScheduler();
});
