// One-shot org authoring (queue nesting): defines the org machine, material,
// and nesting-run types; moves the run's machine/material choice onto the
// run; and wires the visible create-run action so nesting solves and
// constructs its sheet-design children automatically.
//
//   node server/scripts/author-org-queue-nesting.js --org org-6af9e015
//   node server/scripts/author-org-queue-nesting.js --org org-6af9e015 --apply
//
// Without --apply the script prints the plan and makes no writes.
import { randomBytes } from 'node:crypto';
import { connectDB } from '../db/mongo.js';
import { createTypeRegistry, frameworkTypes, projectDomainFromView, rowFieldId } from '#packages/cts';
import {
  authoredProcessDataFromGraphDocument,
  createDefinitionAuthoring,
  createProcessGraphDocument,
  validateProcessDefinition,
  validateLineageBindingResolution,
  validateRequiredInputAvailability
} from '#packages/processes';
import { prepareAuthoredDefinition } from '#packages/processes/designer';

const APP = process.env.APP_URL || 'http://localhost:3000';
const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2);
const orgArgIndex = args.findIndex(value => value === '--org' || value.startsWith('--org='));
const ORG = orgArgIndex < 0
  ? ''
  : (args[orgArgIndex] === '--org' ? args[orgArgIndex + 1] : args[orgArgIndex].slice(6)) || '';
const definitionArgIndex = args.findIndex(value => value === '--definition' || value.startsWith('--definition='));
const DEFINITION = definitionArgIndex < 0
  ? ''
  : (args[definitionArgIndex] === '--definition' ? args[definitionArgIndex + 1] : args[definitionArgIndex].slice(13)) || '';

if (!ORG) {
  console.error('Usage: node server/scripts/author-org-queue-nesting.js --org <organizationId> [--definition <id>] [--apply]');
  process.exit(1);
}

const QUEUE_TYPE = 't-qsh5vy5wjc';
const ENTRY_TYPE = 't-96n6bf0zpl';
const TABLE_TYPE = 't-hiihlfgqr6';
const DESIGN_TYPE = 'cassette-design';
const MACHINE_TYPE = 't-machine';
const MATERIAL_TYPE = 't-material';
const RUN_TYPE = 'nesting-run';
const SHEET_DESIGN_TYPE = 'sheet-design';
const SHEET_INSTANCE_TYPE = 'sheet-instance';
const CUT_PLAN_TYPE = 'sheet-cut-plan';

const NAME_KEY = rowFieldId('Название');
const TOOL_DIAMETER_KEY = rowFieldId('Диаметр инструмента');
const ANGLE_KEY = rowFieldId('Угол');
const THICKNESS_KEY = rowFieldId('Толщина');
const COLOR_KEY = rowFieldId('Цвет');
const WIDTH_KEY = rowFieldId('Ширина');
const HEIGHT_KEY = rowFieldId('Высота');
const DESIGN_KEY = rowFieldId('Кассета');
const COUNT_KEY = rowFieldId('Количество');
const MATERIAL_KEY = rowFieldId('Материал');
const MACHINE_KEY = rowFieldId('Станок');
const RESULT_KEY = rowFieldId('Результат');

const MACHINE = {
  id: MACHINE_TYPE,
  class: 'item',
  name: 'Станок',
  glyph: 'pi pi-cog',
  fields: {
    [NAME_KEY]: { base: 'string', identifier: true, label: 'Название' },
    [TOOL_DIAMETER_KEY]: { base: 'quantity', unit: 'mm', label: 'Диаметр инструмента' },
    [ANGLE_KEY]: { base: 'quantity', unit: 'deg', label: 'Угол' }
  }
};

const MATERIAL = {
  id: MATERIAL_TYPE,
  class: 'item',
  name: 'Материал',
  glyph: 'pi pi-box',
  fields: {
    [NAME_KEY]: { base: 'string', identifier: true, label: 'Название' },
    [THICKNESS_KEY]: { base: 'quantity', unit: 'mm', label: 'Толщина' },
    [COLOR_KEY]: { base: 'string', label: 'Цвет' },
    [WIDTH_KEY]: { base: 'quantity', unit: 'mm', label: 'Ширина' },
    [HEIGHT_KEY]: { base: 'quantity', unit: 'mm', label: 'Высота' }
  }
};

