import { evaluateTemplate, generateSimpleDxf } from '~/server/features/parametric-cassettes/service';
import { service as cassetteService } from '~/server/features/cassettes';

export default defineEventHandler(async (event) => {
  try {
    const userId = event.context.auth?.userId;
    if (!userId) {
      throw createError({ statusCode: 401, message: 'Unauthorized' });
    }

    const id = getRouterParam(event, 'id');
    const query = getQuery(event);
    
    // Get cassette to verify ownership and type
    const template = await cassetteService.getById(id, userId);
    
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
