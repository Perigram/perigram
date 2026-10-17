// One-way migration: deletes the retired process execution record
// collections (owner direction 2026-10-17 — no durable process runs;
// command_runs and task_runs are the audit trail). Run once after
// deploying the in-process action evaluation:
//   node server/scripts/retire-process-runs.js
import { connectDB } from '../db/mongo.js';

const COLLECTIONS = [
  'execution_runs',
  'execution_step_invocations',
  'execution_waits',
  'execution_outputs',
  'execution_steps',
  'execution_receipts'
];

async function main() {
    const db = await connectDB();
    for (const name of COLLECTIONS) {
        const result = await db.collection(name).drop().catch(error => (
            error?.code === 26 ? null : Promise.reject(error)
        ));
        console.log(result ? `${name}: dropped` : `${name}: absent`);
    }
    console.log('Retired process execution records removed.');
    process.exit(0);
}

main().catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
});
