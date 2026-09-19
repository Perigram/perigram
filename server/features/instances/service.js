// Generic instance services (SPEC §13, the second half): one service serves
// every type that has no hand-registered feature service — pack-mounted
// types and org-authored types. Storage is per-class collections
// (files/items/groups/processes) with the type id as discriminator
// (`repository.js`); documents carry type, typeVersion, identity/origin/
// status/lineage/data, org-scoped lineage.
//
// The service resolves the type's declaration per call: framework and pack
// types from static declarations, org types from `cts_types` (cached).
import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import { frameworkTypes } from '~/packages/cts/src/index.js';
import { cncPackContent } from '~/packages/domain-cnc/src/index.js';
import * as typeStore from '../cts-types/repository.js';
import * as repository from './repository.js';

const staticTypes = new Map([...frameworkTypes, ...cncPackContent.types].map(type => [type.id, type]));
const declarationCache = new Map();

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
    return;
  }
  declarationCache.clear();
}

// Stored shape (SPEC §3): { _id, type, typeVersion, name, fields, states,
// lineage, relations, createdAt, updatedAt }. The wire DTO keeps the block
// vocabulary (identity/status/data/specs) every screen and compiled
// contract speaks; the §3 <-> wire mapping lives here, at the service
// boundary, and nowhere else.
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
  return {
    _id: String(doc._id),
    type: doc.type,
    typeVersion: doc.typeVersion,
    identity: { uid: doc._id.toString(), ...(doc.name != null ? { name: doc.name } : {}) },
    status: { state: { primary: doc.states?.main || 'CREATED' } },
    lineage: doc.lineage || {},
    relations: doc.relations || {},
    ...(Object.keys(data).length ? { data } : {}),
    ...(Object.keys(specs).length ? { specs } : {}),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

async function requireDeclaration(typeId, organizationId) {
  const declaration = await declarationFor(typeId, organizationId);
  if (!declaration) throw new Error(`Unknown type ${typeId}: no declaration in the registry view`);
  return declaration;
}

function instanceService(typeId) {
  return {
    async getById(id) {
      // Without organization context the class (and therefore the
      // collection) is not statically known: search the per-class
      // collections for the typed document.
      return toDto(await repository.findInstanceAnywhere(id, typeId), await declarationFor(typeId, null) || {});
    },

    async list(filters = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId);
      const docs = await repository.listInstances(
        repository.collectionForClass(declaration.class),
        typeId,
        organizationId,
        Number(filters?.limit) || 200
      );
      return docs.map(doc => toDto(doc, declaration));
    },

    async create(draft = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.lineage?.organizationId);
      const now = new Date().toISOString();
      const doc = {
        _id: new ObjectId(),
        type: typeId,
        typeVersion: declaration.version || 1,
        name: draft.identity?.name ?? null,
        // §3: the row is one flat fields map (data/specs split is wire-only)
        fields: { ...(draft.data || {}), ...(draft.specs || {}) },
        states: { main: draft.status?.state?.primary || declaration.states?.main?.initial || 'CREATED' },
        lineage: { ...(draft.lineage || {}), ...(organizationId ? { organizationId: toFlexibleId(organizationId) } : {}) },
        ...(draft.relations ? { relations: draft.relations } : {}),
        createdAt: now,
        updatedAt: now
      };
      await repository.insertInstance(repository.collectionForClass(declaration.class), doc);
      return toDto(doc, declaration);
    },

    async processUpdate(id, patch = {}) {
      const declaration = await requireDeclaration(typeId, null);
      const collection = repository.collectionForClass(declaration.class);
      // Wire patches (block paths from the effect boundary) map to §3
      // writes: data/specs leaves land in the flat fields map,
      // status.state.primary becomes states.main.
      const set = {};
      const mergeSlot = (slot, value) => {
        for (const [key, leaf] of Object.entries(value || {})) {
          if (leaf !== undefined) set[`fields.${key}`] = leaf;
        }
      };
      if (patch.identity?.name !== undefined) set.name = patch.identity.name;
      if (patch.data && typeof patch.data === 'object') mergeSlot('data', patch.data);
      if (patch.specs && typeof patch.specs === 'object') mergeSlot('specs', patch.specs);
      if (patch.status?.state?.primary !== undefined) set['states.main'] = patch.status.state.primary;
      if (patch.lineage && typeof patch.lineage === 'object') {
        for (const [key, value] of Object.entries(patch.lineage)) {
          if (value !== undefined) set[`lineage.${key}`] = value;
        }
      }
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

    // -- process bindings --
    processList: (filters, auth) => instanceService(typeId).list(filters, auth.userId, auth.organizationId),
    processGetById: async (id, auth) => {
      const declaration = await declarationFor(typeId, auth.organizationId);
      if (!declaration) return null;
      return toDto(await repository.findInstance(repository.collectionForClass(declaration.class), id, typeId), declaration);
    },
    processDelete: (id, auth) => instanceService(typeId).remove(id),
    processCapabilities: {
      create: true,
      createModes: ['genericCreate'],
      processUpdate: true,
      delete: true,
      archive: false
    },
    constructionHandlers: {
      genericCreate: (draft, context = {}) => instanceService(typeId).create(
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
