import {
  normalizeStatusLifecycle,
  normalizeStatusState,
  stateAxesFromStorage,
  statusStateFromStorage
} from './status.js';

export {
  createStatusState,
  getPrimaryState,
  getRegionState,
  getStatusRegions,
  normalizeStatusLifecycle,
  normalizeStatusState
} from './status.js';
export * from './workflows.js';

export function createRegistry({ id = 'app' } = {}) {
  const domains = new Map();
  const commandDefinitions = new Map();
  const taskDefinitions = new Map();
  const eventDefinitions = new Map();
  const instanceServices = new Map();
  const instanceServiceResolvers = [];
  const commandHandlers = new Map();
  const hookHandlers = new Map();
  const projectionHandlers = new Map();

  const registry = {
    id,

    defineDomain(domain) {
      validateDomain(domain);
      domains.set(domain.id, deepFreeze({ ...domain }));
      for (const command of Object.values(domain.commands || {})) registry.defineCommand(command);
      for (const task of Object.values(domain.tasks || {})) registry.defineTask(task);
      for (const event of Object.values(domain.events || {})) registry.defineEvent(event);
      return registry.getDomain(domain.id);
    },

    getDomain(id) {
      return domains.get(id) || null;
    },

    listDomains() {
      return Array.from(domains.values());
    },

    defineCommand(definition) {
      validateCommandDefinition(definition);
      commandDefinitions.set(definition.id, deepFreeze({
        access: { permissions: [], capabilities: [], ...(definition.access || {}) },
        input: { entities: [], parameters: [], ...(definition.input || {}) },
        output: { entities: [], attachments: [], tasks: [], transitions: [], events: [], data: [], ...(definition.output || {}) },
        triggers: [],
        ...definition
      }));
      return registry.getCommandDefinition(definition.id);
    },

    getCommandDefinition(id) {
      return commandDefinitions.get(id) || null;
    },

    listCommandDefinitions() {
      return Array.from(commandDefinitions.values());
    },

    defineTask(definition) {
      validateTaskDefinition(definition);
      taskDefinitions.set(definition.id, deepFreeze({
        input: { entities: [], parameters: [], ...(definition.input || {}) },
        output: { entities: [], attachments: [], tasks: [], events: [], data: [], ...(definition.output || {}) },
        status: {
          queued: 'QUEUED',
          running: 'RUNNING',
          retryWait: 'RETRY_WAIT',
          succeeded: 'SUCCEEDED',
          failed: 'FAILED',
          cancelled: 'CANCELLED',
          ...(definition.status || {})
        },
        retry: { maxAttempts: 3, backoffMs: 30000, ...(definition.retry || {}) },
        ...definition
      }));
      return registry.getTaskDefinition(definition.id);
    },

    getTaskDefinition(id) {
      return taskDefinitions.get(id) || null;
    },

    listTaskDefinitions() {
      return Array.from(taskDefinitions.values());
    },

    defineEvent(definition) {
      validateEventDefinition(definition);
      eventDefinitions.set(definition.id, deepFreeze({
        informational: false,
        payload: [],
        ...definition
      }));
      return registry.getEventDefinition(definition.id);
    },

    getEventDefinition(id) {
      return eventDefinitions.get(id) || null;
    },

    listEventDefinitions() {
      return Array.from(eventDefinitions.values());
    },

    registerInstanceService(type, service) {
      if (!type) throw new Error('Entity service type is required');
      if (!service?.getById) throw new Error(`Entity service ${type} requires getById`);
      instanceServices.set(type, service);
      return service;
    },

    // A resolver is the generic-instance fallback (SPEC §13): consulted on
    // explicit-miss, it binds types that have no hand-registered service —
    // pack types and org-authored types served by the generic per-class
    // instance services.
    registerInstanceServiceResolver(resolver) {
      if (typeof resolver !== 'function') throw new Error('Entity service resolver must be a function');
      instanceServiceResolvers.push(resolver);
      return registry;
    },

    getInstanceService(type) {
      const explicit = instanceServices.get(type);
      if (explicit) return explicit;
      for (const resolver of instanceServiceResolvers) {
        const resolved = resolver(type);
        if (resolved) return resolved;
      }
      return null;
    },

    listInstanceServices() {
      return Array.from(instanceServices.entries()).map(([type, service]) => ({ type, service }));
    },

    registerCommandHandler(id, handler) {
      if (!id) throw new Error('Command handler id is required');
      if (typeof handler !== 'function') throw new Error(`Command handler ${id} must be a function`);
      commandHandlers.set(id, handler);
      return handler;
    },

    getCommandHandler(id) {
      return commandHandlers.get(id) || null;
    },

    registerHookHandler(id, handler) {
      if (!id) throw new Error('Hook handler id is required');
      if (typeof handler !== 'function') throw new Error(`Hook handler ${id} must be a function`);
      hookHandlers.set(id, handler);
      return handler;
    },

    getHookHandler(id) {
      return hookHandlers.get(id) || null;
    },

    // Declared-projection handlers (SPEC §8 p extract): pack-mounted
    // entity→value reads — the one seam beside instance services that may
    // dereference a payload for the graph's extract reads.
    registerProjectionHandler(id, handler) {
      if (!id) throw new Error('Projection handler id is required');
      if (typeof handler !== 'function') throw new Error(`Projection handler ${id} must be a function`);
      projectionHandlers.set(id, handler);
      return handler;
    },

    getProjectionHandler(id) {
      return projectionHandlers.get(id) || null;
    }
  };

  return registry;
}

