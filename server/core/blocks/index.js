import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import {
  Identity,
  Status,
  Lineage,
  Specs
} from '~/packages/core/src/index.js';

export {
  Identity,
  Status,
  Lineage,
  Specs,
  BaseEntity,
  registerService,
  getService,
  defineEntity,
  getEntityDefinition,
  listEntityDefinitions,
  createData
} from '~/packages/core/src/index.js';

// Factory helpers for clean service code
export const createIdentity = (name, slug, serial = '', reference = '') => 
  new Identity(slug || name, name, slug, serial, reference);

export const createStatus = (state, userId, metadata = {}, eventId = null, lifecycle = {}) => 
  new Status(state, userId, metadata, eventId, null, lifecycle);

export const createSpecs = (data) => new Specs(data);

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
