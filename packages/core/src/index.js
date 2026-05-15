const entityDefinitions = new Map();
const services = new Map();

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
  constructor(state, userId = 'SYSTEM', metadata = {}, eventId = null, timestamp = new Date()) {
    if (!state) throw new Error('Status: state is required');
    this.state = state;
    this.userId = userId || 'SYSTEM';
    this.timestamp = timestamp ? new Date(timestamp) : new Date();
    this.metadata = metadata || {};
    this.eventId = eventId;
  }

  toJSON() {
    return {
      state: this.state,
      userId: this.userId,
      timestamp: this.timestamp,
      metadata: this.metadata,
      eventId: this.eventId
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
      raw.identity?.name || raw.name || '',
      raw.identity?.slug || raw.slug || '',
      raw.identity?.serial || raw.serial || '',
      raw.identity?.reference || raw.reference || ''
    );
    this.lineage = new Lineage(raw.lineage || {});
    this.origin = raw.origin?.state ? new Status(raw.origin.state, raw.origin.userId, raw.origin.metadata, raw.origin.eventId, raw.origin.timestamp) : null;
    this.status = raw.status?.state ? new Status(raw.status.state, raw.status.userId, raw.status.metadata, raw.status.eventId, raw.status.timestamp) : null;
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

  applyStatus(state, userId, metadata = {}, eventId = null) {
    const next = new Status(state, userId, metadata, eventId);
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
      id: this.id,
      identity: this.identity.toJSON(),
      lineage: this.lineage.toJSON(),
      origin: this.origin?.toJSON() || null,
      status: this.status?.toJSON() || null,
      specs: this.specs?.toJSON() || null,
      attachments: this.attachments,
      data: this.data,
      summary: this.summary,
      name: this.name,
      slug: this.identity.slug,
      serial: this.identity.serial,
      reference: this.identity.reference
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

export const createIdentity = (name, slug = '', serial = '', reference = '', uid = slug || name) => new Identity(uid, name, slug, serial, reference);
export const createStatus = (state, userId = 'SYSTEM', metadata = {}, eventId = null) => new Status(state, userId, metadata, eventId);
export const createSpecs = (data = {}) => new Specs(data);
export const createData = (data = {}) => ({ ...data });
export const inheritLineage = (parent, type, mapId = value => value) => new Lineage(parent?.lineage || {}).add(type, mapId(parent?.identity?.uid || parent?._id));
export const createAttachment = (type, fileId, name = '', metadata = {}) => ({ type, fileId, name, metadata, timestamp: new Date() });