export const CANONICAL_ENTITY_BLOCKS = Object.freeze([
  'identity',
  'origin',
  'status',
  'lineage',
  'relations',
  'provenance',
  'specs',
  'attachments',
  'data',
  'summary'
]);

export const CANONICAL_BLOCK_SCHEMAS = Object.freeze({
  identity: Object.freeze([
    canonicalBlockField('identity.uid', 'string', { writable: false, constructible: false }),
    canonicalBlockField('identity.name', 'string'),
    canonicalBlockField('identity.slug', 'string'),
    canonicalBlockField('identity.serial', 'string'),
    canonicalBlockField('identity.reference', 'string')
  ]),
  origin: Object.freeze([
    canonicalBlockField('origin.state.primary', 'status'),
    canonicalBlockField('origin.userId', 'string'),
    canonicalBlockField('origin.timestamp', 'dateTime'),
    canonicalBlockField('origin.metadata', 'json'),
    canonicalBlockField('origin.eventId', 'string'),
    canonicalBlockField('origin.lifecycle', 'json')
  ]),
  status: Object.freeze([
    canonicalBlockField('states.main', 'status'),
    canonicalBlockField('status.userId', 'string'),
    canonicalBlockField('status.timestamp', 'dateTime'),
    canonicalBlockField('status.metadata', 'json'),
    canonicalBlockField('status.eventId', 'string'),
    canonicalBlockField('status.lifecycle', 'json')
  ]),
  lineage: Object.freeze([
    canonicalBlockField('lineage', 'map', {
      keyType: canonicalValueType('string', { nullable: false }),
      valueType: canonicalValueType('id', { nullable: false })
    })
  ]),
  relations: Object.freeze([canonicalBlockField('relations', 'json')]),
  provenance: Object.freeze([canonicalBlockField('provenance', 'json')]),
  specs: Object.freeze([canonicalBlockField('specs', 'json')]),
  attachments: Object.freeze([canonicalBlockField('attachments', 'json')]),
  data: Object.freeze([canonicalBlockField('data', 'json')]),
  summary: Object.freeze([canonicalBlockField('summary', 'json')])
});

export const CANONICAL_BLOCK_COMPOSITION = Object.freeze({
  lineage: Object.freeze({ mode: 'ancestors', valueBase: 'entityRef' }),
  relations: Object.freeze({ mode: 'relations', valueBase: 'entityRef' }),
  provenance: Object.freeze({ mode: 'entries', valueBase: 'json' }),
  attachments: Object.freeze({ mode: 'attachments', valueBase: 'attachmentRef' }),
  specs: Object.freeze({ mode: 'entries', valueBase: 'json' }),
  data: Object.freeze({ mode: 'entries', valueBase: 'json' }),
  summary: Object.freeze({ mode: 'entries', valueBase: 'json' })
});

function canonicalBlockField(path, base, qualifiers = {}) {
  const {
    readable = true,
    writable = true,
    constructible = true,
    ...typeQualifiers
  } = qualifiers;
  return Object.freeze({
    path,
    block: String(path).split('.')[0],
    label: path,
    type: Object.freeze(canonicalValueType(base, typeQualifiers)),
    readable,
    writable,
    constructible
  });
}

function canonicalValueType(base, qualifiers = {}) {
  return Object.freeze({ base, shape: 'item', nullable: true, ...qualifiers });
}

export class Identity {
  constructor(uid = null, name = '', slug = '', serial = '', reference = '') {
    if (!uid) throw new Error('Identity: uid is required');
    this.uid = uid;
    this.name = name;
    this.slug = slug || (typeof uid === 'string' && uid.length !== 24 ? uid : '');
    this.serial = serial;
    this.reference = reference;
  }

  toJSON() {
    return { uid: this.uid, name: this.name, slug: this.slug, serial: this.serial, reference: this.reference };
  }
}

export class Status {
  constructor(state, userId = 'SYSTEM', metadata = {}, eventId = null, timestamp = new Date(), lifecycle = {}) {
    if (!state) throw new Error('Status: state is required');
    this.state = normalizeStatusState(state);
    this.userId = userId || 'SYSTEM';
    this.timestamp = timestamp ? new Date(timestamp) : new Date();
    this.metadata = metadata || {};
    this.eventId = eventId;
    this.lifecycle = normalizeStatusLifecycle(lifecycle);
  }