const RUN_CHILDREN = {
  sheets: { types: [SHEET_DESIGN_TYPE], onRemove: 'restrict', lineageKey: 'nestingRunId' },
  sheetInstances: { types: [SHEET_INSTANCE_TYPE], onRemove: 'restrict', lineageKey: 'nestingRunId' },
  cutPlans: { types: [CUT_PLAN_TYPE], onRemove: 'restrict', lineageKey: 'nestingRunId' }
};

const NESTING_RUN = {
  id: RUN_TYPE,
  class: 'item',
  name: 'Запуск раскладки',
  glyph: 'pi pi-play-circle',
  fields: {
    [NAME_KEY]: { base: 'string', identifier: true, label: 'Название' },
    [MATERIAL_KEY]: { base: 'ref', accepts: [MATERIAL_TYPE], label: 'Материал' },
    [MACHINE_KEY]: { base: 'ref', accepts: [MACHINE_TYPE], label: 'Станок' }
  },
  edges: { children: RUN_CHILDREN }
};

const QUEUE_RUN_CHILD = {
  types: [RUN_TYPE],
  onRemove: 'restrict',
  lineageKey: 'tQsh5vy5wjcId'
};

const db = await connectDB();
const user = await db.collection('users').findOne({
  $or: [{ 'lineage.organizationId': ORG }, { 'memberships.organizationId': ORG }],
  isActive: { $ne: false }
}, { sort: { _id: 1 } });
if (!user) {
  console.error(`No active user found for organization ${ORG}`);
  process.exit(1);
}

const definitionDoc = await db.collection('process_definitions').findOne(
  DEFINITION
    ? { _id: DEFINITION }
    : { 'lineage.organizationId': ORG, 'data.format': 'perigram.graph' },
  { sort: { _id: -1 } }
);
if (!definitionDoc) {
  console.error(`No canonical process definition found for organization ${ORG}`);
  process.exit(1);
}
const definitionId = String(definitionDoc._id);

const sessionId = randomBytes(24).toString('hex');
const headers = { 'content-type': 'application/json', cookie: `sessionId=${sessionId}` };

async function api(path, options = {}) {
  const response = await fetch(`${APP}${path}`, { headers, ...options });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function authoritativeDeclaration(declaration) {
  if (!declaration) return null;
  const { _id, organizationId, scope, version, ...rest } = declaration;
  return rest;
}

function stableJson(value) {
  return JSON.stringify(value, (key, item) => (
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right)))
      : item
  ));
}

function typeNeedsWrite(declaration, stored) {
  if (!stored) return true;
  const current = authoritativeDeclaration(stored);
  if (current.class !== declaration.class || current.name !== declaration.name) return true;
  for (const [key, field] of Object.entries(declaration.fields || {})) {
    if (stableJson(current.fields?.[key]) !== stableJson(field)) return true;
  }
  if (declaration.projections !== undefined
    && stableJson(current.projections) !== stableJson(declaration.projections)) return true;
  return false;
}

function plannedDeclaration(stored, expected) {
  const base = authoritativeDeclaration(stored) || {};
  return {
    ...base,
    ...expected,
    fields: { ...(base.fields || {}), ...(expected.fields || {}) }
  };
}

function queuePlan(stored) {
  const base = authoritativeDeclaration(stored) || {};
  const fields = { ...(base.fields || {}) };
  const removed = [];
  for (const key of [MATERIAL_KEY, MACHINE_KEY, RESULT_KEY]) {
    if (Object.hasOwn(fields, key)) {
      delete fields[key];
      removed.push(key);
    }
  }
  return {
    declaration: {
      ...base,
      fields,
      edges: {
        ...(base.edges || {}),
        children: { ...(base.edges?.children || {}), runs: QUEUE_RUN_CHILD }
      }
    },
    removed
  };
}

