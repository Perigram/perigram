import { seedSystemDefault } from '../features/machines/service.js';

const machine = await seedSystemDefault();
console.log(`Seeded system machine ${machine._id}`);
process.exit(0);
