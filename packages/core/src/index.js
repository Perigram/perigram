export function createRegistry({ id = 'app' } = {}) {
  const domains = new Map();
  const entityDefinitions = new Map();
  const workflowDefinitions = new Map();
  const commandDefinitions = new Map();
  const taskDefinitions = new Map();
  const eventDefinitions = new Map();
  const hookDefinitions = new Map();
  const effectDefinitions = new Map();
  const attachmentKindDefinitions = new Map();
  const entityServices = new Map();
  const commandHandlers = new Map();
  const taskExecutors = new Map();
  const hookHandlers = new Map();
  const adapters = new Map();

  const registry = {
    id,

    defineDomain(domain) {
      validateDomain(domain);
      domains.set(domain.id, deepFreeze({ ...domain }));
      for (const entity of domain.entities || []) registry.defineEntity(entity);
      for (const [entityType, workflow] of Object.entries(domain.workflows || {})) registry.defineWorkflow({ entityType, ...workflow });
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
      validateEntityDefinition(definition);
      entityDefinitions.set(definition.type, deepFreeze({ ...definition }));
      return registry.getEntityDefinition(definition.type);
    },

    getEntityDefinition(type) {
      return entityDefinitions.get(type) || null;
    },

    listEntityDefinitions() {
      return Array.from(entityDefinitions.values());
    },

    defineWorkflow(definition) {
      validateWorkflowDefinition(definition);
      workflowDefinitions.set(definition.entityType, deepFreeze({ ...definition }));
      return registry.getWorkflowDefinition(definition.entityType);
    },

    getWorkflowDefinition(entityType) {
      return workflowDefinitions.get(entityType) || null;
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

    registerEntityService(type, service) {
      if (!type) throw new Error('Entity service type is required');
      if (!service?.getById) throw new Error(`Entity service ${type} requires getById`);
      entityServices.set(type, service);
      return service;
    },

    getEntityService(type) {
      return entityServices.get(type) || null;
    },

    listEntityServices() {
      return Array.from(entityServices.entries()).map(([type, service]) => ({ type, service }));
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

export const createCutkitRegistry = createRegistry;

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
    this.state = state;
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
    this.origin = raw.origin?.state ? new Status(raw.origin.state, raw.origin.userId, raw.origin.metadata, raw.origin.eventId, raw.origin.timestamp, raw.origin.lifecycle) : null;
    this.status = raw.status?.state ? new Status(raw.status.state, raw.status.userId, raw.status.metadata, raw.status.eventId, raw.status.timestamp, raw.status.lifecycle) : null;
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
      origin: this.origin?.toJSON() || null,
      status: this.status?.toJSON() || null,
      specs: this.specs?.toJSON() || null,
      attachments: this.attachments,
      data: this.data,
      summary: this.summary
    };
  }
}

export function createEntityRef(type, id) {
  if (!type || !id) throw new Error('EntityRef requires type and id');
  return { type, id: id.toString() };
}

export function createAttachmentRef({ entityId, kind, name = '', metadata = {} } = {}) {
  if (!entityId) throw new Error('AttachmentRef requires entityId');
  if (!kind) throw new Error('AttachmentRef requires kind');
  return { entityId: entityId.toString(), kind, name, metadata };
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

export function validateEntityDefinition(definition) {
  if (!definition?.type) throw new Error('Entity definition requires type');
}

export function validateWorkflowDefinition(definition) {
  if (!definition?.entityType) throw new Error('Workflow definition requires entityType');
  if (!definition?.initial) throw new Error(`Workflow ${definition.entityType} requires initial state`);
  if (!definition?.states || typeof definition.states !== 'object') throw new Error(`Workflow ${definition.entityType} requires states`);
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
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object' && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}