async function installedDomain() {
  const installs = await db.collection('plugin_installs').find({ organizationId: ORG }).toArray();
  const types = await db.collection('cts_types').find({ organizationId: ORG }).toArray();
  const registry = createTypeRegistry({ id: `queue-nesting:${ORG}` });
  for (const declaration of frameworkTypes) registry.defineType(declaration);
  for (const install of installs) {
    for (const declaration of install.declarations?.types || []) registry.defineType(declaration);
  }
  const overlay = new Map([
    [MACHINE_TYPE, MACHINE],
    [MATERIAL_TYPE, MATERIAL],
    [RUN_TYPE, NESTING_RUN]
  ]);
  const documentsInstall = installs.find(install => install.pluginId === 'documents');
  const csvTable = (documentsInstall?.declarations?.types || []).find(type => type.id === 'csv-table');
  const storedTable = types.find(type => type.id === TABLE_TYPE);
  const tableProjections = storedTable?.projections?.length
    ? storedTable.projections
    : (csvTable?.projections || []);
  const tableRepair = storedTable && tableProjections.length && !storedTable.projections?.length
    ? plannedDeclaration(storedTable, { projections: tableProjections })
    : null;
  const storedIds = new Set(types.map(type => type.id));
  const storedQueue = types.find(type => type.id === QUEUE_TYPE);
  const queue = storedQueue ? queuePlan(storedQueue) : { declaration: null, removed: [] };
  for (const stored of types) {
    const planned = overlay.get(stored.id)
      || (stored.id === QUEUE_TYPE ? queue.declaration : null)
      || (stored.id === TABLE_TYPE ? tableRepair : null);
    registry.defineType({
      ...(planned ? (stored.id === QUEUE_TYPE ? planned : plannedDeclaration(stored, planned)) : stored),
      scope: 'org',
      organizationId: ORG
    });
  }
  for (const [id, declaration] of overlay) {
    if (!storedIds.has(id)) registry.defineType({ ...declaration, scope: 'org', organizationId: ORG });
  }
  const construction = {};
  const commands = {};
  const packServices = [];
  for (const install of installs) {
    for (const [typeId, modes] of Object.entries(install.declarations?.constructions || {})) {
      construction[typeId] = { modes: Object.keys(modes) };
    }
    for (const service of install.services || []) {
      if (!service?.id) continue;
      const id = `plugin.${install.pluginId}.${service.id}`;
      commands[id] = { id, service: `plugin.${install.pluginId}`, action: 'run', plugin: true, input: { parameters: [] } };
      packServices.push({
        id,
        species: 'service',
        command: id,
        plugin: install.pluginId,
        pluginLabel: install.name,
        group: service.palette?.group || install.pluginId,
        signature: service.signature,
        execution: service.execution || null,
        render: service.render || { label: service.label || service.id }
      });
    }
  }
  return {
    domain: projectDomainFromView(registry, ORG, { commands, construction, events: [], serviceContracts: {} }, { packServices }),
    types,
    tableProjections,
    tableRepair,
    queue,
    tableStored: storedTable
  };
}

function classNodeId(authoring, typeId) {
  const data = authoring.definition();
  const record = Object.values(data.ctsTypes)
    .find(candidate => candidate.kind === 'class' && candidate.typeId === typeId);
  if (record?.id) return record.id;
  return data.graph.nodes
    .find(node => node.type === 'ctsClass' && node.data?.typeId === typeId)?.id || '';
}

function ensureNode(authoring, id, paletteId, configure) {
  const existing = authoring.record(id);
  if (existing) {
    configure(existing);
    authoring.sync(id);
    return existing;
  }
  authoring.drop(paletteId, { id });
  const record = authoring.record(id);
  configure(record);
  authoring.sync(id);
  return record;
}

function ensureWire(authoring, source, sourceHandle, target, targetHandle) {
  const connected = authoring.definition().graph.edges.some(edge => (
    edge.source === source
    && edge.sourceHandle === sourceHandle
    && edge.target === target
    && edge.targetHandle === targetHandle
  ));
  if (!connected) authoring.connect(source, sourceHandle, target, targetHandle);
}

