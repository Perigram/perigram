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
// rewritten flat fields, changed axis paths, and the labels of steps that
// applied. A state rename targets one exact axis and rewrites both an exact
// leaf and any active descendant path beneath a renamed parent.
export function transformInstanceForSteps(doc = {}, steps = []) {
  const fields = { ...(doc.fields || {}) };
  const stateChanges = {};
  const applied = [];
  for (const step of steps) {
    switch (step.kind) {
      case 'rename-enum-value': {
        const current = doc.states?.[step.axis];
        if (typeof current === 'string'
          && (current === step.from || current.startsWith(`${step.from}.`))
          && step.from !== step.to) {
          stateChanges[step.axis] = `${step.to}${current.slice(step.from.length)}`;
          applied.push(step.kind);
        }
        break;
      }
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
  return { fields, stateChanges, applied };
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
      const { fields, stateChanges, applied } = transformInstanceForSteps(doc, steps);
      const set = { fields, typeVersion: toVersion, updatedAt: new Date().toISOString() };
      for (const [axis, state] of Object.entries(stateChanges)) {
        set[`states.${axis}`] = state;
      }
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
