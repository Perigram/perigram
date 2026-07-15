import { createError, defineEventHandler, getQuery, readMultipartFormData } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess, serializeManyForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifacts';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  if (event.req.method === 'GET') {
    const artifacts = await service.list(getQuery(event), auth.userId, auth.organizationId, auth.role, auth);
    return serializeManyForAccess('artifact', artifacts, auth);
  }
  if (event.req.method !== 'POST') throw createError({ statusCode: 405, message: 'Method not allowed' });

  const form = await readMultipartFormData(event);
  const file = form?.find(field => field.name === 'file');
  if (!file?.data?.length) throw createError({ statusCode: 400, message: 'Artifact file is required' });
  const value = name => form.find(field => field.name === name)?.data?.toString();
  const type = value('type') || inferArtifactType(file.type, file.filename);
  const lineage = parseObjectField(value('lineage'), 'lineage');
  const metadata = parseObjectField(value('metadata'), 'metadata');
  const artifact = await service.createUploaded({
    buffer: file.data,
    filename: file.filename,
    mimeType: file.type,
    type,
    lineage,
    metadata
  }, auth);
  return serializeForAccess('artifact', artifact, auth);
});

function parseObjectField(value, name) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw createError({ statusCode: 400, message: `Artifact ${name} must be a JSON object` });
  }
}

function inferArtifactType(mimeType = '', filename = '') {
  if (String(mimeType).startsWith('image/')) return 'CAPTURE_PHOTO';
  if (/\.dxf$/i.test(filename)) return 'DXF_SOURCE';
  return 'UPLOAD';
}
