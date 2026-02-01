import { ObjectId } from 'mongodb';

/**
 * v24 Absolute Final - Core Abstractions
 * Architectural Excellence: Standardized Blocks from the very beginning.
 */

const registry = {};
export const registerService = (type, service) => { registry[type] = service; };

export class Identity {
  constructor(uid, name = '') {
    this.uid = uid;
    this.name = name;
  }
}

export class Status {
  constructor(state, userId, metadata = {}, eventId = null) {
    this.state = state;
    this.userId = userId;
    this.timestamp = new Date();
    this.metadata = metadata;
    this.eventId = eventId ? (eventId instanceof ObjectId ? eventId : new ObjectId(eventId)) : null;
  }
}

export class Lineage {
  constructor(parents = {}) {
    for (const [key, value] of Object.entries(parents)) {
      if (value) this[key] = value;
    }
  }
  add(type, uid) {
    if (uid) this[`${type}Id`] = uid;
    return this;
  }
}

export class BaseEntity {
  constructor(raw = {}) {
    // 1. Identify
    this._id = raw.identity?.uid || raw._id || null;
    this.identity = new Identity(this._id, raw.identity?.name || raw.name || '');
    
    // 2. Lineage
    this.lineage = new Lineage(raw.lineage || {});
    
    // 3. Status
    this.origin = raw.origin ? new Status(raw.origin.state, raw.origin.userId, raw.origin.metadata, raw.origin.eventId) : null;
    this.status = raw.status ? new Status(raw.status.state, raw.status.userId, raw.status.metadata, raw.status.eventId) : null;
    
    // 4. Attachments
    this.attachments = raw.attachments || {};
    
    // 5. Data
    this.data = raw.data || {};
  }

  applyStatus(state, userId, metadata = {}, eventId = null) {
    const s = new Status(state, userId, metadata, eventId);
    if (!this.origin) this.origin = s;
    this.status = s;
    return this;
  }

  async getAncestor(type) {
    const uid = this.lineage[`${type}Id` || `${type}Uid` || type];
    if (!uid) return null;
    const service = registry[type];
    if (!service) return null;
    return await service.getById(uid);
  }
}

export const createIdentity = (name, slug, serial = '', reference = '') => ({
  name,
  slug,
  serial,
  reference
});

export const createStatus = (state, userId, metadata = {}, eventId = null) => new Status(state, userId, metadata, eventId);

export const createData = (data = {}) => ({ ...data });

export const createAttachment = (type, fileId, name = '', metadata = {}) => ({
  type,
  fileId: fileId instanceof ObjectId ? fileId : new ObjectId(fileId),
  name,
  metadata,
  timestamp: new Date()
});

export const inheritLineage = (parent, type) => {
  return new Lineage(parent?.lineage || {}).add(type, parent?.identity?.uid || parent?._id);
};