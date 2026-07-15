import { ObjectId } from 'mongodb';
import {
  Identity,
  Status,
  Lineage,
  Specs
} from '#packages/core/src/index.js';

export {
  Identity,
  Status,
  Lineage,
  Specs,
  BaseEntity,
  createRegistry,
  createCutkitRegistry,
  createAttachmentRef,
  createCommandResult,
  createEntityRef,
  createRelationRef,
  getLineageEntityId,
  getLineageReference,
  isEntityReference,
  normalizeEntityReference,
  normalizeRelations,
  setLineageReference,
  createTaskResult,
  createData,
  createStatusState,
  getPrimaryState,
  getRegionState,
  getStatusRegions,
  normalizeStatusState
} from '#packages/core/src/index.js';

// Factory helpers for clean service code
export const createIdentity = (name, slug = '', serial = '', reference = '', uid = slug || name) =>
  new Identity(uid, name, slug, serial, reference);

export const createStatus = (state, userId, metadata = {}, eventId = null, lifecycle = {}) => 
  new Status(state, userId, metadata, eventId, null, lifecycle);

export const createSpecs = (data) => new Specs(data);

export const inheritLineage = (parent, type, mapId = value => value, revisionId = null) => {
  const uid = parent?.identity?.uid || parent?._id;
  return new Lineage(parent?.lineage || {}).add(type, mapId(uid), revisionId);
};

export const createAttachment = (kind, fileId, name = '', metadata = {}) => ({
  kind,
  fileId: fileId instanceof ObjectId ? fileId : new ObjectId(fileId),
  name,
  metadata,
  timestamp: new Date()
});
