import { occsParameterNames, occsQueueParameters } from '#utils/occs/parameters.js';

const LINEAGE_FIELDS = {
  artifact: ['organizationId', 'queueId', 'runId', 'sheetDesignId'],
  cassette: ['organizationId'],
  cassette_design: ['organizationId', 'projectId', 'templateId'],
  cassette_instance: ['organizationId', 'projectId', 'queueId', 'runId', 'cassetteDesignId'],
  catalog: ['organizationId', 'manufacturerId'],
  color: ['catalogId'],
  layer_standard: ['organizationId'],
  material_pile: ['organizationId', 'warehouseId', 'catalogId', 'requisitionId'],
  nesting_run: ['organizationId', 'projectId', 'queueId'],
  pen_template: ['userId'],
  project: ['organizationId'],
  queue: ['organizationId', 'projectId'],
  remnant: ['warehouseId', 'sheetId'],
  requisition: ['organizationId', 'projectId'],
  sheet: ['organizationId', 'warehouseId', 'queueId', 'runId'],
  sheet_design: ['organizationId', 'projectId', 'queueId', 'runId'],
  tool_profile: ['userId', 'organizationId'],
  user: ['organizationId'],
  warehouse: ['organizationId']
};

const ENTITY_ID_FIELD_TYPES = {
  cassetteDesignId: 'cassette_design',
  cassetteId: 'cassette',
  catalogId: 'catalog',
  manufacturerId: 'organization',
  materialPileId: 'material_pile',
  organizationId: 'organization',
  projectId: 'project',
  queueId: 'queue',
  requisitionId: 'requisition',
  runId: 'nesting_run',
  sheetDesignId: 'sheet_design',
  sheetId: 'sheet',
  templateId: 'cassette',
  userId: 'user',
  warehouseId: 'warehouse'
};

const OPTIONAL_LINEAGE_FIELDS = new Set(['manufacturerId', 'requisitionId', 'runId', 'sheetDesignId']);

export function manualEntityContextType(typeId) {
  return typeId === 'cassette_template' ? 'cassette' : typeId;
}

export function manualInstancePreviewType(typeId) {
  return typeId === 'cassette' ? 'cassette_template' : typeId;
}

export function manualFieldsForEntity(type, workflowCompile = {}) {
  if (!type || type === 'cassette') return [];
  const workflow = workflowCompile.machines?.[type];
  const stateNames = workflowCompile.states?.[type] || [];
  return [
    { name: 'name', type: 'string', required: true },
    ...(stateNames.length ? [{ name: 'state', type: 'workflowState', typeId: type, default: workflow?.initial || stateNames[0] }] : []),
    ...lineageFieldsFor(type),
    ...dataFieldsFor(type)
  ];
}

export function defaultManualEntityDraft(type, { context = {}, workflowCompile = {}, label = type } = {}) {
  const fields = manualFieldsForEntity(type, workflowCompile);
  const sequence = Object.keys(context.entities?.[manualEntityContextType(type)] || {}).length + 1;
  const draft = {};
  for (const field of fields) {
    if (field.name === 'name') draft.name = `${label} ${sequence}`;
    else if (field.name === 'state') draft.state = field.default;
  }
  return draft;
}

export function buildManualWorkbenchEntity(type, draft = {}, { context = {}, workflowCompile = {}, entityDefinition = {} } = {}) {
  const uid = uniqueManualEntityId(type);
  const name = String(draft.name || type).trim();
  const state = draft.state || workflowCompile.machines?.[type]?.initial || workflowCompile.states?.[type]?.[0] || 'ACTIVE';
  const status = manualStatus(state, context.access);
  const blocks = new Set(entityDefinition.blocks || []);
  return {
    _id: uid,
    identity: { uid, name, slug: slugify(name), serial: uid.toUpperCase() },
    origin: status,
    status,
    lineage: manualLineageFor(type, draft, context.access),
    specs: blocks.has('specs') ? {} : null,
    attachments: {},
    data: manualDataFor(type, draft, context),
    summary: blocks.has('summary') ? {} : {}
  };
}

function lineageFieldsFor(type) {
  return (LINEAGE_FIELDS[type] || []).map(name => ({
    name,
    type: 'instanceId',
    typeId: ENTITY_ID_FIELD_TYPES[name],
    required: !OPTIONAL_LINEAGE_FIELDS.has(name)
  }));
}

function dataFieldsFor(type) {
  if (type !== 'queue') return [];
  return [
    { name: 'cassetteId', type: 'instanceId', typeId: 'cassette', required: true },
    { name: 'quantity', type: 'number', min: 1, required: true },
    { name: 'materialPileId', type: 'instanceId', typeId: 'material_pile' }
  ];
}

function manualStatus(state, access = {}) {
  return {
    state,
    userId: access.userId || 'user-demo',
    timestamp: new Date(),
    metadata: { note: 'Created manually in workbench' },
    eventId: uniqueManualEntityId('status-event'),
    lifecycle: { actors: [], attachments: {}, data: {} }
  };
}

function manualLineageFor(type, draft, access = {}) {
  const lineage = Object.fromEntries((LINEAGE_FIELDS[type] || [])
    .map(name => [name, draft[name]])
    .filter(([, value]) => value));
  if (type === 'cassette' && access.organizationId && !lineage.organizationId) {
    lineage.organizationId = access.organizationId;
  }
  return lineage;
}

function manualDataFor(type, draft, context) {
  if (type === 'cassette') {
    const definition = draft.definition || {};
    return {
      type: 'PARAMETRIC',
      definition,
      parameters: draft.parameters || occsParameterNames(definition),
      organizationId: context.access?.organizationId,
      userId: context.access?.userId
    };
  }
  if (type === 'queue') {
    const cassetteId = draft.cassetteId;
    const quantity = Number(draft.quantity);
    return {
      job: {
        items: cassetteId && Number.isFinite(quantity) && quantity > 0 ? [{
          id: cassetteId,
          type: 'PARAMETRIC',
          quantity,
          parameters: parametersForCassette(context, cassetteId)
        }] : [],
        materialPool: draft.materialPileId ? [{ type: 'PILE', id: draft.materialPileId }] : []
      }
    };
  }
  return {};
}

function parametersForCassette(context, id) {
  const cassette = entityOptions(context, 'cassette').find(option => option.value?.toString() === id?.toString())?.entity;
  return occsQueueParameters(cassette?.data?.definition || {});
}

function entityOptions(context, type) {
  return Object.values(context.entities?.[manualEntityContextType(type)] || {}).map(entity => ({
    label: entity.identity?.name || entity.identity?.uid || entity._id,
    value: entity._id,
    entity
  }));
}

function uniqueManualEntityId(type) {
  return `${type.replace(/_/g, '-')}-manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function slugify(value) {
  return String(value || 'entity')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'entity';
}
