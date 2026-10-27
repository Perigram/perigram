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
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { frameworkTypes, CLASS_COLLECTIONS, lineageKeyForParent, normalizeType, mimeMatches } from '~/packages/cts/src/index.js';
import * as typeStore from '../cts-types/repository.js';
import * as pluginInstalls from '../plugins/repository.js';
import * as repository from './repository.js';
import { listQueryFilter } from './filters.js';
import * as filesService from '../files/service.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import { hasInstanceAccess } from '../../core/access/service.js';
import { appendFieldChangeEvent } from '../../core/machines/service.js';
import { resolveActiveWorkflow } from '../workflow-overrides/service.js';
import { serviceAwareConstructionHandlers, applyConstructionService } from './construction-services.js';

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

// The attributed change list for the field-change audit event: which
// patched leaves actually differ from the current DTO. Values compare by
// JSON identity — patch leaves are plain wire data.
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
async function assertStateEditableFields(typeId, organizationId, collection, id, fieldIds) {
  if (!fieldIds.length || !organizationId) return;
  let workflow = null;
  try {
    workflow = await resolveActiveWorkflow({ typeId, organizationId });
  } catch {
    return;
  }
  const states = workflow?.states || {};
  if (!Object.values(states).some(state => state?.fieldPolicy)) return;
  const doc = await repository.findInstance(collection, id, typeId);
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

async function lineageKeysFor(typeId, organizationId = null) {
  staticLineageKeys ||= declaredLineageKeysOf([...staticTypes.values()]);
  if (!organizationId) return staticLineageKeys.get(typeId) || new Set();
  const cacheKey = String(organizationId);
  if (!lineageKeysCache.has(cacheKey)) {
    let overlayDeclarations = [];
    try {
      overlayDeclarations = [
        ...staticTypes.values(),
        ...await pluginInstalls.listDeclarationsByOrganization(organizationId),
        ...await typeStore.listByOrganization(organizationId)
      ];
    } catch {
      overlayDeclarations = [];
    }
    lineageKeysCache.set(cacheKey, declaredLineageKeysOf(overlayDeclarations));
  }
  return lineageKeysCache.get(cacheKey).get(typeId) || new Set();
}

async function declarationFor(typeId, organizationId = null) {
  const cacheKey = organizationId ? `${typeId}@${organizationId}` : typeId;
  if (declarationCache.has(cacheKey)) return declarationCache.get(cacheKey);
  let declaration = staticTypes.get(typeId) || null;
  if (!declaration && organizationId) {
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
  declarationCache.set(cacheKey, declaration);
  return declaration;
}

export function invalidateInstanceDeclarations(organizationId = null) {
  if (organizationId) {
    for (const key of declarationCache.keys()) {
      if (key.endsWith(`@${organizationId}`)) declarationCache.delete(key);
    }
    lineageKeysCache.delete(String(organizationId));
    return;
  }
  declarationCache.clear();
  lineageKeysCache.clear();
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
// boundary — `{ op, sources: [{ type, id }], effective }`. Stored
// verbatim; never patched.
function provenanceFromWire(draft = {}) {
  const provenance = draft.provenance;
  if (!provenance || typeof provenance !== 'object') return null;
  const op = provenance.op == null ? null : String(provenance.op);
  const sources = Array.isArray(provenance.sources)
    ? provenance.sources
      .filter(ref => ref?.id != null)
      .map(ref => ({ ...(ref.type != null ? { type: String(ref.type) } : {}), id: String(ref.id) }))
    : [];
  if (!op && !sources.length) return null;
  const effective = provenance.effective && typeof provenance.effective === 'object'
    ? structuredClone(provenance.effective)
    : {};
  return { ...(op ? { op } : {}), sources, effective };
}

// The compiled screen-source filter vocabulary normalizes through the
// canonical instance-filter tree (#shared/instance-filters) and projects
// to Mongo in `filters.js`: a bare DECLARED lineage key scopes the read by
// parent, primaryState(s) by the status window, and _id resolves reference
// lookups. Keys the type never declared are transport noise the service
// ignores — never a Mongo path.

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
async function lineageWithDerivedChain(draft = {}, organizationId = null) {
  const wire = draft.lineage && typeof draft.lineage === 'object' ? draft.lineage : {};
  // The stored lineage is pure tree edges: ref objects (`{ type, id }`)
  // scalarize to ids at this boundary.
  const authored = {};
  for (const [key, value] of Object.entries(wire)) {
    authored[key] = value && typeof value === 'object' ? value.id : value;
  }
  const chain = {};
  for (const [key, parentRef] of Object.entries(authored)) {
    if (key === 'organizationId' || parentRef == null || parentRef === '') continue;
    const parentId = String(parentRef);
    const parent = await repository.findInstanceAnywhere(parentId, null);
    if (!parent) continue;
    if (parent.organizationId && organizationId && String(parent.organizationId) !== String(organizationId)) {
      throw createError({ statusCode: 400, message: `Lineage parent ${parentId} belongs to another organization` });
    }
    Object.assign(chain, parent.lineage || {});
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
  async function createValidated(draft, declaration, userId, organizationId) {
    const payload = payloadFromWire(draft, declaration);
    const provenance = provenanceFromWire(draft);
    const now = new Date().toISOString();
    const state = typeof draft.state === 'string' && draft.state ? draft.state : null;
    const lineage = await lineageWithDerivedChain(draft, organizationId);
    const doc = {
      _id: new ObjectId(),
      type: typeId,
      typeVersion: declaration.version || 1,
      organizationId: organizationId ?? draft.organizationId ?? null,
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
    await repository.insertInstance(repository.collectionForClass(declaration.class), doc);
    return toDto(doc);
  }

  return {
    async getById(id) {
      // Without organization context the class (and therefore the
      // collection) is not statically known: search the per-class
      // collections for the typed document.
      return toDto(await repository.findInstanceAnywhere(id, typeId), await declarationFor(typeId, null) || {});
    },

    async list(filters = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId);
      const filter = listQueryFilter(filters, await lineageKeysFor(typeId, organizationId));
      const docs = await repository.listInstances(
        repository.collectionForClass(declaration.class),
        typeId,
        organizationId,
        Number(filters?.limit) || 200,
        filter
      );
      return docs.map(doc => toDto(doc));
    },

    async create(draft = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.organizationId);
      return await createValidated(draft, declaration, userId, organizationId);
    },

    // Upload/capture protocol constructs: the payload reference is the
    // protocol's whole point — a missing one is a protocol violation,
    // not a silent blank instance.
    async createWithPayloadProtocol(draft = {}, { userId, organizationId } = {}, protocol = 'upload') {
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
      return await createValidated(named, declaration, userId, organizationId);
    },

    async processUpdate(id, patch = {}, context = null) {
      // Context carries the acting organization (an auth-shaped object or
      // a bare id): org-authored types resolve their declarations through
      // it, static types ignore it.
      const organizationId = typeof context === 'string' ? context : context?.organizationId || null;
      const declaration = await requireDeclaration(typeId, organizationId);
      const collection = repository.collectionForClass(declaration.class);
      // Wire patches speak the stored shape. Lifecycle is deliberately
      // absent: transitions and initial-state writes belong to the status
      // runtime.
      if (patch.state !== undefined) {
        throw createError({
          statusCode: 400,
          message: `Type ${typeId} lifecycle transitions must run through the status runtime`
        });
      }
      const patchedFieldIds = Object.keys(patch.fields || {}).filter(key => patch.fields[key] !== undefined);
      await assertStateEditableFields(typeId, organizationId, collection, id, patchedFieldIds);
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
          if (value !== undefined) set[`lineage.${key}`] = value;
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
      const updated = await repository.updateInstanceFields(collection, id, set);
      return toDto(updated);
    },

    // HTTP update transport: the same wire patch processUpdate writes,
    // gated through the shared access engine on the class-collection
    // feature (a write requires a compiled grant — fail-closed), exactly
    // like the payload replacement transport.
    async patch(id, patch = {}, { auth = null, organizationId = null } = {}) {
      const declaration = await requireDeclaration(typeId, organizationId);
      const collection = repository.collectionForClass(declaration.class);
      const doc = await repository.findInstance(collection, id, typeId);
      if (!doc) {
        throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      }
      const current = toDto(doc);
      const target = await writeGrantTarget(declaration, organizationId);
      if (!target || !hasInstanceAccess({ entity: current, typeId: target.typeId, feature: target.feature, level: 'write', auth })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      const updated = await this.processUpdate(id, patch, organizationId);
      // Field edits drop into the state record (SPEC UI): the audit trail
      // carries who changed which field, from what to what, beside the
      // transition history. Only name and data/specs leaves ride — lineage
      // and relations belong to their own link/unlink surfaces.
      await appendFieldChangeEvent(typeId, id, {
        changes: fieldChangesFromPatch(patch, current),
        actorId: auth?.userId || null,
        auth: auth || {},
        state: typeof current.state === 'string' && current.state ? current.state : null
      });
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
    async createForHttp(draft = {}, { auth = null, organizationId = null } = {}) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.organizationId);
      const target = await writeGrantTarget(declaration, organizationId || draft?.organizationId);
      if (!target || !hasInstanceAccess({ entity: null, typeId: target.typeId, feature: target.feature, level: 'write', auth })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      return await createValidated(draft, declaration, auth?.userId || null, organizationId);
    },

    async remove(id) {
      const declaration = await declarationFor(typeId, null);
      const collection = repository.collectionForClass(declaration?.class);
      return await repository.deleteInstance(collection, id);
    },

    // Payload replacement — the editor concern SPEC §3 names. Requires a
    // declared payload and revision scope; every save is revisioned so no
    // payload bytes are ever lost to a silent overwrite. Gated by the
    // shared access engine on the class-collection feature (the feature
    // grants compile against) with the type id as type-id filter.
    async replacePayload(id, { buffer, filename, mimeType } = {}, { userId, organizationId, auth } = {}) {
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
      const doc = await repository.findInstance(collection, id, typeId);
      if (!doc) {
        throw createError({ statusCode: 404, message: `${typeId} ${id} not found` });
      }
      const current = toDto(doc);
      const feature = CLASS_COLLECTIONS[declaration.class] || typeId;
      if (!hasInstanceAccess({ entity: current, typeId: typeId, feature, level: 'write', auth: auth || null })) {
        throw createError({ statusCode: 403, message: 'Permission denied' });
      }
      const stored = await filesService.uploadFile(buffer, filename || 'payload', {
        userId,
        organizationId,
        type: typeId
      }, PAYLOAD_BUCKET);
      try {
        const payload = payloadFromWire({
          payload: {
            fileId: stored.id,
            mime: mimeType || null,
            size: buffer.length,
            name: filename || 'payload'
          }
        }, declaration);
        await instanceRevisionsService.ensureForEntitySnapshot({
          typeId: typeId,
          entity: current,
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
          reason: 'payload-replaced'
        });
        const updated = await repository.updateInstanceFields(collection, id, {
          payload,
          updatedAt: new Date().toISOString()
        });
        if (!updated) {
          throw createError({ statusCode: 409, message: `${typeId} ${id} changed before its payload was saved` });
        }
        return toDto(updated);
      } catch (error) {
        await filesService.deleteFile(stored.id, PAYLOAD_BUCKET).catch(() => {});
        throw error;
      }
    },

    // -- process bindings --
    processList: (filters, auth) => instanceService(typeId).list(filters, auth.userId, auth.organizationId),
    processGetById: async (id, auth) => {
      const declaration = await declarationFor(typeId, auth.organizationId);
      if (!declaration) return null;
      return toDto(await repository.findInstance(repository.collectionForClass(declaration.class), id, typeId), declaration);
    },
    processDelete: (id, auth) => instanceService(typeId).remove(id),
    processCapabilities: {
      create: staticCreateModes.length > 0,
      createModes: staticCreateModes,
      processUpdate: true,
      delete: true,
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
