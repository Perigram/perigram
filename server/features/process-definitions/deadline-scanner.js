// The deadline scanner (SPEC §7): a scheduled sweep, not a standing query.
import * as processRepository from './repository.js';
import * as instanceRepository from '~/server/features/instances/repository.js';
import { stateService } from '~/server/core/machines/service.js';
import { declarationForType } from '~/server/features/instances/service.js';
import { durationMs } from '#packages/cts';

const BATCH_LIMIT = 200;

export async function scanDueDeadlines(now = new Date()) {
  const definitions = await processRepository.findActiveWithCompiledProducerOutputs();
  const summary = { deadlines: 0, moved: 0, refused: 0, failed: 0 };
  for (const definition of definitions) {
    const organizationId = definition.lineage?.organizationId;
    if (!organizationId) continue;
    for (const output of Object.values(definition.data?.compiled?.producerOutputs || {})) {
      const workflow = output?.workflow;
      if (!workflow?.regions || !output.typeId) continue;
      for (const region of Object.values(workflow.regions)) {
        for (const [statePath, stateDefinition] of Object.entries(region.states || {})) {
          const deadline = stateDefinition?.deadline;
          if (!deadline?.to || !deadline.after) continue;
          summary.deadlines += 1;
          const cutoff = new Date(now.getTime() - durationMs(deadline.after));
          const collection = await collectionForDeadlineScan(output.typeId, organizationId);
          if (!collection) continue;
          const overdue = await instanceRepository.findOverdueInstances(
            collection, output.typeId, organizationId, statePath, cutoff, BATCH_LIMIT
          );
          for (const { _id } of overdue) {
            try {
              await stateService.transition(output.typeId, _id, deadline.to, 'SYSTEM',
                { userId: 'SYSTEM', system: true, memberships: [] },
                {
                  producerOutputId: output.producerOutputId,
                  source: { kind: 'deadline', state: statePath }
                });
              summary.moved += 1;
            } catch (error) {
              const statusCode = Number(error?.statusCode);
              if (statusCode === 400 || statusCode === 403 || statusCode === 409) {
                summary.refused += 1;
              } else {
                summary.failed += 1;
                console.error(`[Deadline Scanner] ${output.typeId} ${statePath} -> ${deadline.to}:`, error?.message);
              }
            }
          }
        }
      }
    }
  }
  return summary;
}

async function collectionForDeadlineScan(typeId, organizationId) {
  const declaration = await declarationForType(typeId, organizationId);
  return declaration ? instanceRepository.collectionForClass(declaration.class) : null;
}
