import {
  MOCK_IDS,
  createMockArtifact,
  createMockCassetteDesign,
  createMockCassetteInstance,
  createMockCassetteTemplate,
  createMockCatalog,
  createMockColor,
  createMockLayerStandard,
  createMockMaterial,
  createMockNestingRun,
  createMockOrganization,
  createMockPenTemplate,
  createMockPile,
  createMockProject,
  createMockQueue,
  createMockRemnant,
  createMockRequisition,
  createMockSheet,
  createMockSheetDesign,
  createMockToolProfile,
  createMockUser,
  createMockWarehouse
} from './factories.js';
import { cncCommands, cncWorkflows } from '#packages/domain-cnc/src/index.js';
import { collectCommandAccess, collectWorkflowAccess, workflowInitialState } from '#utils/workflow-compiler.js';
import { occsQueueParameters } from '#utils/occs/parameters.js';
import { createDefaultOccsCassetteTemplateDefinition } from '#utils/occs/templates.js';

export const CNC_DEMO_SCENARIO_ID = 'cnc-demo-production';

export function createCncFixtureScenario({ workflows = cncWorkflows, commands = cncCommands } = {}) {
  const status = (entityType, fallback) => workflowInitialState(workflows, entityType, fallback);
  const cassetteTemplateDefinition = createDefaultOccsCassetteTemplateDefinition();
  const refs = {
    organization: MOCK_IDS.organizationId,
    manufacturer: MOCK_IDS.manufacturerId,
    user: 'user-demo',
    catalog: MOCK_IDS.catalogId,
    color: 'color-demo-ral-9016',
    penTemplate: 'pen-demo-cutting',
    layerStandard: 'layer-standard-demo-facade-ext',
    toolProfile: 'tool-demo-flat-endmill-4',
    warehouse: MOCK_IDS.warehouseId,
    materialPile: 'pile-demo-001',
    sheet: 'sheet-demo-001',
    remnant: 'remnant-demo-001',
    project: MOCK_IDS.projectId,
    cassetteTemplate: MOCK_IDS.cassetteTemplateId,
    cassetteDesign: MOCK_IDS.cassetteDesignId,
    queue: MOCK_IDS.queueId,
    nestingRun: MOCK_IDS.runId,
    sheetDesign: MOCK_IDS.sheetDesignId,
    artifact: 'artifact-demo-layout-dxf',
    cassetteInstance: 'cassette-instance-demo-001',
    requisition: 'requisition-demo-001'
  };

  const scenario = {
    id: CNC_DEMO_SCENARIO_ID,
    label: 'CNC demo production graph',
    refs,
    entities: {
      organization: [
        createMockOrganization({ status: undefined, origin: undefined }),
        createMockOrganization({
          _id: MOCK_IDS.manufacturerId,
          identity: { uid: MOCK_IDS.manufacturerId, name: 'Panel Manufacturer', slug: 'panel-manufacturer' },
          status: undefined,
          origin: undefined,
          data: {
            type: 'MANUFACTURER',
            email: 'manufacturer@example.com',
            phone: '+1 555 0101',
            address: 'Supplier District'
          }
        })
      ],
      user: [createMockUser()],
      catalog: [createMockCatalog({ status: undefined, origin: undefined })],
      color: [createMockColor({ status: undefined, origin: undefined })],
      pen_template: [createMockPenTemplate({ status: undefined, origin: undefined })],
      layer_standard: [createMockLayerStandard({
        status: undefined,
        origin: undefined,
        lineage: { organizationId: refs.organization },
        data: {
          code: 'FACADE_EXT',
          category: 'MILLING',
          defaultPenId: refs.penTemplate,
          parameters: [],
          metadata: { color: '#3b82f6' }
        }
      })],
      tool_profile: [createMockToolProfile({ status: undefined, origin: undefined, lineage: { userId: refs.user, organizationId: refs.organization } })],
      warehouse: [createMockWarehouse({ status: undefined, origin: undefined })],
      material_pile: [createMockPile({ status: undefined, origin: undefined })],
      sheet: [createMockSheet({ status: undefined, origin: undefined })],
      remnant: [createMockRemnant({ status: undefined, origin: undefined })],
      project: [createMockProject({ status: undefined, origin: undefined })],
      cassette: [createMockCassetteTemplate({
        status: undefined,
        origin: undefined,
        data: {
          type: 'PARAMETRIC',
          definition: cassetteTemplateDefinition,
          parameters: Object.keys(cassetteTemplateDefinition.parameters || {}),
          organizationId: refs.organization,
          userId: refs.user
        }
      })],
      cassette_design: [createMockCassetteDesign({
        status: undefined,
        origin: undefined,
        lineage: { organizationId: refs.organization, projectId: refs.project, templateId: refs.cassetteTemplate },
        data: {
          parameters: occsQueueParameters(cassetteTemplateDefinition),
          geometry: {
            dxfId: 'dxf-cassette-design-demo',
            preview: {
              viewBox: '0 0 160 90',
              layers: [
                { name: 'outline', color: 'currentColor', weight: 2, paths: ['M12 12 H148 V78 H12 Z'] },
                { name: 'folds', color: 'var(--p-primary-color)', weight: 1.5, paths: ['M38 12 V78', 'M122 12 V78'] }
              ]
            }
          }
        }
      })],
      queue: [createMockQueue({
        status: undefined,
        origin: undefined,
        data: {
          queueNumber: 'Q-001',
          job: {
            items: [{ id: refs.cassetteTemplate, type: 'PARAMETRIC', quantity: 10, parameters: occsQueueParameters(cassetteTemplateDefinition) }],
            materialPool: [{ type: 'PILE', id: refs.materialPile }]
          }
        }
      })],
      nesting_run: [createMockNestingRun({ status: undefined, origin: undefined })],
      sheet_design: [createMockSheetDesign({
        status: undefined,
        origin: undefined,
        lineage: { organizationId: refs.organization, projectId: refs.project, queueId: refs.queue, runId: refs.nestingRun },
        data: {
          placements: [{ cassetteDesignId: refs.cassetteDesign, x: 200, y: 120, rotation: 0 }],
          geometry: createMockSheetDesign().data.geometry
        }
      })],
      artifact: [createMockArtifact({ status: undefined, origin: undefined, lineage: { organizationId: refs.organization, queueId: refs.queue, runId: refs.nestingRun, sheetDesignId: refs.sheetDesign } })],
      cassette_instance: [createMockCassetteInstance({ status: undefined, origin: undefined, lineage: { organizationId: refs.organization, projectId: refs.project, queueId: refs.queue, runId: refs.nestingRun, cassetteDesignId: refs.cassetteDesign } })],
      requisition: [createMockRequisition({ status: undefined, origin: undefined })],
      material: [createMockMaterial({ status: undefined, origin: undefined, lineage: { organizationId: refs.organization } })]
    }
  };

  applyWorkflowStatuses(scenario, workflows, status);
  scenario.relationships = buildRelationships(scenario);
  scenario.access = buildScenarioAccess({ scenario, workflows, commands });
  scenario.manifests = {
    commandDefaults: buildCommandDefaults(refs),
    entityOptions: buildEntityOptions(scenario.entities)
  };
  scenario.validation = validateCncFixtureScenario(scenario, workflows);
  return toPlainObject(scenario);
}