  toJSON() {
    return {
      state: this.state,
      userId: this.userId,
      timestamp: this.timestamp,
      metadata: this.metadata,
      eventId: this.eventId,
      lifecycle: this.lifecycle
    };
  }
}

export class Lineage {
  constructor(raw = {}) {
    for (const [key, value] of Object.entries(raw)) {
      if (value) this[key] = value;
    }
  }

  add(type, id) {
    if (id) this[`${type}Id`] = id;
    return this;
  }

  toJSON() {
    const json = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value !== 'function') json[key] = value;
    }
    return json;
  }
}

export function normalizeInstanceRef(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!value.type || !value.id) return null;
  const ref = {
    type: String(value.type),
    id: value.id.toString()
  };
  if (value.revisionId) ref.revisionId = value.revisionId.toString();
  return ref;
}

export class Relations {
  constructor(raw = {}) {
    for (const [key, value] of Object.entries(raw || {})) {
      if (Array.isArray(value)) {
        const refs = value.map(normalizeInstanceRef).filter(Boolean);
        if (refs.length) this[key] = refs;
        continue;
      }
      const ref = normalizeInstanceRef(value);
      if (ref) this[key] = ref;
    }
  }

  toJSON() {
    return Object.fromEntries(Object.entries(this));
  }
}

export class Provenance {
  constructor(raw = {}) {
    for (const [key, value] of Object.entries(raw || {})) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const source = normalizeInstanceRef(value.source);
      if (!source) continue;
      this[key] = { ...value, source };
    }
  }

  toJSON() {
    return Object.fromEntries(Object.entries(this));
  }
}

export class BaseEntity {
  constructor(raw = {}) {
    this._id = raw.identity?.uid || raw._id || null;
    this.identity = new Identity(
      this._id,
      raw.identity?.name || '',
      raw.identity?.slug || '',
      raw.identity?.serial || '',
      raw.identity?.reference || ''
    );
    this.lineage = new Lineage(raw.lineage || {});
    this.relations = new Relations(raw.relations || {});
    this.provenance = new Provenance(raw.provenance || {});
    this.origin = raw.origin?.state ? new Status(raw.origin.state, raw.origin.userId, raw.origin.metadata, raw.origin.eventId, raw.origin.timestamp, raw.origin.lifecycle) : null;
    // Storage round-trip:
    // toJSON() is the persisted document shape, so the current status block
    // rehydrates from flat persisted `states` when the document carries no
    // `status` block; pre-migration block documents keep parsing unchanged.
    this.status = raw.status?.state
      ? new Status(raw.status.state, raw.status.userId, raw.status.metadata, raw.status.eventId, raw.status.timestamp, raw.status.lifecycle)
      : (raw.states
          ? (() => {
              const state = statusStateFromStorage(raw.states);
              return state
                ? new Status(state, raw.states.userId, raw.states.metadata, raw.states.eventId, raw.states.timestamp, raw.states.lifecycle)
                : null;
            })()
          : null);
    this.specs = raw.specs && typeof raw.specs === 'object' ? raw.specs : null;
    this.attachments = raw.attachments || {};
    this.data = raw.data || {};
    this.summary = raw.summary || {};
  }

  get id() {
    return this._id?.toString();
  }

  get name() {
    return this.identity?.name || '';
  }

  applyStatus(state, userId, metadata = {}, eventId = null, lifecycle = {}) {
    const next = new Status(state, userId, metadata, eventId, null, lifecycle);
    if (!this.origin) this.origin = next;
    this.status = next;
    return this;
  }

  toJSON() {
    return {
      _id: this._id,
      identity: this.identity.toJSON(),
      lineage: this.lineage.toJSON(),
      relations: this.relations.toJSON(),
      provenance: this.provenance.toJSON(),
      origin: this.origin?.toJSON() || null,
      // Wire vocabulary: every active workflow axis is stored as its
      // canonical leaf path; evidence remains one status envelope. The
      // `states` object is not a single primary-state alias.
      states: this.status
        ? {
            ...stateAxesFromStorage(this.status.state?.active || {}),
            userId: this.status.userId,
            timestamp: this.status.timestamp,
            metadata: this.status.metadata,
            eventId: this.status.eventId,
            lifecycle: this.status.lifecycle
          }
        : null,
      specs: this.specs || null,
      attachments: this.attachments,
      data: this.data,
      summary: this.summary
    };
  }
}

export function createInstanceRef(type, id, revisionId = null) {
  if (!type || !id) throw new Error('InstanceRef requires type and id');
  return normalizeInstanceRef({ type, id, revisionId });
}

