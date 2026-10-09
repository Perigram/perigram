// The worklist (SPEC "Process authoring maturity"): the caller's inbox —
// instances waiting in states whose exits the caller controls, derived as
// a pure projection from the caller's manifest action windows and the
// stored instances. Per-instance availability (guards, lifecycle) stays
// with the instance surface; the worklist names the queue, not the
// verdict.
import { connectDB } from '../../db/mongo.js';
import { toFlexibleId } from '../../utils/objectid.js';
import * as workflowOverridesService from '../../features/workflow-overrides/service.js';
import { getEntityCollection } from '../../runtime/entities.js';
import { declarationForType } from '../../features/instances/service.js';
import { collectionForClass } from '../../features/instances/repository.js';
import { durationMs } from '../../../packages/cts/src/index.js';
import { normalizeWorkflow } from '../../../packages/workflows/src/index.js';

const ROW_LIMIT_PER_TYPE = 100;

export async function buildWorklist(auth = {}, now = new Date()) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) return { items: [] };
  const db = await connectDB();

  // Status-mutating manifest actions with an arrival window scope the
  // queue: unscoped actions belong to instance surfaces, not the inbox.
  const windowsByType = new Map();
  for (const action of auth.roleAssignments?.actions || []) {
    if (!['updateEntity', 'updateInstance'].includes(action.actionKind)) continue;
    const from = action.state?.from || action.access?.stateFrom || '';
    const to = action.state?.to || action.access?.stateTo || '';
    if (!action.typeId || !from || !to) continue;
    const windows = windowsByType.get(action.typeId) || new Map();
    const actions = windows.get(from) || [];
    actions.push({ id: action.id, label: action.label || '', to });
    windows.set(from, actions);
    windowsByType.set(action.typeId, windows);
  }

  const items = [];
  for (const [typeId, windows] of windowsByType) {
    const collection = await collectionForWorklist(typeId, organizationId);
    if (!collection) continue;
    const states = [...windows.keys()];
    const orgId = toFlexibleId(organizationId);
    const docs = await db.collection(collection).find({
      type: typeId,
      $and: [
        { $or: [{ organizationId: orgId }, { 'lineage.organizationId': orgId }] },
        { $or: [{ state: { $in: states } }, { 'status.state.primary': { $in: states } }] }
      ]
    })
      .limit(ROW_LIMIT_PER_TYPE)
      .project({ name: 1, state: 1, stateChangedAt: 1, 'status.state.primary': 1, 'status.timestamp': 1, updatedAt: 1 })
      .toArray();
    if (!docs.length) continue;

    const deadlines = await stateDeadlines(typeId, organizationId);
    for (const doc of docs) {
      const state = doc.state || doc.status?.state?.primary || '';
      const enteredAt = doc.stateChangedAt || doc.status?.timestamp || doc.updatedAt || null;
      const deadline = deadlines.get(state);
      const dueAt = deadline && enteredAt
        ? new Date(new Date(enteredAt).getTime() + durationMs(deadline.after))
        : null;
      items.push({
        typeId,
        id: doc._id,
        name: doc.name || '',
        state,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        overdue: Boolean(dueAt && dueAt < now),
        actions: (windows.get(state) || []).map(action => ({ ...action }))
      });
    }
  }

  items.sort((left, right) => {
    if (Boolean(left.overdue) !== Boolean(right.overdue)) return left.overdue ? -1 : 1;
    if (left.dueAt !== right.dueAt) return (left.dueAt || '9999').localeCompare(right.dueAt || '9999');
    return String(left.name).localeCompare(String(right.name));
  });
  return { items: items.slice(0, 200) };
}

// Declared deadlines per canonical state path, from the active machine —
// the same resolution the status engine executes against.
async function stateDeadlines(typeId, organizationId) {
  try {
    const machine = await workflowOverridesService.resolveActiveWorkflow({ typeId, organizationId });
    if (!machine) return new Map();
    const deadlines = new Map();
    for (const region of Object.values(normalizeWorkflow(machine).regions || {})) {
      for (const [statePath, definition] of Object.entries(region.states || {})) {
        if (definition?.deadline?.after && definition?.deadline?.to) {
          deadlines.set(statePath, definition.deadline);
        }
      }
    }
    return deadlines;
  } catch {
    return new Map();
  }
}

async function collectionForWorklist(typeId, organizationId) {
  const staticCollection = getEntityCollection(typeId);
  if (staticCollection) return staticCollection;
  const declaration = await declarationForType(typeId, organizationId);
  return declaration ? collectionForClass(declaration.class) : null;
}
