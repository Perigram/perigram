import * as cassetteService from '~/server/features/cassettes/service';
import { requireAuth } from '~/server/utils/permissions';
import { readMultipartFormData } from 'h3';

export default defineEventHandler(async (event) => {
  requireAuth(event);
  const auth = event.context.auth;

  const fields = await readMultipartFormData(event);
  
  const fileField = fields.find(f => f.name === 'file');
  const nameField = fields.find(f => f.name === 'name');
  const layerMappingField = fields.find(f => f.name === 'layerMapping');
  const parametersField = fields.find(f => f.name === 'parameters');
  
  if (!fileField) {
    throw createError({
      statusCode: 400,
      message: 'No file uploaded'
    });
  }

  const name = nameField?.data?.toString() || 'Unnamed Cassette';
  const fileName = fileField.filename || 'cassette.dxf';
  const fileBuffer = fileField.data;
  
  let layerMapping = null;
  if (layerMappingField) {
    try {
      layerMapping = JSON.parse(layerMappingField.data.toString());
    } catch (e) {
      console.error('Failed to parse layer mapping:', e);
    }
  }
  
  let parameters = null;
  if (parametersField) {
    try {
      parameters = JSON.parse(parametersField.data.toString());
    } catch (e) {
      console.error('Failed to parse parameters:', e);
    }
  }
  
  return await cassetteService.upload(
    fileBuffer, 
    fileName, 
    name, 
    auth.userId,
    auth.organizationId,
    auth.role,
    auth.permissions,
    layerMapping, 
    parameters
  );
});
