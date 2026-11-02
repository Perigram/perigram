import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { emitInstanceCreated, emitInstanceDeleted, emitInstanceMutation, emitInstanceUpdated, markSelfPublished, onInstanceChanged } from '~/utils/instance-events.js';
import { dtoToScreenInstance } from '~/utils/instance-shape.js';
import { createdEntity } from '~/utils/instance-run-results.js';
import { isCreateAction } from '~/utils/action-visibility.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { useRegistryStore } from './registry';
import { useOutboxStore } from './outbox';

// The single instance cache and transport boundary. Records are keyed by type key, then id; each entry
// carries the raw wire DTO plus, when the registry knows the type, the
// derived CTS instance shape. List results are cached observations; single
// reads and mutations coalesce per type:id. Reads resolve through the
// generic §3 instance transport for every type the server resolver
// serves — party types included (their process bindings speak the §3
// wire shape with their own read gates). Party mutations stay on the
// feature routes: party creation/assignment is feature-owned, never a
// process-graph concern. One `onInstanceChanged` subscriber
// reconciles every open surface.

// Types whose mutations still own feature routes (party administration,
// editor feature endpoints); every other type mutates through the generic
// instance transport (POST/PATCH /api/instances/:type(/:id)).
const MUTATION_ROUTES = {
  organization: '/api/organizations',
  user: '/api/users',
  process_definition: '/api/process-definitions',
  entity_revision: '/api/instance-revisions'
};

// Reads that keep a feature route (their process bindings do not speak
// the §3 wire shape); everything else reads through the transport.
const READ_ROUTES = {
  process_definition: '/api/process-definitions',
  entity_revision: '/api/instance-revisions'
};

function endpointsFor(typeKey = '') {
  const mutationBase = MUTATION_ROUTES[typeKey] || null;
  const readBase = READ_ROUTES[typeKey] || null;
  if (!readBase && !mutationBase) {
    // The generic instance transport speaks the CTS id (kebab).
    const typeId = String(typeKey).replace(/_/g, '-');
    return { single: id => `/api/instances/${typeId}/${id}`, list: () => `/api/instances/${typeId}` };
  }
  const single = id => (readBase ? `${readBase}/${id}` : `/api/instances/${typeKey}/${id}`);
  const list = () => readBase || `/api/instances/${typeKey}`;
  if (mutationBase && mutationBase !== readBase) {
    return { single, list, mutationSingle: id => `${mutationBase}/${id}`, mutationList: () => mutationBase };
  }
  return { single, list };
}

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

