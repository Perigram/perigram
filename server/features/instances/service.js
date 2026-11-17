// Generic instance services (SPEC §13, the second half): one service serves
// every type that has no hand-registered feature service — pack-mounted
// types and org-authored types. Storage is per-class collections
// (files/items/groups/processes) with the type id as discriminator
// (`repository.js`); documents carry the §3 stored shape and the wire DTO
// IS that document (owner decision 2026-10-11: ids JSON-safe, no
// synthesized blocks, no slot split, no assumed fields).
//
// The service resolves the type's declaration per call: framework and pack
// types from static declarations, org types from `cts_types` (cached).
import { createError } from 'h3';
import { withMongoSnapshotTransaction } from '~/server/db/transactions.js';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { frameworkTypes, CLASS_COLLECTIONS, lineageKeyForParent, mimeMatches, validateConstraints, evaluateAsync, MAX_COLLECTION_ITEMS, MAX_STEPS } from '#packages/cts';
import * as typeStore from '../cts-types/repository.js';
import * as pluginInstalls from '../plugins/repository.js';
import * as repository from './repository.js';
import { listQueryFilter } from './filters.js';
import * as filesService from '../files/service.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import * as entityEventService from '../instance-events/service.js';
import { getOrganizationChangeSequence, recordOrganizationChange, runOrganizationChange, withOrganizationChangeSequence } from './organization-sequence.js';
export { getOrganizationChangeSequence, recordOrganizationChange, runOrganizationChange, withOrganizationChangeSequence };
import { hasInstanceAccess } from '../../core/access/service.js';
import { appendFieldChangeEvent, appendPayloadRevisionEvent, buildEventActor } from '../../core/machines/service.js';
import { resolveActiveWorkflow } from '../workflow-overrides/service.js';
import { serviceAwareConstructionHandlers, applyConstructionService, storedConstructionDraft } from './construction-services.js';

// The composed system view (framework + mounted packs in dependency
// order): every pack type is executable through the generic instance
// service. Pack membership drives per-org enablement filtering (SPEC
// §Plugin marketplace): orgs hold disablement records against packs.
const staticTypes = new Map(frameworkTypes.map(type => [type.id, type]));
const declarationCache = new Map();
// Declared lineage keys per child type (SPEC §6), derived from the same
// view the indexes derive from: the storage keys parents' children edges
// name on the child. Static pack declarations compose the system half
// once; org declarations resolve per organization beside the declaration
// cache and invalidate with it on registry writes.
let staticLineageKeys = null;
const lineageKeysCache = new Map();
// Declared relation edges per target type (SPEC §6: explicit
// edges.relations entries and ref fields alike — a ref row is a declared
// relation), derived over the same view as the lineage keys and
// invalidated with it.
let staticRelationEdges = null;
const relationEdgesCache = new Map();

// The attributed change list for the field-change audit event: which
// patched leaves actually differ from the current DTO. Values compare by
// JSON identity — patch leaves are plain wire data.
function boundedInteger(value, fallback, minimum, maximum, label) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw createError({ statusCode: 400, message: `Query ${label} must be an integer between ${minimum} and ${maximum}` });
  }
  return parsed;
}

function instanceSortOf(sortBy, sortDirection, declaration, lineageKeys) {
  const requested = String(sortBy || 'createdAt');
  const direction = sortDirection == null || sortDirection === '' || sortDirection === 'desc'
    ? -1
    : sortDirection === 'asc' ? 1 : null;
  if (direction == null) {
    throw createError({ statusCode: 400, message: 'Query sortDirection must be asc or desc' });
  }
  const allowed = new Set(['_id', 'name', 'state', 'createdAt', 'updatedAt']);
  for (const fieldId of Object.keys(declaration.fields || {})) allowed.add(`fields.${fieldId}`);
  for (const key of lineageKeys || []) allowed.add(`lineage.${key}`);
  const path = requested.startsWith('fields.') || requested.startsWith('lineage.')
    ? requested
    : Object.hasOwn(declaration.fields || {}, requested) ? `fields.${requested}` : requested;
  if (!allowed.has(path)) {
    throw createError({ statusCode: 400, message: `Query sort field ${requested} is not declared for ${declaration.id}` });
  }
  return { [path]: direction, _id: direction };
}

function fieldChangesFromPatch(patch = {}, current = {}) {
  const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const changes = [];
  if (patch.name !== undefined && !sameValue(patch.name, current.name)) {
    changes.push({ field: 'name', from: current.name ?? null, to: patch.name });
  }
  for (const [key, value] of Object.entries(patch.fields || {})) {
    if (value === undefined) continue;
    const before = current.fields?.[key] ?? null;
    if (!sameValue(value, before)) changes.push({ field: key, from: before, to: value });
  }
  return changes;
}

// Per-state field policy (CTS SPEC §7 `fieldPolicy`, §10): the current
// state's `editable` whitelist gates row-field writes at this boundary.
// The workflow resolves through the same seam the status runtime uses; a
// vocabulary without authored facets writes unrestricted, and the current
// document is read only when some state carries a facet.
async function assertStateEditableFields(typeId, organizationId, collection, id, fieldIds, { session = null } = {}) {
  if (!fieldIds.length || !organizationId) return;
  const workflow = await resolveActiveWorkflow({ typeId, organizationId });
  const states = workflow?.states || {};
  if (!Object.values(states).some(state => state?.fieldPolicy)) return;
  const doc = await repository.findInstance(collection, id, typeId, { session });
  const state = String(doc?.state ?? '');
  if (!state) return;
  const facet = states[state]?.fieldPolicy || states[state.split('.').pop()]?.fieldPolicy;
  if (!facet) return;
  const editable = Array.isArray(facet.editable) ? facet.editable : null;
  const visible = Array.isArray(facet.visible) ? facet.visible : null;
  if (!editable && !visible) return;
  const locked = fieldIds.filter(fieldId =>
    (editable && !editable.includes(fieldId)) || (visible && !visible.includes(fieldId)));
  if (locked.length) {
    throw createError({
      statusCode: 409,
      message: `Fields ${locked.join(', ')} are locked in state ${state}`
    });
  }
}

function declaredLineageKeysOf(declarations = []) {
  const keysByType = new Map();
  for (const parent of declarations) {
    for (const [key, edge] of Object.entries(parent?.edges?.children || {})) {
      const lineageKey = edge?.lineageKey || lineageKeyForParent(parent.id) || key;
      for (const childType of edge?.types || []) {
        if (!keysByType.has(childType)) keysByType.set(childType, new Set());
        keysByType.get(childType).add(lineageKey);
      }
    }
  }
  return keysByType;
}

// Relation edges keyed by target type. The `*` strangler wildcard
// accepts every target, so wildcard ref fields ride beside every
// target's edge set.
function declaredRelationEdgesOf(declarations = []) {
  const edgesByTarget = new Map();
  const wildcardEdges = [];
  const push = (target, entry) => {
    const edges = edgesByTarget.get(target) || [];
    edges.push(entry);
    edgesByTarget.set(target, edges);
  };
  for (const owner of declarations) {
    const seen = new Set();
    for (const [key, declaration] of Object.entries(owner?.edges?.relations || {})) {
      seen.add(key);
      for (const target of declaration?.types || []) push(target, { ownerTypeId: owner.id, key });
    }
    for (const [name, descriptor] of Object.entries(owner?.fields || {})) {
      if (descriptor?.base !== 'ref' || seen.has(name)) continue;
      const accepts = descriptor?.accepts || [];
      if (accepts.includes('*')) wildcardEdges.push({ ownerTypeId: owner.id, key: name });
      for (const target of accepts) if (target !== '*') push(target, { ownerTypeId: owner.id, key: name });
    }
  }
  return { byTarget: edgesByTarget, wildcardEdges };
}

async function overlayDeclarationsFor(organizationId) {
  try {
    return [
      ...staticTypes.values(),
      ...await pluginInstalls.listDeclarationsByOrganization(organizationId),
      ...await typeStore.listByOrganization(organizationId)
    ];
  } catch {
    return [];
  }
}

async function lineageKeysFor(typeId, organizationId = null) {
  staticLineageKeys ||= declaredLineageKeysOf([...staticTypes.values()]);
  if (!organizationId) return staticLineageKeys.get(typeId) || new Set();
  const cacheKey = String(organizationId);
  if (!lineageKeysCache.has(cacheKey)) {
    lineageKeysCache.set(cacheKey, declaredLineageKeysOf(await overlayDeclarationsFor(organizationId)));
  }
  return lineageKeysCache.get(cacheKey).get(typeId) || new Set();
}

async function relationEdgesFor(typeId, organizationId = null) {
  staticRelationEdges ||= declaredRelationEdgesOf([...staticTypes.values()]);
  const edgesFor = (derived) => {
    const typed = derived.byTarget.get(typeId) || [];
    const seen = new Set(typed.map(edge => `${edge.ownerTypeId}:${edge.key}`));
    const wildcards = derived.wildcardEdges.filter(edge => !seen.has(`${edge.ownerTypeId}:${edge.key}`));
    return [...typed, ...wildcards];
  };
  if (!organizationId) return edgesFor(staticRelationEdges);
  const cacheKey = String(organizationId);
  if (!relationEdgesCache.has(cacheKey)) {
    relationEdgesCache.set(cacheKey, declaredRelationEdgesOf(await overlayDeclarationsFor(organizationId)));
  }
  return edgesFor(relationEdgesCache.get(cacheKey));
}

