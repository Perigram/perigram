import { requireLineagePermission } from '~/server/utils/permissions';
import { listCommands } from '~/server/core/commands/service.js';

export default defineEventHandler((event) => {
  requireLineagePermission(event, { organizationId: event.context.auth?.organizationId }, 'organizations', 'admin');
  const commands = listCommands().map(command => ({ ...command, kind: 'command', runnable: true }));
  return {
    success: true,
    registry: {
      source: 'app-registry:domains',
      count: commands.length,
      commandCount: commands.length,
      handlerCount: commands.filter(command => command.handlerRegistered).length
    },
    commands
  };
});
