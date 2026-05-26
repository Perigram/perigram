import * as factories from './factories.js';

export const MANUAL_ENTITY_FACTORIES = {
  artifact: factories.createMockArtifact,
  cassette_design: factories.createMockCassetteDesign,
  cassette_instance: factories.createMockCassetteInstance,
  catalog: factories.createMockCatalog,
  color: factories.createMockColor,
  layer_standard: factories.createMockLayerStandard,
  material: factories.createMockMaterial,
  material_pile: factories.createMockPile,
  nesting_run: factories.createMockNestingRun,
  organization: factories.createMockOrganization,
  pen_template: factories.createMockPenTemplate,
  project: factories.createMockProject,
  queue: factories.createMockQueue,
  remnant: factories.createMockRemnant,
  requisition: factories.createMockRequisition,
  sheet: factories.createMockSheet,
  sheet_design: factories.createMockSheetDesign,
  tool_profile: factories.createMockToolProfile,
  user: factories.createMockUser,
  warehouse: factories.createMockWarehouse
};

const MANUAL_LINEAGE_FIELDS = {
  artifact: ['organizationId', 'queueId', 'runId', 'sheetDesignId'],
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
  defaultPenId: 'pen_template',
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

const MANUAL_DATA_FIELDS = {
  artifact: [{ name: 'kind', type: 'enum', options: ['LAYOUT_DXF', 'LAYOUT_SVG'] }],
  catalog: [{ name: 'material', default: 'ALUMINUM' }],
  color: [{ name: 'code', default: 'RAL-9016' }, { name: 'hexCode', default: '#F6F6F6' }],
  layer_standard: [
    { name: 'code', default: 'FACADE_EXT' },
    { name: 'category', type: 'enum', options: ['MILLING', 'MARKING', 'FOLDING'] },
    { name: 'defaultPenId', type: 'entityId', entityType: 'pen_template' }
  ],
  material: [{ name: 'code', default: 'ACP' }, { name: 'description', default: 'Manual workbench material' }],
  material_pile: [
    { name: 'quantity', type: 'number', default: 10, min: 0 },
    { name: 'width', type: 'number', default: 3000, min: 0 },
    { name: 'length', type: 'number', default: 1500, min: 0 },
    { name: 'sheetThickness', type: 'number', default: 4, min: 0 }
  ],
  pen_template: [{ name: 'strokeColor', default: '#FF0000' }, { name: 'strokeWeight', type: 'number', default: 2, min: 0 }],
  project: [{ name: 'address', default: 'Workbench project address' }],
  queue: [
    { name: 'queueNumber', default: 'Q-MANUAL' },
    { name: 'cassetteId', type: 'entityId', entityType: 'cassette', required: true },
    { name: 'quantity', type: 'number', default: 1, min: 1 },
    { name: 'materialPileId', type: 'entityId', entityType: 'material_pile' }
  ],
  requisition: [
    { name: 'requisitionNumber', default: 'REQ-MANUAL' },
    { name: 'catalogId', type: 'entityId', entityType: 'catalog' },
    { name: 'quantity', type: 'number', default: 10, min: 1 }
  ],
  remnant: [
    { name: 'width', type: 'number', default: 900, min: 0 },
    { name: 'length', type: 'number', default: 500, min: 0 }
  ],
  sheet: [
    { name: 'width', type: 'number', default: 3000, min: 0 },
    { name: 'length', type: 'number', default: 1500, min: 0 },
    { name: 'sheetThickness', type: 'number', default: 4, min: 0 }
  ],
  tool_profile: [
    { name: 'diameter', type: 'number', default: 4, min: 0 },
    { name: 'kerf', type: 'number', default: 4, min: 0 },
    { name: 'angle', type: 'number', default: 180, min: 0 }
  ],
  warehouse: [{ name: 'address', default: 'Workbench warehouse address' }]
};

export function manualEntityContextType(entityType) {
  return entityType === 'cassette_template' ? 'cassette' : entityType;
}

export function manualEntityPreviewType(entityType) {
  return entityType === 'cassette' ? 'cassette_template' : entityType;
}

export function manualFieldsForEntity(type, workflowCompile = {}) {
  if (!type || type === 'cassette') return [];
  const workflow = workflowCompile.machines?.[type];
  const stateNames = workflowCompile.states?.[type] || [];
  return [
    { name: 'name', type: 'string', required: true },
    ...(stateNames.length ? [{ name: 'state', type: 'workflowState', entityType: type, default: workflow?.initial || stateNames[0] }] : []),
    ...(MANUAL_LINEAGE_FIELDS[type] || []).map(name => ({
      name,
      type: 'entityId',
      entityType: ENTITY_ID_FIELD_TYPES[name],
      required: !['manufacturerId', 'requisitionId', 'runId', 'sheetDesignId'].includes(name)
    })),
    ...(MANUAL_DATA_FIELDS[type] || [])
  ];
}

export function defaultManualEntityDraft(type, { context = {}, workflowCompile = {}, label = type } = {}) {
  const fields = manualFieldsForEntity(type, workflowCompile);
  const sequence = Object.keys(context.entities?.[manualEntityContextType(type)] || {}).length + 1;
  const draft = {};
  for (const field of fields) {
    if (field.name === 'name') {
      draft.name = `${label} ${sequence}`;
      continue;
    }
    if (field.name === 'state') {
      draft.state = field.default;
      continue;
    }
    if (field.type === 'entityId') {
      const value = firstEntityOptionValue(context, field.entityType);
      if (value) draft[field.name] = value;
      continue;
    }
    if (field.default !== undefined) draft[field.name] = field.default;
  }
  return draft;
}

export function buildManualWorkbenchEntity(type, draft = {}, { context = {}, workflowCompile = {} } = {}) {
  const factory = type === 'cassette' ? factories.createMockCassetteTemplate : MANUAL_ENTITY_FACTORIES[type];
  if (!factory) return null;
  const base = factory();
  const uid = uniqueManualEntityId(type);
  const name = String(draft.name || type).trim();
  const state = draft.state || workflowCompile.machines?.[type]?.initial || workflowCompile.states?.[type]?.[0] || base.status?.state || 'ACTIVE';
  const status = manualStatus(state, context.access);
  const specs = manualSpecsFor(type, draft, base.specs);
  return {
    ...base,
    _id: uid,
    identity: {
      ...(base.identity || {}),
      uid,
      name,
      slug: slugify(name),
      serial: draft.serial || base.identity?.serial || uid.toUpperCase()
    },
    origin: status,
    status,
    lineage: manualLineageFor(type, draft, base.lineage || {}, context.access),
    specs,
    data: manualDataFor(type, draft, base.data || {}, specs, context)
  };
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

function manualLineageFor(type, draft, baseLineage = {}, access = {}) {
  const lineage = { ...baseLineage };
  for (const name of MANUAL_LINEAGE_FIELDS[type] || []) {
    if (draft[name]) lineage[name] = draft[name];
    else delete lineage[name];
  }
  if (type === 'cassette') lineage.organizationId = access.organizationId;
  return Object.fromEntries(Object.entries(lineage).filter(([, value]) => value));
}

function manualSpecsFor(type, draft, baseSpecs = {}) {
  if (!['material_pile', 'sheet', 'remnant'].includes(type)) return baseSpecs;
  const width = Number(draft.width || baseSpecs?.width || 0);
  const length = Number(draft.length || baseSpecs?.length || 0);
  const area = width && length ? (width * length) / 1000000 : baseSpecs?.area;
  return {
    ...(baseSpecs || {}),
    width,
    length,
    area,
    sheetThickness: Number(draft.sheetThickness || baseSpecs?.sheetThickness || 0) || baseSpecs?.sheetThickness
  };
}

function manualDataFor(type, draft, baseData = {}, specs = {}, context = {}) {
  if (type === 'cassette') {
    const definition = draft.definition || baseData.definition || {};
    return {
      ...baseData,
      type: 'PARAMETRIC',
      definition,
      parameters: draft.parameters || Object.keys(definition.params || {}),
      organizationId: context.access?.organizationId,
      userId: context.access?.userId
    };
  }
  if (type === 'queue') {
    const cassetteId = draft.cassetteId || firstEntityOptionValue(context, 'cassette');
    return {
      ...baseData,
      queueNumber: draft.queueNumber || baseData.queueNumber,
      job: {
        items: cassetteId ? [{
          id: cassetteId,
          type: 'PARAMETRIC',
          quantity: Number(draft.quantity || 1),
          parameters: parametersForCassette(context, cassetteId)
        }] : [],
        materialPool: draft.materialPileId ? [{ type: 'PILE', id: draft.materialPileId }] : []
      }
    };
  }
  if (type === 'material_pile') {
    const quantity = Number(draft.quantity || baseData.quantity || 0);
    return { ...baseData, specs, quantity, stock: { total: quantity, used: 0 } };
  }
  if (type === 'sheet' || type === 'remnant') return { ...baseData, specs };
  if (type === 'catalog') return { ...baseData, material: draft.material || baseData.material };
  if (type === 'color') return { ...baseData, code: draft.code || baseData.code, visuals: { ...(baseData.visuals || {}), hexCode: draft.hexCode || baseData.visuals?.hexCode } };
  if (type === 'layer_standard') return { ...baseData, code: draft.code || baseData.code, category: draft.category || baseData.category, defaultPenId: draft.defaultPenId || baseData.defaultPenId };
  if (type === 'material') return { ...baseData, code: draft.code || baseData.code, description: draft.description || baseData.description };
  if (type === 'pen_template') return { ...baseData, stroke: { ...(baseData.stroke || {}), color: draft.strokeColor || baseData.stroke?.color, weight: Number(draft.strokeWeight || baseData.stroke?.weight || 1) } };
  if (type === 'project') return { ...baseData, address: draft.address || baseData.address };
  if (type === 'requisition') return { ...baseData, requisitionNumber: draft.requisitionNumber || baseData.requisitionNumber, items: draft.catalogId ? [{ catalogId: draft.catalogId, quantity: Number(draft.quantity || 1) }] : baseData.items };
  if (type === 'tool_profile') return { ...baseData, diameter: Number(draft.diameter || baseData.diameter), kerf: Number(draft.kerf || baseData.kerf), angle: Number(draft.angle || baseData.angle) };
  if (type === 'warehouse') return { ...baseData, address: draft.address || baseData.address };
  if (type === 'artifact') return { ...baseData, type: draft.kind || baseData.type };
  return baseData;
}

function firstEntityOptionValue(context, type) {
  return entityOptions(context, type)[0]?.value || '';
}

function parametersForCassette(context, id) {
  const cassette = entityOptions(context, 'cassette').find(option => option.value?.toString() === id?.toString())?.entity;
  const params = cassette?.data?.definition?.params || {};
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Number(value) || value]));
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