function ensureDeclarationField(authoring, { id, classId, name, descriptor }) {
  const data = authoring.definition();
  if (data.ctsTypes[id] || data.graph.nodes.some(node => node.id === id)) return;
  authoring.declareField({ id, ownerClassId: classId, name, descriptor });
}

function ensureDeclarationClass(authoring, { id, typeId, class: classKind, name, glyph }) {
  const data = authoring.definition();
  if (data.ctsTypes[id] || data.graph.nodes.some(node => node.id === id)) return;
  authoring.declareClass({ id, typeId, class: classKind, name, glyph });
}

function queueDeclaration(stored) {
  const plan = queuePlan(stored);
  return plan.removed.length
    ? { ...plan.declaration, migrate: plan.removed.map(field => ({ kind: 'remove-field', field })) }
    : plan.declaration;
}

function validatePlan(data, domain, roles) {
  const prepared = prepareAuthoredDefinition(data, domain);
  const validation = validateProcessDefinition(prepared.definition, domain, { roles });
  const availability = validateRequiredInputAvailability(validation.definition, domain);
  const lineage = validateLineageBindingResolution(validation.definition, domain);
  return [
    ...(prepared.errors || []),
    ...(validation.errors || []),
    ...availability.map(diagnostic => diagnostic.message),
    ...lineage.map(diagnostic => diagnostic.message)
  ];
}

function removeIfPresent(authoring, id) {
  const data = authoring.definition();
  if (data.graph.nodes.some(node => node.id === id)) authoring.removeNode(id);
}

function ensureTypeRef(authoring, id, typeId) {
  const data = authoring.definition();
  if (data.graph.nodes.some(node => node.id === id)) return;
  authoring.declareTypeRef({ id, typeId });
}

