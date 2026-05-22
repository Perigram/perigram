import { requireAuth } from '~/server/utils/permissions';
import { listCommands } from '~/server/core/commands/service.js';

export default defineEventHandler((event) => {
  requireAuth(event);
  const commands = listCommands().map(command => ({ ...command, kind: 'command', runnable: true }));
  return {
    success: true,
    registry: {
      source: '@cutkit/domain-cnc:cncDomain',
      count: commands.length,
      commandCount: commands.length,
      handlerCount: commands.filter(command => command.handlerRegistered).length
    },
    commands
  };
});
