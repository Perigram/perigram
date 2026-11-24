import { computed, onScopeDispose, ref, unref, watch } from 'vue';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';
import { useConnections } from './useConnections.js';
import { useAuthStore } from '~/stores/auth';

const CURSOR_COLORS = ['#e11d48', '#0891b2', '#7c3aed', '#ea580c', '#16a34a', '#2563eb', '#c026d3', '#ca8a04'];
const CLAIM_RETRY_LIMIT = 40;
const UPDATE_DELAY = 40;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, ms || 0)));
}

function toBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function colorFor(seed) {
  let hash = 0;
  for (const character of String(seed || '')) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// Per-page collaborative transport (SPEC §26, §19): Yjs documents sync over
// the connections SSE topic `page:<id>`; every client posts updates and pulls
// missed state through the page collab API. The page structure is one Yjs
// document and every text block is its own document, so each block carries
// its own cursor awareness.
export function usePageCollab({ docId }) {
  const id = computed(() => String(unref(docId) || ''));
  const clientToken = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const connections = useConnections();
  const authStore = useAuthStore();
  const user = computed(() => ({
    name: authStore.userData?.name || '',
    id: String(authStore.userData?.userId || '')
  }));
  const controllers = new Map();
  const textControllers = new Map();
  const ready = ref(false);
  let structure = null;
  let structureReady = false;
  let unsubscribe = null;
  let started = false;

  function pageTopic() {
    return id.value ? `page:${id.value}` : '';
  }

  async function request(op, payload = {}) {
    return await $fetch(`/api/pages/${encodeURIComponent(id.value)}/collab`, {
      method: 'POST',
      body: { op, clientToken, ...payload },
      timeout: 8000
    });
  }

  function ensureSubscription() {
    if (unsubscribe || !id.value) return;
    unsubscribe = connections.subscribe(pageTopic(), payload => {
      if (!payload || payload.clientToken === clientToken) return;
      const controller = payload.doc === 'structure'
        ? structure
        : textControllers.get(String(payload.doc || '').replace(/^block:/, ''));
      if (!controller) return;
      if (payload.type === 'yjs' && payload.update) {
        try {
          Y.applyUpdate(controller.doc, fromBase64(payload.update), 'remote');
        } catch {
          /* a malformed broadcast never breaks the local document */
        }
      } else if (payload.type === 'awareness' && controller.awareness && payload.awareness) {
        try {
          applyAwarenessUpdate(controller.awareness, fromBase64(payload.awareness), 'remote');
        } catch {
          /* stale awareness entries are dropped silently */
        }
      }
    });
  }

  function flushUpdate(controller) {
    if (controller.updateTimer) {
      clearTimeout(controller.updateTimer);
      controller.updateTimer = null;
    }
    const update = controller.pendingUpdate;
    controller.pendingUpdate = null;
    if (!update || controller.closed) return;
    request('update', { doc: controller.name, update: toBase64(update) }).catch(() => {});
  }

  function queueUpdate(controller, update) {
    if (controller.closed) return;
    controller.pendingUpdate = controller.pendingUpdate
      ? Y.mergeUpdates([controller.pendingUpdate, update])
      : update;
    if (controller.updateTimer) clearTimeout(controller.updateTimer);
    controller.updateTimer = setTimeout(() => flushUpdate(controller), UPDATE_DELAY);
  }

  function queueAwareness(controller, awareness) {
    if (controller.closed) return;
    controller.pendingAwareness = awareness;
    if (controller.awarenessTimer) return;
    controller.awarenessTimer = setTimeout(() => {
      controller.awarenessTimer = null;
      const payload = controller.pendingAwareness;
      controller.pendingAwareness = null;
      if (!payload || controller.closed) return;
      request('awareness', { doc: controller.name, awareness: toBase64(payload) }).catch(() => {});
    }, UPDATE_DELAY);
  }

  function createController(name, { awareness = false, deferSeed = false } = {}) {
    const controller = {
      name,
      doc: new Y.Doc(),
      awareness: null,
      owner: false,
      initialized: false,
      seeded: false,
      deferSeed,
      closed: false,
      pendingUpdate: null,
      updateTimer: null,
      pendingAwareness: null,
      awarenessTimer: null,
      ready: null,
      resolveReady: null
    };
    controller.ready = new Promise(resolve => { controller.resolveReady = resolve; });
    if (awareness) {
      controller.awareness = new Awareness(controller.doc);
      controller.awareness.setLocalStateField('user', {
        name: user.value.name,
        color: colorFor(user.value.id || clientToken)
      });
      controller.awareness.on('update', ({ added, updated, removed }, origin) => {
        if (origin === 'remote') return;
        const ids = [...added, ...updated, ...removed];
        if (!ids.length) return;
        queueAwareness(controller, encodeAwarenessUpdate(controller.awareness, ids));
      });
    }
    controller.doc.on('update', (update, origin) => {
      if (origin === 'remote') return;
      if (origin === 'seed') return;
      queueUpdate(controller, update);
    });
    controller.markSeeded = () => {
      if (controller.closed || controller.seeded) return;
      controller.seeded = true;
      controller.initialized = true;
      controller.resolveReady();
      flushUpdate(controller);
      request('update', {
        doc: name,
        update: toBase64(Y.encodeStateAsUpdate(controller.doc)),
        seed: true
      }).catch(() => {});
    };
    controller.sync = async () => {
      if (controller.closed) return;
      try {
        const vector = () => toBase64(Y.encodeStateVector(controller.doc));
        const full = () => toBase64(Y.encodeStateAsUpdate(controller.doc));
        let response = await request('sync', { doc: name, stateVector: vector() });
        if (response?.initialized) {
          if (response.update) Y.applyUpdate(controller.doc, fromBase64(response.update), 'remote');
          controller.initialized = true;
          return;
        }
        if (controller.owner && (!controller.deferSeed || controller.seeded)) {
          await request('update', { doc: name, update: full(), seed: true });
          controller.initialized = true;
          return;
        }
        for (let attempt = 0; attempt < 10 && !controller.closed; attempt += 1) {
          const claim = await request('claim', { doc: name });
          if (claim?.owner) {
            controller.owner = true;
            if (controller.deferSeed && !controller.seeded) return;
            await request('update', { doc: name, update: full(), seed: true });
            controller.initialized = true;
            return;
          }
          await delay(claim?.retryAfter || 200);
          response = await request('sync', { doc: name, stateVector: vector() });
          if (response?.initialized) {
            if (response.update) Y.applyUpdate(controller.doc, fromBase64(response.update), 'remote');
            controller.initialized = true;
            return;
          }
        }
      } catch {
        /* the local document stays authoritative until the transport heals */
      }
    };
    controller.destroy = () => {
      controller.closed = true;
      if (controller.updateTimer) clearTimeout(controller.updateTimer);
      if (controller.awarenessTimer) clearTimeout(controller.awarenessTimer);
      if (controller.awareness) {
        const awarenessId = controller.awareness.clientID;
        controller.awareness.setLocalState(null);
        const removal = encodeAwarenessUpdate(controller.awareness, [awarenessId]);
        request('awareness', { doc: name, awareness: toBase64(removal) }).catch(() => {});
        controller.awareness.destroy();
      }
      controller.awareness = null;
      controller.doc.destroy();
      controllers.delete(name);
      if (name.startsWith('block:')) textControllers.delete(name.slice('block:'.length));
    };
    controllers.set(name, controller);
    if (name.startsWith('block:')) textControllers.set(name.slice('block:'.length), controller);
    return controller;
  }

  async function waitUntilInitialized(controller, { seed = null, deferSeed = false } = {}) {
    for (let attempt = 0; attempt < CLAIM_RETRY_LIMIT && !controller.closed; attempt += 1) {
      try {
        const response = await request('sync', {
          doc: controller.name,
          stateVector: toBase64(Y.encodeStateVector(controller.doc))
        });
        if (response?.initialized) {
          if (response.update) Y.applyUpdate(controller.doc, fromBase64(response.update), 'remote');
          controller.initialized = true;
          controller.seeded = true;
          controller.resolveReady();
          return;
        }
        await delay(response?.retryAfter || 250);
        const claim = await request('claim', { doc: controller.name });
        if (claim?.owner) {
          controller.owner = true;
          if (seed) {
            seed(controller.doc);
            controller.markSeeded();
          } else if (!deferSeed) {
            controller.markSeeded();
          } else {
            controller.resolveReady();
          }
          return;
        }
      } catch {
        break;
      }
    }
    if (!controller.closed) {
      controller.owner = true;
      if (seed) {
        seed(controller.doc);
        controller.markSeeded();
      } else if (!deferSeed) {
        controller.markSeeded();
      } else {
        controller.resolveReady();
      }
    }
  }

  async function openController(name, options = {}) {
    const controller = createController(name, options);
    try {
      const claim = await request('claim', { doc: name });
      if (claim?.owner) {
        controller.owner = true;
        if (options.seed) {
          options.seed(controller.doc);
          controller.markSeeded();
        } else if (!options.deferSeed) {
          controller.markSeeded();
        }
      } else if (claim) {
        await waitUntilInitialized(controller, options);
      } else {
        controller.owner = true;
        if (options.seed) {
          options.seed(controller.doc);
          controller.markSeeded();
        } else {
          controller.resolveReady();
        }
      }
    } catch {
      controller.owner = true;
      if (options.seed) {
        options.seed(controller.doc);
        controller.markSeeded();
      } else {
        controller.resolveReady();
      }
    }
    return controller;
  }

  function withStructure(mutator) {
    if (!structureReady || !structure || structure.closed) return;
    const order = structure.doc.getArray('order');
    const blocks = structure.doc.getMap('blocks');
    structure.doc.transact(() => mutator({ order, blocks }), 'local');
  }

  async function start({ seed, apply } = {}) {
    if (started || typeof window === 'undefined' || !id.value) return;
    started = true;
    try {
      ensureSubscription();
      structure = await openController('structure', { seed });
      structureReady = true;
      const order = structure.doc.getArray('order');
      const blocks = structure.doc.getMap('blocks');
      const notify = () => {
        if (!structureReady || !apply) return;
        const keys = order.toArray();
        apply({ order: keys, blocks: keys.map(key => blocks.get(key)).filter(Boolean) });
      };
      order.observe(notify);
      blocks.observe(notify);
      notify();
    } finally {
      ready.value = true;
    }
  }

  function insertBlock(block, at) {
    const value = plain(block);
    withStructure(({ order, blocks }) => {
      blocks.set(value.id, value);
      const index = Math.max(0, Math.min(at, order.length));
      order.insert(index, [value.id]);
    });
  }

  function removeBlock(blockId) {
    withStructure(({ order, blocks }) => {
      const index = order.toArray().indexOf(String(blockId));
      if (index >= 0) order.delete(index, 1);
      blocks.delete(String(blockId));
    });
    textControllers.get(String(blockId))?.destroy();
  }

  function move(key, direction) {
    withStructure(({ order }) => {
      const index = order.toArray().indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= order.length) return;
      order.delete(index, 1);
      order.insert(target, [key]);
    });
  }

  function moveToIndex(key, targetIndex) {
    withStructure(({ order }) => {
      const index = order.toArray().indexOf(key);
      if (index < 0) return;
      const clamped = Math.max(0, Math.min(targetIndex, order.length));
      const destination = index < clamped ? clamped - 1 : clamped;
      order.delete(index, 1);
      order.insert(destination, [key]);
    });
  }

  // The text controller is returned immediately; its claim runs in the
  // background and `ready` settles when the editor may bind it.
  function textBlock(blockId) {
    if (!started || typeof window === 'undefined') return null;
    const key = String(blockId);
    const existing = textControllers.get(key);
    if (existing && !existing.closed) return existing;
    const controller = createController(`block:${key}`, { awareness: true, deferSeed: true });
    (async () => {
      try {
        const claim = await request('claim', { doc: controller.name });
        if (claim?.owner) {
          controller.owner = true;
          controller.resolveReady();
          return;
        }
        if (claim) {
          await waitUntilInitialized(controller, { deferSeed: true });
          return;
        }
      } catch {
        /* fall through to the local-only editor */
      }
      controller.owner = true;
      controller.resolveReady();
    })();
    return controller;
  }

  async function syncAll() {
    await structure?.sync();
    for (const controller of textControllers.values()) {
      await controller.sync();
    }
  }

  watch(() => connections.epoch.value, () => {
    if (!started) return;
    structure?.sync();
    for (const controller of textControllers.values()) controller.sync();
  });

  onScopeDispose(() => {
    unsubscribe?.();
    unsubscribe = null;
    for (const controller of [...controllers.values()]) controller.destroy();
    controllers.clear();
    textControllers.clear();
    structure = null;
    structureReady = false;
    started = false;
    ready.value = false;
  });

  return {
    start,
    ready,
    active: () => started,
    textBlock,
    closeBlock: blockId => textControllers.get(String(blockId))?.destroy(),
    syncAll,
    insertBlock,
    removeBlock,
    move,
    moveToIndex
  };
}
