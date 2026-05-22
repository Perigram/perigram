import { requireAuth } from '~/server/utils/permissions';
import { listProcessDefinitions } from '~/server/core/processes/service.js';
import { listServiceActions } from '~/server/core/operations/service.js';

export default defineEventHandler((event) => {
  requireAuth(event);
  const actions = listServiceActions().map(action => ({ ...action, kind: 'service_action', runnable: true }));
  const processes = listProcessDefinitions().map(process => ({
    id: process.id,
    service: process.service,
    action: process.id,
    label: process.label || process.id,
    kind: 'process',
    source: 'registered-domain',
    runnable: false,
    handlerRegistered: false,
    input: process.input || {},
    output: process.output || {},
    executor: process.executor || null,
    triggers: process.triggers || [],
    access: process.access || {}
  }));
  const operations = [...actions, ...processes];
  return {
    success: true,
    registry: {
      source: '@cutkit/domain-cnc:cncDomain',
      count: operations.length,
      serviceActionCount: actions.length,
      processCount: processes.length,
      handlerCount: actions.filter(action => action.handlerRegistered).length
    },
    operations
  };
});
