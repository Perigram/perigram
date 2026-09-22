// Apply migration plan (canonical contract in this feature's README):
// the database impact statement generated from the Apply diff, plus the
// confirmed-migration executor. Pure builders take compiled-contract data
// only; the executor stays inside feature access boundaries (entity service
// `processList` reads, the status runtime's initial-state write, the shared
// typed invalidation events) and never issues generic Mongo writes for
// business entities.
import { createError } from 'h3';
import { primaryStates } from '~/packages/processes/src/index.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { stateService } from '~/server/core/machines/service.js';
import * as entityEventService from '../instance-events/service.js';

// stranded: [{ typeId, statuses: [{ state, count }] }] from the live
// count pass; nextCompiled: the compiled contract about to be applied.
export function buildStatusMigrationPlan(stranded = [], nextCompiled = {}) {
  const producerOutputs = nextCompiled?.producerOutputs || {};
  return {
    statuses: stranded.map(({ typeId, statuses }) => ({
      typeId,
      removed: statuses,
      targets: [...primaryStates(producerOutputs, typeId)].sort()
    }))
  };
}

// Historical 409 shape kept for callers that render `affected` lines.
export function strandedAsAffected(stranded = []) {
  return stranded.map(({ typeId, statuses }) => ({
    typeId,
    statuses: statuses.map(({ state }) => state),
    count: statuses.reduce((total, { count }) => total + count, 0)
  }));
}

export function normalizeStatusMappings(mappings = []) {
  if (!Array.isArray(mappings)) return [];
  const seen = new Set();
  return mappings.flatMap(mapping => {
    const typeId = String(mapping?.typeId || '');
    const from = String(mapping?.from || '');
    const to = String(mapping?.to || '');
    const key = `${typeId}|${from}`;
    if (!typeId || !from || !to || seen.has(key)) return [];
    seen.add(key);
    return [{ typeId, from, to }];
  });
}

// Declared mappings cover the plan when every removed state with a live
// count carries one mapping onto a retained target. Declared rows the
// current plan does not require are no-ops: declarations persist on the
// definition across applies, and a mapping for a state a later plan no
// longer removes must not block activation.
export function validateStatusMappings(plan = {}, mappings = []) {
  const errors = [];
  const requiredByKey = new Map();
  for (const row of plan.statuses || []) {
    for (const { state } of row.removed || []) {
      requiredByKey.set(`${row.typeId}|${state}`, {
        typeId: row.typeId,
        state,
        targets: row.targets || []
      });
    }
  }
  for (const { typeId, state, targets } of requiredByKey.values()) {
    const mapping = mappings.find(item => item.typeId === typeId && item.from === state);
    if (!mapping) {
      errors.push(`${typeId} state ${state} has no migration target`);
      continue;
    }
    if (!targets.includes(mapping.to)) {
      errors.push(`${mapping.to} is not a retained state of ${typeId}`);
    }
  }
  return errors;
}

function producerOutputIdForState(compiled = {}, typeId = '', targetState = '') {
  for (const [producerOutputId, output] of Object.entries(compiled.producerOutputs || {})) {
    if (output.typeId !== typeId) continue;
    const workflow = output.workflow || {};
    const region = workflow.regions?.[workflow.primaryRegion] || {};
    if (Object.hasOwn(region.states || {}, targetState)) return producerOutputId;
  }
  return null;
}

// Idempotent: instances no longer holding the removed state are skipped,
// so re-running with the same mappings completes an interrupted migration.
export async function applyStatusMigrations({ mappings = [], auth = {}, organizationId = null, compiled = {} } = {}) {
  const byTypeId = new Map();
  for (const mapping of mappings) {
    if (!byTypeId.has(mapping.typeId)) byTypeId.set(mapping.typeId, []);
    byTypeId.get(mapping.typeId).push(mapping);
  }
  const applied = {};
  const failures = [];
  for (const [typeId, typeMappings] of byTypeId) {
    const service = getAppRegistry().getInstanceService(typeId);
    if (!service?.processList) {
      for (const mapping of typeMappings) {
        failures.push({ typeId, id: null, from: mapping.from, to: mapping.to, error: `Entity service cannot query ${typeId} from a process` });
      }
      continue;
    }
    let entities = [];
    try {
      entities = await service.processList({}, auth);
    } catch (error) {
      for (const mapping of typeMappings) {
        failures.push({ typeId, id: null, from: mapping.from, to: mapping.to, error: error?.message || String(error) });
      }
      continue;
    }
    for (const entity of entities || []) {
      const record = entity?.toJSON ? entity.toJSON() : entity;
      const from = record?.states?.main
        ?? (typeof record?.status?.state === 'string' ? record.status.state : record?.status?.state?.primary);
      const mapping = typeMappings.find(item => item.from === from);
      if (!mapping) continue;
      const id = record?._id || record?.id || record?.identity?.uid;
      if (!id) continue;
      try {
        await stateService.setInitialStateForOrganization(
          typeId,
          id,
          mapping.to,
          organizationId,
          auth.userId,
          {
            note: 'Process apply migration',
            producerOutputId: producerOutputIdForState(compiled, typeId, mapping.to) || undefined
          }
        );
        await entityEventService.publishEntityChanged(auth, {
          type: typeId,
          id,
          change: 'updated',
          reason: 'process-apply-migration'
        });
        const key = `${mapping.from}->${mapping.to}`;
        applied[typeId] = applied[typeId] || {};
        applied[typeId][key] = (applied[typeId][key] || 0) + 1;
      } catch (error) {
        failures.push({ typeId, id: String(id), from: mapping.from, to: mapping.to, error: error?.message || String(error) });
      }
    }
  }
  return { applied, failures };
}

export function throwMigrationRequired(stranded, plan) {
  const detail = strandedAsAffected(stranded)
    .map(item => `${item.typeId} ${item.statuses.join(', ')} (${item.count})`)
    .join('; ');
  throw createError({
    statusCode: 409,
    message: `Removed workflow states still used by active entities require a migration decision: ${detail}`,
    data: { migrationRequired: true, affected: strandedAsAffected(stranded), migrationPlan: plan }
  });
}