export function createProvenance(source, facts = {}) {
  const normalizedSource = normalizeInstanceRef(source);
  if (!normalizedSource) throw new Error('Provenance requires a canonical source EntityRef');
  return { ...facts, source: normalizedSource };
}

export function createAttachmentRef({ instanceId, kind, name = '', metadata = {} } = {}) {
  if (!instanceId) throw new Error('AttachmentRef requires instanceId');
  if (!kind) throw new Error('AttachmentRef requires kind');
  return { instanceId: instanceId.toString(), kind, name, metadata };
}

export function createCommandResult({
  commandId,
  ok = true,
  entities = [],
  attachments = [],
  tasks = [],
  transitions = [],
  events = [],
  effects = [],
  data = {},
  raw = null,
  error = null
} = {}) {
  if (!commandId) throw new Error('CommandResult requires commandId');
  return { ok, commandId, entities, attachments, tasks, transitions, events, effects, data, raw, error };
}

const ENTITY_OUTPUT_OWNERS = new Set(['commandOwned', 'graphOwned']);
const ENTITY_OUTPUT_TIMINGS = new Set(['immediate', 'completion']);

export function normalizeEntityOutputContracts(output = {}) {
  const declared = Array.isArray(output?.entities) ? output.entities : [];
  return declared.map(entry => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Declared entity output ${JSON.stringify(entry)} must be a { type, persistenceOwner, timing } record`);
    }
    if (!entry.type) throw new Error('Declared entity output requires type');
    if (!ENTITY_OUTPUT_OWNERS.has(entry.persistenceOwner)) {
      throw new Error(`Declared entity output ${entry.type} requires persistenceOwner 'commandOwned' or 'graphOwned'`);
    }
    if (!ENTITY_OUTPUT_TIMINGS.has(entry.timing)) {
      throw new Error(`Declared entity output ${entry.type} requires timing 'immediate' or 'completion'`);
    }
    return { type: entry.type, persistenceOwner: entry.persistenceOwner, timing: entry.timing };
  });
}

export function validateResultEntityOutputs({ contracts = [], entities = [], phase = 'immediate' } = {}) {
  const byType = new Map(contracts.map(contract => [contract.type, contract]));
  const violations = [];
  for (const entry of entities || []) {
    const type = String(entry?.type || '');
    const contract = byType.get(type);
    if (!contract) {
      violations.push(`Result carries undeclared entity output ${type || '<missing type>'}`);
      continue;
    }
    if (phase === 'immediate' && contract.timing === 'completion') {
      violations.push(`Entity output ${type} is completion-timed and cannot populate an immediate result`);
    }
    if (contract.persistenceOwner === 'commandOwned' && !entry.id) {
      violations.push(`Command-owned entity output ${type} must return a persisted entity reference`);
    }
    if (contract.persistenceOwner === 'graphOwned' && entry.id) {
      violations.push(`Graph-owned entity output ${type} must not return a persisted entity; route raw construction data to an explicit persistence node`);
    }
  }
  return violations;
}

export function createTaskResult({
  taskId,
  ok = true,
  entities = [],
  attachments = [],
  tasks = [],
  events = [],
  effects = [],
  data = {},
  raw = null,
  error = null
} = {}) {
  if (!taskId) throw new Error('TaskResult requires taskId');
  return { ok, taskId, entities, attachments, tasks, events, effects, data, raw, error };
}

export const createIdentity = (name, slug = '', serial = '', reference = '', uid = slug || name) => new Identity(uid, name, slug, serial, reference);
export const createStatus = (state, userId = 'SYSTEM', metadata = {}, eventId = null, lifecycle = {}) => new Status(state, userId, metadata, eventId, null, lifecycle);
export const createData = (data = {}) => ({ ...data });
export const inheritLineage = (parent, type, mapId = value => value) => new Lineage(parent?.lineage || {}).add(type, mapId(parent?.identity?.uid || parent?._id));
export const createAttachment = (kind, fileId, name = '', metadata = {}) => ({ kind, fileId, name, metadata, timestamp: new Date() });

export function validateDomain(domain) {
  if (!domain?.id) throw new Error('Domain requires id');
}

export function validateCommandDefinition(definition) {
  if (!definition?.id) throw new Error('Command definition requires id');
  if (!definition?.service) throw new Error(`Command ${definition.id} requires service`);
  if (!definition?.action) throw new Error(`Command ${definition.id} requires action`);
}

export function validateTaskDefinition(definition) {
  if (!definition?.id) throw new Error('Task definition requires id');
  if (!definition?.service) throw new Error(`Task ${definition.id} requires service`);
  if (!definition?.executor) throw new Error(`Task ${definition.id} requires executor`);
}

export function validateEventDefinition(definition) {
  if (!definition?.id) throw new Error('Event definition requires id');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}
