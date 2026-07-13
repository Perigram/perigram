import { ensureSystemDefault } from '../features/machines/service.js';

ensureSystemDefault()
  .then(machine => {
    process.stdout.write(`Seeded ${machine.identity?.name || machine._id}\n`);
    process.exit(0);
  })
  .catch(error => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