// Mirrors the instance service's wire-patch leaf-set semantics
// (processUpdate): `name` plus per-key leaf sets into `fields`,
// `lineage`, and `relations` — blocks merge, they are never replaced
// wholesale, and undefined leaves are skipped. Keys outside the patch
// vocabulary are ignored: the server DTO that lands on success is the
// authority, the optimistic merge only needs to be a safe preview.
function applyWirePatch(dto = {}, patch = {}) {
  const next = { ...dto };
  if (patch.name !== undefined) next.name = patch.name;
  for (const block of ['fields', 'lineage', 'relations']) {
    const leaves = patch[block];
    if (!leaves || typeof leaves !== 'object') continue;
    const merged = { ...(dto[block] || {}) };
    for (const [key, value] of Object.entries(leaves)) {
      if (value !== undefined) merged[key] = value;
    }
    next[block] = merged;
  }
  return next;
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

  // Per-record optimistic write state (stores README): `${typeKey}:${id}` →
  // idle | pending | confirmed | rolled-back | queued.
  const writeStates = reactive({});
  const writeChains = new Map();

  function writeKey(typeKey = '', id = '') {
    return id ? `${typeKey}:${String(id)}` : '';
  }

  function writeStateFor(typeKey = '', id = '') {
    const key = writeKey(typeKey, id);
    return key ? (writeStates[key] || 'idle') : 'idle';
  }

  function setWriteState(typeKey = '', id = '', state = 'idle') {
    const key = writeKey(typeKey, id);
    if (key) writeStates[key] = state;
  }

  function reconcileWriteState(typeKey = '', id = '', source = 'local') {
    if (source === 'local') return;
    const key = writeKey(typeKey, id);
    if (key && writeStates[key] && writeStates[key] !== 'confirmed') writeStates[key] = 'confirmed';
  }

  // Writes for one record run in arrival order: the head previews and
  // issues its request immediately, later writes wait for it to settle.
  function serializeWrite(typeKey = '', id = '', task) {
    const key = writeKey(typeKey, id);
    if (!key) return task();
    const previous = writeChains.get(key);
    const run = previous
      ? previous.catch(() => null).then(() => start())
      : start();
    function start() {
      setWriteState(typeKey, id, 'pending');
      return task();
    }
    writeChains.set(key, run);
    run.then(clear, clear);
    function clear() {
      if (writeChains.get(key) === run) writeChains.delete(key);
    }
    return run;
  }

  ensureSyncListener();
  // -- type keys ----------------------------------------------------------

  // Registry-known ids win; legacy surface keys (camel) and graph ids
  // (kebab) canonicalize mechanically. Unknown keys stay snake_case so
  // legacy surfaces keep deterministic cache keys.
  function canonicalTypeKey(key = '') {
    const raw = String(key || '');
    if (!raw) return '';
    if (registry.typesById.has(raw)) return raw;
    // The kebab registry id behind a snake/camel spelling: refs may carry
    // either alias, and the registry ids are the cache keys the pool and
    // the screens resolve against.
    const kebab = raw.replace(/_/g, '-').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    if (registry.typesById.has(kebab)) return kebab;
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

  // The record's derived instance, derived lazily: a record cached before
  // the registry hydrated derives as soon as the declaration arrives
  // (the pool is a reactive consumer, so the refresh re-renders surfaces).
  function instanceOf(typeKey = '', entry = null) {
    if (!entry?.dto) return null;
    return entry.instance || deriveInstance(typeKey, entry.dto);
  }

  function upsertRecord(typeKey = '', dto = {}) {
    const ids = dtoIds(dto);
    if (!ids.length) return null;
    const bucket = bucketFor(typeKey);
    const id = ids[0];
    bucket[id] = { dto, instance: deriveInstance(typeKey, dto) };
    markObservationsStale(typeKey);
    return bucket[id];
  }

  function removeRecord(typeKey = '', id = '') {
    if (!records[typeKey] || !id) return;
    delete records[typeKey][String(id)];
    markObservationsStale(typeKey);
  }

  function recordFor(typeKey = '', id = '') {
    if (!id) return null;
    return records[typeKey]?.[String(id)] || null;
  }

  function dtoFor(typeKey = '', id = '') {
    return recordFor(typeKey, id)?.dto || null;
  }

  function instanceFor(typeKey = '', id = '') {
    return instanceOf(typeKey, recordFor(typeKey, id));
  }

  // The generator's data layer: { [typeKey]: { [id]: instance } }.
  const instancePool = computed(() => {
    const pool = {};
    for (const [typeKey, bucket] of Object.entries(records)) {
      const instances = {};
      for (const [id, entry] of Object.entries(bucket)) {
        const instance = instanceOf(typeKey, entry);
        if (instance) instances[id] = instance;
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

  function markObservationsStale(typeKey = '') {
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
  // 403/404 browser failures. Only an exact readable match is cached, and
  // a cached match serves later lookups without a refetch (hover-driven
  // resolvers call this on every trigger).
  async function resolveReadableReference(typeKey = '', id = '', { silent = false, fetchOptions = {} } = {}) {
    if (!typeKey || !id) return null;
    const known = dtoFor(typeKey, id);
    if (known) return known;
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
      body: { instanceId, entities, data, parameters, ...(action?.rerun && instanceId ? { rerun: true } : {}) },
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
  // persists generated detail-surface edits. Party reads ride the §3
  // transport while their mutations keep the feature route, so the
  // mutation endpoints win wherever they are split.
  async function mutateDirect(typeKey = '', method = 'PATCH', { id = null, body = null, meta = {} } = {}) {
    const outbox = useOutboxStore();
    const endpoints = endpointsFor(typeKey);
    const mutationSingle = endpoints.mutationSingle || endpoints.single;
    const mutationList = endpoints.mutationList || endpoints.list;
    return outbox.mutate({
      url: id ? mutationSingle(id) : mutationList(),
      method,
      ...(body !== null ? { body } : {}),
      meta
    });
  }

  // The delegated CRUD emission contract (previously useEntity's): direct
  // feature mutations emit the shared browser-local instance event and
  // publish the typed invalidation for other sessions. The published
  // event id is remembered so this tab's own realtime/poll delivery of
  // the same event is skipped — the mutation already applied its own
  // snapshot here. Process actions (runAction) reconcile through the
  // server-published events instead.
  function publishMutation(detail = {}) {
    if (import.meta.server || !detail.type || !detail.id) return;
    $fetch('/api/instance-events', { method: 'POST', body: detail })
      .then(event => markSelfPublished(event?.eventId))
      .catch(() => null);
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

  // Optimistic updates (stores README): a cached record previews the wire
  // patch immediately and rolls back to the server-known DTO on any
  // failure — an offline queueing (OfflineQueuedError) reverts the
  // preview instead of faking local state, and the replay re-lands the
  // mutation when connectivity returns. Uncached ids skip the preview.
  // Creates stay server-round-trip: the server assigns identity.
  // Direct feature mutations that do not ride the CRUD verbs (the
  // revisioned payload transport, editor feature flows) still owe the
  // shared emission contract: emit the browser-local snapshot and
  // publish the typed invalidation for other sessions. `origin` rides
  // only the local event so the acting surface can skip its own
  // publication (stores README).
  function notifyMutated(typeId = '', id = '', { snapshot = null, change = 'updated', reason = 'update', origin = null } = {}) {
    if (!typeId || !id) return;
    emitInstanceMutation({
      type: typeId,
      id,
      instance: snapshot,
      change,
      reason,
      source: 'local',
      ...(origin !== null ? { origin } : {})
    });
    publishMutation({ type: typeId, id, change, reason });
  }

  async function updateInstance(typeKey = '', id = '', body = {}, { typeId = typeKey, reason = 'update' } = {}) {
    const cacheKey = canonicalTypeKey(typeKey);
    return serializeWrite(cacheKey, id, async () => {
      const previous = recordFor(cacheKey, id)?.dto || null;
      if (previous) {
        const optimistic = applyWirePatch(previous, body);
        upsertRecord(cacheKey, optimistic);
        emitInstanceUpdated({ type: typeId, id, instance: optimistic, reason });
      }
      try {
        const data = await mutateDirect(typeKey, 'PATCH', {
          id,
          body,
          meta: { kind: 'instance', typeId, instanceId: id, change: 'updated', reason }
        });
        emitInstanceUpdated({ type: typeId, id: data?._id || id, instance: data, reason });
        publishMutation({ type: typeId, id: data?._id || id, change: 'updated', reason });
        setWriteState(cacheKey, id, 'confirmed');
        return data;
      } catch (err) {
        if (previous) {
          upsertRecord(cacheKey, previous);
          emitInstanceUpdated({ type: typeId, id, instance: previous, reason: `${reason}-rollback` });
        }
        setWriteState(cacheKey, id, isOfflineQueuedError(err) ? 'queued' : 'rolled-back');
        throw err;
      }
    });
  }

  async function removeInstance(typeKey = '', id = '', { typeId = typeKey, instance = null } = {}) {
    const cacheKey = canonicalTypeKey(typeKey);
    return serializeWrite(cacheKey, id, async () => {
      const previous = recordFor(cacheKey, id)?.dto || null;
      removeRecord(cacheKey, id);
      emitInstanceDeleted({ type: typeId, id, instance: instance || previous });
      try {
        await mutateDirect(typeKey, 'DELETE', {
          id,
          meta: { kind: 'instance', typeId, instanceId: id, change: 'deleted', reason: 'delete' }
        });
        publishMutation({ type: typeId, id, change: 'deleted', reason: 'delete' });
        setWriteState(cacheKey, id, 'confirmed');
      } catch (err) {
        if (previous) {
          upsertRecord(cacheKey, previous);
          emitInstanceUpdated({ type: typeId, id, instance: previous, reason: 'delete-rollback' });
        }
        setWriteState(cacheKey, id, isOfflineQueuedError(err) ? 'queued' : 'rolled-back');
        throw err;
      }
    });
  }

  // -- reconciliation ------------------------------------------------------

  // One listener per store instance (one per Pinia): reconciliation is
  // idempotent, so a re-created store re-attaching under tests is harmless.
  function ensureSyncListener() {
    if (typeof window === 'undefined') return;
    onInstanceChanged(({ type, id, instance, change, source }) => {
      const typeKey = canonicalTypeKey(type);
      const normalizedId = id?.toString?.() || id || instance?._id?.toString?.() || instance?._id;
      if (!typeKey || !normalizedId) return;
      reconcileWriteState(typeKey, normalizedId, source);
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
    writeStateFor,
    upsertRecord,
    removeRecord,
    fetchInstance,
    listInstances,
    resolveReadableReference,
    runAction,
    mutateDirect,
    notifyMutated,
    createInstance,
    updateInstance,
    removeInstance,
    iconFor,
    constructible
  };
});
