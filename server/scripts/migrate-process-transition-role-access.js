import { connectDB } from '../db/mongo.js';

const DRY_RUN = process.argv.includes('--dry-run');

function stripProcessTransitionAccess(workflow = {}) {
  let changed = false;
  const nextWorkflow = {
    ...workflow,
    regions: { ...(workflow.regions || {}) }
  };

  if (Array.isArray(workflow.transitions)) {
    const result = stripTransitionList(workflow.transitions);
    nextWorkflow.transitions = result.transitions;
    changed ||= result.changed;
  }

  for (const [regionId, region] of Object.entries(nextWorkflow.regions || {})) {
    const result = stripTransitionList(region.transitions || []);
    nextWorkflow.regions[regionId] = { ...region, transitions: result.transitions };
    changed ||= result.changed;
  }

  return { workflow: nextWorkflow, changed };
}

function stripTransitionList(transitions = []) {
  let changed = false;
  return {
    transitions: transitions.map(transition => {
      if (!Array.isArray(transition.processRoleIds) || transition.processRoleIds.length === 0) return transition;
      if (!transition.access?.permissions?.length) return transition;

      changed = true;
      const nextAccess = { ...(transition.access || {}) };
      delete nextAccess.permissions;
      const nextTransition = { ...transition };
      if (Object.keys(nextAccess).length) {
        nextTransition.access = nextAccess;
      } else {
        delete nextTransition.access;
      }
      return nextTransition;
    }),
    changed
  };
}

function migrateCompiled(compiled = {}) {
  let changed = false;
  const workflows = {};
  for (const [entityType, workflow] of Object.entries(compiled.workflows || {})) {
    const result = stripProcessTransitionAccess(workflow);
    workflows[entityType] = result.workflow;
    changed ||= result.changed;
  }

  return {
    compiled: changed
      ? { ...compiled, workflows }
      : compiled,
    changed
  };
}

async function main() {
  const db = await connectDB();
  const cursor = db.collection('process_definitions').find({
    'data.compiled.workflows': { $exists: true }
  });

  let scanned = 0;
  let updated = 0;

  for await (const process of cursor) {
    scanned += 1;
    const result = migrateCompiled(process.data?.compiled || {});
    if (!result.changed) continue;

    if (!DRY_RUN) {
      await db.collection('process_definitions').updateOne(
        { _id: process._id },
        {
          $set: {
            'data.compiled': result.compiled,
            updatedAt: new Date()
          }
        }
      );
    }
    updated += 1;
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, scanned, updated }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
