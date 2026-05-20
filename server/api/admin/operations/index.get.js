import { requireAuth } from '~/server/utils/permissions';
import { listServiceActions } from '~/server/core/operations/service.js';
import '~/server/features/nesting/operations.js';
import '~/server/features/artifacts/operations.js';

export default defineEventHandler((event) => {
  requireAuth(event);
  const actions = listServiceActions();
  return {
    success: true,
    registry: {
      source: '@cutkit/domain-cnc:cncServiceActions',
      count: actions.length,
      handlerCount: actions.filter(action => action.handlerRegistered).length
    },
    operations: actions
  };
});
