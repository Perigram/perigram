import { defineEventHandler, readMultipartFormData } from 'h3';
import { requireAuth } from '~/server/utils/permissions';
import * as cassetteService from '~/server/features/cassettes/service';

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event);
  const formData = await readMultipartFormData(event);
  
  if (!formData) throw createError({ statusCode: 400, message: 'No form data' });
  
  const file = formData.find(f => f.name === 'file');
  const name = formData.find(f => f.name === 'name')?.data.toString();
  const mapping = formData.find(f => f.name === 'layerMapping')?.data.toString();
  const parameters = formData.find(f => f.name === 'parameters')?.data.toString();
  
  return await cassetteService.upload(
    file.data,
    file.filename,
    name,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    mapping ? JSON.parse(mapping) : null,
    parameters ? JSON.parse(parameters) : null
  );
});