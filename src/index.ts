import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { startScheduler } from './services/scheduler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req: Request, res: Response) => {
  res.send('KRC20 Backend is running');
});

app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  await startScheduler();
});
