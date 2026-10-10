import { createError } from 'h3';
import { createInstanceRef, createProvenance } from '../../core/blocks/index.js';
import * as artifactsService from '../artifacts/service.js';
import * as filesService from '../files/service.js';

// The conversion capability is plugin-agnostic machinery: installed
// plugins supply the declared conversion catalog (id, label, sourceKinds,
// target) with optional service bindings through their listing snapshots
// (server/features/plugins). This module owns the generic halves — source
// verification, artifact-to-artifact copying, and the service-backed
// entity conversion (the artifact file as values to the plugin's
// executor, the returned payload and fields through the generic instance
// machinery) — and imports no domain code.
import { createError } from 'h3';
import { createInstanceRef, createProvenance } from '../../core/blocks/index.js';
import * as artifactsService from '../artifacts/service.js';
import * as filesService from '../files/service.js';
import { executeConnectorService } from '../plugins/service.js';
import { instanceServiceResolver } from '../instances/service.js';

export async function convertArtifact(
  { artifact, conversionId, name, layerMapping, parameters } = {},
  auth = {},
  { conversions = [] } = {}
) {
  if (!artifact?._id) throw createError({ statusCode: 400, message: 'Artifact is required' });
  const conversion = conversions.find(entry => entry.id === conversionId) || null;
  if (!conversion) {
    throw createError({ statusCode: 400, message: `Unknown artifact conversion: ${conversionId}` });
  }
  if (!conversion.sourceKinds.includes(artifact.data?.type)) {
    throw createError({ statusCode: 400, message: `${conversion.label} does not accept ${artifact.data?.type || 'this'} artifacts` });
  }

  if (conversion.target.kind === 'artifact') {
    return await convertToArtifact(artifact, conversion, name, auth);
  }
  if (conversion.target.kind === 'entity' && conversion.service) {
    return await convertToEntityViaService(artifact, conversion, { name, layerMapping, parameters }, auth);
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

// Entity-target conversion through the plugin's executor: the artifact's
// file and conversion inputs travel as values (buffer base64); the
// executor returns the target's payload and computed fields; the platform
// stores the payload and creates the instance through the generic §13
// machinery. Provenance records the conversion.
async function convertToEntityViaService(artifact, conversion, inputs, auth) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
  if (!organizationId) {
    throw createError({ statusCode: 400, message: 'Entity conversion requires an organization context' });
  }
  const attachment = artifact.attachments?.primary;
  if (!attachment?.fileId) throw createError({ statusCode: 409, message: 'Artifact conversion requires a primary file' });
  const bucketName = attachment.metadata?.bucketName || attachment.bucketName || artifactsService.bucketNameForType(artifact.data?.type);
  const buffer = await filesService.getFileBuffer(attachment.fileId, bucketName);

  const output = await executeConnectorService(
    { id: conversion.service },
    {
      parameters: {
        artifact: {
          id: String(artifact._id),
          type: artifact.data?.type || null,
          name: artifact.identity?.name || null,
          bufferBase64: Buffer.from(buffer).toString('base64')
        },
        name: inputs.name || null,
        layerMapping: inputs.layerMapping || null,
        parameters: inputs.parameters || null
      },
      auth
    }
  );
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw createError({ statusCode: 502, message: `Conversion service ${conversion.service} returned no object output` });
  }
  const typeId = conversion.target.typeId;
  if (!typeId) throw createError({ statusCode: 400, message: `Conversion ${conversion.id} targets an entity without a typeId` });

  let payload = null;
  if (output.payloadBase64) {
    const payloadBuffer = Buffer.from(String(output.payloadBase64), 'base64');
    const filename = output.filename || `${inputs.name || 'converted'}.dxf`;
    const uploaded = await filesService.uploadFile(
      payloadBuffer,
      filename,
      {
        userId: auth.userId,
        organizationId,
        convertedFromArtifactId: String(artifact._id),
        type: conversion.target.typeId
      },
      'files'
    );
    payload = {
      fileId: uploaded.id,
      name: filename,
      mime: output.payloadMime || attachment.metadata?.mimeType || 'application/dxf',
      size: payloadBuffer.length
    };
  }

  const service = instanceServiceResolver(typeId);
  const fields = output.fields && typeof output.fields === 'object' && !Array.isArray(output.fields) ? output.fields : {};
  const entity = await service.create({
    ...(inputs.name ? { identity: { name: inputs.name } } : {}),
    ...(Object.keys(fields).length ? { data: fields } : {}),
    ...(payload ? { payload } : {}),
    lineage: artifact.lineage || {},
    provenance: {
      derivedFrom: createProvenance(createInstanceRef('artifact', artifact._id), { conversionId: conversion.id })
    }
  }, auth.userId, organizationId);
  return { type: typeId, entity };
}
