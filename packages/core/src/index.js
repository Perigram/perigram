const entityDefinitions = new Map();
const services = new Map();
const entityServiceContracts = new Map();
const serviceContracts = new Map();
const serviceActionDefinitions = new Map();
const serviceActionHandlers = new Map();

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
  if (!definition?.type) throw new Error('Entity definition requires type');
  entityDefinitions.set(definition.type, Object.freeze({ ...definition }));
  return getEntityDefinition(definition.type);
}

export function getEntityDefinition(type) {
  return entityDefinitions.get(type) || null;
}

export function listEntityDefinitions() {
  return Array.from(entityDefinitions.values());
}

export function registerService(type, service) {
  services.set(type, service);
}

export function getService(type) {
  return services.get(type) || null;
}

export function clearServices() {
  services.clear();
}

export function defineEntityServiceContract(definition) {
  if (!definition?.type) throw new Error('Entity service contract requires type');
  entityServiceContracts.set(definition.type, Object.freeze({
    operations: ['getById', 'list', 'create', 'update', 'remove', 'transition'],
    ...definition
  }));
  return getEntityServiceContract(definition.type);
}

export function getEntityServiceContract(type) {
  return entityServiceContracts.get(type) || null;
}

export function listEntityServiceContracts() {
  return Array.from(entityServiceContracts.values());
}

export function registerEntityService(type, service) {
  if (!type) throw new Error('Entity service type is required');
  if (!service?.getById) throw new Error(`Entity service ${type} requires getById`);
  services.set(type, service);
  return service;
}

export function defineServiceContract(definition) {
  if (!definition?.service) throw new Error('Service contract requires service');
  serviceContracts.set(definition.service, Object.freeze({
    actions: [],
    triggers: [],
    ...definition
  }));
  return getServiceContract(definition.service);
}

export function getServiceContract(service) {
  return serviceContracts.get(service) || null;
}

export function listServiceContracts() {
  return Array.from(serviceContracts.values());
}

export function defineServiceAction(definition) {
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
  return getServiceActionDefinition(definition.id);
}

export function getServiceActionDefinition(id) {
  return serviceActionDefinitions.get(id) || null;
}

export function listServiceActionDefinitions() {
  return Array.from(serviceActionDefinitions.values());
}

export function registerServiceActionHandler(id, handler) {
  if (!id) throw new Error('Service action handler id is required');
  if (typeof handler !== 'function') throw new Error(`Service action handler ${id} must be a function`);
  serviceActionHandlers.set(id, handler);
  return handler;
}

export function getServiceActionHandler(id) {
  return serviceActionHandlers.get(id) || null;
}

export function clearServiceActionHandlers() {
  serviceActionHandlers.clear();
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

export const createIdentity = (name, slug = '', serial = '', reference = '', uid = slug || name) => new Identity(uid, name, slug, serial, reference);
export const createStatus = (state, userId = 'SYSTEM', metadata = {}, eventId = null, lifecycle = {}) => new Status(state, userId, metadata, eventId, null, lifecycle);
export const createSpecs = (data = {}) => new Specs(data);
export const createData = (data = {}) => ({ ...data });
export const inheritLineage = (parent, type, mapId = value => value) => new Lineage(parent?.lineage || {}).add(type, mapId(parent?.identity?.uid || parent?._id));
export const createAttachment = (type, fileId, name = '', metadata = {}) => ({ type, fileId, name, metadata, timestamp: new Date() });
