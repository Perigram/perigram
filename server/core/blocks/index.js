import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../utils/objectid.js';
import { Identity } from './Identity.js';
import { Status } from './Status.js';
import { Lineage } from './Lineage.js';
import { Specs } from './Specs.js';
import { BaseEntity, registerService, getService } from './BaseEntity.js';

export {
  Identity,
  Status,
  Lineage,
  Specs,
  BaseEntity,
  registerService,
  getService
};

// Factory helpers for clean service code
export const createIdentity = (name, slug, serial = '', reference = '') => 
  new Identity(slug || name, name, slug, serial, reference);

export const createStatus = (state, userId, metadata = {}, eventId = null) => 
  new Status(state, userId, metadata, eventId);

export const createSpecs = (data) => new Specs(data);

export const createData = (data = {}) => ({ ...data });

export const inheritLineage = (parent, type) => {
  const uid = parent?.identity?.uid || parent?._id;
  return new Lineage(parent?.lineage || {}).add(type, toFlexibleId(uid));
};

export const createAttachment = (type, fileId, name = '', metadata = {}) => ({
  type,
  fileId: fileId instanceof ObjectId ? fileId : new ObjectId(fileId),
  name,
  metadata,
  timestamp: new Date()
});
