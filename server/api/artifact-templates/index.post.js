import { createError, defineEventHandler, readMultipartFormData } from 'h3';
import { requireAuth } from '~/server/utils/permissions.js';
import { serializeForAccess } from '~/server/utils/entity-redaction.js';
import { service } from '~/server/features/artifact-templates';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const form = await readMultipartFormData(event);
  const file = form?.find(field => field.name === 'file');
  if (!file?.data?.length) throw createError({ statusCode: 400, message: 'Artifact template file is required' });
  const name = form.find(field => field.name === 'name')?.data?.toString().trim();
  const template = await service.createUploaded({
    buffer: file.data,
    filename: file.filename,
    mimeType: file.type,
    name
  }, auth);
  return serializeForAccess('artifactTemplate', template, auth);
});
