export function createRegistry({ id = 'app' } = {}) {
  const domains = new Map();
  const instanceDefinitions = new Map();
  const workflowDefinitions = new Map();
  const commandDefinitions = new Map();
  const taskDefinitions = new Map();
  const eventDefinitions = new Map();
  const hookDefinitions = new Map();
  const effectDefinitions = new Map();
  const attachmentKindDefinitions = new Map();
  const instanceServices = new Map();
  const instanceServiceResolvers = [];
  const commandHandlers = new Map();
  const taskExecutors = new Map();
  const hookHandlers = new Map();
  const projectionHandlers = new Map();
  const adapters = new Map();

  const registry = {
    id,

    defineDomain(domain) {
      validateDomain(domain);
      domains.set(domain.id, deepFreeze({ ...domain }));
      for (const entity of domain.entities || []) registry.defineEntity(entity);
      for (const [typeId, workflow] of Object.entries(domain.workflows || {})) registry.defineWorkflow({ typeId, ...workflow });
      for (const command of Object.values(domain.commands || {})) registry.defineCommand(command);
      for (const task of Object.values(domain.tasks || {})) registry.defineTask(task);
      for (const event of Object.values(domain.events || {})) registry.defineEvent(event);
      for (const hook of Object.values(domain.hooks || {})) registry.defineHook(hook);
      for (const effect of Object.values(domain.effects || {})) registry.defineEffect(effect);
      for (const kind of Object.values(domain.attachmentKinds || {})) registry.defineAttachmentKind(kind);
      return registry.getDomain(domain.id);
    },

    getDomain(id) {
      return domains.get(id) || null;
    },

    listDomains() {
      return Array.from(domains.values());
    },

    defineEntity(definition) {
      validateInstanceDefinition(definition);
      instanceDefinitions.set(definition.type, deepFreeze({ ...definition }));
      return registry.getInstanceDefinition(definition.type);
    },

    getInstanceDefinition(type) {
      return instanceDefinitions.get(type) || null;
    },

    listInstanceDefinitions() {
      return Array.from(instanceDefinitions.values());
    },

    defineWorkflow(definition) {
      validateWorkflowDefinition(definition);
      workflowDefinitions.set(definition.typeId, deepFreeze({ ...definition }));
      return registry.getWorkflowDefinition(definition.typeId);
    },

    getWorkflowDefinition(typeId) {
      return workflowDefinitions.get(typeId) || null;
    },

    listWorkflowDefinitions() {
      return Array.from(workflowDefinitions.values());
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

    defineHook(definition) {
      validateHookDefinition(definition);
      hookDefinitions.set(definition.id, deepFreeze({ parameters: [], ...definition }));
      return registry.getHookDefinition(definition.id);
    },

    getHookDefinition(id) {
      return hookDefinitions.get(id) || null;
    },

    listHookDefinitions() {
      return Array.from(hookDefinitions.values());
    },

    defineEffect(definition) {
      validateEffectDefinition(definition);
      effectDefinitions.set(definition.id, deepFreeze({
        effects: [],
        ...definition
      }));
      return registry.getEffectDefinition(definition.id);
    },

    getEffectDefinition(id) {
      return effectDefinitions.get(id) || null;
    },

    listEffectDefinitions() {
      return Array.from(effectDefinitions.values());
    },

    defineAttachmentKind(definition) {
      validateAttachmentKindDefinition(definition);
      attachmentKindDefinitions.set(definition.kind, deepFreeze({
        preview: { mode: 'download', ...(definition.preview || {}) },
        ...definition
      }));
      return registry.getAttachmentKindDefinition(definition.kind);
    },

    getAttachmentKindDefinition(kind) {
      return attachmentKindDefinitions.get(kind) || null;
    },

    listAttachmentKindDefinitions() {
      return Array.from(attachmentKindDefinitions.values());
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

    registerTaskExecutor(id, executor) {
      if (!id) throw new Error('Task executor id is required');
      if (typeof executor !== 'function') throw new Error(`Task executor ${id} must be a function`);
      taskExecutors.set(id, executor);
      return executor;
    },

    getTaskExecutor(id) {
      return taskExecutors.get(id) || null;
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
    },

    listHookHandlers() {
      return Array.from(hookHandlers.entries()).map(([hookId, handler]) => ({ hookId, handler }));
    },

    registerAdapter(id, adapter) {
      if (!id) throw new Error('Adapter id is required');
      adapters.set(id, adapter);
      return adapter;
    },

    getAdapter(id) {
      return adapters.get(id) || null;
    }
  };

  return registry;
}

export const createPerigramRegistry = createRegistry;

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
  specs: Object.freeze([
    canonicalBlockField('specs.width', 'number', { unit: 'mm' }),
    canonicalBlockField('specs.length', 'number', { unit: 'mm' }),
    canonicalBlockField('specs.area', 'number', { unit: 'm2' }),
    canonicalBlockField('specs.sheetThickness', 'number', { unit: 'mm' }),
    canonicalBlockField('specs.foilThickness', 'number', { unit: 'mm' })
  ]),
  attachments: Object.freeze([canonicalBlockField('attachments', 'json')]),
  data: Object.freeze([canonicalBlockField('data', 'json')]),
  summary: Object.freeze([canonicalBlockField('summary', 'json')])
});

