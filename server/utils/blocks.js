import { ObjectId } from 'mongodb';
import {
  BaseEntity,
  Identity,
  Status,
  Lineage,
  Specs,
  createIdentity,
  createStatus,
  createSpecs,
  createData,
  createAttachment
} from '../core/blocks/index.js';
import { toFlexibleId } from './objectid.js';

// Deprecated compatibility bridge. New code must import from
// server/core/blocks/index.js so scripts/check-arch.js can enforce v24.
export {
  BaseEntity,
  Identity,
  Status,
  Lineage,
  Specs,
  createIdentity,
  createStatus,
  createSpecs,
  createData,
  createAttachment
};

export const inheritLineage = (parent, type) => {
  const lineage = new Lineage(parent?.lineage || {});
  const uid = parent?.identity?.uid || parent?._id;
  lineage.add(type, toFlexibleId(uid));
  return lineage;
};

export const createAttachmentWithObjectId = (type, fileId, name = '', metadata = {}) => ({
  type,
  fileId: fileId instanceof ObjectId ? fileId : new ObjectId(fileId),
  name,
  metadata,
  timestamp: new Date()
});