function planDefinition(definition, domain, adminRoleId, tableProjections = []) {
  const source = definition.data?.activated || definition.data;
  const seed = authoredProcessDataFromGraphDocument(source) || source;
  const authoring = createDefinitionAuthoring(domain, null, seed);
  const adminAccess = {
    level: 'admin',
    grants: [{ roleId: adminRoleId, level: 'admin' }]
  };

  for (const id of [
    'queueMaterialField', 'queueMachineField', 'queueResultField',
    'queueNestingResult', 'queueMaterial', 'queueMachine'
  ]) {
    removeIfPresent(authoring, id);
  }

  ensureDeclarationClass(authoring, {
    id: 'machineClass', typeId: MACHINE_TYPE, class: 'item', name: MACHINE.name, glyph: MACHINE.glyph
  });
  ensureDeclarationField(authoring, { id: 'machineNameField', classId: 'machineClass', name: 'Название', descriptor: { base: 'string', identifier: true } });
  ensureDeclarationField(authoring, { id: 'machineToolDiameterField', classId: 'machineClass', name: 'Диаметр инструмента', descriptor: { base: 'quantity', unit: 'mm' } });
  ensureDeclarationField(authoring, { id: 'machineAngleField', classId: 'machineClass', name: 'Угол', descriptor: { base: 'quantity', unit: 'deg' } });

  ensureDeclarationClass(authoring, {
    id: 'materialClass', typeId: MATERIAL_TYPE, class: 'item', name: MATERIAL.name, glyph: MATERIAL.glyph
  });
  ensureDeclarationField(authoring, { id: 'materialNameField', classId: 'materialClass', name: 'Название', descriptor: { base: 'string', identifier: true } });
  ensureDeclarationField(authoring, { id: 'materialThicknessField', classId: 'materialClass', name: 'Толщина', descriptor: { base: 'quantity', unit: 'mm' } });
  ensureDeclarationField(authoring, { id: 'materialColorField', classId: 'materialClass', name: 'Цвет', descriptor: { base: 'string' } });
  ensureDeclarationField(authoring, { id: 'materialWidthField', classId: 'materialClass', name: 'Ширина', descriptor: { base: 'quantity', unit: 'mm' } });
  ensureDeclarationField(authoring, { id: 'materialHeightField', classId: 'materialClass', name: 'Высота', descriptor: { base: 'quantity', unit: 'mm' } });

  ensureDeclarationClass(authoring, {
    id: 'nestingRunClass', typeId: RUN_TYPE, class: 'item', name: NESTING_RUN.name, glyph: NESTING_RUN.glyph
  });
  ensureDeclarationField(authoring, { id: 'runNameField', classId: 'nestingRunClass', name: 'Название', descriptor: { base: 'string', identifier: true } });
  ensureDeclarationField(authoring, { id: 'runMaterialField', classId: 'nestingRunClass', name: 'Материал', descriptor: { base: 'ref', accepts: [MATERIAL_TYPE] } });
  ensureDeclarationField(authoring, { id: 'runMachineField', classId: 'nestingRunClass', name: 'Станок', descriptor: { base: 'ref', accepts: [MACHINE_TYPE] } });
  authoring.wireDeclaration('materialClass', 'runMaterialField', 'targets');
  authoring.wireDeclaration('machineClass', 'runMachineField', 'targets');
  for (const [id, typeId] of [
    ['sheetDesignRef', SHEET_DESIGN_TYPE],
    ['sheetInstanceRef', SHEET_INSTANCE_TYPE],
    ['cutPlanRef', CUT_PLAN_TYPE]
  ]) ensureTypeRef(authoring, id, typeId);
  authoring.wireDeclaration('sheetDesignRef', 'nestingRunClass', 'children', { key: 'sheets' });
  authoring.wireDeclaration('sheetInstanceRef', 'nestingRunClass', 'children', { key: 'sheetInstances' });
  authoring.wireDeclaration('cutPlanRef', 'nestingRunClass', 'children', { key: 'cutPlans' });

  const tableClassId = classNodeId(authoring, TABLE_TYPE);
  if (tableClassId && tableProjections.length) {
    authoring.configure(tableClassId, { projections: tableProjections });
  }

  const queueClassId = classNodeId(authoring, QUEUE_TYPE);
  if (!queueClassId) throw new Error(`Process declares no ${QUEUE_TYPE} class`);
  authoring.wireDeclaration('nestingRunClass', queueClassId, 'children', { key: 'runs' });

  ensureNode(authoring, 'mkMachine', 'construct', () => {});
  authoring.wireDeclaration('machineClass', 'mkMachine', 'binds');
  authoring.configure('mkMachine', { access: adminAccess });
  ensureNode(authoring, 'mkMaterial', 'construct', () => {});
  authoring.wireDeclaration('materialClass', 'mkMaterial', 'binds');
  authoring.configure('mkMaterial', { access: adminAccess });

  const designs = authoring.record('designs');
  if (!designs || designs.kind !== 'cts.read' || designs.select !== 'all' || designs.typeId !== DESIGN_TYPE) {
    if (designs) authoring.removeNode('designs');
    authoring.drop('allEntities', { id: 'designs' });
    const designRef = authoring.record('designSourceRef') ? 'designSourceRef' : null;
    if (designRef) authoring.wireDeclaration(designRef, 'designs', 'binds');
    else {
      authoring.declareTypeRef({ id: 'designSourceRef', typeId: DESIGN_TYPE });
      authoring.wireDeclaration('designSourceRef', 'designs', 'binds');
    }
  }

  ensureNode(authoring, 'queueCtx', 'contextEntity', record => {
    record.typeId = QUEUE_TYPE;
    record.select = 'current';
  });
  ensureNode(authoring, 'mkRun', 'construct', () => {});
  authoring.wireDeclaration('nestingRunClass', 'mkRun', 'binds');
  authoring.configure('mkRun', { access: adminAccess });
  authoring.setInputDefault('mkRun', `fields.${NAME_KEY}`, 'Раскладка');

  ensureNode(authoring, 'queueChildren', 'childEntities', record => {
    record.typeId = QUEUE_TYPE;
  });
  ensureNode(authoring, 'queueChildType', 'getField', record => {
    record.typeId = ENTRY_TYPE;
    record.path = 'type';
  });
  ensureNode(authoring, 'positionType', 'literal', record => {
    record.type = { base: 'string', nullable: false };
    record.value = ENTRY_TYPE;
  });
  ensureNode(authoring, 'isPosition', 'compareValues', record => {
    record.operation = 'eq';
  });
  ensureNode(authoring, 'queueEntries', 'filterList', () => {});
  ensureNode(authoring, 'designParts', 'extractProjection', record => {
    record.typeId = DESIGN_TYPE;
    record.projection = 'nesting-polygons';
  });
  ensureNode(authoring, 'queueNestingParts', 'joinByKey', record => {
    record.leftKey = `relations.${DESIGN_KEY}.id`;
    record.rightKey = 'sourceId';
  });
  for (const id of ['qnSourceId', 'qnSourceKey', 'qnParts']) removeIfPresent(authoring, id);
  ensureNode(authoring, 'qnPairRight', 'recordField', record => {
    record.path = 'right';
    record.type = { base: 'record', nullable: false };
  });
  ensureNode(authoring, 'qnCount', 'recordField', record => {
    record.path = `left.fields.${COUNT_KEY}`;
    record.type = { base: 'number', nullable: false, unit: 'count' };
  });
  ensureNode(authoring, 'qnCountRecord', 'constructRecord', record => {
    record.fields = ['count'];
  });
  if (authoring.record('qnItems')?.kind !== 'record.merge') {
    if (authoring.record('qnItems')) authoring.removeNode('qnItems');
    ensureNode(authoring, 'qnItems', 'mergeRecords', () => {});
  }
  ensureNode(authoring, 'runMaterial', 'relatedEntities', record => {
    record.typeId = RUN_TYPE;
    record.relationKey = MATERIAL_KEY;
  });
  ensureNode(authoring, 'runMachine', 'relatedEntities', record => {
    record.typeId = RUN_TYPE;
    record.relationKey = MACHINE_KEY;
  });
  ensureNode(authoring, 'materialWidthValue', 'getField', record => {
    record.typeId = MATERIAL_TYPE;
    record.path = `fields.${WIDTH_KEY}`;
  });
  ensureNode(authoring, 'materialHeightValue', 'getField', record => {
    record.typeId = MATERIAL_TYPE;
    record.path = `fields.${HEIGHT_KEY}`;
  });
  ensureNode(authoring, 'machineToolDiameterValue', 'getField', record => {
    record.typeId = MACHINE_TYPE;
    record.path = `fields.${TOOL_DIAMETER_KEY}`;
  });

  ensureNode(authoring, 'queueNestingSolve', 'service:nesting:nesting-solve', () => {});
  ensureNode(authoring, 'solveRecord', 'castValue', record => {
    record.outputType = { base: 'record' };
  });
  ensureNode(authoring, 'solveLayouts', 'recordField', record => {
    record.path = 'layouts';
    record.type = { base: 'json', nullable: true };
  });
  ensureNode(authoring, 'layoutLoop', 'forEachEntity', record => {
    record.type = { base: 'json', nullable: true };
  });
  ensureNode(authoring, 'mkSheet', 'construct', () => {});
  authoring.wireDeclaration('sheetDesignRef', 'mkSheet', 'binds');
  authoring.configure('mkSheet', { construction: { mode: 'fromLayout' }, access: adminAccess });
  ensureNode(authoring, 'mkSheetInstance', 'construct', () => {});
  authoring.wireDeclaration('sheetInstanceRef', 'mkSheetInstance', 'binds');
  authoring.configure('mkSheetInstance', { access: adminAccess });
  authoring.setInputDefault('mkSheetInstance', 'fields.name', 'Лист');
  ensureNode(authoring, 'mkCutPlan', 'construct', () => {});
  authoring.wireDeclaration('cutPlanRef', 'mkCutPlan', 'binds');
  authoring.configure('mkCutPlan', { access: adminAccess });
  authoring.setInputDefault('mkCutPlan', 'fields.name', 'Карта раскроя');

  ensureWire(authoring, 'queueCtx', 'data:result', 'mkRun', 'data:lineage.tQsh5vy5wjcId');
  ensureWire(authoring, 'queueCtx', 'data:result', 'queueChildren', 'data:entity');
  ensureWire(authoring, 'queueChildren', 'data:result', 'queueChildType', 'data:entity');
  ensureWire(authoring, 'queueChildType', 'data:value', 'isPosition', 'data:left');
  ensureWire(authoring, 'positionType', 'data:value', 'isPosition', 'data:right');
  ensureWire(authoring, 'queueChildren', 'data:result', 'queueEntries', 'data:items');
  ensureWire(authoring, 'isPosition', 'data:result', 'queueEntries', 'data:mask');
  ensureWire(authoring, 'designs', 'data:result', 'designParts', 'data:entity');
  ensureWire(authoring, 'queueEntries', 'data:items', 'queueNestingParts', 'data:left');
  ensureWire(authoring, 'designParts', 'data:result', 'queueNestingParts', 'data:right');
  ensureWire(authoring, 'queueNestingParts', 'data:pairs', 'qnPairRight', 'data:value');
  ensureWire(authoring, 'queueNestingParts', 'data:pairs', 'qnCount', 'data:value');
  ensureWire(authoring, 'qnCount', 'data:value', 'qnCountRecord', 'data:count');
  ensureWire(authoring, 'qnPairRight', 'data:value', 'qnItems', 'data:left');
  ensureWire(authoring, 'qnCountRecord', 'data:record', 'qnItems', 'data:right');
  ensureWire(authoring, 'qnItems', 'data:record', 'queueNestingSolve', 'data:items');
  ensureWire(authoring, 'mkRun', 'data:result', 'runMaterial', 'data:entity');
  ensureWire(authoring, 'mkRun', 'data:result', 'runMachine', 'data:entity');
  ensureWire(authoring, 'runMaterial', 'data:result', 'materialWidthValue', 'data:entity');
  ensureWire(authoring, 'runMaterial', 'data:result', 'materialHeightValue', 'data:entity');
  ensureWire(authoring, 'runMachine', 'data:result', 'machineToolDiameterValue', 'data:entity');
  ensureWire(authoring, 'materialWidthValue', 'data:value', 'queueNestingSolve', 'data:sheetWidth');
  ensureWire(authoring, 'materialHeightValue', 'data:value', 'queueNestingSolve', 'data:sheetHeight');
  ensureWire(authoring, 'machineToolDiameterValue', 'data:value', 'queueNestingSolve', 'data:space');
  ensureWire(authoring, 'queueNestingSolve', 'data:result', 'solveRecord', 'data:value');
  ensureWire(authoring, 'solveRecord', 'data:value', 'solveLayouts', 'data:value');
  ensureWire(authoring, 'solveLayouts', 'data:value', 'layoutLoop', 'data:items');
  ensureWire(authoring, 'mkRun', 'control:completed', 'layoutLoop', 'control:in');
  ensureWire(authoring, 'layoutLoop', 'control:each', 'mkSheet', 'control:in');
  ensureWire(authoring, 'layoutLoop', 'data:item', 'mkSheet', 'data:layout');
  ensureWire(authoring, 'designs', 'data:result', 'mkSheet', 'data:designs');
  ensureWire(authoring, 'mkRun', 'data:result', 'mkSheet', 'data:lineage.nestingRunId');
  ensureWire(authoring, 'mkSheet', 'control:completed', 'mkSheetInstance', 'control:in');
  ensureWire(authoring, 'mkRun', 'data:result', 'mkSheetInstance', 'data:lineage.nestingRunId');
  ensureWire(authoring, 'mkSheetInstance', 'control:completed', 'mkCutPlan', 'control:in');
  ensureWire(authoring, 'mkRun', 'data:result', 'mkCutPlan', 'data:lineage.nestingRunId');
  ensureWire(authoring, 'mkSheet', 'data:result', 'mkCutPlan', 'data:relations.design');
  ensureWire(authoring, 'mkSheetInstance', 'data:result', 'mkCutPlan', 'data:relations.sheet');
  ensureWire(authoring, 'mkCutPlan', 'control:completed', 'layoutLoopEnd', 'control:in');

  const data = authoring.definition();
  for (const key of ['history', 'activated']) {
    if (definition.data?.[key] !== undefined) data[key] = definition.data[key];
  }
  return data;
}
await db.collection('sessions').insertOne({
  sessionId,
  userId: String(user._id),
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000)
});

