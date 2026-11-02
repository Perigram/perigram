import { recoverAbandonedCommandRuns } from '~/server/core/commands/service.js';

export default defineNitroPlugin(() => {
  recoverAbandonedCommandRuns()
    .then(({ abandoned }) => {
      if (abandoned) console.log(`[Command Run Recovery] abandoned ${abandoned} running command runs`);
    })
    .catch(error => console.error('[Command Run Recovery] failed:', error.message));
});
