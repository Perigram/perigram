// The deadline scanner (SPEC §7): a scheduled sweep, not a standing query.
// Every tick resolves the organizations' active compiled machines, finds
// states carrying a declared deadline, and moves overdue instances through
// the normal transition boundary as SYSTEM — stamps, guards, lifecycle
// validation, and hooks unchanged. Scan input is the activation-written
// `data.compiled` snapshot of ACTIVE definitions; auth decisions always
// recompile and never read this path.
import { connectDB } from '~/server/db/mongo.js';
import { toFlexibleId } from '~/server/utils/objectid.js';
import { stateService } from '~/server/core/machines/service.js';
import { declarationForType } from '~/server/features/instances/service.js';
import { collectionForClass } from '~/server/features/instances/repository.js';
import { durationMs } from '#packages/cts/src/index.js';

const BATCH_LIMIT = 200;

export async function scanDueDeadlines(now = new Date()) {
  const db = await connectDB();
  const definitions = await db.collection('process_definitions')
    .find({ 'states.main': 'ACTIVE', 'data.compiled.producerOutputs': { $exists: true } })
    .project({ 'lineage.organizationId': 1, 'data.compiled.producerOutputs': 1 })
    .toArray();
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
          const overdue = await db.collection(collection).find({
            type: output.typeId,
            $and: [
              { $or: [{ organizationId: toFlexibleId(organizationId) }, { 'lineage.organizationId': toFlexibleId(organizationId) }] },
              {
                // The entered-state clock: §3 flat docs carry
                // stateChangedAt; legacy block docs keep status.timestamp.
                $or: [
                  { state: statePath, stateChangedAt: { $lt: cutoff.toISOString() } },
                  { 'status.state.primary': statePath, 'status.timestamp': { $lt: cutoff } }
                ]
              }
            ]
          }).project({ _id: 1 }).limit(BATCH_LIMIT).toArray();
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
                // Validation, guard, or access refusal: the instance is
                // not movable along this edge (yet) — the next tick
                // re-evaluates with fresh data.
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
  return declaration ? collectionForClass(declaration.class) : null;
}