export function validateCncFixtureScenario(scenario, workflows = cncWorkflows) {
  const issues = [];
  const byId = new Map(Object.values(scenario.entities).flat().map(entity => [entity._id, entity]));
  for (const [type, entities] of Object.entries(scenario.entities)) {
    for (const entity of entities) {
      const state = entity.status?.state;
      if (workflows[type] && !workflows[type].states?.[state]) {
        issues.push(`${type}:${entity._id} has state ${state} outside compiled workflow`);
      }
      for (const [key, value] of Object.entries(entity.lineage || {})) {
        if (String(key).endsWith('Id') && value && !isExternalRef(value) && !byId.has(value)) {
          issues.push(`${type}:${entity._id} lineage ${key} references missing ${value}`);
        }
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function applyWorkflowStatuses(scenario, workflows, status) {
  for (const [type, entities] of Object.entries(scenario.entities)) {
    for (const entity of entities) {
      const state = status(type, entity.status?.state || 'ACTIVE');
      const baseStatus = entity.status || {
        userId: 'user-demo',
        timestamp: new Date(),
        metadata: { note: 'Generated by workbench fixture scenario' },
        eventId: `${entity._id}-origin`,
        lifecycle: { actors: [], attachments: {}, data: {} }
      };
      entity.status = { ...baseStatus, state };
      entity.origin = { ...(entity.origin || baseStatus), state };
    }
  }
}

function buildRelationships(scenario) {
  return Object.entries(scenario.entities).flatMap(([type, entities]) => entities.flatMap(entity => Object.entries(entity.lineage || {})
    .filter(([key, value]) => key.endsWith('Id') && value)
    .map(([key, value]) => ({ from: `${type}:${entity._id}`, key, to: value }))));
}

function buildScenarioAccess({ scenario, workflows, commands }) {
  const permissions = {
    ...collectWorkflowAccess(workflows),
    ...collectCommandAccess(Object.values(commands || {})),
    cassettes: 'admin',
    materials: 'admin',
    projects: 'admin',
    queues: 'admin',
    nesting_runs: 'admin',
    artifacts: 'admin'
  };
  return {
    userId: scenario.refs.user,
    organizationId: scenario.refs.organization,
    permissions,
    memberships: [{ organizationId: scenario.refs.organization, permissions, status: 'active' }]
  };
}

function buildCommandDefaults(refs) {
  return {
    solveNesting: {
      entities: { queue: refs.queue },
      parameters: { materialMode: 'VIRTUAL', width: 1220, height: 2440, spacing: 5, inventoryItems: [], toolProfileId: refs.toolProfile }
    },
    generateAttachment: {
      entities: { sheetDesign: refs.sheetDesign, nestingRun: refs.nestingRun },
      parameters: { kind: 'LAYOUT_DXF' }
    }
  };
}

function buildEntityOptions(entities) {
  return Object.fromEntries(Object.entries(entities).map(([type, items]) => [type, items.map(entity => ({
    label: entity.identity?.name || entity.identity?.uid || entity._id,
    value: entity._id,
    entity
  }))]));
}

function isExternalRef(value) {
  return String(value).startsWith('file-') || String(value).startsWith('dxf-') || String(value).startsWith('svg-');
}

function toPlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}
