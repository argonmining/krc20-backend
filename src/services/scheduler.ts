import Agenda from 'agenda';
import { pollKasplexAPI } from './kasplexService';

const mongoConnectionString = process.env.MONGO_URL || 'mongodb://localhost/agenda';
const agenda = new Agenda({ db: { address: mongoConnectionString } });

agenda.define('poll Kasplex API', async (job: Agenda.Job) => {
  await pollKasplexAPI();
});

(async function() {
  await agenda.start();
  await agenda.every('5 minutes', 'poll Kasplex API');
})();

export default agenda;
