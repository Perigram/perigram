// Type migration executor (SPEC §11): runs a covered `migrate` step set
// against a type's persisted instances when cts-types lands a breaking
// redefinition. Pure per-document transform plus one total org-scoped scan;
// the new `typeVersion` stamp is what makes re-runs skip finished
// documents, so an interrupted migration resumes by re-posting the same
// declaration. The step language and coverage rules live in
// @perigram/cts diff.js (canonical contract: this feature's README).
import { evaluate } from '#packages/cts';
import * as repository from './repository.js';
import * as entityEventService from '../instance-events/service.js';

// Pure transform: one document through all steps in one pass. Returns the
// rewritten flat fields, the rewritten lineage (when an edge step detached
// a stored key), changed axis paths, and the labels of steps that
// applied. A state rename targets one exact axis and rewrites both an exact
// leaf and any active descendant path beneath a renamed parent.
export function transformInstanceForSteps(doc = {}, steps = []) {
  const fields = { ...(doc.fields || {}) };
  const lineage = doc.lineage && typeof doc.lineage === 'object' ? { ...doc.lineage } : null;
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
          if (Object.hasOwn(fields, step.to)) {
            throw new Error(`Cannot rename field ${step.from} to ${step.to}: target field already exists`);
          }
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
      case 'remove-edge':
        // The removed edge detaches its stored parent key (SPEC §11):
        // children of the edge become roots. Foreign-type children walk
        // their own collections in applyTypeMigrationSteps; the declaring
        // type's own documents (self-containment) ride the main loop.
        if (lineage && step.lineageKey && Object.hasOwn(lineage, step.lineageKey)) {
          delete lineage[step.lineageKey];
          applied.push(step.kind);
        }
        break;
      default:
        throw new Error(`unknown migration step ${step.kind}`);
    }
  }
  return { fields, ...(lineage ? { lineage } : {}), stateChanges, applied };
}

export async function applyTypeMigrationSteps({
  declaration = {}, organizationId = null, steps = [], toVersion = null, actor = null,
  collectionForType = null
} = {}) {
  if (!declaration.id || !organizationId || toVersion == null) {
    throw new Error('type migration requires declaration id, organizationId, and toVersion');
  }
  const collection = repository.collectionForClass(declaration.class);
  const counts = {};
  const failures = [];

  // Foreign-child detach (SPEC §11 remove-edge): children of another type
  // store the removed key in their own collection and must NOT receive the
  // declaring type's version stamp — the walk is idempotent by the unset
  // itself. `collectionForType` resolves a child type's collection from the
  // registry view the caller already holds.
  const detachWalks = [];
  for (const step of steps) {
    if (step.kind !== 'remove-edge' || !step.lineageKey || typeof collectionForType !== 'function') continue;
    for (const childType of step.types || []) {
      if (childType === declaration.id) continue;
      const childCollection = collectionForType(childType);
      if (childCollection) detachWalks.push({ childType, childCollection, lineageKey: step.lineageKey });
    }
  }
  for (const { childType, childCollection, lineageKey } of detachWalks) {
    for await (const doc of repository.iterateChildrenWithLineageKey(childCollection, childType, organizationId, lineageKey)) {
      try {
        const update = await repository.detachMigratedLineageKey(childCollection, doc._id, childType, organizationId, lineageKey);
        if (update?.modifiedCount) {
          await entityEventService.publishEntityChanged(
            { userId: actor || 'SYSTEM', organizationId: String(organizationId) },
            { type: childType, id: String(doc._id), change: 'updated', reason: 'type-migration' }
          );
          counts['remove-edge'] = (counts['remove-edge'] || 0) + 1;
        }
      } catch (error) {
        failures.push({ id: String(doc._id), error: error?.message || String(error) });
      }
    }
  }

  // Behind documents only: finished documents carry the new stamp, so the
  // scan itself is the resume filter.
  for await (const doc of repository.iterateInstancesForTypeMigration(collection, declaration.id, organizationId, toVersion)) {
    try {
      const { fields, lineage, stateChanges, applied } = transformInstanceForSteps(doc, steps);
      const set = { fields, typeVersion: toVersion, updatedAt: new Date().toISOString() };
      if (lineage) set.lineage = lineage;
      for (const [axis, state] of Object.entries(stateChanges)) {
        set[`states.${axis}`] = state;
      }
      const update = await repository.updateMigratedInstance(collection, doc._id, declaration.id, organizationId, set);
      if (update?.matchedCount !== 1) {
        throw new Error('Instance disappeared or changed before its type migration update');
      }
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
