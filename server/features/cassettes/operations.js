import * as cassetteService from './service.js';
import { createError } from 'h3';
import * as artifactsService from '../artifacts/service.js';
import * as filesService from '../files/service.js';
import { occsParameterNames } from '#utils/occs/parameters.js';

export async function saveCassetteTemplate({ entities = {}, parameters = {}, auth }) {
  const body = {
    name: parameters.name,
    type: parameters.type || 'PARAMETRIC',
    definition: parameters.definition,
    parameters: parameters.parameters || occsParameterNames(parameters.definition || {})
  };

  const cassetteId = entities.cassette?._id;
  const cassette = cassetteId
    ? await cassetteService.update(cassetteId, body, auth.userId, auth.organizationId, auth.role, auth)
    : await cassetteService.create(body, auth.userId, auth.organizationId, auth.role, auth);

  return {
    entities: [{ type: 'cassette', id: cassette._id.toString() }],
    events: [{
      type: 'cassette.templateSaved',
      source: { type: 'cassette', id: cassette._id.toString() }
    }],
    data: { cassetteId: cassette._id.toString() }
  };
}

export async function importCassetteDesign({ entities = {}, parameters = {}, auth }) {
  const artifact = entities.artifact?._id
    ? entities.artifact
    : await createImportArtifact(parameters, auth);
  if (!artifact?._id) throw createError({ statusCode: 400, message: 'DXF artifact or file is required' });
  const source = await artifactsService.getById(artifact._id, auth.userId, auth.organizationId, auth.role, auth);
  const attachment = source.attachments?.primary;
  if (!attachment?.fileId) throw createError({ statusCode: 400, message: 'Artifact has no uploaded file' });
  const stream = await filesService.getFileStream(attachment.fileId, attachment.metadata?.bucketName || 'uploads');
  const fileBuffer = await streamBuffer(stream);
  const imported = await cassetteService.upload(
    fileBuffer,
    attachment.name || source.identity?.name || 'cassette.dxf',
    parameters.name || source.identity?.name,
    auth.userId,
    auth.organizationId,
    auth.role,
    auth,
    parameters.layerMapping || {},
    []
  );
  const templateId = imported.template._id.toString();
  const designId = imported.design._id.toString();
  return {
    entities: [
      { type: 'cassette', id: templateId },
      { type: 'cassette_design', id: designId }
    ],
    events: [{
      type: 'cassette.designImported',
      source: { type: 'artifact', id: artifact._id.toString() },
      entities: [{ type: 'cassette_design', id: designId }]
    }],
    data: { cassetteId: templateId, cassetteDesignId: designId }
  };
}

async function createImportArtifact(parameters = {}, auth = {}) {
  if (!parameters.file?.fileId) return null;
  return await artifactsService.create({
    name: parameters.file.filename || parameters.name || 'cassette.dxf',
    type: 'DXF_UPLOAD',
    file: parameters.file
  }, auth.userId, auth.organizationId, auth.role, auth);
}

async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}
