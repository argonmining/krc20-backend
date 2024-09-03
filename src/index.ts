import express from 'express';
import dotenv from 'dotenv';
import './services/scheduler';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('KRC20 Backend is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
