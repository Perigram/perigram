// Generic instance services (SPEC §13, the second half): one service serves
// every type that has no hand-registered feature service — pack-mounted
// types and org-authored types. Storage is per-class collections
// (files/items/groups/processes) with the type id as discriminator
// (`repository.js`); documents carry type, typeVersion, identity/origin/
// status/lineage/data, org-scoped lineage.
//
// The service resolves the type's declaration per call: framework and pack
// types from static declarations, org types from `cts_types` (cached).
import { createError } from 'h3';
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { frameworkTypes, CLASS_COLLECTIONS, lineageKeyForParent } from '~/packages/cts/src/index.js';
import { composeSystemDeclarations } from '~/server/packs/declarations.js';
import * as typeStore from '../cts-types/repository.js';
import * as repository from './repository.js';
import * as filesService from '../files/service.js';
import * as instanceRevisionsService from '../instance-revisions/service.js';
import { hasInstanceAccess } from '../../core/access/service.js';

// The composed system view (framework + mounted packs in dependency
// order): every pack type is executable through the generic instance
// service.
const staticTypes = new Map([...frameworkTypes, ...composeSystemDeclarations()].map(type => [type.id, type]));
const declarationCache = new Map();
// Declared lineage keys per child type (SPEC §6), derived from the same
// view the indexes derive from: the storage keys parents' children edges
// name on the child. Static pack declarations compose the system half
// once; org declarations resolve per organization beside the declaration
// cache and invalidate with it on registry writes.
let staticLineageKeys = null;
const lineageKeysCache = new Map();

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
    let orgDeclarations = [];
    try {
      orgDeclarations = await typeStore.listByOrganization(organizationId);
    } catch {
      orgDeclarations = [];
    }
    lineageKeysCache.set(cacheKey, declaredLineageKeysOf([...staticTypes.values(), ...orgDeclarations]));
  }
  return lineageKeysCache.get(cacheKey).get(typeId) || new Set();
}

