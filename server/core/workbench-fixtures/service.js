import { createError } from 'h3';
import { getCutkitRegistry } from '~/server/runtime/cutkit-registry.js';
import { contextToScenario, normalizeWorkbenchContext } from '~/test-data/workbench-context.js';
import { compileWorkflowDraft } from '~/utils/workflow-compiler.js';
import { createWorkflowState, getPrimaryState, getWorkflowRegion, normalizeWorkflow } from '~/packages/workflows/src/index.js';
import * as repository from './repository.js';

export async function seedScenario({ scenario, context, workflows = {} } = {}) {
  const entityCollections = getEntityCollections();
  const sourceScenario = scenario?.entities ? scenario : contextToScenario(context);
  if (!sourceScenario?.entities) throw createError({ statusCode: 400, message: 'Fixture scenario is required' });
  const compiled = compileWorkflowDraft({ workflows });
  if (!compiled.ok) {
    throw createError({
      statusCode: 400,
      message: `Workflow draft is invalid: ${compiled.issues.map(issue => issue.message).join('; ')}`
    });
  }

  const persistedEntities = {};
  for (const [typeId, entities] of Object.entries(sourceScenario.entities)) {
    const collection = entityCollections[typeId];
    if (!collection) continue;
    persistedEntities[typeId] = toPlainObject(await repository.upsertEntities(collection, entities.map(entity => normalizeEntityStatus(entity, compiled.machines[typeId]))));
  }

  const persistedScenario = {
    ...sourceScenario,
    entities: persistedEntities,
    manifests: {
      ...(sourceScenario.manifests || {}),
      entityOptions: buildEntityOptions(persistedEntities)
    },
    workflowCompile: {
      ok: true,
      states: compiled.states,
      warnings: compiled.warnings
    }
  };

  return toPlainObject({
    scenario: persistedScenario,
    context: {
      ...normalizeWorkbenchContext({
        ...(context || persistedScenario),
        ...persistedScenario,
        workflows: compiled
      }),
      persisted: true
    }
  });
}

function getEntityCollections() {
  const entities = getCutkitRegistry().getDomain('cnc')?.entities || [];
  return Object.fromEntries(entities.map(entity => [entity.type, entity.collection]));
}

function normalizeEntityStatus(entity, workflow) {
  if (!workflow) return entity;
  const normalized = normalizeWorkflow(workflow);
  const region = getWorkflowRegion(normalized, normalized.primaryRegion);
  const state = region?.states?.[getPrimaryState(entity.status)] ? getPrimaryState(entity.status) : region.initial;
  const lifecycleSchema = region.states?.[state]?.lifecycle;
  const stateObject = createWorkflowState(normalized, { primary: state, active: { [normalized.primaryRegion]: state } });
  const lifecycle = lifecycleSchema
    ? {
        actors: [],
        attachments: Object.fromEntries(Object.entries(lifecycleSchema.attachments || {}).map(([key, schema]) => [key, schema.multiple ? [] : null])),
        data: lifecycleSchema.data === true ? entity.status?.lifecycle?.data || {} : {}
      }
    : { actors: [], attachments: {}, data: {} };
  return {
    ...entity,
    status: { ...(entity.status || {}), state: stateObject, lifecycle },
    origin: { ...(entity.origin || entity.status || {}), state: stateObject, lifecycle }
  };
}

function buildEntityOptions(entities) {
  return Object.fromEntries(Object.entries(entities).map(([type, items]) => [type, items.map(entity => ({
    label: entity.identity?.name || entity.identity?.uid || entity._id?.toString(),
    value: entity._id?.toString(),
    entity: { ...entity, _id: entity._id?.toString() }
  }))]));
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
