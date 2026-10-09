import { defineEventHandler, getRouterParam, setResponseHeader } from 'h3';
import { requireAuth } from '../../../utils/permissions.js';
import { generateDxf } from '#packages/facade/server/sheet-designs/operations.js';

export default defineEventHandler(async (event) => {
  const auth = requireAuth(event);
  const id = getRouterParam(event, 'id');
  const result = await generateDxf(id, auth);

  setResponseHeader(event, 'Content-Disposition', `attachment; filename="sheet-design-${id}.dxf"`);
  setResponseHeader(event, 'Content-Type', 'application/dxf');

  return result;
});