async function declarationFor(typeId, organizationId = null) {
  const cacheKey = organizationId ? `${typeId}@${organizationId}` : typeId;
  if (declarationCache.has(cacheKey)) return declarationCache.get(cacheKey);
  let declaration = staticTypes.get(typeId) || null;
  if (!declaration && organizationId) {
    try {
      declaration = await typeStore.findByTypeId(organizationId, typeId);
    } catch {
      declaration = null;
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
// fields, states, lineage, relations, createdAt, updatedAt }. Tenancy is
// the top-level `organizationId` slot; `lineage` holds pure tree edges —
// the wire DTO's `lineage.organizationId` is a boundary projection owned
// here (create maps it to the slot, toDto re-projects it for the legacy
// block vocabulary) and nowhere else.
function wireFieldsSplit(fields = {}, declaration = {}) {
  const data = {};
  const specs = {};
  for (const [name, value] of Object.entries(fields)) {
    const descriptor = declaration.fields?.[name];
    const slot = descriptor ? (descriptor.slot || (declaration.class === 'item' && descriptor.base === 'quantity' ? 'specs' : 'data')) : 'data';
    (slot === 'specs' ? specs : data)[name] = value;
  }
  return { data, specs };
}

function toDto(doc, declaration = {}) {
  if (!doc) return null;
  const { data, specs } = wireFieldsSplit(doc.fields || {}, declaration);
  // §3 tenancy slot projects back into the wire lineage block.
  const lineage = { ...(doc.lineage || {}) };
  if (doc.organizationId != null) lineage.organizationId = doc.organizationId;
  return {
    _id: String(doc._id),
    type: doc.type,
    typeVersion: doc.typeVersion,
    identity: { uid: doc._id.toString(), ...(doc.name != null ? { name: doc.name } : {}) },
    states: { main: doc.states?.main || 'CREATED' },
    lineage,
    relations: doc.relations || {},
    // §3 payload slot projects onto the legacy wire attachments block.
    ...(doc.payload?.fileId ? { attachments: { primary: doc.payload } } : {}),
    ...(doc.provenance ? { provenance: doc.provenance } : {}),
    ...(Object.keys(data).length ? { data } : {}),
    ...(Object.keys(specs).length ? { specs } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

// Payload reference (SPEC §3/§4): §3-honest callers pass `payload`, legacy
// wire callers pass `attachments.primary`. Validated against the type's
// declared payload traits at construct; mime/size checks run on the values
// the reference carries.
function payloadFromWire(draft = {}, declaration = {}) {
  const reference = draft.payload || draft.attachments?.primary || null;
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
  // declaration's single string.
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

function mimeMatches(actual = '', accepted = '') {
  if (accepted === '*/*' || accepted === actual) return true;
  if (accepted.endsWith('/*')) return actual.split('/')[0] === accepted.slice(0, -2) && actual.includes('/');
  return false;
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

// The compiled screen-source filter vocabulary (the same transport
// contract the feature routes speak, cassettes' libraryId): a bare
// DECLARED lineage key scopes the read by parent, primaryState(s) by the
// status window, and _id resolves reference lookups. Keys the type never
// declared are transport noise the service ignores — never a Mongo path.
function listQueryFilter(filters = {}, declaredLineageKeys = new Set()) {
  const filter = {};
  for (const [key, rawValue] of Object.entries(filters || {})) {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (value === undefined || value === null || value === '') continue;
    if (key === 'limit' || key === 'skip') continue;
    if (key === '_id') {
      filter._id = toFlexibleId(value);
      continue;
    }
    if (key === 'primaryState') {
      filter['states.main'] = String(value);
      continue;
    }
    if (key === 'primaryStates') {
      const states = String(value).split(',').map(item => item.trim()).filter(Boolean);
      if (states.length) filter['states.main'] = { $in: states };
      continue;
    }
    if (declaredLineageKeys.has(key)) {
      filter[`lineage.${key}`] = lineageMatchValues(value);
      continue;
    }
    // Dotted form (`?lineage.<key>=…`) is the same filter: accept both
    // spellings so no caller convention can silently disable scoping and
    // return the whole collection.
    if (key.startsWith('lineage.') && declaredLineageKeys.has(key.slice('lineage.'.length))) {
      filter[key] = lineageMatchValues(value);
    }
  }
  return filter;
}

// Stored lineage values keep whatever shape their writer persisted
// (string ids from dialogs and the effect boundary, ObjectIds from
// flexible-id writes), so an id-shaped filter matches both forms.
function lineageMatchValues(value) {
  const flexible = toFlexibleId(value);
  return flexible === value ? value : { $in: [value, flexible] };
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
      return [...new Set([].concat(staticDeclaration.payload.creation || ['upload']).map(String))];
    }
    return ['genericCreate'];
  })();
  // Shared construct body: the §3 document build common to every
  // construction mode.
  async function createValidated(draft, declaration, userId, organizationId) {
    // Tenancy: the wire may carry lineage.organizationId (the legacy
    // projection); storage keeps the top-level slot and pure tree edges.
    const wireLineage = { ...(draft.lineage || {}) };
    const tenancyId = organizationId ?? wireLineage.organizationId ?? null;
    delete wireLineage.organizationId;
    const payload = payloadFromWire(draft, declaration);
    const provenance = provenanceFromWire(draft);
    const now = new Date().toISOString();
    const doc = {
      _id: new ObjectId(),
      type: typeId,
      typeVersion: declaration.version || 1,
      organizationId: tenancyId == null ? null : toFlexibleId(tenancyId),
      name: draft.identity?.name ?? null,
      // §3: the row is one flat fields map (data/specs split is wire-only)
      fields: { ...(draft.data || {}), ...(draft.specs || {}) },
      states: { main: draft.states?.main || declaration.states?.main?.initial || 'CREATED' },
      lineage: wireLineage,
      ...(draft.relations ? { relations: draft.relations } : {}),
      ...(payload ? { payload } : {}),
      ...(provenance ? { provenance } : {}),
      createdAt: now,
      updatedAt: now
    };
    await repository.insertInstance(repository.collectionForClass(declaration.class), doc);
    return toDto(doc, declaration);
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
      return docs.map(doc => toDto(doc, declaration));
    },

    async create(draft = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.lineage?.organizationId);
      return await createValidated(draft, declaration, userId, organizationId);
    },

    // Upload/capture protocol constructs: the payload reference is the
    // protocol's whole point — a missing one is a protocol violation,
    // not a silent blank instance.
    async createWithPayloadProtocol(draft = {}, { userId, organizationId } = {}, protocol = 'upload') {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.lineage?.organizationId);
      if (!declaration.payload) {
        throw createError({ statusCode: 400, message: `Type ${typeId} declares no payload; creation protocol ${protocol} does not apply` });
      }
      const reference = draft.payload || draft.attachments?.primary || null;
      if (!reference?.fileId && !reference?.id) {
        throw createError({ statusCode: 400, message: `Creation protocol ${protocol} requires a payload file` });
      }
      return await createValidated(draft, declaration, userId, organizationId);
    },

    async processUpdate(id, patch = {}) {
      const declaration = await requireDeclaration(typeId, null);
      const collection = repository.collectionForClass(declaration.class);
      // Wire patches (block paths from the effect boundary) map to §3
      // writes: data/specs leaves land in the flat fields map,
      // states.main becomes states.main.
      const set = {};
      const mergeSlot = (slot, value) => {
        for (const [key, leaf] of Object.entries(value || {})) {
          if (leaf !== undefined) set[`fields.${key}`] = leaf;
        }
      };
      if (patch.identity?.name !== undefined) set.name = patch.identity.name;
      if (patch.data && typeof patch.data === 'object') mergeSlot('data', patch.data);
      if (patch.specs && typeof patch.specs === 'object') mergeSlot('specs', patch.specs);
      if (patch.states?.main !== undefined) set['states.main'] = patch.states.main;
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
      return toDto(updated, declaration);
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
      const current = toDto(doc, declaration);
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
          snapshot: { identity: current.identity || null, data: { payload } },
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
        return toDto(updated, declaration);
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
    constructionHandlers: {
      genericCreate: (draft, context = {}) => instanceService(typeId).create(
        draft, context.userId, context.organizationId
      ),
      // Payload creation protocols (SPEC §4): upload/capture require the
      // payload reference the dialog uploaded (trait-validated by the
      // construct path); editor constructs a blank instance whose first
      // editor save fills the payload.
      upload: (draft, context = {}) => instanceService(typeId).createWithPayloadProtocol(
        draft, context, 'upload'
      ),
      capture: (draft, context = {}) => instanceService(typeId).createWithPayloadProtocol(
        draft, context, 'capture'
      ),
      editor: (draft, context = {}) => instanceService(typeId).create(
        draft, context.userId, context.organizationId
      )
    }
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
const frameworkServiceTypes = new Set(['organization', 'user', 'artifact', 'process_definition', 'entity_revision']);