export const CANONICAL_BLOCK_COMPOSITION = Object.freeze({
  lineage: Object.freeze({ mode: 'ancestors', valueBase: 'entityRef' }),
  relations: Object.freeze({ mode: 'relations', valueBase: 'entityRef' }),
  provenance: Object.freeze({ mode: 'entries', valueBase: 'json' }),
  attachments: Object.freeze({ mode: 'attachments', valueBase: 'attachmentRef' }),
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

export function normalizeStatusLifecycle(lifecycle = {}) {
  const source = lifecycle && typeof lifecycle === 'object' ? lifecycle : {};
  return {
    actors: Array.isArray(source.actors) ? source.actors : [],
    attachments: source.attachments && typeof source.attachments === 'object' ? source.attachments : {},
    data: source.data && typeof source.data === 'object' ? source.data : {}
  };
}

export function normalizeStatusState(state, { region = 'main' } = {}) {
  if (state && typeof state === 'object' && state.schemaVersion === 2) {
    const primary = state.primary || getFirstActiveState(state.active) || 'UNKNOWN';
    const active = normalizeActiveStates(state.active || { [region]: primary });
    const regions = normalizeStateRegions(state.regions || {}, active);
    return {
      schemaVersion: 2,
      primary,
      active,
      regions
    };
  }

  const primary = typeof state === 'string' ? state : String(state || 'UNKNOWN');
  return {
    schemaVersion: 2,
    primary,
    active: { [region]: primary },
    regions: {
      [region]: { state: primary, path: [primary] }
    }
  };
}

export function createStatusState(primary, options = {}) {
  return normalizeStatusState({
    schemaVersion: 2,
    primary,
    active: options.active || { [options.region || 'main']: primary },
    regions: options.regions || {
      [options.region || 'main']: {
        state: primary,
        path: Array.isArray(options.path) && options.path.length ? options.path : [primary]
      }
    }
  });
}

export function getPrimaryState(statusOrState, fallback = 'UNKNOWN') {
  const state = statusOrState?.state ?? statusOrState;
  if (typeof state === 'string') return state || fallback;
  if (state && typeof state === 'object') {
    if (typeof state.main === 'string') return state.main || fallback;
    return state.primary || getFirstActiveState(state.active) || fallback;
  }
  return fallback;
}

export function getRegionState(statusOrState, region = 'main', fallback = null) {
  const state = statusOrState?.state ?? statusOrState;
  if (typeof state === 'string') return region === 'main' ? state : fallback;
  if (!state || typeof state !== 'object') return fallback;
  return state.active?.[region] || state.regions?.[region]?.state || (region === 'main' ? getPrimaryState(state, fallback) : fallback);
}

export function getStatusRegions(statusOrState) {
  const state = normalizeStatusState(statusOrState?.state ?? statusOrState);
  return Object.entries(state.regions || {}).map(([id, region]) => ({
    id,
    state: region.state || state.active?.[id] || state.primary,
    path: Array.isArray(region.path) ? region.path : [region.state || state.active?.[id] || state.primary],
    label: region.label || id
  }));
}

function normalizeActiveStates(active = {}) {
  return Object.fromEntries(Object.entries(active)
    .filter(([key, value]) => key && value)
    .map(([key, value]) => [key, typeof value === 'string' ? value : String(value)]));
}

function normalizeStateRegions(regions = {}, active = {}) {
  const entries = Object.entries(regions)
    .filter(([key]) => key)
    .map(([key, value]) => {
      const regionState = value?.state || active[key] || 'UNKNOWN';
      return [key, {
        ...(value && typeof value === 'object' ? value : {}),
        state: regionState,
        path: Array.isArray(value?.path) && value.path.length ? value.path : [regionState]
      }];
    });
  const normalized = Object.fromEntries(entries);
  for (const [key, value] of Object.entries(active)) {
    if (!normalized[key]) normalized[key] = { state: value, path: [value] };
  }
  return normalized;
}

function getFirstActiveState(active = {}) {
  return Object.values(active || {}).find(Boolean) || null;
}

const STATUS_EVIDENCE_KEYS = new Set(['userId', 'timestamp', 'metadata', 'eventId', 'lifecycle']);

function stateAxesFromStorage(states = {}) {
  return Object.fromEntries(Object.entries(states || {})
    .filter(([key, value]) => key && !STATUS_EVIDENCE_KEYS.has(key) && typeof value === 'string' && value));
}

function statusStateFromStorage(states = {}) {
  const active = stateAxesFromStorage(states);
  if (!Object.keys(active).length) return null;
  const primary = active.main || Object.values(active)[0];
  return {
    schemaVersion: 2,
    primary,
    active,
    regions: Object.fromEntries(Object.entries(active).map(([region, value]) => [region, {
      state: value,
      path: value.split('.').filter(Boolean)
    }]))
  };
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

export class Specs {
  constructor(raw = {}) {
    this.sheetThickness = Number(raw.sheetThickness || 0);
    this.foilThickness = Number(raw.foilThickness || 0);
    this.width = Number(raw.width || 0);
    this.length = Number(raw.length || 0);
    this.area = Number(raw.area || (this.width * this.length) / 1000000 || 0);
  }

  toJSON() {
    return {
      sheetThickness: this.sheetThickness,
      foilThickness: this.foilThickness,
      width: this.width,
      length: this.length,
      area: this.area
    };
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
    // Storage round-trip (canonical contract in server/core/blocks/README.md):
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
    this.specs = raw.specs ? new Specs(raw.specs) : null;
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
      specs: this.specs?.toJSON() || null,
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
export const createSpecs = (data = {}) => new Specs(data);
export const createData = (data = {}) => ({ ...data });
export const inheritLineage = (parent, type, mapId = value => value) => new Lineage(parent?.lineage || {}).add(type, mapId(parent?.identity?.uid || parent?._id));
export const createAttachment = (kind, fileId, name = '', metadata = {}) => ({ kind, fileId, name, metadata, timestamp: new Date() });

export function validateDomain(domain) {
  if (!domain?.id) throw new Error('Domain requires id');
}

export function validateInstanceDefinition(definition) {
  if (!definition?.type) throw new Error('Entity definition requires type');
}

export function validateWorkflowDefinition(definition) {
  if (!definition?.typeId) throw new Error('Workflow definition requires typeId');
  if (!definition?.regions && !definition?.initial) throw new Error(`Workflow ${definition.typeId} requires regions or initial state`);
  if (definition.regions && typeof definition.regions !== 'object') throw new Error(`Workflow ${definition.typeId} regions must be an object`);
  if (!definition.regions && (!definition?.states || typeof definition.states !== 'object')) throw new Error(`Workflow ${definition.typeId} requires states`);
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

export function validateHookDefinition(definition) {
  if (!definition?.id) throw new Error('Hook definition requires id');
}

export function validateEffectDefinition(definition) {
  if (!definition?.id) throw new Error('Effect definition requires id');
  if (!definition?.on) throw new Error(`Effect ${definition.id} requires on`);
}

export function validateAttachmentKindDefinition(definition) {
  if (!definition?.kind) throw new Error('Attachment kind definition requires kind');
  const creationMode = definition.creation?.mode || 'workflow';
  if (!['upload', 'capture', 'editor', 'command', 'workflow'].includes(creationMode)) {
    throw new Error(`Attachment kind ${definition.kind} has invalid creation mode ${creationMode}`);
  }
  if (creationMode === 'command' && !definition.creation?.commandId) {
    throw new Error(`Attachment kind ${definition.kind} command creation requires commandId`);
  }
  const editorMode = definition.editor?.mode || 'none';
  if (!['none', 'text', 'csv', 'layout', 'sketch'].includes(editorMode)) {
    throw new Error(`Attachment kind ${definition.kind} has invalid editor mode ${editorMode}`);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}
