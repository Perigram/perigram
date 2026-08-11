import { createError, defineEventHandler, readMultipartFormData } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/features/cassettes/service';
import * as artifactService from '~/server/features/artifacts/service.js';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const formData = await readMultipartFormData(event);
  
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' });
  
  const file = formData.find(f => f.name === 'file');
  if (!file?.data) throw createError({ statusCode: 400, message: 'No DXF file provided' });
  const name = formData.find(f => f.name === 'name')?.data.toString();
  const mapping = formData.find(f => f.name === 'layerMapping')?.data.toString();
  const parameters = formData.find(f => f.name === 'parameters')?.data.toString();
  
  const artifact = await artifactService.createUploaded({
    buffer: file.data,
    filename: file.filename,
    mimeType: file.type || 'application/dxf',
    type: 'DXF_SOURCE',
    metadata: { purpose: 'cassette-import' }
  }, auth);

  return await cassetteService.importFromArtifact(
    artifact._id,
    name,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    mapping ? JSON.parse(mapping) : null,
    parameters ? JSON.parse(parameters) : null
  );
});
