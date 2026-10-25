// The export executor (SPEC §21): an installed plugin's export binding
// is the whole truth — the source instance's actual type must match a
// (typeId, kind) binding exactly, and the bound service returns the
// file. Exports land in the `files` GridFS bucket (the SPEC §3 Blob
// home) and the command result carries the stored file reference. The
// caller must hold write on the source instance (the same grant model
// as compiled run-command actions).
import { createError } from 'h3';
import { assertEntityAccess } from '../../core/access/service.js';
import * as filesService from '../files/service.js';
import { declarationForType, instanceServiceResolver, writeGrantTarget } from '../instances/service.js';
import { executeConnectorService, exportersForOrganization } from './service.js';

export async function generateAttachment({ entities, parameters = {}, auth }) {
  const source = entities.source;
  if (!source) throw createError({ statusCode: 400, message: 'Export source entity is required' });

  const kind = parameters.kind;
  if (!kind) throw createError({ statusCode: 400, message: 'Export kind is required' });

  const sourceType = source.type || source.typeId;
  const sourceId = String(source._id || source.id);
  const organizationId = auth?.organizationId || auth?.memberships?.[0]?.organizationId || null;
  if (!organizationId) throw createError({ statusCode: 400, message: 'Export requires an organization context' });

  const binding = (await exportersForOrganization(organizationId))
    .find(entry => entry.kind === kind && entry.typeId === sourceType) || null;
  if (!binding) {
    throw createError({ statusCode: 400, message: `No installed plugin exports ${kind} from ${sourceType}` });
  }

  const declaration = await declarationForType(binding.typeId, organizationId);
  if (!declaration) throw createError({ statusCode: 404, message: `Unknown type ${binding.typeId}` });

  const service = instanceServiceResolver(binding.typeId);
  const instance = await service.getById(sourceId);
  if (!instance) throw createError({ statusCode: 404, message: `Export source ${sourceId} not found` });

  const writeGate = await writeGrantTarget(declaration, organizationId);
  if (!writeGate) throw createError({ statusCode: 403, message: `Write gate for ${binding.typeId} is not resolvable` });
  assertEntityAccess({
    entity: instance,
    typeId: writeGate.typeId,
    feature: writeGate.feature,
    level: 'write',
    action: 'update',
    auth
  });

  const output = await executeConnectorService(
    { id: binding.service },
    { parameters: await exportServiceInput(instance), auth }
  );
  const dxf = output && typeof output.dxf === 'string' ? output.dxf : null;
  if (!dxf) {
    throw createError({ statusCode: 502, message: `Export service ${binding.service} returned no dxf` });
  }

  const name = `${instance.name || instance.identity?.name || sourceId}.dxf`;
  const uploaded = await filesService.uploadFile(
    Buffer.from(dxf, 'utf8'),
    name,
    {
      userId: auth.userId,
      organizationId,
      exportedFrom: `${binding.typeId}:${sourceId}`,
      kind: binding.kind
    },
    'files',
    'application/dxf'
  );

  const file = {
    kind: binding.kind,
    fileId: uploaded.id,
    name,
    mimeType: 'application/dxf'
  };
  return {
    attachments: [file],
    events: [{
      type: 'attachment.generationCompleted',
      source: { type: binding.typeId, id: sourceId },
      data: { kind: binding.kind, fileId: uploaded.id }
    }],
    data: file
  };
}

// The export values contract mirrors construction dispatch: the record
// as values ({ id, name, fields }, payload as base64), ids never
// dereferenced executor-side.
async function exportServiceInput(instance) {
  const value = {
    typeId: instance.type,
    id: String(instance._id),
    name: instance.name || instance.identity?.name || null,
    fields: instance.fields || instance.data || {}
  };
  const payloadRef = instance.payload || instance.attachments?.primary || null;
  const fileId = payloadRef?.fileId || payloadRef?.id || null;
  if (fileId) {
    const buffer = await filesService.getFileBuffer(fileId, 'files');
    value.payloadBase64 = Buffer.from(buffer).toString('base64');
    value.payloadMime = payloadRef.mime || payloadRef.mimeType || null;
  }
  return value;
}
