import { createError } from 'h3';
import { createInstanceRef, createProvenance } from '../../core/blocks/index.js';
import { getArtifactConversion } from '#packages/domain-cnc/src/artifact-conversions.js';
import * as artifactsService from '../artifacts/service.js';
import * as cassettesService from '../cassettes/service.js';
import * as filesService from '../files/service.js';

export async function convertArtifact({ artifact, conversionId, name, layerMapping, parameters } = {}, auth = {}) {
  if (!artifact?._id) throw createError({ statusCode: 400, message: 'Artifact is required' });
  const conversion = getArtifactConversion(conversionId);
  if (!conversion) throw createError({ statusCode: 400, message: `Unknown artifact conversion: ${conversionId}` });
  if (!conversion.sourceKinds.includes(artifact.data?.type)) {
    throw createError({ statusCode: 400, message: `${conversion.label} does not accept ${artifact.data?.type || 'this'} artifacts` });
  }

  if (conversion.target.kind === 'artifact') {
    return await convertToArtifact(artifact, conversion, name, auth);
  }
  if (conversion.target.kind === 'entity' && conversion.target.typeId === 'cassette_design') {
    const imported = await cassettesService.importFromArtifact(
      artifact._id,
      name,
      auth.userId,
      auth.organizationId,
      auth.role,
      auth,
      layerMapping || null,
      parameters || null
    );
    return { type: 'cassette_design', entity: imported.design };
  }

  throw createError({ statusCode: 400, message: `Unsupported artifact conversion target: ${conversion.id}` });
}

async function convertToArtifact(artifact, conversion, name, auth) {
  const attachment = artifact.attachments?.primary;
  if (!attachment?.fileId) throw createError({ statusCode: 409, message: 'Artifact conversion requires a primary file' });
  const bucketName = attachment.metadata?.bucketName || attachment.bucketName || artifactsService.bucketNameForType(artifact.data?.type);
  const buffer = await filesService.getFileBuffer(attachment.fileId, bucketName);
  const filename = attachment.name || artifact.identity?.name || 'artifact.dxf';
  const converted = await artifactsService.createUploaded({
    buffer,
    filename,
    name: name || artifact.identity?.name || filename,
    mimeType: attachment.metadata?.mimeType || 'application/dxf',
    type: conversion.target.artifactKind,
    lineage: artifact.lineage || {},
    metadata: { conversionId: conversion.id, convertedFromArtifactId: String(artifact._id) },
    provenance: {
      derivedFrom: createProvenance(createInstanceRef('artifact', artifact._id), { conversionId: conversion.id })
    }
  }, auth);
  return { type: 'artifact', entity: converted };
}
