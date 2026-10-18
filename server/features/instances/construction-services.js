// Service-backed construction (SPEC §Plugin marketplace): construction
// modes of installed-plugin types whose compute lives in the plugin's
// external executor. The platform resolves the operator's inputs as
// VALUES — referenced instances (with their payload documents) and the
// draft's uploaded payload, all base64 — calls the executor through the
// connector service path, and merges the returned fields into the record
// created through the generic §13 machinery. The executor never receives
// ids it must dereference: values in, values out.
//
// Dynamic imports of ./service.js follow the command runtime's
// cycle-breaking precedent (the instance machinery imports this module at
// module scope; the resolver is only called at construction time).
import { createError } from 'h3';
import * as filesService from '../files/service.js';
import { executeConnectorService, constructionsForOrganization } from '../plugins/service.js';

// Service-backed construction (SPEC §Plugin marketplace): construction
// modes of installed-plugin types dispatch to the plugin's executor.
export function serviceAwareConstructionHandlers(typeId, standard) {
  return new Proxy(standard, {
    get(target, mode) {
      if (Object.hasOwn(target, mode)) return target[mode];
      if (typeof mode === 'string' && mode) return serviceBackedConstruction(typeId, mode);
      return undefined;
    },
    // Capability projections ask hasOwn: every declared mode must report
    // as served (the dispatch resolves per call against the organization's
    // bindings and fails loudly when a mode is genuinely unbound).
    getOwnPropertyDescriptor(target, mode) {
      if (Object.hasOwn(target, mode)) return Object.getOwnPropertyDescriptor(target, mode);
      if (typeof mode === 'string' && mode) {
        return { configurable: true, enumerable: false, writable: true, value: serviceBackedConstruction(typeId, mode) };
      }
      return undefined;
    }
  });
}

// The handler for a construction mode with no standard protocol: resolve
// the org's binding, run the executor, create through the generic service.
export function serviceBackedConstruction(typeId, mode) {
  return async (draft = {}, context = {}) => {
    const merged = await applyConstructionService(typeId, mode, draft, context);
    const { instanceServiceResolver } = await import('./service.js');
    const service = instanceServiceResolver(typeId);
    if (mode === 'upload' || mode === 'capture') {
      return await service.createWithPayloadProtocol(merged, context, mode);
    }
    return await service.create(merged, context.userId, context.organizationId);
  };
}

// The pre-step the standard payload-protocol handlers apply: merge the
// executor's computed fields into the draft before the protocol runs.
// Types without a binding pass through unchanged.
export async function applyConstructionService(typeId, mode, draft = {}, context = {}) {
  const organizationId = context.organizationId || null;
  if (!organizationId) return draft;
  const bindings = await constructionsForOrganization(organizationId).catch(() => ({}));
  const serviceRef = bindings[typeId]?.[mode];
  if (!serviceRef) return draft;

  const parameters = await buildServiceInput(typeId, mode, draft, context, organizationId);
  const output = await executeConnectorService(
    { id: serviceRef },
    { parameters, auth: serviceAuth(context) }
  );
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw createError({ statusCode: 502, message: `Construction service ${serviceRef} returned no object output` });
  }
  const data = output.data && typeof output.data === 'object' && !Array.isArray(output.data) ? output.data : {};
  // The executor's computed rows land in the draft's FIELDS — the declared
  // home the projection and the wire read (fields.geometry et al).
  return { ...draft, fields: { ...(draft.fields || {}), ...data } };
}

function serviceAuth(context = {}) {
  return context.executionAuth || {
    userId: context.userId,
    organizationId: context.organizationId,
    role: context.role,
    memberships: []
  };
}

async function buildServiceInput(typeId, mode, draft, context, organizationId) {
  const { instanceServiceResolver, declarationForType } = await import('./service.js');
  const declaration = await declarationForType(typeId, organizationId);
  const operator = Object.values(declaration?.operators || {})
    .find(candidate => candidate?.species === 'construct' && candidate.id === mode) || null;

  // Construction inputs may arrive row-relative (top-level `template`,
  // `parameters`) or data-qualified (`data.template`): the in-process
  // handlers always accepted both spellings, and the executor contract
  // reads the data-qualified form — normalize once, here.
  const draftData = { ...(draft?.data || {}) };
  for (const field of Object.keys(operator?.input?.fields || {})) {
    if (draftData[field] === undefined && draft?.[field] !== undefined) {
      draftData[field] = draft[field];
    }
  }

  // Ref inputs resolve to values: the referenced instance, its identity,
  // and — when it carries a payload — the payload document as base64.
  // Cross-org references refuse, exactly like the in-process handlers did.
  const refs = {};
  for (const [field, fieldDef] of Object.entries(operator?.input?.fields || {})) {
    if (fieldDef?.base !== 'ref') continue;
    const id = String(draftData[field] ?? '').trim();
    if (!id) continue;
    const accepted = Array.isArray(fieldDef.accepts) ? fieldDef.accepts : [];
    let instance = null;
    for (const acceptedType of accepted) {
      instance = await instanceServiceResolver(acceptedType).getById(id).catch(() => null);
      if (instance) break;
    }
    if (!instance) {
      throw createError({ statusCode: 400, message: `Construction input ${field} references ${id}, which none of [${accepted.join(', ')}] serves` });
    }
    const tenancy = instance.organizationId ?? instance.lineage?.organizationId;
    const instanceOrg = tenancy != null ? String(tenancy) : null;
    if (instanceOrg && instanceOrg !== String(organizationId)) {
      throw createError({ statusCode: 400, message: `Construction input ${field} references an instance of another organization` });
    }
    refs[field] = await referencedValue(instance);
  }

  // The upload protocol's file: the draft's payload as base64.
  let payloadBase64 = null;
  let payloadMeta = null;
  const payloadRef = draft?.payload || null;
  const fileId = payloadRef?.fileId || payloadRef?.id || null;
  if (fileId) {
    const buffer = await filesService.getFileBuffer(fileId, 'files');
    payloadBase64 = Buffer.from(buffer).toString('base64');
    payloadMeta = {
      name: payloadRef.name || null,
      mime: payloadRef.mime || null,
      size: payloadRef.size ?? buffer.length
    };
  }

  return {
    mode,
    typeId,
    draft: {
      identity: draft?.identity || null,
      data: draftData,
      lineage: draft?.lineage || null
    },
    refs,
    ...(payloadBase64 ? { payloadBase64, payloadMeta } : {})
  };
}

async function referencedValue(instance) {
  const value = {
    id: String(instance._id),
    name: instance.identity?.name || instance.name || null,
    fields: instance.data || instance.fields || {}
  };
  const payloadRef = instance.attachments?.primary || instance.payload || null;
  const fileId = payloadRef?.fileId || payloadRef?.id || null;
  if (fileId) {
    const buffer = await filesService.getFileBuffer(fileId, 'files');
    value.payloadBase64 = Buffer.from(buffer).toString('base64');
    value.payloadMime = payloadRef.mime || null;
  }
  return value;
}
