// Service-backed construction (SPEC §Plugin marketplace): construction
// modes of installed-plugin types whose compute lives in the plugin's
// runtime or external executor. The platform resolves the operator's
// inputs as VALUES — referenced instances (with their payload documents)
// and the draft's uploaded payload, all base64 — calls the bound service
// through the synchronous value dispatch, and merges the returned fields
// into the record created through the generic §13 machinery. The service
// never receives ids it must dereference: values in, values out.
//
// Dynamic imports of ./service.js follow the command runtime's
// cycle-breaking precedent (the instance machinery imports this module at
// module scope; the resolver is only called at construction time).
import { createError } from 'h3';
import { isRefDescriptor, refAcceptsOf } from '#packages/cts';
import * as filesService from '../files/service.js';
import { invokeConstructionValueService, constructionsForOrganization } from '../plugins/service.js';
import { executorPayload } from '../plugins/executor-payload.js';

const EXECUTOR_FIELD_IDS = Symbol('executorFieldIds');

// A relation slot is a set: executor-declared refs collapse by type+id so
// a computed list (one entry per placement) stores each target once.
function uniqueRelationValue(value) {
  if (!Array.isArray(value)) return value;
  const seen = new Set();
  return value.filter(ref => {
    const id = ref && typeof ref === 'object' ? (ref.id ?? ref._id) : ref;
    if (id == null) return true;
    const type = ref && typeof ref === 'object' ? (ref.type || ref.typeId || '') : '';
    const key = `${type}:${String(id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}


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
    const executorFieldIds = merged[EXECUTOR_FIELD_IDS] || [];
    if (merged.payload || mode === 'upload' || mode === 'capture') {
      return await service.createWithPayloadProtocol(merged, context, mode, { executorFieldIds });
    }
    return await service.create(merged, context.userId, context.organizationId, { executorFieldIds });
  };
}

// The shared executor invocation both construction paths ride: resolve
// the org's binding, build the values input, run the service. Null when
// the context carries no organization or the mode is unbound; a
// structured refusal throws with the offender list (SPEC §24).
async function invokeConstructionService(typeId, mode, draft = {}, context = {}) {
  const organizationId = context.organizationId || null;
  if (!organizationId) return null;
  const bindings = await constructionsForOrganization(organizationId).catch(() => ({}));
  const serviceRef = bindings[typeId]?.[mode];
  if (!serviceRef) return null;

  const parameters = await buildServiceInput(typeId, mode, draft, context, organizationId);
  const output = await invokeConstructionValueService(serviceRef, parameters, serviceAuth(context));
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw createError({ statusCode: 502, message: `Construction service ${serviceRef} returned no object output` });
  }
  if (Array.isArray(output.failures) && output.failures.length) {
    const failures = output.failures
      .map(failure => ({ ...(failure && typeof failure === 'object' ? failure : { message: String(failure) }) }))
      .map(failure => ({ name: failure.name == null ? null : String(failure.name), message: String(failure.message || '') }))
      .filter(failure => failure.message || failure.name);
    if (failures.length) {
      throw createError({
        statusCode: 422,
        message: failures.map(failure => [failure.name, failure.message].filter(Boolean).join(': ')).join('; '),
        data: { failures }
      });
    }
  }
  const data = output.data && typeof output.data === 'object' && !Array.isArray(output.data) ? output.data : {};
  return { serviceRef, parameters, output, data };
}

// The fill dialog's composed preview (SPEC §24): the same service the
// create runs, invoked with nothing persisted — the payload returns as
// base64 wire, the fields as the computed draft, and the executor's
// `meta` verbatim (the ephemeral channel records never store). An
// unbound mode is a quiet null (the route answers 204), a missing
// organization refuses.
export async function previewConstructionService(typeId, mode, draft = {}, context = {}) {
  if (!context.organizationId) {
    throw createError({ statusCode: 400, message: 'Organization context is required' });
  }
  const run = await invokeConstructionService(typeId, mode, draft, context);
  if (!run) return null;
  const file = executorPayload(run.serviceRef, run.output.payload);
  return {
    payload: file ? { base64: file.buffer.toString('base64'), mime: file.mime, ...(file.name ? { name: file.name } : {}) } : null,
    fields: run.data,
    ...(run.output.meta && typeof run.output.meta === 'object' ? { meta: run.output.meta } : {})
  };
}

// The pre-step the standard payload-protocol handlers apply: merge the
// executor's computed fields into the draft before the protocol runs.
// Types without a binding pass through unchanged.
export async function applyConstructionService(typeId, mode, draft = {}, context = {}) {
  const run = await invokeConstructionService(typeId, mode, draft, context);
  if (!run) return draft;
  const { serviceRef, parameters, output, data } = run;
  const merged = { ...draft, fields: { ...(draft.fields || {}), ...data } };
  Object.defineProperty(merged, EXECUTOR_FIELD_IDS, { value: Object.keys(data) });
  // Executor-declared relations (SPEC §6 edges): computed relation values
  // join the draft beside the computed fields and store through the same
  // §3 relations slot wire patches use.
  if (output.relations && typeof output.relations === 'object' && !Array.isArray(output.relations)) {
    merged.relations = {
      ...(draft.relations || {}),
      ...Object.fromEntries(Object.entries(output.relations).map(([key, value]) => [key, uniqueRelationValue(value)]))
    };
  }
  // Revision stamps (SPEC §24): the resolved pin rides the stored ref —
  // a declared ref field stores `{ type, id, revision }`, and every
  // resolved ref pins in provenance.sources, where the causal refs live.
  const declaredRefFields = new Set(parameters.declaredRefFields || []);
  for (const [field, pin] of Object.entries(parameters.pins || {})) {
    if (declaredRefFields.has(field)) merged.relations = { ...(merged.relations || {}), [field]: pin };
  }
  const pins = Object.values(parameters.pins || {}).flatMap(pin => (Array.isArray(pin) ? pin : [pin]));
  if (pins.length) {
    const sources = [...(merged.provenance?.sources || [])];
    for (const pin of pins) {
      const at = sources.findIndex(source => source.type === pin.type && String(source.id) === String(pin.id));
      if (at >= 0) sources[at] = { ...sources[at], revision: pin.revision };
      else sources.push(pin);
    }
    merged.provenance = { ...(merged.provenance || {}), sources };
  }
  const file = executorPayload(serviceRef, output.payload);
  if (!file) return merged;
  const withPayload = { ...merged, payload: await storeExecutorPayload(typeId, draft, file, context, context.organizationId) };
  Object.defineProperty(withPayload, EXECUTOR_FIELD_IDS, { value: Object.keys(data) });
  return withPayload;
}

async function storeExecutorPayload(typeId, draft, file, context, organizationId) {
  const { declarationForType, payloadFromWire } = await import('./service.js');
  const declaration = await declarationForType(typeId, organizationId);
  const extension = [].concat(declaration?.payload?.accept || []).find(entry => String(entry).startsWith('.')) || '';
  const filename = file.name || `${draft.name || typeId}${extension}`;
  const stored = await filesService.uploadFile(file.buffer, filename, {
    userId: context.userId,
    organizationId,
    type: typeId
  }, 'files');
  try {
    return payloadFromWire(
      { payload: { fileId: stored.id, mime: file.mime, size: file.buffer.length, name: filename } },
      declaration
    );
  } catch (error) {
    await filesService.deleteFile(stored.id, 'files').catch(() => {});
    throw error;
  }
}

function serviceAuth(context = {}) {
  return context.executionAuth || {
    userId: context.userId,
    organizationId: context.organizationId,
    role: context.role,
    memberships: []
  };
}

function sourceReadAuth(context = {}) {
  return context.executionAuth || context.auth || serviceAuth(context);
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
  // Payload protocols declare extra construction inputs on the payload
  // traits; operator modes declare theirs on the operator signature.
  const modeFields = mode === 'upload' || mode === 'capture'
    ? Object.keys(declaration?.payload?.inputs || {})
    : Object.keys(operator?.input?.fields || {});
  for (const field of modeFields) {
    if (draftData[field] === undefined && draft?.[field] !== undefined) {
      draftData[field] = draft[field];
    }
  }

  // Ref inputs resolve to values: the referenced instance, its identity,
  // and — when it carries one — the payload document as base64. A list
  // of refs resolves item by item under the same rules. Cross-org
  // references refuse, exactly like the in-process handlers did. Every
  // resolved ref of a revision-scoped type also resolves its pin (SPEC
  // §24): the current revision for a fresh read, the pinned revision's
  // frozen bytes for a stored pin.
  const refs = {};
  const pins = {};
  const declaredRefFields = [];
  for (const [field, fieldDef] of Object.entries(declaration?.fields || {})) {
    if (isRefDescriptor(fieldDef)) declaredRefFields.push(field);
  }
  for (const [field, fieldDef] of Object.entries(operator?.input?.fields || {})) {
    if (fieldDef?.base === 'ref') {
      const input = refInputOf(draftData[field]);
      if (input) {
        const resolved = await resolveRefValue(instanceServiceResolver, declarationForType, input, refAcceptsOf(fieldDef), field, organizationId, sourceReadAuth(context));
        refs[field] = resolved.value;
        if (resolved.pin) pins[field] = resolved.pin;
      }
      continue;
    }
    if (fieldDef?.base === 'list' && fieldDef?.itemType?.base === 'ref') {
      const raw = draftData[field];
      const inputs = (Array.isArray(raw) ? raw : [raw])
        .map(refInputOf)
        .filter(Boolean);
      if (inputs.length) {
        refs[field] = [];
        pins[field] = [];
        for (const input of inputs) {
          const resolved = await resolveRefValue(instanceServiceResolver, declarationForType, input, refAcceptsOf(fieldDef), field, organizationId, sourceReadAuth(context));
          refs[field].push(resolved.value);
          if (resolved.pin) pins[field].push(resolved.pin);
        }
        if (!pins[field].length) delete pins[field];
      }
    }
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
    pins,
    declaredRefFields,
    ...(payloadBase64 ? { payloadBase64, payloadMeta } : {})
  };
}

// A ref input travels as a bare id (the dialog's scalarized picker value,
// the graph's wired id) or as the stored ref shape `{ type, id,
// revision? }` — a re-derive reads its stored pins (SPEC §24). A spot
// assignment (`spot-parts` control pin) rides beside the id: the explicit
// anchor pairing reaches the executor.
function refInputOf(value) {
  if (value == null) return null;
  if (typeof value === 'string') return String(value).trim() ? { id: String(value).trim() } : null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    const id = String(value.id ?? value._id ?? '').trim();
    if (!id) return null;
    const input = {};
    const revision = value.revision == null ? null : String(value.revision);
    if (revision) input.revision = revision;
    if (value.spot != null) input.spot = String(value.spot);
    return { id, ...input };
  }
  return null;
}

async function resolveRefValue(instanceServiceResolver, declarationForType, input, accepted, field, organizationId, auth = {}) {
  let instance = null;
  for (const acceptedType of accepted) {
    const service = instanceServiceResolver(acceptedType);
    if (typeof service?.processGetById !== 'function') {
      throw createError({ statusCode: 500, message: `Entity service cannot authorize construction input ${acceptedType}` });
    }
    try {
      instance = await service.processGetById(input.id, auth);
    } catch (error) {
      // A missing candidate lets the declared union try its next type;
      // permission failures must not be disguised as a missing reference.
      if (error?.statusCode !== 404) throw error;
    }
    if (instance) break;
  }
  if (!instance) {
    throw createError({ statusCode: 400, message: `Construction input ${field} references ${input.id}, which none of [${accepted.join(', ')}] serves` });
  }
  const tenancy = instance.organizationId ?? instance.lineage?.organizationId;
  const instanceOrg = tenancy != null ? String(tenancy) : null;
  if (instanceOrg && instanceOrg !== String(organizationId)) {
    throw createError({ statusCode: 400, message: `Construction input ${field} references an instance of another organization` });
  }

  // The version-fabric seam (SPEC §24): resolution stamps the revision
  // beside the ref. A stored pin reads the frozen bytes; a fresh read
  // resolves the source's current revision when its type declares a
  // scope.
  const typeId = instance.type || accepted[0];
  const declaration = await declarationForType(typeId, organizationId);
  const scope = declaration?.revisions || null;
  let revisionId = input.revision || null;
  if (!revisionId && scope) {
    const { getCurrentForEntity } = await import('../instance-revisions/service.js');
    const current = await getCurrentForEntity(typeId, instance._id ?? input.id, scope).catch(() => null);
    revisionId = current?._id ? String(current._id) : null;
  }
  if (input.revision) {
    if (!scope) {
      throw createError({ statusCode: 400, message: `Construction input ${field} pins a revision for a type without a revision scope` });
    }
    const { getById } = await import('../instance-revisions/service.js');
    const revision = await getById(input.revision, auth?.userId, auth?.role ?? null, auth || null);
    const source = revision?.data?.source || {};
    if (String(source.type || '') !== String(typeId)
      || String(source.id || '') !== String(instance._id ?? input.id)
      || String(revision?.data?.scope || '') !== String(scope)) {
      throw createError({ statusCode: 400, message: `Pinned revision ${input.revision} does not belong to construction input ${field}` });
    }
  }
  const value = await referencedValue(instance, input.revision || null);
  if (revisionId) value.revision = revisionId;
  if (input.spot != null) value.spot = input.spot;
  // The stored ref shape: `{ type, id }` with the revision when the
  // source type scopes one — a revisionless reference still stores.
  // A plain reference is not a revision pin. Only revision-scoped
  // source types participate in the version fabric; otherwise no pin
  // record is written to the constructed entity's provenance.
  const pin = scope
    ? { type: typeId, id: String(instance._id ?? input.id), ...(revisionId ? { revision: revisionId } : {}) }
    : null;
  return { value, pin };
}

async function referencedValue(instance, pinnedRevisionId) {
  const value = {
    id: String(instance._id),
    name: instance.identity?.name || instance.name || null,
    fields: instance.data || instance.fields || {}
  };
  if (pinnedRevisionId) {
    const { pinnedRevisionFile } = await import('../instance-revisions/service.js');
    const pinned = await pinnedRevisionFile(pinnedRevisionId);
    if (!pinned) {
      throw createError({ statusCode: 400, message: `Pinned revision ${pinnedRevisionId} no longer exists` });
    }
    const buffer = await filesService.getFileBuffer(pinned.fileId, pinned.bucket);
    value.payloadBase64 = Buffer.from(buffer).toString('base64');
    value.payloadMime = pinned.mime;
    return value;
  }
  const payloadRef = instance.attachments?.primary || instance.payload || null;
  const fileId = payloadRef?.fileId || payloadRef?.id || null;
  if (fileId) {
    const buffer = await filesService.getFileBuffer(fileId, 'files');
    value.payloadBase64 = Buffer.from(buffer).toString('base64');
    value.payloadMime = payloadRef.mime || null;
  }
  return value;
}

// The stored-inputs draft for a construct re-run (SPEC §24, owner
// decision 2026-10-27): each operator input reads back from the record —
// a declared ref field carries its pin; an input the type does not
// declare reads its authored value from provenance's replay-safety
// parameters, with the ref pin recovered from the causal sources.
export function storedConstructionDraft(record = {}, declaration = null, mode = '') {
  const operator = Object.values(declaration?.operators || {})
    .find(candidate => candidate?.species === 'construct' && candidate.id === mode) || null;
  if (!operator) return null;
  const fields = record.fields || {};
  const effective = record.provenance?.effective?.parameters || {};
  const pinnedSource = (type, id) => {
    const source = (record.provenance?.sources || [])
      .find(entry => entry.type === type && String(entry.id) === String(id));
    return source?.revision || null;
  };
  const data = {};
  for (const [field, fieldDef] of Object.entries(operator.input?.fields || {})) {
    const isRef = fieldDef?.base === 'ref';
    const isRefList = fieldDef?.base === 'list' && fieldDef?.itemType?.base === 'ref';
    const stored = isRef || isRefList ? record.relations?.[field] : fields[field];
    if (isRef && stored && typeof stored === 'object' && stored.id != null) {
      data[field] = stored;
      continue;
    }
    const authored = effective[field] ?? undefined;
    if (authored === undefined) continue;
    if (isRef && typeof authored === 'string') {
      const accepts = refAcceptsOf(fieldDef);
      const revision = pinnedSource(accepts[0], authored);
      data[field] = revision ? { type: accepts[0], id: authored, revision } : authored;
      continue;
    }
    if (isRefList && Array.isArray(authored)) {
      const accepts = refAcceptsOf(fieldDef);
      data[field] = authored.map(id => (
        typeof id === 'object' && id?.id != null ? id
          : (() => {
            const revision = pinnedSource(accepts[0], String(id));
            return revision ? { type: accepts[0], id: String(id), revision } : String(id);
          })()
      ));
      continue;
    }
    data[field] = authored;
  }
  return {
    name: record.name ?? null,
    fields: { ...fields },
    lineage: { ...(record.lineage || {}) },
    ...(record.provenance ? { provenance: record.provenance } : {}),
    data
  };
}