try {
  const organization = await api(`/api/organizations/${ORG}`);
  const roleMap = organization?.data?.roles || {};
  const roles = Object.values(roleMap);
  const adminRole = roles.find(role => String(role.label || '').toLowerCase() === 'admin') || roles[0];
  const adminRoleId = adminRole?.id || '';
  if (!adminRoleId) throw new Error('organization has no admin role');

  const { domain, types, tableProjections, tableRepair, queue: queueChange } = await installedDomain();
  const byId = new Map(types.map(type => [type.id, type]));
  if (!byId.has(QUEUE_TYPE)) throw new Error(`organization has no ${QUEUE_TYPE} type`);
  if (!byId.has(ENTRY_TYPE)) throw new Error(`organization has no ${ENTRY_TYPE} type`);

  const queue = queueDeclaration(byId.get(QUEUE_TYPE));
  const declarations = [MACHINE, MATERIAL, NESTING_RUN, queue, ...(tableRepair ? [tableRepair] : [])];
  const changedTypes = declarations.filter(declaration => (
    typeNeedsWrite(declaration, byId.get(declaration.id))
    || (declaration.id === QUEUE_TYPE && queueChange.removed.length)
  ));

  const planned = planDefinition(definitionDoc, domain, adminRoleId, tableProjections);
  const currentAuthored = authoredProcessDataFromGraphDocument(definitionDoc.data.activated || definitionDoc.data)
    || definitionDoc.data.activated
    || definitionDoc.data;

  if (!APPLY) {
    const newNodes = Object.keys(planned.processNodes || {}).filter(id => !currentAuthored.processNodes?.[id]);
    const newEdges = (planned.graph?.edges || []).filter(edge => !(currentAuthored.graph?.edges || []).some(existing => existing.id === edge.id));
    const errors = validatePlan(planned, domain, roleMap);
    console.log(`[dry-run] org ${ORG}, definition ${definitionId}`);
    console.log(`[dry-run] would define types: ${changedTypes.map(type => type.id).join(', ') || '(none)'}`);
    console.log(`[dry-run] would add nodes: ${newNodes.join(', ') || '(none)'}`);
    console.log(`[dry-run] would add edges: ${newEdges.map(edge => `${edge.source}->${edge.target}`).join(', ') || '(none)'}`);
    console.log(`[dry-run] validation: ${errors.length ? errors.join('; ') : 'ok'}`);
    process.exit(0);
  }

  for (const declaration of declarations) {
    await api('/api/admin/cts/types', {
      method: 'POST',
      body: JSON.stringify(declaration)
    });
  }

  const applyInfo = await installedDomain();
  const data = planDefinition(definitionDoc, applyInfo.domain, adminRoleId, applyInfo.tableProjections);
  const errors = validatePlan(data, applyInfo.domain, roleMap);
  if (errors.length) throw new Error(`Planned process does not validate: ${errors.join('; ')}`);
  await api(`/api/process-definitions/${definitionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ data: createProcessGraphDocument(data) })
  });
  await api(`/api/process-definitions/${definitionId}/activate`, { method: 'POST' });
  console.log(`Org ${ORG}: queue nesting authored on definition ${definitionId} (${changedTypes.map(type => type.id).join(', ') || 'no type changes'}); activated`);
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await db.collection('sessions').deleteOne({ sessionId });
  process.exit(process.exitCode || 0);
}
