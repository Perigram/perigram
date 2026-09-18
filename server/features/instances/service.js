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

function toDto(doc) {
  if (!doc) return null;
  return { ...doc, _id: String(doc._id) };
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
      return toDto(await repository.findInstanceAnywhere(id, typeId));
    },

    async list(filters = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId);
      const docs = await repository.listInstances(
        repository.collectionForClass(declaration.class),
        typeId,
        organizationId,
        Number(filters?.limit) || 200
      );
      return docs.map(toDto);
    },

    async create(draft = {}, userId, organizationId) {
      const declaration = await requireDeclaration(typeId, organizationId || draft?.lineage?.organizationId);
      const now = new Date().toISOString();
      const doc = {
        _id: new ObjectId(),
        type: typeId,
        typeVersion: declaration.version || 1,
        identity: { ...(draft.identity || {}), uid: `cts-${typeId}-${new ObjectId().toString().slice(0, 8)}` },
        origin: { state: { primary: 'CREATED' }, userId: userId || null, timestamp: now },
        status: { state: { primary: declaration.states?.main?.initial || 'CREATED' }, userId: userId || null, timestamp: now },
        lineage: { ...(draft.lineage || {}), ...(organizationId ? { organizationId: toFlexibleId(organizationId) } : {}) },
        data: { ...(draft.data || {}) },
        ...(draft.specs ? { specs: draft.specs } : {}),
        ...(draft.states ? { states: draft.states } : {}),
        ...(draft.relations ? { relations: draft.relations } : {}),
        createdAt: now,
        updatedAt: now
      };
      await repository.insertInstance(repository.collectionForClass(declaration.class), doc);
      return toDto(doc);
    },

    async processUpdate(id, patch = {}) {
      const declaration = await declarationFor(typeId, null);
      const collection = repository.collectionForClass(declaration?.class);
      const update = {};
      for (const block of ['identity', 'data', 'specs', 'status', 'lineage', 'relations']) {
        if (patch[block] && typeof patch[block] === 'object') update[block] = { ...patch[block] };
      }
      const updated = await repository.updateInstanceBlocks(collection, id, update);
      return toDto(updated);
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
      return toDto(await repository.findInstance(repository.collectionForClass(declaration.class), id, typeId));
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
const frameworkServiceTypes = new Set(['organization', 'user', 'artifact', 'artifact_template', 'process_definition', 'entity_revision']);
