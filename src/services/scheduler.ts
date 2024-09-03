import cron from 'node-cron';
import { pollKasplexAPI, fetchAllHistoricalData, removeDuplicateTransactions } from './kasplexService';

export async function startScheduler() {
  console.log('Starting scheduler...');

  // Remove duplicate transactions
  await removeDuplicateTransactions().catch(console.error);

  // Run fetchAllHistoricalData immediately when the app starts
  await fetchAllHistoricalData().catch(console.error);

  // Schedule pollKasplexAPI to run every hour
  cron.schedule('0 * * * *', () => {
    pollKasplexAPI().catch(console.error);
  });

  console.log('Scheduler started');
}
