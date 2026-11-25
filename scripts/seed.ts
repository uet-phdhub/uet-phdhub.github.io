import 'dotenv/config';
import { initDb } from '../server/db/initDb';
import { seedDemoDataIfEmpty } from '../server/db/seedData';

async function main() {
  await initDb();
  await seedDemoDataIfEmpty();
  console.log('[UET PhDHub] Seed completed successfully.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
