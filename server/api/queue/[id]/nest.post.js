import { requireAuth } from '../../../utils/permissions.js';
import { executeServerOperation } from '../../../core/operations/service.js';
import '../../../features/nesting/operations.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const body = await readBody(event);
  const result = await executeServerOperation('nesting.run', {
    entities: { queue: event.context.params.id },
    data: body
  }, auth);

  return result.data;
});
