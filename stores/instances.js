import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { emitInstanceCreated, emitInstanceDeleted, emitInstanceUpdated, onInstanceChanged } from '~/utils/instance-events.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { createdEntity } from '~/utils/instance-run-results.js';
import { isCreateAction } from '~/utils/action-visibility.js';
import { useRegistryStore } from './registry';
import { useOutboxStore } from './outbox';

// The single instance cache and transport boundary. Records are keyed by type key, then id; each entry
// carries the raw wire DTO plus, when the registry knows the type, the
// derived CTS instance shape. List results are cached observations; single
// reads and mutations coalesce per type:id. Endpoint resolution mirrors the
// server: framework party/service types keep feature routes, the remaining
// mounted pack feature modules keep theirs, and every other type resolves
// to the generic instance transport. One `onInstanceChanged` subscriber
// reconciles every open surface.

// Framework types with explicit feature services (mirror of the server
// instance resolver's framework set) — feature routes, not the transport.
const FRAMEWORK_ROUTES = {
  organization: '/api/organizations',
  user: '/api/users',
  artifact: '/api/artifacts',
  process_definition: '/api/process-definitions',
  entity_revision: '/api/instance-revisions'
};

// Pack feature modules that still own mounted REST routes; every other
// type (declared or legacy) resolves through `/api/instances/:type`.
const FEATURE_ROUTES = {
  artifact_template: '/api/artifact-templates'
};

const ROUTE_BY_TYPE = { ...FRAMEWORK_ROUTES, ...FEATURE_ROUTES };

