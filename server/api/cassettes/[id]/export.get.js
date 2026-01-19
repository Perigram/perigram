import { evaluateTemplate, generateSimpleDxf } from '~/server/features/parametric-cassettes/service';
import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';

export default defineEventHandler(async (event) => {
  try {
    requireAuth(event);
    const auth = event.context.auth;
    const id = event.context.params.id;
    const query = getQuery(event);
    
    // Get cassette to verify ownership and type
    const template = await cassetteService.getById(
        id, 
        auth.userId,
        auth.organizationId,
        auth.role,
        auth.permissions
    );
    
    if (template.type !== 'PARAMETRIC') {
      throw createError({ statusCode: 400, message: 'Only parametric templates can be exported with custom dimensions' });
    }

    // Evaluate geometry with dimensions from query
    const { polygons } = await evaluateTemplate(id, query);
    const dxfContent = generateSimpleDxf(polygons);

    const filename = `${template.name}-${id}.dxf`;

    setResponseHeaders(event, {
      'Content-Type': 'application/dxf',
      'Content-Disposition': `attachment; filename="${filename}"`
    });

    return dxfContent;
  } catch (error) {
    console.error('Export error:', error);
    throw error;
  }
});
