import { ObjectId } from 'mongodb';
import { connectDB } from '../db/mongo.js';
import { createStatus } from '../core/blocks/index.js';
import { createWorkflowState } from '../../packages/workflows/src/index.js';
import { cncDomain } from '../../packages/domain-cnc/src/index.js';

function completeStatus({ userId = 'SYSTEM', taskRunId = null, eventId }) {
  return JSON.parse(JSON.stringify(createStatus(
    createWorkflowState(cncDomain.workflows.nesting_run, {
      primary: 'COMPLETE',
      active: { main: 'COMPLETE' }
    }),
    userId,
    {
      note: 'Nesting calculation completed',
      ...(taskRunId ? { taskRunId } : {}),
      repairedBy: 'repair-nesting-run-completions'
    },
    eventId
  )));
}

async function main() {
  const db = await connectDB();
  const runs = db.collection('nesting_runs').find({
    'states.main': 'NESTING',
    'data.results': { $exists: true },
    'data.sheetDesignIds.0': { $exists: true }
  });

  let scanned = 0;
  let repaired = 0;
  let skipped = 0;

  for await (const run of runs) {
    scanned++;
    const sheetDesignIds = (run?.data?.sheetDesignIds || []).map(id => id?.toString?.() || id).filter(Boolean);
    if (!run?.data?.results || !sheetDesignIds.length) {
      skipped++;
      continue;
    }
    if (run.states?.main === 'COMPLETE') {
      skipped++;
      continue;
    }

    const job = await db.collection('nesting_jobs').findOne({ runId: run._id });
    const eventId = new ObjectId();
    const status = completeStatus({
      userId: run.status?.userId || 'SYSTEM',
      taskRunId: job?.taskRunId?.toString?.() || job?.taskRunId || null,
      eventId
    });
    await db.collection('status_events').insertOne({
      _id: eventId,
      targetId: run._id,
      targetType: 'nesting_run',
      fromState: 'NESTING',
      toState: 'COMPLETE',
      fromStatePrimary: 'NESTING',
      toStatePrimary: 'COMPLETE',
      region: 'main',
      status,
      timestamp: new Date(),
      metadata: { repairedBy: 'repair-nesting-run-completions' }
    });
    await db.collection('nesting_runs').updateOne(
      { _id: run._id },
      { $set: { status, updatedAt: new Date() } }
    );
    repaired++;
  }

  console.log(`Scanned ${scanned} completed-but-nesting runs; repaired ${repaired}; skipped ${skipped}.`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
