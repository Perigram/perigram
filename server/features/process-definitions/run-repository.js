import { advanceProcessRun, createProcessRun } from '~/packages/processes/src/index.js';

// Manual runs deliberately have no durable repository after removal of the
// unapproved automation scheduler. This boundary owns their finite execution
// lifecycle and can be replaced only if a durable-run protocol is introduced.
export async function executeManualRun(definition, payload = {}, { actor, executeEffect, catalogContext, data } = {}) {
  let run = createProcessRun(definition, payload.trigger || {}, {
    processDefinitionId: definition._id || definition.id,
    context: { inputs: payload.inputs || {}, actor }
  });
  for (let index = 0; run.status === 'running' && index < 999; index += 1) {
    const advanced = await advanceProcessRun(run, definition.data, {
      executeEffect: request => executeEffect(request, run),
      catalogContext,
      data: data(run)
    });
    if (JSON.stringify(advanced) === JSON.stringify(run)) break;
    run = advanced;
  }
  if (run.status === 'running') throw new Error('Process run exceeded 1000 steps');
  return run;
}

export async function resumeDueRuns() {
  return [];
}
