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
import { statusService } from '~/server/core/machines/service.js';
import * as entityEventService from '../entity-events/service.js';

// stranded: [{ entityType, statuses: [{ state, count }] }] from the live
// count pass; nextCompiled: the compiled contract about to be applied.
export function buildStatusMigrationPlan(stranded = [], nextCompiled = {}) {
  const producerOutputs = nextCompiled?.producerOutputs || {};
  return {
    statuses: stranded.map(({ entityType, statuses }) => ({
      entityType,
      removed: statuses,
      targets: [...primaryStates(producerOutputs, entityType)].sort()
    }))
  };
}

// Historical 409 shape kept for callers that render `affected` lines.
export function strandedAsAffected(stranded = []) {
  return stranded.map(({ entityType, statuses }) => ({
    entityType,
    statuses: statuses.map(({ state }) => state),
    count: statuses.reduce((total, { count }) => total + count, 0)
  }));
}

export function normalizeStatusMappings(mappings = []) {
  if (!Array.isArray(mappings)) return [];
  const seen = new Set();
  return mappings.flatMap(mapping => {
    const entityType = String(mapping?.entityType || '');
    const from = String(mapping?.from || '');
    const to = String(mapping?.to || '');
    const key = `${entityType}|${from}`;
    if (!entityType || !from || !to || seen.has(key)) return [];
    seen.add(key);
    return [{ entityType, from, to }];
  });
}

export function validateStatusMappings(plan = {}, mappings = []) {
  const errors = [];
  const requiredByKey = new Map();
  for (const row of plan.statuses || []) {
    for (const { state } of row.removed || []) {
      requiredByKey.set(`${row.entityType}|${state}`, {
        entityType: row.entityType,
        state,
        targets: row.targets || []
      });
    }
  }
  for (const { entityType, from } of mappings) {
    if (!requiredByKey.has(`${entityType}|${from}`)) {
      errors.push(`No removed state ${from} on ${entityType} requires a mapping`);
    }
  }
  for (const { entityType, state, targets } of requiredByKey.values()) {
    const mapping = mappings.find(item => item.entityType === entityType && item.from === state);
    if (!mapping) {
      errors.push(`${entityType} state ${state} has no migration target`);
      continue;
    }
    if (!targets.includes(mapping.to)) {
      errors.push(`${mapping.to} is not a retained state of ${entityType}`);
    }
  }
  return errors;
}

function producerOutputIdForState(compiled = {}, entityType = '', targetState = '') {
  for (const [producerOutputId, output] of Object.entries(compiled.producerOutputs || {})) {
    if (output.entityType !== entityType) continue;
    const workflow = output.workflow || {};
    const region = workflow.regions?.[workflow.primaryRegion] || {};
    if (Object.hasOwn(region.states || {}, targetState)) return producerOutputId;
  }
  return null;
}

// Idempotent: instances no longer holding the removed state are skipped,
// so re-running with the same mappings completes an interrupted migration.
export async function applyStatusMigrations({ mappings = [], auth = {}, organizationId = null, compiled = {} } = {}) {
  const byEntityType = new Map();
  for (const mapping of mappings) {
    if (!byEntityType.has(mapping.entityType)) byEntityType.set(mapping.entityType, []);
    byEntityType.get(mapping.entityType).push(mapping);
  }
  const applied = {};
  const failures = [];
  for (const [entityType, typeMappings] of byEntityType) {
    const service = getAppRegistry().getEntityService(entityType);
    if (!service?.processList) {
      for (const mapping of typeMappings) {
        failures.push({ entityType, id: null, from: mapping.from, to: mapping.to, error: `Entity service cannot query ${entityType} from a process` });
      }
      continue;
    }
    let entities = [];
    try {
      entities = await service.processList({}, auth);
    } catch (error) {
      for (const mapping of typeMappings) {
        failures.push({ entityType, id: null, from: mapping.from, to: mapping.to, error: error?.message || String(error) });
      }
      continue;
    }
    for (const entity of entities || []) {
      const record = entity?.toJSON ? entity.toJSON() : entity;
      const from = record?.status?.state?.primary;
      const mapping = typeMappings.find(item => item.from === from);
      if (!mapping) continue;
      const id = record?._id || record?.id || record?.identity?.uid;
      if (!id) continue;
      try {
        await statusService.setInitialStateForOrganization(
          entityType,
          id,
          mapping.to,
          organizationId,
          auth.userId,
          {
            note: 'Process apply migration',
            producerOutputId: producerOutputIdForState(compiled, entityType, mapping.to) || undefined
          }
        );
        await entityEventService.publishEntityChanged(auth, {
          type: entityType,
          id,
          change: 'updated',
          reason: 'process-apply-migration'
        });
        const key = `${mapping.from}->${mapping.to}`;
        applied[entityType] = applied[entityType] || {};
        applied[entityType][key] = (applied[entityType][key] || 0) + 1;
      } catch (error) {
        failures.push({ entityType, id: String(id), from: mapping.from, to: mapping.to, error: error?.message || String(error) });
      }
    }
  }
  return { applied, failures };
}

export function throwMigrationRequired(stranded, plan) {
  const detail = strandedAsAffected(stranded)
    .map(item => `${item.entityType} ${item.statuses.join(', ')} (${item.count})`)
    .join('; ');
  throw createError({
    statusCode: 409,
    message: `Removed workflow states still used by active entities require a migration decision: ${detail}`,
    data: { migrationRequired: true, affected: strandedAsAffected(stranded), migrationPlan: plan }
  });
}