async function declarationFor(typeId, organizationId = null) {
  const cacheKey = organizationId ? `${typeId}@${organizationId}` : typeId;
  if (declarationCache.has(cacheKey)) return declarationCache.get(cacheKey);
  let declaration = null;
  // Organization-authored declarations override framework/pack records
  // with the same id. Resolve the tenant's view first; static fallback is
  // only valid when that organization has no declaration.
  if (organizationId) {
    try {
      declaration = await pluginInstalls.findDeclarationByTypeId(organizationId, typeId);
    } catch {
      declaration = null;
    }
    if (!declaration) {
      try {
        declaration = await typeStore.findByTypeId(organizationId, typeId);
      } catch {
        declaration = null;
      }
    }
  }
  if (!declaration) declaration = staticTypes.get(typeId) || null;
  // Do not memoize a static fallback under a tenant key: a declaration
  // added to that organization later must take precedence on the next
  // resolution, rather than being hidden by the stale fallback.
  if (!organizationId || declaration !== staticTypes.get(typeId)) {
    declarationCache.set(cacheKey, declaration);
  }
  return declaration;
}

export function invalidateInstanceDeclarations(organizationId = null) {
  if (organizationId) {
    for (const key of declarationCache.keys()) {
      if (key.endsWith(`@${organizationId}`)) declarationCache.delete(key);
    }
    lineageKeysCache.delete(String(organizationId));
    relationEdgesCache.delete(String(organizationId));
    return;
  }
  declarationCache.clear();
  lineageKeysCache.clear();
  relationEdgesCache.clear();
}

// The cached declaration accessor for sibling features (the
// workflow-overrides declaration-machine fallback): same tenancy, same
// invalidation. Returns the raw stored/static declaration — callers
// normalize for their own use.
export async function declarationForType(typeId, organizationId = null) {
  return declarationFor(typeId, organizationId);
}

// The synchronous static-only twin: pack/framework declarations without
// organization context. Org-authored declarations live in the async type
// store and cannot resolve here.
export function staticTypeDeclaration(typeId) {
  return staticTypes.get(typeId) || null;
}

