export function createCutkitRegistry({ id = 'default' } = {}) {
  const entityDefinitions = new Map();
  const services = new Map();
  const entityServiceContracts = new Map();
  const serviceContracts = new Map();
  const serviceActionDefinitions = new Map();
  const serviceActionHandlers = new Map();
  const processDefinitions = new Map();
  const processExecutors = new Map();
  const hookHandlers = new Map();
  const domains = new Map();
  const artifactTypeDefinitions = new Map();

  const registry = {
    id,

    defineEntity(definition) {
      if (!definition?.type) throw new Error('Entity definition requires type');
      entityDefinitions.set(definition.type, Object.freeze({ ...definition }));
      return registry.getEntityDefinition(definition.type);
    },

    defineDomain(domain) {
      if (!domain?.id) throw new Error('Domain requires id');
      domains.set(domain.id, Object.freeze({ ...domain }));

      for (const entity of domain.entities || []) registry.defineEntity(entity);
      for (const contract of Object.values(domain.services || {})) registry.defineServiceContract(contract);
      for (const action of Object.values(domain.operations || domain.serviceActions || {})) registry.defineServiceAction(action);
      for (const process of Object.values(domain.processes || {})) registry.defineProcess(process);
      for (const artifactType of Object.values(domain.artifacts || domain.artifactTypes || {})) registry.defineArtifactType(artifactType);

      return registry.getDomain(domain.id);
    },

    getDomain(id) {
      return domains.get(id) || null;
    },

    listDomains() {
      return Array.from(domains.values());
    },

    getEntityDefinition(type) {
      return entityDefinitions.get(type) || null;
    },

    listEntityDefinitions() {
      return Array.from(entityDefinitions.values());
    },

    registerService(type, service) {
      services.set(type, service);
      return service;
    },

    registerEntityService(type, service) {
      if (!type) throw new Error('Entity service type is required');
      if (!service?.getById) throw new Error(`Entity service ${type} requires getById`);
      services.set(type, service);
      return service;
    },

    getService(type) {
      return services.get(type) || null;
    },

    listServices() {
      return Array.from(services.entries()).map(([type, service]) => ({ type, service }));
    },

    clearServices() {
      services.clear();
    },

    defineEntityServiceContract(definition) {
      if (!definition?.type) throw new Error('Entity service contract requires type');
      entityServiceContracts.set(definition.type, Object.freeze({
        operations: ['getById', 'list', 'create', 'update', 'remove', 'transition'],
        ...definition
      }));
      return registry.getEntityServiceContract(definition.type);
    },

    getEntityServiceContract(type) {
      return entityServiceContracts.get(type) || null;
    },

    listEntityServiceContracts() {
      return Array.from(entityServiceContracts.values());
    },

    defineServiceContract(definition) {
      if (!definition?.service) throw new Error('Service contract requires service');
      serviceContracts.set(definition.service, Object.freeze({
        actions: [],
        triggers: [],
        ...definition
      }));
      return registry.getServiceContract(definition.service);
    },

    getServiceContract(service) {
      return serviceContracts.get(service) || null;
    },

    listServiceContracts() {
      return Array.from(serviceContracts.values());
    },

    defineServiceAction(definition) {
      if (!definition?.id) throw new Error('Service action requires id');
      if (!definition?.service) throw new Error(`Service action ${definition.id} requires service`);
      if (!definition?.action) throw new Error(`Service action ${definition.id} requires action`);
      serviceActionDefinitions.set(definition.id, Object.freeze({
        access: { permissions: [], capabilities: [], ...(definition.access || {}) },
        input: { entities: [], parameters: [], ...(definition.input || {}) },
        output: { entities: [], artifacts: [], jobs: [], transitions: [], events: [], ...(definition.output || {}) },
        triggers: [],
        ...definition
      }));
      return registry.getServiceActionDefinition(definition.id);
    },

    getServiceActionDefinition(id) {
      return serviceActionDefinitions.get(id) || null;
    },

    listServiceActionDefinitions() {
      return Array.from(serviceActionDefinitions.values());
    },

    defineProcess(definition) {
      if (!definition?.id) throw new Error('Process definition requires id');
      if (!definition?.service) throw new Error(`Process ${definition.id} requires service`);
      processDefinitions.set(definition.id, Object.freeze({
        input: { entities: [], parameters: [], ...(definition.input || {}) },
        output: { entities: [], artifacts: [], jobs: [], events: [], data: [], ...(definition.output || {}) },
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
      return registry.getProcessDefinition(definition.id);
    },

    getProcessDefinition(id) {
      return processDefinitions.get(id) || null;
    },

    listProcessDefinitions() {
      return Array.from(processDefinitions.values());
    },

    registerProcessExecutor(id, executor) {
      if (!id) throw new Error('Process executor id is required');
      if (typeof executor !== 'function') throw new Error(`Process executor ${id} must be a function`);
      processExecutors.set(id, executor);
      return executor;
    },

    getProcessExecutor(id) {
      return processExecutors.get(id) || null;
    },

    defineArtifactType(definition) {
      if (!definition?.type) throw new Error('Artifact type definition requires type');
      artifactTypeDefinitions.set(definition.type, Object.freeze({
        preview: { kind: 'download', ...(definition.preview || {}) },
        ...definition
      }));
      return registry.getArtifactTypeDefinition(definition.type);
    },

    getArtifactTypeDefinition(type) {
      return artifactTypeDefinitions.get(type) || null;
    },

    listArtifactTypeDefinitions() {
      return Array.from(artifactTypeDefinitions.values());
    },

    registerServiceActionHandler(id, handler) {
      if (!id) throw new Error('Service action handler id is required');
      if (typeof handler !== 'function') throw new Error(`Service action handler ${id} must be a function`);
      serviceActionHandlers.set(id, handler);
      return handler;
    },

    getServiceActionHandler(id) {
      return serviceActionHandlers.get(id) || null;
    },

    clearServiceActionHandlers() {
      serviceActionHandlers.clear();
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
    }
  };

  return registry;
}

const defaultRegistry = createCutkitRegistry({ id: 'default-compat' });

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

  async getAncestor(type) {
    const uid = this.lineage[`${type}Id`] || this.lineage[`${type}Uid`] || this.lineage[type];
    if (!uid) return null;
    const service = getService(type);
    if (!service) return null;
    return await service.getById(uid);
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

export function defineEntity(definition) {
  return defaultRegistry.defineEntity(definition);
}

export function defineDomain(domain) {
  return defaultRegistry.defineDomain(domain);
}

export function getDomain(id) {
  return defaultRegistry.getDomain(id);
}

export function listDomains() {
  return defaultRegistry.listDomains();
}

export function getEntityDefinition(type) {
  return defaultRegistry.getEntityDefinition(type);
}

export function listEntityDefinitions() {
  return defaultRegistry.listEntityDefinitions();
}

export function registerService(type, service) {
  return defaultRegistry.registerService(type, service);
}

export function getService(type) {
  return defaultRegistry.getService(type);
}

export function listServices() {
  return defaultRegistry.listServices();
}

export function clearServices() {
  defaultRegistry.clearServices();
}

export function defineEntityServiceContract(definition) {
  return defaultRegistry.defineEntityServiceContract(definition);
}

export function getEntityServiceContract(type) {
  return defaultRegistry.getEntityServiceContract(type);
}

export function listEntityServiceContracts() {
  return defaultRegistry.listEntityServiceContracts();
}

export function registerEntityService(type, service) {
  return defaultRegistry.registerEntityService(type, service);
}

export function defineServiceContract(definition) {
  return defaultRegistry.defineServiceContract(definition);
}

export function getServiceContract(service) {
  return defaultRegistry.getServiceContract(service);
}

export function listServiceContracts() {
  return defaultRegistry.listServiceContracts();
}

export function defineServiceAction(definition) {
  return defaultRegistry.defineServiceAction(definition);
}

export function getServiceActionDefinition(id) {
  return defaultRegistry.getServiceActionDefinition(id);
}

export function listServiceActionDefinitions() {
  return defaultRegistry.listServiceActionDefinitions();
}

export function defineProcess(definition) {
  return defaultRegistry.defineProcess(definition);
}

export function getProcessDefinition(id) {
  return defaultRegistry.getProcessDefinition(id);
}

export function listProcessDefinitions() {
  return defaultRegistry.listProcessDefinitions();
}

export function registerProcessExecutor(id, executor) {
  return defaultRegistry.registerProcessExecutor(id, executor);
}

export function getProcessExecutor(id) {
  return defaultRegistry.getProcessExecutor(id);
}

export function defineArtifactType(definition) {
  return defaultRegistry.defineArtifactType(definition);
}

export function getArtifactTypeDefinition(type) {
  return defaultRegistry.getArtifactTypeDefinition(type);
}

export function listArtifactTypeDefinitions() {
  return defaultRegistry.listArtifactTypeDefinitions();
}

export function registerServiceActionHandler(id, handler) {
  return defaultRegistry.registerServiceActionHandler(id, handler);
}

export function getServiceActionHandler(id) {
  return defaultRegistry.getServiceActionHandler(id);
}

export function clearServiceActionHandlers() {
  defaultRegistry.clearServiceActionHandlers();
}

export function registerHookHandler(id, handler) {
  return defaultRegistry.registerHookHandler(id, handler);
}

export function getHookHandler(id) {
  return defaultRegistry.getHookHandler(id);
}

export function listHookHandlers() {
  return defaultRegistry.listHookHandlers();
}

export function createEntityRef(type, id) {
  if (!type || !id) throw new Error('EntityRef requires type and id');
  return { type, id: id.toString() };
}

export function createServiceActionResult({
  actionId,
  ok = true,
  entities = [],
  artifacts = [],
  jobs = [],
  transitions = [],
  events = [],
  data = {},
  error = null
} = {}) {
  if (!actionId) throw new Error('ServiceActionResult requires actionId');
  return { ok, actionId, entities, artifacts, jobs, transitions, events, data, error };
}

export function createProcessResult({
  processId,
  ok = true,
  entities = [],
  artifacts = [],
  jobs = [],
  events = [],
  data = {},
  error = null
} = {}) {
  if (!processId) throw new Error('ProcessResult requires processId');
  return { ok, processId, entities, artifacts, jobs, events, data, error };
}

export const createIdentity = (name, slug = '', serial = '', reference = '', uid = slug || name) => new Identity(uid, name, slug, serial, reference);
export const createStatus = (state, userId = 'SYSTEM', metadata = {}, eventId = null, lifecycle = {}) => new Status(state, userId, metadata, eventId, null, lifecycle);
export const createSpecs = (data = {}) => new Specs(data);
export const createData = (data = {}) => ({ ...data });
export const inheritLineage = (parent, type, mapId = value => value) => new Lineage(parent?.lineage || {}).add(type, mapId(parent?.identity?.uid || parent?._id));
export const createAttachment = (type, fileId, name = '', metadata = {}) => ({ type, fileId, name, metadata, timestamp: new Date() });
