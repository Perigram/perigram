import { createError, defineEventHandler, getRouterParam, readMultipartFormData } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifacts';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { validateArtifactFile } from '~/server/features/artifacts/file-contract.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const form = await readMultipartFormData(event);
  const file = form?.find(field => field.name === 'file');
  if (!file?.data?.length) throw createError({ statusCode: 400, message: 'Artifact file is required' });
  const id = getRouterParam(event, 'id');
  const current = await service.getById(id, auth.userId, auth.organizationId, auth.role, auth);
  const kind = getAppRegistry().getAttachmentKindDefinition(current.data?.type);
  if (!kind || !['upload', 'capture', 'editor'].includes(kind.creation?.mode)) throw createError({ statusCode: 400, message: 'Artifact kind does not support file replacement' });
  validateArtifactFile(kind, { buffer: file.data, filename: file.filename, mimeType: file.type });
  const artifact = await service.replaceUploadedFile(id, {
    buffer: file.data,
    filename: file.filename,
    mimeType: file.type
  }, auth);
  return serializeForAccess('artifact', artifact, auth);
});
