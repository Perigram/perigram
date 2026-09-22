import { ObjectId } from 'mongodb';
import { toFlexibleId } from '../../utils/objectid.js';
import {
  Identity,
  Status,
  Lineage,
  Relations,
  Provenance,
  Specs
} from '#packages/core/src/index.js';

export {
  Identity,
  Status,
  Lineage,
  Relations,
  Provenance,
  Specs,
  BaseEntity,
  createRegistry,
  createCutkitRegistry,
  createAttachmentRef,
  createCommandResult,
  createInstanceRef,
  createProvenance,
  createTaskResult,
  normalizeEntityOutputContracts,
  validateResultEntityOutputs,
  createData,
  createStatusState,
  getPrimaryState,
  getRegionState,
  getStatusRegions,
  normalizeStatusState
} from '#packages/core/src/index.js';

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

export const createAttachment = (kind, fileId, name = '', metadata = {}) => ({
  kind,
  fileId: fileId instanceof ObjectId ? fileId : new ObjectId(fileId),
  name,
  metadata,
  timestamp: new Date()
});