function surfaceToSnake(key = '') {
  return String(key).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function collectionItems(response) {
  if (Array.isArray(response)) return response;
  for (const key of ['items', 'projects', 'data']) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return [];
}

function dtoIds(dto = {}) {
  return [dto._id, dto.id]
    .map(value => value?.toString?.() || value)
    .filter(Boolean);
}

export const useInstancesStore = defineStore('instances', () => {
  const registry = useRegistryStore();
  // { [typeKey]: { [id]: { dto, instance } } }
  const records = reactive({});
  // { [queryKey]: { ids: [...], stale } } — cached list observations.
  const observations = ref({});
  const loading = ref(false);
  const error = ref(null);
  const pending = new Map();

  ensureSyncListener();
  // -- type keys ----------------------------------------------------------

  // Registry-known ids win; legacy surface keys (camel) and graph ids
  // (kebab) canonicalize mechanically. Unknown keys stay snake_case so
  // legacy surfaces keep deterministic cache keys.
  function canonicalTypeKey(key = '') {
    const raw = String(key || '');
    if (!raw) return '';
    if (registry.typesById.has(raw)) return raw;
    // Kebab registry ids (`t-uth93vgdab`, `text-document`) ARE the
    // canonical server form — snake-ifying them poisons the record cache
    // against later registry-aware lookups (empty-registry first loads
    // vs loaded-registry reads keyed the same type two ways). Only the
    // legacy camel surface keys convert.
    if (raw.includes('-')) return raw;
    const snake = surfaceToSnake(raw.replace(/-/g, '_'));
    if (registry.typesById.has(snake)) return snake;
    return snake;
  }

  // -- endpoints ----------------------------------------------------------

  function endpointsFor(typeKey = '') {
    const base = ROUTE_BY_TYPE[typeKey];
    if (base) return { single: id => `${base}/${id}`, list: () => base };
    // The generic instance transport speaks the CTS id (kebab).
    const typeId = String(typeKey).replace(/_/g, '-');
    return { single: id => `/api/instances/${typeId}/${id}`, list: () => `/api/instances/${typeId}` };
  }

  function listUrlFor(typeKey = '', filters = {}) {
    const base = endpointsFor(typeKey).list();
    const params = new URLSearchParams(filters).toString();
    return params ? `${base}?${params}` : base;
  }

  // -- cache --------------------------------------------------------------

  function bucketFor(typeKey = '') {
    records[typeKey] ||= reactive({});
    return records[typeKey];
  }

  function deriveInstance(typeKey = '', dto = {}) {
    const typeRecord = registry.typeRecord(typeKey);
    return typeRecord ? dtoToScreenInstance(dto, typeRecord) : null;
  }

  function upsertRecord(typeKey = '', dto = {}) {
    const ids = dtoIds(dto);
    if (!ids.length) return null;
    const bucket = bucketFor(typeKey);
    const id = ids[0];
    bucket[id] = { dto, instance: deriveInstance(typeKey, dto) };
    markObservationsFresh(typeKey);
    return bucket[id];
  }

  function removeRecord(typeKey = '', id = '') {
    if (!records[typeKey] || !id) return;
    delete records[typeKey][String(id)];
    markObservationsFresh(typeKey);
  }

  function recordFor(typeKey = '', id = '') {
    if (!id) return null;
    return records[typeKey]?.[String(id)] || null;
  }

  function dtoFor(typeKey = '', id = '') {
    return recordFor(typeKey, id)?.dto || null;
  }

  function instanceFor(typeKey = '', id = '') {
    return recordFor(typeKey, id)?.instance || null;
  }

  // The generator's data layer: { [typeKey]: { [id]: instance } }.
  const instancePool = computed(() => {
    const pool = {};
    for (const [typeKey, bucket] of Object.entries(records)) {
      const instances = {};
      for (const [id, entry] of Object.entries(bucket)) {
        if (entry.instance) instances[id] = entry.instance;
      }
      if (Object.keys(instances).length) pool[typeKey] = instances;
    }
    return pool;
  });

  // The delegated legacy projection: wire DTOs keyed by type.
  const dtoRegistry = computed(() => {
    const view = {};
    for (const [typeKey, bucket] of Object.entries(records)) {
      view[typeKey] = Object.fromEntries(Object.entries(bucket).map(([id, entry]) => [id, entry.dto]));
    }
    return view;
  });

  // -- reads ---------------------------------------------------------------

  function queryKey(typeKey = '', filters = {}) {
    return `${typeKey}?${new URLSearchParams(filters || {}).toString()}`;
  }

  function markObservationsFresh(typeKey = '') {
    for (const [key, observation] of Object.entries(observations.value)) {
      if (key.startsWith(`${typeKey}?`)) observation.stale = true;
    }
  }

  async function fetchInstance(typeKey = '', id = '', { force = false, fetchOptions = {} } = {}) {
    const key = `${typeKey}:${id}`;
    if (!force && recordFor(typeKey, id)?.dto) return recordFor(typeKey, id).dto;
    if (!force && pending.has(key)) return pending.get(key);
    loading.value = true;
    const request = $fetch(endpointsFor(typeKey).single(id), fetchOptions)
      .then(dto => {
        upsertRecord(typeKey, dto);
        return dto;
      })
      .finally(() => {
        pending.delete(key);
        loading.value = false;
      });
    pending.set(key, request);
    try {
      return await request;
    } catch (err) {
      error.value = err?.data?.message || err?.message || String(err);
      throw err;
    }
  }

  async function listInstances(typeKey = '', filters = {}, { force = false, silent = false, fetchOptions = {} } = {}) {
    const key = queryKey(typeKey, filters);
    const observation = observations.value[key];
    if (!force && observation && !observation.stale) {
      return observation.ids.map(dtoId => dtoFor(typeKey, dtoId)).filter(Boolean);
    }
    loading.value = true;
    try {
      const response = await $fetch(endpointsFor(typeKey).list(), { query: filters, ...fetchOptions });
      const items = collectionItems(response);
      for (const dto of items) upsertRecord(typeKey, dto);
      observations.value[key] = { ids: items.map(dto => dtoIds(dto)[0]).filter(Boolean), stale: false };
      return items;
    } catch (err) {
      if (!silent) console.error(`[instances] Failed to list ${typeKey}:`, err);
      error.value = err?.data?.message || err?.message || String(err);
      throw err;
    } finally {
      loading.value = false;
    }
  }

  // The delegated legacy reference contract: resolve an optional reference
  // through the access-filtered list endpoint, never the protected detail
  // endpoint — an unreadable reference resolves to null without expected
  // 403/404 browser failures. Only an exact readable match is cached.
  async function resolveReadableReference(typeKey = '', id = '', { silent = false, fetchOptions = {} } = {}) {
    if (!typeKey || !id) return null;
    const key = `${typeKey}:ref:${id}`;
    if (pending.has(key)) return pending.get(key);
    const request = $fetch(endpointsFor(typeKey).list(), { query: { _id: id }, ...fetchOptions })
      .then(async response => {
        const match = collectionItems(response).find(dto => dtoIds(dto).includes(String(id))) || null;
        if (match) {
          upsertRecord(typeKey, match);
          return match;
        }
        // Framework party types are directory-visible beyond the caller's
        // memberships: the directory card is the cross-tenant fallback
        // (name-level only).
        return directoryFallback(typeKey, id, fetchOptions);
      })
      .catch(err => {
        if (!silent) console.error(`[instances] Failed to resolve ${typeKey} ${id}:`, err);
        error.value = err?.data?.message || err?.message || String(err);
        return directoryFallback(typeKey, id, fetchOptions);
      })
      .finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  async function directoryFallback(typeKey = '', id = '', fetchOptions = {}) {
    const type = canonicalTypeKey(typeKey);
    if (!['user', 'organization'].includes(type)) return null;
    const entry = await $fetch(`/api/directory/${type}/${encodeURIComponent(String(id))}`, fetchOptions)
      .catch(() => null);
    if (entry?._id) upsertRecord(type, entry);
    return entry?._id ? entry : null;
  }

  // -- mutations -----------------------------------------------------------

  // Process actions are the mutation boundary: the projected manifest
  // action id is the execution contract; the run API resolves the rest
  // server-side. Offline replays carry the idempotency key. A create run
  // lands its created entity in the pool eagerly — the local half of
  // run-action reconciliation (the server-published event remains the
  // cross-session backstop): create-open destinations read the pool
  // immediately, and the upsert marks the type's cached list observations
  // stale so surfaces refetch.
  async function runAction({ action = null, actionId, instanceId = null, entities = {}, data = {}, parameters = {} } = {}) {
    const outbox = useOutboxStore();
    const result = await outbox.mutate({
      url: `/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/execute`,
      method: 'POST',
      body: { instanceId, entities, data, parameters },
      meta: { kind: 'action', instanceId, change: 'updated', reason: 'process-action' }
    });
    if (isCreateAction(action)) {
      const entity = createdEntity(action, result);
      const id = entity?._id ?? entity?.id;
      const typeId = entity?.type
        || [].concat(action.relationMutation?.targetTypes || [])[0]
        || action.typeId
        || '';
      if (id && typeId) upsertRecord(canonicalTypeKey(typeId), entity);
    }
    return result;
  }

  // Framework/party types, editor feature endpoints, and the generic
  // instance update transport (PATCH /api/instances/:type/:id) that
  // persists generated detail-surface edits.
  async function mutateDirect(typeKey = '', method = 'PATCH', { id = null, body = null, meta = {} } = {}) {
    const outbox = useOutboxStore();
    const endpoints = endpointsFor(typeKey);
    return outbox.mutate({
      url: id ? endpoints.single(id) : endpoints.list(),
      method,
      ...(body !== null ? { body } : {}),
      meta
    });
  }

  // The delegated CRUD emission contract (previously useEntity's): direct
  // feature mutations emit the shared browser-local instance event and
  // publish the typed invalidation for other sessions. Process actions
  // (runAction) reconcile through the server-published events instead.
  function publishMutation(detail = {}) {
    if (import.meta.server || !detail.type || !detail.id) return;
    $fetch('/api/instance-events', { method: 'POST', body: detail }).catch(() => null);
  }

  async function createInstance(typeKey = '', body = {}, { typeId = typeKey } = {}) {
    const data = await mutateDirect(typeKey, 'POST', {
      body,
      meta: { kind: 'instance', typeId, change: 'created', reason: 'create' }
    });
    emitInstanceCreated({ type: typeId, id: data?._id, instance: data });
    publishMutation({ type: typeId, id: data?._id, change: 'created', reason: 'create' });
    return data;
  }

  async function updateInstance(typeKey = '', id = '', body = {}, { typeId = typeKey } = {}) {
    const data = await mutateDirect(typeKey, 'PATCH', {
      id,
      body,
      meta: { kind: 'instance', typeId, instanceId: id, change: 'updated', reason: 'update' }
    });
    emitInstanceUpdated({ type: typeId, id: data?._id || id, instance: data });
    publishMutation({ type: typeId, id: data?._id || id, change: 'updated', reason: 'update' });
    return data;
  }

  async function removeInstance(typeKey = '', id = '', { typeId = typeKey, instance = null } = {}) {
    await mutateDirect(typeKey, 'DELETE', {
      id,
      meta: { kind: 'instance', typeId, instanceId: id, change: 'deleted', reason: 'delete' }
    });
    emitInstanceDeleted({ type: typeId, id, instance });
    publishMutation({ type: typeId, id, change: 'deleted', reason: 'delete' });
  }

  // -- reconciliation ------------------------------------------------------

  // One listener per store instance (one per Pinia): reconciliation is
  // idempotent, so a re-created store re-attaching under tests is harmless.
  function ensureSyncListener() {
    if (typeof window === 'undefined') return;
    onInstanceChanged(({ type, id, instance, change }) => {
      const typeKey = canonicalTypeKey(type);
      const normalizedId = id?.toString?.() || id || instance?._id?.toString?.() || instance?._id;
      if (!typeKey || !normalizedId) return;
      if (change === 'deleted') {
        removeRecord(typeKey, normalizedId);
        return;
      }
      if (instance) {
        upsertRecord(typeKey, instance);
        return;
      }
      // Snapshot-less invalidation: drop the record so the next read
      // refetches through the normal API.
      removeRecord(typeKey, normalizedId);
    });
  }

  // -- render-policy delegates (single icon/constructibility home) --------

  function iconFor(typeKey = '') {
    return registry.iconFor(canonicalTypeKey(typeKey));
  }

  function constructible(typeKey = '') {
    return registry.constructible(canonicalTypeKey(typeKey));
  }

  return {
    records,
    loading,
    error,
    instancePool,
    dtoRegistry,
    canonicalTypeKey,
    endpointsFor,
    listUrlFor,
    recordFor,
    dtoFor,
    instanceFor,
    upsertRecord,
    removeRecord,
    fetchInstance,
    listInstances,
    resolveReadableReference,
    runAction,
    mutateDirect,
    createInstance,
    updateInstance,
    removeInstance,
    iconFor,
    constructible
  };
});