// Stored shape (SPEC §3): { _id, type, typeVersion, organizationId, name,
// fields, state, stateChangedAt, lineage, relations, payload, provenance,
// createdAt, updatedAt }. The wire DTO IS this document (owner decision
// 2026-10-11), ids JSON-safe — no synthesized blocks, no slot split, no
// assumed fields. Display names resolve client-side through the §4
// identifier law, never by copying row data into a second wire field.
function toDto(doc) {
  if (!doc) return null;
  return {
    _id: String(doc._id),
    type: doc.type,
    typeVersion: doc.typeVersion,
    revision: Number.isSafeInteger(doc.revision) ? doc.revision : null,
    organizationId: doc.organizationId ?? null,
    name: doc.name ?? null,
    fields: { ...(doc.fields || {}) },
    state: typeof doc.state === 'string' && doc.state ? doc.state : null,
    ...(doc.stateChangedAt ? { stateChangedAt: doc.stateChangedAt } : {}),
    lineage: { ...(doc.lineage || {}) },
    relations: { ...(doc.relations || {}) },
    ...(doc.payload ? { payload: doc.payload } : {}),
    ...(doc.provenance ? { provenance: doc.provenance } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

// Payload reference (SPEC §3/§4): the wire payload slot, validated
// against the type's declared payload traits at construct; mime/size
// checks run on the values the reference carries.
export function payloadFromWire(draft = {}, declaration = {}) {
  const reference = draft.payload || null;
  if (!reference) return null;
  const traits = declaration.payload;
  if (!traits) {
    throw createError({ statusCode: 400, message: `Type ${typeIdOf(declaration)} declares no payload` });
  }
  const fileId = reference.fileId || reference.id;
  if (!fileId) {
    throw createError({ statusCode: 400, message: 'Payload reference requires a fileId' });
  }
  // Trait mime may be the registry-normalized list or the raw pack
  // declaration's single string; the wildcard matcher is shared with the
  // strict acceptance predicate (packages/cts payload.js).
  const acceptedMime = typeof traits.mime === 'string' ? [traits.mime] : [...(traits.mime || [])];
  const mime = reference.mime || reference.mimeType || null;
  if (mime && !acceptedMime.some(accepted => mimeMatches(mime, accepted))) {
    throw createError({ statusCode: 400, message: `Payload mime ${mime} is not accepted by ${typeIdOf(declaration)} (${acceptedMime.join(', ')})` });
  }
  const size = Number.isFinite(reference.size) ? reference.size : null;
  if (size != null && Number.isFinite(traits.maxSize) && size > traits.maxSize) {
    throw createError({ statusCode: 400, message: `Payload size ${size} exceeds the ${traits.maxSize}-byte limit of ${typeIdOf(declaration)}` });
  }
  return {
    fileId: String(fileId),
    ...(mime ? { mime } : {}),
    ...(size != null ? { size } : {}),
    ...(reference.name ? { name: String(reference.name) } : {})
  };
}

// Instance payload blobs live in the `files` GridFS bucket (SPEC §3 Blob
// home); the wire payload reference carries no bucket by design.
const PAYLOAD_BUCKET = 'files';

function typeIdOf(declaration = {}) {
  return declaration.id || '';
}

// Provenance (SPEC §3/§8): the causal record stamped by the construct
// boundary — `{ op, sources: [{ type, id, revision? }], effective }`.
// Stored verbatim; never patched. A source's `revision` is its version
// pin (SPEC §24).
function provenanceFromWire(draft = {}) {
  const provenance = draft.provenance;
  if (!provenance || typeof provenance !== 'object') return null;
  const op = provenance.op == null ? null : String(provenance.op);
  const sources = Array.isArray(provenance.sources)
    ? provenance.sources
      .filter(ref => ref?.id != null)
      .map(ref => ({
        ...(ref.type != null ? { type: String(ref.type) } : {}),
        id: String(ref.id),
        ...(ref.revision != null ? { revision: String(ref.revision) } : {})
      }))
    : [];
  if (!op && !sources.length) return null;
  const effective = provenance.effective && typeof provenance.effective === 'object'
    ? structuredClone(provenance.effective)
    : {};
  return { ...(op ? { op } : {}), sources, effective };
}

// The version-fabric mint (SPEC §24): every payload write on a
// revision-scoped type records an immutable revision — creation, payload
// replacement, and re-derive all pass through this one home. The mint
// stamps the acting principal and, on restore, the restored revision;
// every write past creation also rides the status_events audit trail.
async function recordPayloadRevision(typeId, entity, declaration, payload, userId, reason, { auth = null, restoredFrom = null, session = null } = {}) {
  if (!declaration?.revisions || !payload?.fileId) return;
  const actor = buildEventActor(auth || {}, userId);
  const revision = await instanceRevisionsService.ensureForEntitySnapshot({
    typeId,
    entity,
    scope: declaration.revisions,
    content: { fileId: payload.fileId, mime: payload.mime || null, size: payload.size ?? null, name: payload.name || null },
    snapshot: { payload },
    attachments: {
      primary: {
        fileId: payload.fileId,
        name: payload.name || 'payload',
        metadata: { mimeType: payload.mime || 'application/octet-stream', bucketName: PAYLOAD_BUCKET }
      }
    },
    userId,
    reason,
    actor,
    ...(restoredFrom ? { restoredFrom } : {}),
    session
  });
  if (reason !== 'created') {
    await appendPayloadRevisionEvent(typeId, entity._id ?? entity.id, {
      reason,
      revision: revision ? { id: String(revision._id), number: revision.data?.number ?? null } : null,
      restoredFrom,
      actorId: userId,
      auth: auth || {},
      state: typeof entity.state === 'string' && entity.state ? entity.state : null,
      session
    });
  }
}

// The compiled screen-source filter vocabulary normalizes through the
// canonical instance-filter tree (#shared/instance-filters) and projects
// to Mongo in `filters.js`: a bare DECLARED lineage key scopes the read by
// parent, primaryState(s) by the status window, and _id resolves reference
// lookups. Keys the type never declared are transport noise the service
// ignores — never a Mongo path.

function constraintValue(instance = {}) {
  const fields = instance.fields && typeof instance.fields === 'object' ? instance.fields : {};
  return {
    ...fields,
    _id: instance._id ?? instance.id ?? null,
    type: instance.type ?? null,
    organizationId: instance.organizationId ?? null,
    fields,
    relations: instance.relations || {},
    lineage: instance.lineage || {},
    state: instance.state ?? null
  };
}

async function constraintResolversFor(organizationId, { session = null } = {}) {
  const declarations = await overlayDeclarationsFor(organizationId);
  const domainChecks = new Set();
  const domainBudget = { steps: MAX_STEPS };
  const view = new Map(declarations.map(declaration => [declaration.id, declaration]));

  async function loadTarget(typeId, id) {
    const declaration = view.get(typeId) || await declarationFor(typeId, organizationId);
    if (!declaration?.class) return null;
    const doc = await repository.findInstance(repository.collectionForClass(declaration.class), id, typeId, { session });
    if (!doc) return null;
    const targetOrganizationId = doc.organizationId == null ? null : String(doc.organizationId);
    const sourceOrganizationId = organizationId == null ? null : String(organizationId);
    if (targetOrganizationId !== null && targetOrganizationId !== sourceOrganizationId) return null;
    return constraintValue(toDto(doc));
  }

  async function resolveRelation(owner, key) {
    const declaration = view.get(owner?.type) || await declarationFor(owner?.type, organizationId);
    const field = declaration?.fields?.[key];
    const edge = declaration?.edges?.relations?.[key];
    const accepted = edge?.types || field?.accepts || field?.itemType?.accepts || [];
    const slot = owner?.relations?.[key] ?? owner?.fields?.[key];
    if (slot == null) return [];
    const cardinality = edge?.cardinality || (field?.base === 'list' ? 'many' : 'one');
    if (cardinality === 'many' && !Array.isArray(slot)) {
      throw new Error(`relation ${key} requires a list of references`);
    }
    if (cardinality === 'one' && Array.isArray(slot)) {
      throw new Error(`relation ${key} accepts exactly one reference`);
    }
    const refs = Array.isArray(slot) ? slot : [slot];
    const resolved = [];
    const seen = new Set();
    for (const ref of refs) {
      const id = typeof ref === 'string' ? ref : ref?.id ?? ref?._id;
      const refType = typeof ref === 'object' && ref
        ? String(ref.type || '')
        : '';
      const declaredTypes = accepted.filter(type => type !== '*');
      if (id == null || !accepted.length) {
        throw new Error(`relation ${key} has no resolvable typed reference`);
      }
      if (refType && !accepted.includes('*') && !accepted.includes(refType)) {
        throw new Error(`relation ${key} does not accept target type ${refType}`);
      }
      if (!refType && (accepted.includes('*') || declaredTypes.length !== 1)) {
        throw new Error(`relation ${key} requires an explicit target type`);
      }
      const targetType = refType || declaredTypes[0];
      const identity = `${targetType}:${String(id)}`;
      if (seen.has(identity)) throw new Error(`relation ${key} contains a duplicate reference`);
      seen.add(identity);
      const target = await loadTarget(targetType, String(id));
      if (!target) throw new Error(`relation ${key} target ${String(id)} is missing or outside the organization`);
      const where = edge?.where ?? field?.where ?? field?.itemType?.where;
      if (where != null) {
        const ownerId = String(owner?._id ?? owner?.id ?? '');
        const domainKey = `${owner?.type || ''}:${ownerId}.${key}->${targetType}:${String(id)}`;
        if (domainChecks.has(domainKey)) {
          throw new Error(`relation ${key} target-domain evaluation is recursive`);
        }
        domainChecks.add(domainKey);
        try {
          if (await evaluateAsync(where, { value: target }, domainBudget) !== true) {
            throw new Error(`relation ${key} target ${String(id)} is outside its declared domain`);
          }
        } finally {
          domainChecks.delete(domainKey);
        }
      }
      resolved.push(target);
      if (resolved.length > MAX_COLLECTION_ITEMS) throw new Error('relation collection item limit exceeded');
    }
    return resolved;
  }

  async function resolveChildren(owner) {
    const declaration = view.get(owner?.type) || await declarationFor(owner?.type, organizationId);
    const result = [];
    for (const [key, edge] of Object.entries(declaration?.edges?.children || {})) {
      for (const childType of edge.types || []) {
        const childDeclaration = view.get(childType) || await declarationFor(childType, organizationId);
        if (!childDeclaration?.class) continue;
        const scope = organizationId
          ? { $or: [{ organizationId: toFlexibleId(organizationId) }, { organizationId: null }] }
          : { organizationId: null };
        const docs = await repository.findInstancesByFilter(repository.collectionForClass(childDeclaration.class), {
          type: childType,
          ...scope,
          [`lineage.${key}`]: toFlexibleId(owner._id ?? owner.id)
        }, { session });
        for (const doc of docs) {
          result.push(constraintValue(toDto(doc)));
          if (result.length > MAX_COLLECTION_ITEMS) throw new Error('child collection item limit exceeded');
        }
      }
    }
    return result;
  }

  async function resolveDescendants(owner) {
    const seen = new Set([`${owner?.type}:${String(owner?._id ?? owner?.id)}`]);
    const all = [];
    let frontier = [owner];
    for (let depth = 0; frontier.length && depth < 32; depth += 1) {
      const next = [];
      for (const parent of frontier) {
        for (const child of await resolveChildren(parent)) {
          const key = `${child.type}:${String(child._id)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          all.push(child);
          next.push(child);
          if (all.length > MAX_COLLECTION_ITEMS) throw new Error('descendant collection item limit exceeded');
        }
      }
      frontier = next;
    }
    if (frontier.length) throw new Error('descendant traversal depth limit exceeded');
    return all;
  }

  Object.assign(domainBudget, { resolveRelation, resolveChildren, resolveDescendants });
  return { resolveRelation, resolveChildren, resolveDescendants };
}

async function assertDeclaredRelationSlots(declaration, instance, organizationId, keys = [], { session = null } = {}) {
  if (!keys.length) return;
  const declared = new Set(Object.keys(declaration?.edges?.relations || {}));
  for (const [fieldId, field] of Object.entries(declaration?.fields || {})) {
    if (field?.base === 'ref' || (field?.base === 'list' && field?.itemType?.base === 'ref')) {
      declared.add(fieldId);
    }
  }
  const resolvers = await constraintResolversFor(organizationId, { session });
  for (const key of keys) {
    if (!declared.has(key)) {
      throw createError({ statusCode: 400, message: `Relation ${key} is not declared for ${declaration.id}` });
    }
    try {
      await resolvers.resolveRelation(instance, key);
    } catch (error) {
      throw createError({ statusCode: 400, message: error?.message || `Relation ${key} is invalid` });
    }
  }
}

async function assertDeclaredLineageSlots(typeId, lineage, organizationId, { session = null } = {}) {
  const entries = Object.entries(lineage || {}).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const declarations = organizationId
    ? await overlayDeclarationsFor(organizationId)
    : [...staticTypes.values()];
  const parentTypesByKey = new Map();
  for (const parent of declarations) {
    for (const [edgeKey, edge] of Object.entries(parent?.edges?.children || {})) {
      const lineageKey = edge?.lineageKey || lineageKeyForParent(parent.id) || edgeKey;
      if (!(edge?.types || []).includes(typeId)) continue;
      const parents = parentTypesByKey.get(lineageKey) || new Set();
      parents.add(parent.id);
      parentTypesByKey.set(lineageKey, parents);
    }
  }
  for (const [key, value] of entries) {
    const parentTypes = parentTypesByKey.get(key);
    if (!parentTypes?.size) {
      throw createError({ statusCode: 400, message: `Lineage key ${key} is not declared for child type ${typeId}` });
    }
    if (value == null) continue;
    const id = lineageParentId(value);
    if (id == null) {
      throw createError({ statusCode: 400, message: `Lineage key ${key} requires a parent instance id` });
    }
    let found = false;
    for (const parentType of parentTypes) {
      const parentDeclaration = declarations.find(item => item.id === parentType)
        || await declarationFor(parentType, organizationId);
      if (!parentDeclaration?.class) continue;
      const parent = await repository.findInstance(
        repository.collectionForClass(parentDeclaration.class),
        String(id),
        parentType,
        { session }
      );
      if (!parent) continue;
      const parentOrganizationId = parent.organizationId == null ? null : String(parent.organizationId);
      const childOrganizationId = organizationId == null ? null : String(organizationId);
      if (parentOrganizationId !== null && parentOrganizationId !== childOrganizationId) continue;
      found = true;
      break;
    }
    if (!found) {
      throw createError({ statusCode: 400, message: `Lineage key ${key} parent ${String(id)} is missing or outside the organization` });
    }
  }
}

async function assertPermanentConstraints(declaration, instance, organizationId, { session = null } = {}) {
  if (!declaration?.constraints?.length) return;
  const errors = await validateConstraints(
    declaration,
    instance,
    await constraintResolversFor(organizationId, { session })
  );
  if (errors.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'CTS instance constraints failed',
      data: { errors }
    });
  }
}

async function requireDeclaration(typeId, organizationId) {
  const declaration = await declarationFor(typeId, organizationId);
  if (!declaration) {
    // Reads and constructs of undeclared types fail loudly but cleanly:
    // the type is a missing resource class, not a server fault.
    throw createError({ statusCode: 404, message: `Unknown type ${typeId}: no declaration in the registry view` });
  }
  return declaration;
}

// A type may delegate its write gate to another type through its
// declaration (`access.inherits` — the listing grammar): writes to
// records of the delegating type are authorized by the parent's grant,
// so a type that only exists beside its parent (the facade profile
// library beside cassettes) inherits that parent's rights instead of
// demanding its own grant row (owner direction 2026-10-17). One hop,
// no chains; an unresolvable parent refuses fail-closed.
async function writeGrantTarget(declaration, organizationId) {
  const inherits = declaration?.access?.inherits;
  if (!inherits || inherits === declaration.id) {
    return { typeId: declaration.id, feature: CLASS_COLLECTIONS[declaration.class] || declaration.id };
  }
  try {
    const parent = await requireDeclaration(inherits, organizationId);
    return { typeId: parent.id, feature: CLASS_COLLECTIONS[parent.class] || parent.id };
  } catch {
    return null;
  }
}

export { writeGrantTarget };

// The §3 lineage chain a create stores: every referenced parent
// contributes its own lineage; authored axes win over derived ones
// (canonical law: this feature's README). A parent in another
// organization refuses.
function lineageParentId(value) {
  if (value instanceof ObjectId) return value;
  if (value && typeof value === 'object') return value.id ?? value._id;
  return value;
}

async function lineageWithDerivedChain(draft = {}, organizationId = null, childTypeId = null, { session = null } = {}) {
  const wire = draft.lineage && typeof draft.lineage === 'object' ? draft.lineage : {};
  // The stored lineage is pure tree edges: ref objects (`{ type, id }`)
  // scalarize to ids at this boundary.
  const authored = {};
  for (const [key, value] of Object.entries(wire)) {
    if (key === 'organizationId') continue; // tenancy is stored in its own §3 slot
    authored[key] = lineageParentId(value);
  }
  const declarations = organizationId
    ? await overlayDeclarationsFor(organizationId)
    : [...staticTypes.values()];
  const parentsByKey = new Map();
  for (const parentDeclaration of declarations) {
    for (const [edgeKey, edge] of Object.entries(parentDeclaration?.edges?.children || {})) {
      const lineageKey = edge?.lineageKey || lineageKeyForParent(parentDeclaration.id) || edgeKey;
      if (childTypeId && !(edge?.types || []).includes(childTypeId)) continue;
      const parentTypes = parentsByKey.get(lineageKey) || new Set();
      parentTypes.add(parentDeclaration.id);
      parentsByKey.set(lineageKey, parentTypes);
    }
  }
  const chain = {};
  const directEntries = [];
  const inheritedEntries = [];
  for (const [key, parentRef] of Object.entries(authored)) {
    if (key === 'organizationId' || parentRef == null || parentRef === '') continue;
    if (parentsByKey.has(key)) directEntries.push([key, parentRef]);
    else inheritedEntries.push([key, parentRef]);
  }
  for (const [key, parentRef] of directEntries) {
    const parentTypes = parentsByKey.get(key);
    const parentId = String(parentRef);
    let parent = null;
    for (const parentType of parentTypes) {
      const declaration = declarations.find(item => item.id === parentType)
        || await declarationFor(parentType, organizationId);
      if (!declaration?.class) continue;
      const candidate = await repository.findInstance(
        repository.collectionForClass(declaration.class),
        parentId,
        parentType,
        { session }
      );
      if (!candidate) continue;
      const parentOrganizationId = candidate.organizationId == null ? null : String(candidate.organizationId);
      const childOrganizationId = organizationId == null ? null : String(organizationId);
      if (parentOrganizationId !== null && parentOrganizationId !== childOrganizationId) continue;
      parent = candidate;
      break;
    }
    if (!parent) {
      throw createError({ statusCode: 400, message: `Lineage key ${key} parent ${parentId} is missing or outside the organization` });
    }
    Object.assign(chain, parent.lineage || {});
  }
  for (const [key] of inheritedEntries) {
    if (!Object.hasOwn(chain, key)) {
      throw createError({ statusCode: 400, message: `Lineage key ${key} is not declared for child type ${childTypeId || 'unknown'}` });
    }
  }
  return { ...chain, ...authored };
}

function instanceService(typeId) {
  // Static-declaration construct modes (SPEC §4): payload types offer
  // only their creation protocols, payload-less types offer
  // genericCreate, derived types offer none — the projection is the
  // authoritative mirror. Handlers stay unconditional (generic
  // machinery). Org-authored declarations live in the async type store,
  // so unknown types keep the payload-less literal (genericCreate); the
  // projection governs their executable modes.
  const staticDeclaration = staticTypes.get(typeId);
  const staticCreateModes = (() => {
    if (!staticDeclaration) return ['genericCreate'];
    if (staticDeclaration.derived) return [];
    if (staticDeclaration.payload) {
      // A payload type with construct operators mirrors the view
      // projection: creation protocols plus the operator modes.
      const payloadOperators = Object.values(staticDeclaration.operators || {})
        .filter(operator => operator?.species === 'construct')
        .map(operator => operator.id);
      return [...new Set([]
        .concat(staticDeclaration.payload.creation || ['upload'])
        .map(String)
        .concat(payloadOperators))];
    }
    // A payload-less type whose construction is fully operator-shaped
    // (declared construct operators) mirrors the view projection: the
    // operator modes are the constructible ones, genericCreate is not
    // offered for records that are meaningless unoperated.
    const constructOperators = Object.values(staticDeclaration.operators || {})
      .filter(operator => operator?.species === 'construct');
    if (constructOperators.length) return constructOperators.map(operator => operator.id);
    return ['genericCreate'];
  })();
  // Shared construct body: the §3 document build common to every
  // construction mode. The wire draft IS the stored shape: tenancy
  // travels as `organizationId`, the payload as `payload`, rows as flat
  // `fields`, the rename channel as `name`.
  async function createValidated(draft, declaration, userId, organizationId, { executorFieldIds = [], session = null, expectedOrganizationSequence = null } = {}) {
    const payload = payloadFromWire(draft, declaration);
    const provenance = provenanceFromWire(draft);
    const now = new Date().toISOString();
    const state = typeof draft.state === 'string' && draft.state ? draft.state : null;
    const effectiveOrganizationId = organizationId ?? draft.organizationId ?? null;
    if (draft.fields != null && (typeof draft.fields !== 'object' || Array.isArray(draft.fields))) {
      throw createError({ statusCode: 400, message: 'Instance fields must be an object' });
    }
    if (draft.relations != null && (typeof draft.relations !== 'object' || Array.isArray(draft.relations))) {
      throw createError({ statusCode: 400, message: 'Instance relations must be an object' });
    }
    if (draft.lineage != null && (typeof draft.lineage !== 'object' || Array.isArray(draft.lineage))) {
      throw createError({ statusCode: 400, message: 'Instance lineage must be an object' });
    }
    const trustedExecutorFields = new Set(executorFieldIds);
    const unsafeExecutorFields = executorFieldIds.filter(fieldId =>
      !/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(fieldId)
      || ['__proto__', 'prototype', 'constructor'].includes(fieldId)
    );
    if (unsafeExecutorFields.length) {
      throw createError({ statusCode: 400, message: 'Executor returned unsafe field ids: ' + unsafeExecutorFields.join(', ') });
    }
    const unknownFields = Object.keys(draft.fields || {}).filter(fieldId =>
      !Object.hasOwn(declaration.fields || {}, fieldId) && !trustedExecutorFields.has(fieldId)
    );
    if (unknownFields.length) {
      throw createError({ statusCode: 400, message: 'Fields ' + unknownFields.join(', ') + ' are not declared for ' + typeId });
    }
    const lineage = await lineageWithDerivedChain(draft, effectiveOrganizationId, typeId, { session });
    const doc = {
      _id: new ObjectId(),
      type: typeId,
      typeVersion: declaration.version || 1,
      revision: 1,
      organizationId: effectiveOrganizationId,
      name: draft.name ?? null,
      fields: { ...(draft.fields || {}) },
      state,
      ...(state ? { stateChangedAt: now } : {}),
      lineage,
      ...(draft.relations ? { relations: draft.relations } : {}),
      ...(payload ? { payload } : {}),
      ...(provenance ? { provenance } : {}),
      createdAt: now,
      updatedAt: now
    };
    const relationKeys = new Set(Object.keys(doc.relations || {}));
    for (const [fieldId, field] of Object.entries(declaration.fields || {})) {
      if ((field?.base === 'ref' || (field?.base === 'list' && field?.itemType?.base === 'ref'))
        && Object.hasOwn(doc.fields || {}, fieldId)) relationKeys.add(fieldId);
    }
    await assertDeclaredRelationSlots(declaration, doc, effectiveOrganizationId, [...relationKeys], { session });
    await assertPermanentConstraints(declaration, toDto(doc), effectiveOrganizationId, { session });
    await runOrganizationChange(effectiveOrganizationId, {
      kind: 'instance-created',
      typeId,
      instanceId: String(doc._id),
      paths: ['fields', 'lineage', 'relations', 'payload', 'provenance'],
      actorId: userId
    }, async () => {
      await repository.insertInstance(repository.collectionForClass(declaration.class), doc, { session });
      await recordPayloadRevision(typeId, doc, declaration, payload, userId, 'created', { session });
    }, { session, expectedSequence: expectedOrganizationSequence });
    return toDto(doc);
  }

  return {
    async validateCandidate(candidate, organizationId = null) {
      const effectiveOrganizationId = organizationId ?? candidate?.organizationId ?? null;
      const declaration = await declarationFor(typeId, effectiveOrganizationId);
      if (!declaration?.constraints?.length) return false;
      await assertPermanentConstraints(declaration, toDto(candidate || {}), effectiveOrganizationId);
      return true;
    },

    async getById(id) {
      // Without organization context the class (and therefore the
      // collection) is not statically known: search the per-class
      // collections for the typed document.
      return toDto(await repository.findInstanceAnywhere(id, typeId), await declarationFor(typeId, null) || {});
    },

    async list(filters = {}, userId, organizationId, { session = null } = {}) {
      const declaration = await requireDeclaration(typeId, organizationId);
      const lineageKeys = await lineageKeysFor(typeId, organizationId);
      const reserved = new Set(['limit', 'offset', 'sortBy', 'sortDirection']);
      const queryFilters = Object.fromEntries(Object.entries(filters || {}).filter(([key]) => !reserved.has(key)));
      const limit = boundedInteger(filters?.limit, 200, 1, 1000, 'limit');
      const offset = boundedInteger(filters?.offset, 0, 0, 10000, 'offset');
      const sort = instanceSortOf(filters?.sortBy, filters?.sortDirection, declaration, lineageKeys);
      const filter = listQueryFilter(queryFilters, lineageKeys);
      const docs = await repository.listInstances(
        repository.collectionForClass(declaration.class),
        typeId,
        organizationId,
        limit,
        filter,
        { sort, skip: offset, session }
      );
      return docs.map(doc => toDto(doc));
    },

    async create(draft = {}, userId, organizationId, options = {}) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.organizationId);
      return await createValidated(draft, declaration, userId, organizationId, options);
    },

    // Upload/capture protocol constructs: the payload reference is the
    // protocol's whole point — a missing one is a protocol violation,
    // not a silent blank instance.
    async createWithPayloadProtocol(draft = {}, { userId, organizationId } = {}, protocol = 'upload', options = {}) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.organizationId);
      if (!declaration.payload) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no payload; creation protocol ${protocol} does not apply` });
      }
      const reference = draft.payload || null;
      if (!reference?.fileId && !reference?.id) {
        throw createError({ statusCode: 400, message: `Creation protocol ${protocol} requires a payload file` });
      }
      // The record name derives from the uploaded file's name (extension
      // stripped); an explicit draft name wins.
      const filename = typeof reference?.name === 'string' ? reference.name.replace(/\.[^.]+$/, '') : '';
      const named = draft.name == null && filename ? { ...draft, name: filename } : draft;
      return await createValidated(named, declaration, userId, organizationId, options);
    },

    async processUpdate(id, patch = {}, context = null) {
      // Context carries the acting organization (an auth-shaped object or
      // a bare id): org-authored types resolve their declarations through
      // it, static types ignore it.
      const organizationId = typeof context === 'string' ? context : context?.organizationId || null;
      const session = context && typeof context === 'object' ? context.session || null : null;
      const declaration = await requireDeclaration(typeId, organizationId);
      if (declaration.mutability === 'append-only') throw createError({ statusCode: 409, message: `${typeId} records are append-only` });
      if (patch.fields != null && (typeof patch.fields !== 'object' || Array.isArray(patch.fields))) {
        throw createError({ statusCode: 400, message: 'Instance fields patch must be an object' });
      }
      const unknownFields = Object.keys(patch.fields || {}).filter(fieldId =>
        !Object.hasOwn(declaration.fields || {}, fieldId)
      );
      if (unknownFields.length) {
        throw createError({
          statusCode: 400,
          message: 'Fields ' + unknownFields.join(', ') + ' are not declared for ' + typeId
        });
      }
      if (patch.relations != null && (typeof patch.relations !== 'object' || Array.isArray(patch.relations))) {
        throw createError({ statusCode: 400, message: 'Instance relations patch must be an object' });
      }
      const collection = repository.collectionForClass(declaration.class);
      const relationKeys = new Set(Object.keys(patch.relations || {}));
      for (const [fieldId, field] of Object.entries(declaration.fields || {})) {
        if ((field?.base === 'ref' || (field?.base === 'list' && field?.itemType?.base === 'ref'))
          && Object.hasOwn(patch.fields || {}, fieldId)) relationKeys.add(fieldId);
      }
      if (relationKeys.size) {
        const candidate = {
          type: typeId,
          organizationId,
          fields: patch.fields || {},
          relations: patch.relations || {}
        };
        await assertDeclaredRelationSlots(declaration, candidate, organizationId, [...relationKeys], { session });
      }
      await assertDeclaredLineageSlots(typeId, patch.lineage, organizationId, { session });
      // Wire patches speak the stored shape. Lifecycle is deliberately
      // absent: transitions and initial-state writes belong to the status
      // runtime.
      if (patch.state !== undefined) {
        throw createError({
          statusCode: 400,
          message: `Type ${typeId} lifecycle transitions must run through the status runtime`
        });
      }
      const hasExpectedUpdatedAt = Boolean(context && typeof context === 'object'
        && Object.hasOwn(context, 'expectedUpdatedAt'));
      let expectedUpdatedAt = hasExpectedUpdatedAt ? context.expectedUpdatedAt : undefined;
      const constrained = Boolean(declaration.constraints?.length);
      if (constrained) {
        const currentDoc = await repository.findInstance(collection, id, typeId, { session });
        if (!currentDoc) throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
        expectedUpdatedAt = currentDoc.updatedAt;
        if (context?.expectedRevision != null
          && (currentDoc.revision == null || String(currentDoc.revision) !== String(context.expectedRevision))) {
          throw createError({ statusCode: 409, message: `${typeId} ${id} changed after the graph proposal was evaluated` });
        }
        const current = toDto(currentDoc);
        const candidate = {
          ...current,
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          fields: { ...current.fields, ...(patch.fields || {}) },
          lineage: { ...current.lineage, ...(patch.lineage || {}) },
          relations: { ...current.relations, ...(patch.relations || {}) }
        };
        await assertPermanentConstraints(declaration, candidate, organizationId, { session });
      }
      const patchedFieldIds = Object.keys(patch.fields || {}).filter(key => patch.fields[key] !== undefined);
      await assertStateEditableFields(typeId, organizationId, collection, id, patchedFieldIds, { session });
      const set = {};
      if (patch.name !== undefined) set.name = patch.name;
      if (patch.fields && typeof patch.fields === 'object') {
        for (const [key, leaf] of Object.entries(patch.fields)) {
          if (leaf !== undefined) set[`fields.${key}`] = leaf;
        }
      }
      if (patch.lineage && typeof patch.lineage === 'object') {
        for (const [key, value] of Object.entries(patch.lineage)) {
          // Tenancy is immutable after construct: the wire projection's
          // organizationId key is deliberately not a writable edge.
          if (key === 'organizationId') continue;
          if (value !== undefined) {
            const parentId = lineageParentId(value);
            set[`lineage.${key}`] = parentId;
          }
        }
      }
      // Payload and provenance are construct-time records (SPEC §3): the
      // processUpdate contract deliberately has no patch path for them —
      // payload replacement is a construct/editor concern.
      if (patch.relations && typeof patch.relations === 'object') {
        for (const [key, value] of Object.entries(patch.relations)) {
          if (value !== undefined) set[`relations.${key}`] = value;
        }
      }
      const write = async () => {
        const compareRevision = constrained || hasExpectedUpdatedAt;
        const updated = await repository.updateInstanceFields(
          collection,
          id,
          set,
          { ...(compareRevision ? { expectedUpdatedAt } : {}), ...(session ? { session } : {}) }
        );
        if (compareRevision && !updated) {
          throw createError({ statusCode: 409, message: `${typeId} ${id} changed while its update was being validated` });
        }
        return updated;
      };
      const updated = Object.keys(set).length
        ? await runOrganizationChange(organizationId, {
            kind: 'instance-updated',
            typeId,
            instanceId: String(id),
            paths: Object.keys(set),
            actorId: context?.userId || null
          }, write, { session, expectedSequence: context?.expectedOrganizationSequence ?? null })
        : await write();
      return toDto(updated);
    },

    // HTTP update transport: the same wire patch processUpdate writes,
    // gated through the shared access engine on the class-collection
    // feature (a write requires a compiled grant — fail-closed), exactly
    // like the payload replacement transport.
    async patch(id, patch = {}, { auth = null, organizationId = null, expectedRevision = null, expectedOrganizationSequence = null, session = null } = {}) {
      // Structural edges have dedicated link/unlink boundaries that validate
      // declared edge shape, target scope, and relation domains. The generic
      // field-patch transport must never write them around those checks.
      if (patch.lineage !== undefined || patch.relations !== undefined) {
        throw createError({
          statusCode: 400,
          message: 'Lineage and relations must be changed through their dedicated link/unlink operations'
        });
      }
      const declaration = await requireDeclaration(typeId, organizationId);
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId, { session });
      if (!doc) {
        throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      }
      const current = toDto(doc);
      if (doc.organizationId != null && organizationId != null
        && String(doc.organizationId) !== String(organizationId)) {
        throw createError({ statusCode: 403, message: 'Instance belongs to a different organization' });
      }
      if (expectedRevision != null
        && (current.revision == null || String(current.revision) !== String(expectedRevision))) {
        throw createError({ statusCode: 409, message: `${typeId} ${id} changed after the graph proposal was evaluated` });
      }
      const target = await writeGrantTarget(declaration, organizationId);
      if (!target || !hasInstanceAccess({ entity: current, typeId: target.typeId, feature: target.feature, level: 'write', action: 'update', auth })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      const updated = await this.processUpdate(id, patch, {
        organizationId,
        userId: auth?.userId || null,
        expectedUpdatedAt: doc.updatedAt,
        expectedRevision,
        expectedOrganizationSequence,
        session
      });
      // Field edits drop into the state record (SPEC UI): the audit trail
      // carries who changed which field, from what to what, beside the
      // transition history. Only name and data/specs leaves ride — lineage
      // and relations belong to their own link/unlink surfaces.
      await appendFieldChangeEvent(typeId, id, {
        changes: fieldChangesFromPatch(patch, current),
        actorId: auth?.userId || null,
        auth: auth || {},
        state: typeof current.state === 'string' && current.state ? current.state : null,
        session
      });
      return updated;
    },

    async linkRelationForHttp(id, relationKey, targetRef, {
      auth = null,
      organizationId = null,
      expectedRevision = null,
      expectedOrganizationSequence = null,
      session = null
    } = {}) {
      const key = String(relationKey || '');
      if (!key || !targetRef || typeof targetRef !== 'object'
        || typeof targetRef.type !== 'string' || !targetRef.type.trim()
        || typeof targetRef.id !== 'string' || !targetRef.id.trim()) {
        throw createError({ statusCode: 400, message: 'Relation link requires a declared key and typed target reference' });
      }
      const declaration = await requireDeclaration(typeId, organizationId);
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId, { session });
      if (!doc) throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      if (doc.organizationId != null && organizationId != null
        && String(doc.organizationId) !== String(organizationId)) {
        throw createError({ statusCode: 403, message: 'Relation owner belongs to a different organization' });
      }
      const current = toDto(doc, declaration);
      if (expectedRevision == null || current.revision == null
        || String(current.revision) !== String(expectedRevision)) {
        throw createError({ statusCode: 409, message: `${typeId} ${id} changed after the relation proposal was evaluated` });
      }
      const target = await writeGrantTarget(declaration, organizationId);
      if (!target || !hasInstanceAccess({
        entity: current,
        typeId: target.typeId,
        feature: target.feature,
        level: 'write',
        action: 'update',
        auth
      })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }

      const edge = declaration.edges?.relations?.[key] || null;
      const field = declaration.fields?.[key] || null;
      const fieldRef = field?.base === 'ref';
      const fieldRefList = field?.base === 'list' && field?.itemType?.base === 'ref';
      if (!edge && !fieldRef && !fieldRefList) {
        throw createError({ statusCode: 400, message: `Relation ${key} is not declared for ${typeId}` });
      }
      const relationValue = edge ? current.relations?.[key] : current.fields?.[key];
      const many = edge ? edge.cardinality !== 'one' : fieldRefList;
      const nextRef = { type: String(targetRef.type), id: String(targetRef.id) };
      const acceptedTypes = edge?.types || field?.accepts || field?.itemType?.accepts || [];
      const matchesTarget = value => {
        const valueType = value && typeof value === 'object'
          ? String(value.type || (acceptedTypes.length === 1 ? acceptedTypes[0] : ''))
          : acceptedTypes.length === 1 ? acceptedTypes[0] : '';
        const valueId = typeof value === 'string' ? value : value?.id ?? value?._id;
        return valueType === nextRef.type && String(valueId ?? '') === nextRef.id;
      };
      const existing = relationValue == null ? [] : Array.isArray(relationValue) ? relationValue : [relationValue];
      if (existing.some(matchesTarget)) {
        throw createError({ statusCode: 409, message: 'The relation already contains this target' });
      }
      if (!many && existing.length) {
        throw createError({ statusCode: 409, message: `Relation ${key} already has a target` });
      }
      const nextValue = many ? [...existing, nextRef] : nextRef;
      const patch = edge
        ? { relations: { [key]: nextValue } }
        : { fields: { [key]: nextValue } };
      const candidate = {
        ...current,
        [edge ? 'relations' : 'fields']: {
          ...(edge ? current.relations : current.fields),
          [key]: nextValue
        }
      };
      await assertDeclaredRelationSlots(declaration, candidate, organizationId, [key], { session });
      const updated = await instanceService(typeId).processUpdate(id, patch, {
        organizationId,
        userId: auth?.userId || null,
        expectedUpdatedAt: doc.updatedAt,
        expectedRevision,
        expectedOrganizationSequence,
        session
      });
      if (!edge) {
        await appendFieldChangeEvent(typeId, id, {
          changes: fieldChangesFromPatch(patch, current),
          actorId: auth?.userId || null,
          auth: auth || {},
          state: typeof current.state === 'string' && current.state ? current.state : null,
          session
        });
      }
      return updated;
    },

    async unlinkRelationForHttp(id, relationKey, targetRef, {
      auth = null,
      organizationId = null,
      expectedRevision = null,
      expectedOrganizationSequence = null,
      session = null
    } = {}) {
      const key = String(relationKey || '');
      if (!key || !targetRef || typeof targetRef !== 'object'
        || typeof targetRef.type !== 'string' || !targetRef.type.trim()
        || typeof targetRef.id !== 'string' || !targetRef.id.trim()) {
        throw createError({ statusCode: 400, message: 'Relation unlink requires a declared key and typed target reference' });
      }
      const declaration = await requireDeclaration(typeId, organizationId);
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId, { session });
      if (!doc) throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      if (doc.organizationId != null && organizationId != null
        && String(doc.organizationId) !== String(organizationId)) {
        throw createError({ statusCode: 403, message: 'Relation owner belongs to a different organization' });
      }
      const current = toDto(doc, declaration);
      if (expectedRevision == null || current.revision == null
        || String(current.revision) !== String(expectedRevision)) {
        throw createError({ statusCode: 409, message: `${typeId} ${id} changed after the relation proposal was evaluated` });
      }
      const target = await writeGrantTarget(declaration, organizationId);
      if (!target || !hasInstanceAccess({
        entity: current,
        typeId: target.typeId,
        feature: target.feature,
        level: 'write',
        action: 'update',
        auth
      })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }

      const edge = declaration.edges?.relations?.[key] || null;
      const field = declaration.fields?.[key] || null;
      const fieldRef = field?.base === 'ref';
      const fieldRefList = field?.base === 'list' && field?.itemType?.base === 'ref';
      if (!edge && !fieldRef && !fieldRefList) {
        throw createError({ statusCode: 400, message: `Relation ${key} is not declared for ${typeId}` });
      }
      const relationValue = edge ? current.relations?.[key] : current.fields?.[key];
      const acceptedTypes = edge?.types || field?.accepts || field?.itemType?.accepts || [];
      const existing = relationValue == null ? [] : Array.isArray(relationValue) ? relationValue : [relationValue];
      const matches = value => {
        const valueType = value && typeof value === 'object'
          ? String(value.type || (acceptedTypes.length === 1 ? acceptedTypes[0] : ''))
          : acceptedTypes.length === 1 ? acceptedTypes[0] : '';
        const valueId = typeof value === 'string' ? value : value?.id ?? value?._id;
        return valueType === String(targetRef.type) && String(valueId ?? '') === String(targetRef.id);
      };
      if (!existing.some(matches)) {
        throw createError({ statusCode: 409, message: 'The relation does not contain this target' });
      }
      const many = edge ? edge.cardinality !== 'one' : fieldRefList;
      if (!many && fieldRef && field.nullable !== true) {
        throw createError({ statusCode: 409, message: `Relation field ${key} is not nullable and cannot be unlinked` });
      }
      const nextValue = many ? existing.filter(value => !matches(value)) : null;
      const patch = edge
        ? { relations: { [key]: nextValue } }
        : { fields: { [key]: nextValue } };
      const candidate = {
        ...current,
        [edge ? 'relations' : 'fields']: {
          ...(edge ? current.relations : current.fields),
          [key]: nextValue
        }
      };
      await assertDeclaredRelationSlots(declaration, candidate, organizationId, [key], { session });
      const updated = await instanceService(typeId).processUpdate(id, patch, {
        organizationId,
        userId: auth?.userId || null,
        expectedUpdatedAt: doc.updatedAt,
        expectedRevision,
        expectedOrganizationSequence,
        session
      });
      if (!edge) {
        await appendFieldChangeEvent(typeId, id, {
          changes: fieldChangesFromPatch(patch, current),
          actorId: auth?.userId || null,
          auth: auth || {},
          state: typeof current.state === 'string' && current.state ? current.state : null,
          session
        });
      }
      return updated;
    },

    // HTTP create transport (`POST /api/instances/:type`): the create
    // half of the same wire — the §3 draft createValidated stores (name
    // rename channel, flat fields, lineage edges, payload traits),
    // gated through the shared access engine on the class-collection
    // feature exactly like patch: a write requires a compiled grant,
    // fail-closed. The construct boundary keeps its own `create` with
    // execution auth; this serves the records host capability
    // (contract-2 surfaces composing other types' records).
    async createForHttp(draft = {}, { auth = null, organizationId = null, session = null, expectedOrganizationSequence = null, requireRevisionedPayload = false } = {}) {
      const targetOrganizationId = organizationId || draft?.organizationId || null;
      const declaration = await requireDeclaration(typeId, targetOrganizationId);
      if (requireRevisionedPayload && (!draft.payload || !declaration.payload || !declaration.revisions)) {
        throw createError({ statusCode: 400, message: `Type ${typeId} must declare a revisioned payload for graph Bake` });
      }
      const target = await writeGrantTarget(declaration, targetOrganizationId);
      const scopeEntity = targetOrganizationId ? { lineage: { organizationId: targetOrganizationId } } : null;
      if (!target || !hasInstanceAccess({ entity: scopeEntity, typeId: target.typeId, feature: target.feature, level: 'write', action: 'create', auth })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      return await createValidated(draft, declaration, auth?.userId || null, targetOrganizationId, { session, expectedOrganizationSequence });
    },

    // HTTP remove transport (`DELETE /api/instances/:type/:id`): the
    // record death behind the same write gate the patch transport
    // takes — the loaded entity against the compiled grant.
    async removeForHttp(id, { auth = null, organizationId = null } = {}) {
      const result = await withMongoSnapshotTransaction(async session => {
        const doc = await repository.findInstanceAnywhere(id, typeId, { session });
        if (!doc) {
          throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
        }
        const targetOrganizationId = doc.organizationId ?? organizationId ?? null;
        const declaration = await requireDeclaration(typeId, targetOrganizationId);
        if (declaration.mutability === 'append-only') {
          throw createError({ statusCode: 409, message: `${typeId} records are append-only` });
        }
        const target = await writeGrantTarget(declaration, targetOrganizationId);
        if (!target || !hasInstanceAccess({
          entity: toDto(doc),
          typeId: target.typeId,
          feature: target.feature,
          level: 'write',
          action: 'delete',
          auth
        })) {
          throw createError({ statusCode: 403, message: 'Permission denied' });
        }
        const pendingEvents = [];
        const removed = await this.remove(id, {
          actor: auth?.userId || null,
          organizationId: doc.organizationId ?? null,
          session,
          pendingEvents
        });
        return { removed, pendingEvents };
      });
      for (const event of result.pendingEvents) {
        await entityEventService.publishEntityChanged(event.auth, event.detail);
      }
      return result.removed;
    },

    // The sweep runs before the delete (SPEC §22.12); the doc's own
    // organization scopes the referrer scan, so a system target sweeps
    // every org.
    async remove(id, { actor = null, organizationId = null, session = null, expectedOrganizationSequence = null, pendingEvents = null } = {}) {
      organizationId = organizationId == null ? null : String(organizationId);
      const declaration = await declarationFor(typeId, organizationId);
      if (declaration?.mutability === 'append-only') throw createError({ statusCode: 409, message: `${typeId} records are append-only` });
      const collection = repository.collectionForClass(declaration?.class);
      const doc = await repository.findInstance(collection, id, typeId, { session });
      if (!doc) return false;
      return await runOrganizationChange(doc.organizationId ?? organizationId, {
        kind: 'instance-deleted',
        typeId,
        instanceId: String(id),
        paths: ['instance'],
        actorId: actor
      }, async () => {
        await sweepRelationRefs({ typeId, id: String(doc._id), organizationId: doc.organizationId ?? null }, actor, { session, pendingEvents });
        return await repository.deleteInstance(collection, id, { session });
      }, { session, expectedSequence: expectedOrganizationSequence });
    },

    // Payload replacement — the editor concern SPEC §3 names. Requires a
    // declared payload and revision scope; every save is revisioned so no
    // payload bytes are ever lost to a silent overwrite. Gated by the
    // shared access engine on the class-collection feature (the feature
    // grants compile against) with the type id as type-id filter.
    async replacePayload(id, { buffer, filename, mimeType } = {}, { userId, organizationId, auth, reason = 'payload-replaced', restoredFrom = null, session = null, expectedRevision = null, expectedOrganizationSequence = null, storedFile = null } = {}) {
      const declaration = await requireDeclaration(typeId, organizationId);
      if (!declaration.payload) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no payload` });
      }
      if (!declaration.revisions) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no revision scope; payload replacement requires revisions` });
      }
      if (!buffer?.length) {
        throw createError({ statusCode: 400, message: 'Payload file is required' });
      }
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId, { session });
      if (!doc) {
        throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      }
      const current = toDto(doc);
      if (doc.organizationId != null && organizationId != null
        && String(doc.organizationId) !== String(organizationId)) {
        throw createError({ statusCode: 403, message: 'Payload target belongs to a different organization' });
      }
      if (expectedRevision != null
        && (current.revision == null || String(current.revision) !== String(expectedRevision))) {
        throw createError({ statusCode: 409, message: `${typeId} ${id} changed after the graph proposal was evaluated` });
      }
      const feature = CLASS_COLLECTIONS[declaration.class] || typeId;
      if (!hasInstanceAccess({ entity: current, typeId: typeId, feature, level: 'write', action: 'update', auth: auth || null })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      const ownsStoredFile = !storedFile;
      const stored = storedFile || await filesService.uploadFile(buffer, filename || 'payload', {
        userId,
        organizationId,
        type: typeId
      }, PAYLOAD_BUCKET);
      if (!stored?.id) throw createError({ statusCode: 400, message: 'A stored payload file reference is required' });
      try {
        const updated = await runOrganizationChange(organizationId, {
          kind: 'instance-payload-replaced',
          typeId,
          instanceId: String(id),
          paths: ['payload'],
          actorId: userId
        }, async () => {
          const payload = payloadFromWire({
            payload: {
              fileId: stored.id,
              mime: mimeType || null,
              size: buffer.length,
              name: filename || 'payload'
            }
          }, declaration);
          await recordPayloadRevision(typeId, current, declaration, payload, userId, reason, { auth, restoredFrom, session });
          const changed = await repository.updateInstanceFields(collection, id, {
            payload
          }, { expectedUpdatedAt: doc.updatedAt, session });
          if (!changed) {
            throw createError({ statusCode: 409, message: `${typeId} ${id} changed before its payload was saved` });
          }
          return changed;
        }, { session, expectedSequence: expectedOrganizationSequence });
        return toDto(updated);
      } catch (error) {
        if (ownsStoredFile) await filesService.deleteFile(stored.id, PAYLOAD_BUCKET).catch(() => {});
        throw error;
      }
    },

    // Restore (SPEC §24, owner decision 2026-10-28): a prior revision's
    // frozen bytes re-enter through the payload channel as a new
    // revision. The revision must belong to this record and the type's
    // declared scope; the write gate, trait validation, and the mint are
    // replacePayload's own.
    async restorePayloadRevision(id, revisionId, { userId, organizationId, auth } = {}) {
      const declaration = await requireDeclaration(typeId, organizationId);
      if (!declaration.payload) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no payload` });
      }
      if (!declaration.revisions) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no revision scope; restore requires revisions` });
      }
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId);
      if (!doc) {
        throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      }
      const current = toDto(doc);
      const feature = CLASS_COLLECTIONS[declaration.class] || typeId;
      if (!hasInstanceAccess({ entity: current, typeId: typeId, feature, level: 'write', action: 'update', auth: auth || null })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      const revision = await instanceRevisionsService.getById(revisionId, userId, auth?.role ?? null, auth || null);
      const source = revision?.data?.source || {};
      if (String(source.type || '') !== typeId
        || String(source.id || '') !== String(current._id)
        || revision?.data?.scope !== declaration.revisions) {
        throw createError({ statusCode: 400, message: 'Revision does not belong to this record' });
      }
      const file = await instanceRevisionsService.pinnedRevisionFile(revisionId);
      if (!file?.fileId) {
        throw createError({ statusCode: 400, message: 'Revision carries no frozen payload' });
      }
      const buffer = await filesService.getFileBuffer(file.fileId, file.bucket);
      return await this.replacePayload(id, { buffer, filename: file.name, mimeType: file.mime }, {
        userId,
        organizationId,
        auth,
        reason: 'payload-restored',
        restoredFrom: { id: String(revision._id), number: revision.data?.number ?? null }
      });
    },

    // Re-derive (SPEC §24 version fabric, owner decision 2026-10-27):
    // the compiled construct action's re-run over its stored inputs. The
    // construction service executes against the stored refs' pinned
    // revisions (or current, for follow-latest refs) and the same
    // instance takes the recomputed fields, payload, and provenance.
    // Same write gate as payload replacement.
    async rederive(id, mode, { provenance = null, userId, organizationId, auth } = {}) {
      const declaration = await requireDeclaration(typeId, organizationId);
      if (!organizationId) {
        throw createError({ statusCode: 400, message: `Re-derive of ${typeId} requires an organization context` });
      }
      const { constructionsForOrganization } = await import('../plugins/service.js');
      const bindings = await constructionsForOrganization(organizationId).catch(() => ({}));
      if (!bindings[typeId]?.[mode]) {
        throw createError({ statusCode: 400, message: `Type ${typeId} has no ${mode} construction service to re-run` });
      }
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId);
      if (!doc) {
        throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      }
      const current = toDto(doc);
      const feature = CLASS_COLLECTIONS[declaration.class] || typeId;
      if (!hasInstanceAccess({ entity: current, typeId: typeId, feature, level: 'write', action: 'update', auth: auth || null })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      const stored = storedConstructionDraft(current, declaration, mode);
      if (!stored) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no ${mode} construct to re-run` });
      }
      const merged = await applyConstructionService(typeId, mode, stored, { userId, organizationId, auth });
      await assertPermanentConstraints(declaration, {
        ...current,
        fields: merged.fields || current.fields
      }, organizationId);
      const nextProvenance = { ...(merged.provenance || current.provenance || {}) };
      if (provenance?.op) nextProvenance.op = provenance.op;
      let revisionError = null;
      const updated = await runOrganizationChange(organizationId, {
        kind: 'instance-rederived',
        typeId,
        instanceId: String(id),
        paths: ['fields', ...(merged.payload ? ['payload'] : []), 'provenance'],
        actorId: userId || null
      }, async () => {
        const changed = await repository.updateInstanceFields(collection, id, {
          fields: merged.fields || current.fields,
          ...(merged.payload ? { payload: merged.payload } : {}),
          provenance: nextProvenance,
          updatedAt: new Date().toISOString()
        }, { expectedUpdatedAt: doc.updatedAt });
        if (!changed) {
          throw createError({ statusCode: 409, message: `${typeId} ${id} changed before its re-derive was saved` });
        }
        if (merged.payload) {
          try {
            await recordPayloadRevision(typeId, current, declaration, merged.payload, userId, 'rederived', { auth });
          } catch (error) {
            revisionError = error;
          }
        }
        return changed;
      });
      if (revisionError) throw revisionError;
      return toDto(updated);
    },

    // -- process bindings --
    processList: async (filters, auth = {}, { session = null } = {}) => {
      // Process graph queries are an entity-read surface too: tenant
      // filtering in the repository is necessary but does not replace the
      // compiled feature grant applied by the HTTP list transport.
      const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId || null;
      const declaration = await requireDeclaration(typeId, organizationId);
      const target = await writeGrantTarget(declaration, organizationId);
      if (!target) throw createError({ statusCode: 403, message: 'Permission denied' });
      const items = await instanceService(typeId).list(filters, auth.userId, organizationId, { session });
      return (items || []).filter(item => hasInstanceAccess({
        entity: item?.toJSON ? item.toJSON() : item,
        typeId: target.typeId,
        feature: target.feature,
        level: 'read',
        action: 'view',
        auth
      }));
    },
    processGetById: async (id, auth = {}, { session = null } = {}) => {
      const doc = session
        ? await repository.findInstanceAnywhere(id, typeId, { session })
        : await repository.findInstanceAnywhere(id, typeId);
      if (!doc) return null;
      const organizationId = doc.organizationId ?? auth.organizationId ?? null;
      const declaration = await declarationFor(typeId, organizationId);
      if (!declaration) return null;
      const target = await writeGrantTarget(declaration, organizationId);
      const entity = toDto(doc, declaration);
      if (!target || !hasInstanceAccess({
        entity,
        typeId: target.typeId,
        feature: target.feature,
        level: 'read',
        action: 'view',
        auth
      })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      return entity;
    },
    processDelete: (id, auth) => instanceService(typeId).removeForHttp(id, {
      auth,
      organizationId: auth?.organizationId || null
    }),
    processCapabilities: {
      create: staticCreateModes.length > 0,
      createModes: staticCreateModes,
      processUpdate: staticDeclaration?.mutability !== 'append-only',
      delete: staticDeclaration?.mutability !== 'append-only',
      archive: false
    },
    constructionHandlers: serviceAwareConstructionHandlers(typeId, {
      genericCreate: async (draft, context = {}) => {
        // Types that declare construction modes (payload creation
        // protocols or construct operators) never offer a bare generic
        // create — a record without its constructed geometry is
        // meaningless. The upload default belongs to PAYLOAD declarations
        // (SPEC §4 creation protocols): a type without a payload offers
        // no creation protocol, so generic create is exactly its mode.
        const declaration = await declarationFor(typeId, context.organizationId || null);
        const declaredModes = [
          ...Object.values(declaration?.operators || {})
            .filter(operator => operator?.species === 'construct')
            .map(operator => operator.id),
          ...(declaration?.payload ? (declaration.payload.creation || ['upload']).map(String) : [])
        ];
        const hasProtocols = Boolean(declaration?.payload) || declaredModes.length > 0;
        if (hasProtocols && !(declaredModes.includes('genericCreate'))) {
          throw createError({
            statusCode: 400,
            message: `${typeId} declares construction modes [${declaredModes.join(', ')}] — genericCreate is not offered for it`
          });
        }
        return await instanceService(typeId).create(draft, context.userId, context.organizationId);
      },
      // Payload creation protocols (SPEC §4): upload/capture require the
      // payload reference the dialog uploaded (trait-validated by the
      // construct path); editor constructs a blank instance whose first
      // editor save fills the payload. Types whose installed plugin binds
      // a construction service for the mode run the executor first and
      // merge its computed fields into the created record.
      upload: async (draft, context = {}) => instanceService(typeId).createWithPayloadProtocol(
        await applyConstructionService(typeId, 'upload', draft, context), context, 'upload'
      ),
      capture: async (draft, context = {}) => instanceService(typeId).createWithPayloadProtocol(
        await applyConstructionService(typeId, 'capture', draft, context), context, 'capture'
      ),
      editor: (draft, context = {}) => instanceService(typeId).create(
        draft, context.userId, context.organizationId
      ),
      // The content protocol (SPEC §4, owner decision 2026-10-13): the
      // wired or prompted text is the payload — stored as a blob and
      // validated through the same trait checks every payload reference
      // takes at construct.
      content: async (draft = {}, context = {}) => {
        const declaration = await requireDeclaration(typeId, context.organizationId || draft?.organizationId);
        if (!declaration.payload) {
          throw createError({ statusCode: 400, message: `Type ${typeId} declares no payload; creation protocol content does not apply` });
        }
        const text = draft.content;
        if (typeof text !== 'string' || !text.trim()) {
          throw createError({ statusCode: 400, message: `Creation protocol content requires a text body` });
        }
        const buffer = Buffer.from(text, 'utf8');
        const [mime] = [].concat(declaration.payload.mime || []);
        const extension = [].concat(declaration.payload.accept || []).find(entry => String(entry).startsWith('.')) || '';
        const filename = `${draft.name || 'document'}${extension}`;
        const stored = await filesService.uploadFile(buffer, filename, {
          userId: context.userId,
          organizationId: context.organizationId,
          type: typeId
        }, PAYLOAD_BUCKET);
        try {
          return await createValidated({
            ...draft,
            payload: { fileId: stored.id, ...(mime ? { mime } : {}), size: buffer.length, name: filename }
          }, declaration, context.userId, context.organizationId);
        } catch (error) {
          await filesService.deleteFile(stored.id, PAYLOAD_BUCKET).catch(() => {});
          throw error;
        }
      }
    })
  };
}

// Relation-ref sweep (SPEC §22.12: deleting a referenced instance
// removes every ref pointing at it). Both stored id forms match: the
// query carries the string and ObjectId shapes, the row comparison
// stringifies.
function refPointsAt(value, deletedId, deletedTypeId) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (value.type && deletedTypeId && value.type !== deletedTypeId) return false;
    return String(value.id) === deletedId;
  }
  return String(value) === deletedId;
}

function sweptRefSlot(value, deletedId, deletedTypeId) {
  if (Array.isArray(value)) {
    const next = value.filter(item => !refPointsAt(item, deletedId, deletedTypeId));
    return next.length === value.length ? value : next;
  }
  return refPointsAt(value, deletedId, deletedTypeId) ? null : value;
}

async function sweepRelationRefs({ typeId, id, organizationId }, actor = null, { session = null, pendingEvents = null } = {}) {
  const edges = await relationEdgesFor(typeId, organizationId);
  if (!edges.length) return;
  const deletedId = String(id);
  const idForms = [deletedId];
  const flexible = toFlexibleId(deletedId);
  if (String(flexible) !== deletedId) idForms.push(flexible);
  for (const { ownerTypeId, key } of edges) {
    const ownerDeclaration = await declarationFor(ownerTypeId, organizationId);
    const collection = repository.collectionForClass(ownerDeclaration?.class);
    if (!collection) continue;
    const filter = {
      type: ownerTypeId,
      $or: [
        { [`relations.${key}.id`]: { $in: idForms } },
        { [`relations.${key}`]: { $in: idForms } },
        { [`fields.${key}`]: { $in: idForms } }
      ],
      // An org-scoped target is referenced from its own org alone; a
      // system target (organizationId null) is referenced from any org.
      ...(organizationId ? { organizationId: toFlexibleId(organizationId) } : {})
    };
    for (const referrer of await repository.findInstancesByFilter(collection, filter, { session })) {
      const set = {};
      if (referrer.relations && referrer.relations[key] !== undefined) {
        const next = sweptRefSlot(referrer.relations[key], deletedId, typeId);
        if (next !== referrer.relations[key]) set[`relations.${key}`] = next;
      }
      if (referrer.fields && referrer.fields[key] !== undefined) {
        const next = sweptRefSlot(referrer.fields[key], deletedId, typeId);
        if (next !== referrer.fields[key]) set[`fields.${key}`] = next;
      }
      if (!Object.keys(set).length) continue;
      await repository.updateInstanceFields(collection, referrer._id, set, { session });
      const event = {
        auth: { userId: actor || 'SYSTEM', organizationId: referrer.organizationId ?? organizationId },
        detail: { type: ownerTypeId, id: String(referrer._id), change: 'updated', reason: 'ref-sweep' }
      };
      if (Array.isArray(pendingEvents)) pendingEvents.push(event);
      else await entityEventService.publishEntityChanged(event.auth, event.detail);
    }
  }
}

const boundServices = new Map();

// The registry resolver (SPEC §13): every non-framework type resolves to
// its generic instance service. Unknown types resolve too — the per-call
// declaration check fails loudly if the type truly does not exist.
export function instanceServiceResolver(type) {
  if (!type) return null;
  if (frameworkServiceTypes.has(type)) return null; // framework keeps explicit services
  if (!boundServices.has(type)) boundServices.set(type, instanceService(type));
  return boundServices.get(type);
}

// Types served by explicit framework feature services; the resolver never
// shadows them.
const frameworkServiceTypes = new Set(['organization', 'user', 'process_definition', 'entity_revision']);
