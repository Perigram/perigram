// Type migration executor (SPEC §11): runs a covered `migrate` step set
// against a type's persisted instances when cts-types lands a breaking
// redefinition. Pure per-document transform plus one total org-scoped scan;
// the new `typeVersion` stamp is what makes re-runs skip finished
// documents, so an interrupted migration resumes by re-posting the same
// declaration. The step language and coverage rules live in
// @perigram/cts diff.js (canonical contract: this feature's README).
import { connectDB } from '~/server/db/mongo';
import { toFlexibleId } from '../../utils/objectid.js';
import { evaluate } from '~/packages/cts/src/index.js';
import { collectionForClass } from './repository.js';
import * as entityEventService from '../instance-events/service.js';

// Pure transform: one document through all steps in one pass. Returns the
// rewritten flat fields, the rewritten primary state (undefined when no
// step touched it), and the labels of the steps that applied. Idempotent
// by construction: an already-renamed value or field no longer matches.
export function transformInstanceForSteps(doc = {}, steps = []) {
  const fields = { ...(doc.fields || {}) };
  let main = doc.states?.main;
  const applied = [];
  for (const step of steps) {
    switch (step.kind) {
      case 'rename-enum-value':
        if (main === step.from && step.from !== step.to) {
          main = step.to;
          applied.push(step.kind);
        }
        break;
      case 'rename-field':
        if (Object.hasOwn(fields, step.from) && step.from !== step.to) {
          fields[step.to] = fields[step.from];
          delete fields[step.from];
          applied.push(step.kind);
        }
        break;
      case 'remove-field':
        if (Object.hasOwn(fields, step.field)) {
          delete fields[step.field];
          applied.push(step.kind);
        }
        break;
      case 'add-default-field':
        if (!Object.hasOwn(fields, step.field)) {
          fields[step.field] = step.value;
          applied.push(step.kind);
        }
        break;
      case 'retype-field':
        if (Object.hasOwn(fields, step.field)) {
          fields[step.field] = evaluate(step.via, { value: fields[step.field] });
          applied.push(step.kind);
        }
        break;
      default:
        throw new Error(`unknown migration step ${step.kind}`);
    }
  }
  return { fields, main, applied };
}

export async function applyTypeMigrationSteps({
  declaration = {}, organizationId = null, steps = [], toVersion = null, actor = null
} = {}) {
  if (!declaration.id || !organizationId || toVersion == null) {
    throw new Error('type migration requires declaration id, organizationId, and toVersion');
  }
  const collection = collectionForClass(declaration.class);
  const db = await connectDB();
  const counts = {};
  const failures = [];
  // Behind documents only: finished documents carry the new stamp, so the
  // scan itself is the resume filter.
  const cursor = db.collection(collection).find({
    type: declaration.id,
    organizationId: toFlexibleId(organizationId),
    typeVersion: { $ne: toVersion }
  });
  for await (const doc of cursor) {
    try {
      const { fields, main, applied } = transformInstanceForSteps(doc, steps);
      const set = { fields, typeVersion: toVersion, updatedAt: new Date().toISOString() };
      if (main !== undefined && doc.states?.main !== main) set['states.main'] = main;
      await db.collection(collection).updateOne({ _id: doc._id }, { $set: set });
      await entityEventService.publishEntityChanged(
        { userId: actor || 'SYSTEM', organizationId: String(organizationId) },
        { type: declaration.id, id: String(doc._id), change: 'updated', reason: 'type-migration' }
      );
      for (const label of applied) counts[label] = (counts[label] || 0) + 1;
    } catch (error) {
      failures.push({ id: String(doc._id), error: error?.message || String(error) });
    }
  }
  return { appliedAt: new Date().toISOString(), actor: actor || 'SYSTEM', counts, failures };
}
