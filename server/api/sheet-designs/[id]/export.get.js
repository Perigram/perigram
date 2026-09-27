import { defineEventHandler, setResponseHeader } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as sheetDesignsService from '~/server/packs/facade/sheet-designs/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const id = event.context.params.id;
  const result = await sheetDesignsService.generateDxf(
    id,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth
  );

  setResponseHeader(event, 'Content-Disposition', `attachment; filename="sheet-design-${id}.dxf"`);
  setResponseHeader(event, 'Content-Type', 'application/dxf');

  return result;
});
