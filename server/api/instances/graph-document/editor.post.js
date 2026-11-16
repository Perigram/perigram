import { createError, defineEventHandler, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { assertValidGraphDocument } from '@perigram/core';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as filesService from '~/server/features/files/service.js';

// First-save boundary for the graph editor (SPEC §28.7): create the
// canonical graph instance and its payload together. The temporary blob
// is removed if the authorized CTS create is refused.
export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const body = await readBody(event);
  const name = String(body?.name || '').trim();
  if (!name) throw createError({ statusCode: 400, message: 'Graph name is required' });
  if (!body?.graph || typeof body.graph !== 'object' || Array.isArray(body.graph)) {
    throw createError({ statusCode: 400, message: 'Graph document is required' });
  }

  let graph;
  try {
    graph = assertValidGraphDocument({ ...body.graph, name });
  } catch (error) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid graph document',
      data: { message: error.message, problems: error.problems || [] }
    });
  }

  const bytes = Buffer.from(JSON.stringify(graph), 'utf8');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
    throw createError({ statusCode: 413, message: 'Graph document exceeds the 5 MiB limit' });
  }

  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const stored = await filesService.uploadFile(
    bytes,
    `${name}.json`,
    { userId: auth.userId, organizationId, type: 'graph-document' },
    'files',
    'application/json'
  );

  try {
    const service = getAppRegistry().getInstanceService('graph-document');
    if (!service || typeof service.createForHttp !== 'function') {
      throw createError({ statusCode: 404, message: 'Graph document service is unavailable' });
    }
    return await service.createForHttp({
      name,
      payload: { fileId: stored.id, mime: 'application/json', size: bytes.length, name: `${name}.json` }
    }, { auth, organizationId });
  } catch (error) {
    await filesService.deleteFile(stored.id, 'files').catch(() => {});
    throw error;
  }
});
