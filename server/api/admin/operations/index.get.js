import { requireAuth } from '~/server/utils/permissions';
import { listServerOperations } from '~/server/core/operations/service.js';
import '~/server/features/nesting/operations.js';
import '~/server/features/artifacts/operations.js';

export default defineEventHandler((event) => {
  requireAuth(event);
  const operations = listServerOperations();
  return {
    success: true,
    registry: {
      source: '@cutkit/domain-cnc:cncOperations',
      count: operations.length,
      handlerCount: operations.filter(operation => operation.handlerRegistered).length
    },
    operations
  };
});
