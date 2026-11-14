// One-shot flat-state vocabulary migration (SPEC §7). Three persisted
// surfaces carried the retired declaration-era state model:
//   1. cts_types declarations with `states`/`transitions` — types declare
//      nothing about states now; the keys drop.
//   2. process definitions: transition records with a `state` payload
//      (`{axis, to}`) become socket defaults (`inputDefaults.state`), and
//      ctsState records lose their axis/parentStateId/initial fluff.
//   3. instance documents with `states: {main: <value>}` persist one flat
//      `state` string. Append-only status_events history is untouched.
// Dry-run by default; `--apply` persists. Idempotent: re-running is a no-op.
import { connectDB } from '../db/mongo.js';
import { CLASS_COLLECTIONS } from '#packages/cts';

function report() {
  return {
    mode: process.argv.includes('--apply') ? 'apply' : 'dry-run',
    typesStripped: 0,
    transitionsRewired: 0,
    stateRecordsCleaned: 0,
    instancesFlattened: 0,
    failures: []
  };
}

function statePayloadOf(record = {}) {
  if (record.kind !== 'cts.transition') return null;
  const to = record.state?.to ?? record.target ?? null;
  return to ? { to: String(to) } : null;
}

export async function runFlatStateMigration(database, { apply = false } = {}) {
  const db = database || await connectDB();
  const summary = report();
  const persist = apply
    ? (collection, filter, update) => db.collection(collection).updateOne(filter, update)
    : async () => ({ matchedCount: 1 });

  for await (const doc of db.collection('cts_types').find({})) {
    if (!doc.states && !doc.transitions) continue;
    const { states: _s, transitions: _t, ...rest } = doc;
    try {
      await persist('cts_types', { _id: doc._id }, { $set: rest, $unset: { states: '', transitions: '' } });
      summary.typesStripped += 1;
    } catch (error) {
      summary.failures.push(`cts_types ${doc._id}: ${error.message}`);
    }
  }

  for await (const doc of db.collection('process_definitions').find({})) {
    const data = doc.data || {};
    let changed = false;
    const processNodes = { ...(data.processNodes || {}) };
    for (const [id, record] of Object.entries(processNodes)) {
      const payload = statePayloadOf(record);
      if (payload) {
        processNodes[id] = {
          ...record,
          inputDefaults: { ...(record.inputDefaults || {}), state: payload.to },
          state: undefined
        };
        summary.transitionsRewired += 1;
        changed = true;
      }
    }
    const ctsTypes = { ...(data.ctsTypes || {}) };
    for (const [id, record] of Object.entries(ctsTypes)) {
      if (record?.kind !== 'state') continue;
      if (record.axis === undefined && record.parentStateId === undefined && record.initial === undefined) continue;
      const { axis: _a, parentStateId: _p, initial: _i, ...rest } = record;
      ctsTypes[id] = rest;
      summary.stateRecordsCleaned += 1;
      changed = true;
    }
    if (changed) {
      try {
        await persist('process_definitions', { _id: doc._id }, { $set: { 'data.processNodes': processNodes, 'data.ctsTypes': ctsTypes } });
      } catch (error) {
        summary.failures.push(`process_definitions ${doc._id}: ${error.message}`);
      }
    }
  }

  for (const collection of CLASS_COLLECTIONS) {
    for await (const doc of db.collection(collection).find({ states: { $type: 'object' } })) {
      const value = doc.states?.main;
      if (typeof value !== 'string' || !value) continue;
      try {
        await persist(collection, { _id: doc._id }, { $set: { state: value }, $unset: { states: '' } });
        summary.instancesFlattened += 1;
      } catch (error) {
        summary.failures.push(`${collection} ${doc._id}: ${error.message}`);
      }
    }
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runFlatStateMigration(null, { apply: process.argv.includes('--apply') })
    .then(summary => {
      console.log(JSON.stringify(summary, null, 2));
      process.exitCode = summary.failures.length ? 1 : 0;
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}
