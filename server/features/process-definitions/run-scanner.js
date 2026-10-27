// The process run scanner: wakes runs parked on a Wait Until at their
// authored time, fires due entry schedules, and delivers undispatched
// events — one sweep, the deadline-scanner's shape.
import { connectDB } from '~/server/db/mongo.js';
import { durationMs } from '#packages/cts/src/index.js';
import { findDueWakeRuns, findLastScheduleFire, findUndispatchedEvents, markEventDispatched } from './run-store.js';
import { resumeParkedRun, runDefinitionEntry } from './service.js';

const BATCH_LIMIT = 50;

// Event delivery (SPEC: Time and events): every active definition of the
// event's organization carrying an entry subscribed to the event type
// executes once, the event record riding the run trigger (the
// `eventPayload` source reads it).
export async function dispatchEventToSubscribers(event) {
  const db = await connectDB();
  const definitions = await db.collection('process_definitions')
    .find({ 'states.main': 'ACTIVE', 'lineage.organizationId': event.organizationId })
    .toArray();
  let started = 0;
  for (const definition of definitions) {
    for (const node of Object.values(definition.data?.processNodes || {})) {
      if (node?.trigger?.mode !== 'event' || !node.eventId || node.eventId !== event.type) continue;
      await runDefinitionEntry(definition, {
        nodeId: node.id,
        eventId: event.type,
        event: { type: event.type, payload: event.payload, at: event.at }
      }, { kind: 'event', nodeId: node.id, organizationId: event.organizationId });
      started += 1;
    }
  }
  return started;
}

export async function scanDueProcessRuns(now = new Date()) {
  const summary = { wakes: 0, wakeFailed: 0, scheduleFires: 0, events: 0, eventFailed: 0 };
  for (const record of await findDueWakeRuns(now, BATCH_LIMIT)) {
    try {
      await resumeParkedRun(record);
      summary.wakes += 1;
    } catch (error) {
      summary.wakeFailed += 1;
      console.error(`[Process Run Scanner] wake ${record._id}:`, error?.message);
    }
  }
  summary.scheduleFires = await scanDueSchedules(now);
  for (const event of await findUndispatchedEvents(BATCH_LIMIT)) {
    try {
      await dispatchEventToSubscribers(event);
      await markEventDispatched(event._id);
      summary.events += 1;
    } catch (error) {
      summary.eventFailed += 1;
      console.error(`[Process Run Scanner] event ${event._id}:`, error?.message);
    }
  }
  return summary;
}

// Schedule fires are ledgered by their runs: a one-shot `at` fires while
// no run exists for the entry; an `interval` fires when the last run has
// aged past the duration (missed ticks collapse into one fire).
async function scanDueSchedules(now) {
  const db = await connectDB();
  const definitions = await db.collection('process_definitions')
    .find({ 'states.main': 'ACTIVE' })
    .toArray();
  let fired = 0;
  for (const definition of definitions) {
    const organizationId = definition.lineage?.organizationId;
    if (!organizationId) continue;
    for (const node of Object.values(definition.data?.processNodes || {})) {
      const schedule = node?.trigger?.mode === 'schedule' ? node.trigger.schedule : null;
      if (!schedule) continue;
      const due = schedule.at
        ? await oneShotDue(definition, node, schedule, now)
        : schedule.interval ? await intervalDue(definition, node, schedule, now) : false;
      if (!due) continue;
      try {
        await runDefinitionEntry(definition, { nodeId: node.id }, { kind: 'schedule', nodeId: node.id, organizationId });
        fired += 1;
      } catch (error) {
        console.error(`[Process Run Scanner] schedule ${definition._id}/${node.id}:`, error?.message);
      }
    }
  }
  return fired;
}

async function oneShotDue(definition, node, schedule, now) {
  if (new Date(schedule.at).getTime() > now.getTime()) return false;
  return !(await findLastScheduleFire(definition._id, node.id));
}

async function intervalDue(definition, node, schedule, now) {
  const last = await findLastScheduleFire(definition._id, node.id);
  if (!last) return true;
  return new Date(last.createdAt).getTime() + durationMs(schedule.interval) <= now.getTime();
}
