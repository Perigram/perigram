import { createError, defineEventHandler, getRouterParam, readBody } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import { assertValidGraphDocument } from '#packages/core';
import { declarationForType } from '~/server/features/instances/service.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import * as filesService from '~/server/features/files/service.js';

// The one blank-editor creation boundary (SPEC §4/§28.13): any file type
// that accepts an editor payload creates its instance and first payload
// together. The type declaration owns the mime and size limits; graph
// documents additionally validate their canonical graph before storage.
export default defineEventHandler(async event => {
  const auth = await requireAuth(event);
  const typeId = getRouterParam(event, 'type');
  const body = await readBody(event);
  const name = String(body?.name || '').trim();
  const text = typeof body?.payload === 'string' ? body.payload : '';
  if (!typeId || !name || !text) {
    throw createError({ statusCode: 400, message: 'A file type, name, and editor payload are required' });
  }

  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  const declaration = await declarationForType(typeId, organizationId);
  if (!declaration?.payload) {
    throw createError({ statusCode: 400, message: `${typeId} does not accept an editor payload` });
  }

  const bytes = Buffer.from(text, 'utf8');
  const maxSize = Number(declaration.payload.maxSize || 0);
  if (!bytes.length || (maxSize && bytes.length > maxSize)) {
    throw createError({ statusCode: 413, message: `${typeId} payload exceeds its declared size limit` });
  }

  let fields = {};
  if (typeId === 'graph-document') {
    let graph;
    try {
      graph = assertValidGraphDocument(JSON.parse(text));
    } catch (error) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid graph document',
        data: { message: error.message, problems: error.problems || [] }
      });
    }
    fields = { graphId: graph.id };
  }

  const mimes = Array.isArray(declaration.payload.mime)
    ? declaration.payload.mime
    : [declaration.payload.mime].filter(Boolean);
  const mime = mimes[0] || 'application/octet-stream';
  const accepted = [].concat(declaration.payload.accept || []);
  const extension = accepted.find(entry => String(entry).startsWith('.')) || '';
  const filename = `${name}${extension}`;

  const stored = await filesService.uploadFile(bytes, filename, {
    userId: auth.userId,
    organizationId,
    type: typeId
  }, 'files', mime);

  try {
    const service = getAppRegistry().getInstanceService(typeId);
    if (!service || typeof service.createForHttp !== 'function') {
      throw createError({ statusCode: 404, message: `No instance service for ${typeId}` });
    }
    return await service.createForHttp({
      name,
      fields,
      payload: { fileId: stored.id, mime, size: bytes.length, name: filename }
    }, { auth, organizationId });
  } catch (error) {
    await filesService.deleteFile(stored.id, 'files').catch(() => {});
    throw error;
  }
});
