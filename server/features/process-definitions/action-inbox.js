import { connectDB } from '~/server/db/mongo.js';
import { declarationForType } from '../instances/service.js';
import { collectionForClass } from '../instances/repository.js';
import { toFlexibleId } from '~/server/utils/objectid.js';

// The action inbox query (SPEC §4): instances whose current state admits
// an action the user's roles grant. Grants are the hydration manifest's
// own filter (`roleAssignments.actions` carries only the assigned roles'
// actions) — this query adds the state window and never re-evaluates
// grants.
export const INBOX_ROW_CAP_PER_ACTION = 25;

// Stored primary-state paths in every persisted shape; the wire twin of
// this vocabulary is `entityPrimaryStatus` (utils/action-visibility.js).
const STATE_PATHS = Object.freeze([
  'state',
  'states.main',
  'status.state',
  'status.state.primary',
  'status.state.active.main'
]);

export function selectInboxActions(manifestActions = []) {
  return (manifestActions || []).filter(action => (
    Boolean(action?.typeId)
    && action.actionKind !== 'createInstance'
    && action?.trigger?.mode === 'manual'
    && Boolean(action.state?.from || action.state?.to)
  ));
}

export function admittingStateFilter(action = {}) {
  const from = action.state?.from || '';
  const to = action.state?.to || '';
  if (from) {
    return { $or: STATE_PATHS.map(path => ({ [path]: from })) };
  }
  // A to-only window admits every state the action legally leaves: any
  // non-empty state except the no-op target; a stateless instance is in
  // no admitting state.
  const excluded = [null, '', to];
  return { $or: STATE_PATHS.map(path => ({ [path]: { $nin: excluded } })) };
}

export async function getActiveActionInbox(auth = {}, { query = mongoInboxQuery, collectionOf = declarationCollectionOf } = {}) {
  const organizationId = auth.organizationId || auth.memberships?.[0]?.organizationId;
  if (!organizationId) return { items: [] };
  const actions = selectInboxActions(auth.roleAssignments?.actions || []);
  if (!actions.length) return { items: [] };

  const orgFilter = { $or: [{ organizationId: toFlexibleId(organizationId) }, { organizationId: null }] };
  const rows = new Map();
  for (const action of actions) {
    const collection = await collectionOf(action.typeId, organizationId);
    if (!collection) continue;
    const docs = await query(collection, {
      type: action.typeId,
      $and: [orgFilter, admittingStateFilter(action)]
    }, { limit: INBOX_ROW_CAP_PER_ACTION });
    for (const doc of docs || []) {
      const id = doc?._id == null ? '' : String(doc._id);
      if (!id) continue;
      const key = `${action.typeId}:${id}`;
      const row = rows.get(key) || { typeId: action.typeId, instanceId: id, actionIds: [] };
      row.actionIds.push(action.id);
      rows.set(key, row);
    }
  }
  return { items: [...rows.values()] };
}

async function declarationCollectionOf(typeId = '', organizationId = null) {
  const declaration = await declarationForType(typeId, organizationId);
  return declaration ? collectionForClass(declaration.class) : null;
}

async function mongoInboxQuery(collection, filter, { limit } = {}) {
  const db = await connectDB();
  return await db.collection(collection)
    .find(filter, { projection: { _id: 1 } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
}
