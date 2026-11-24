// One-shot org authoring: completes the queue CSV import process.
// A Таблица upload joined to the queue's project library creates one
// Позиция per row; each row's Тип selects a cassette template, and the
// row's parameters reuse or bake the cassette design the entry references.
//
//   node server/scripts/author-org-csv-queue-import.js --org org-6af9e015
//   node server/scripts/author-org-csv-queue-import.js --org org-6af9e015 --apply
//
// Without --apply the script prints the plan and makes no writes.
import { randomBytes } from 'node:crypto';
import { connectDB } from '../db/mongo.js';
import { createTypeRegistry, projectDomainFromView } from '#packages/cts';
import { authoredProcessDataFromGraphDocument, validateProcessDefinition } from '#packages/processes';
import { createDefinitionAuthoring } from '#packages/processes/authoring';
import documentsListing from '../../workers/documents/listing.json' with { type: 'json' };
import techDrawingListing from '../../workers/tech-drawing/listing.json' with { type: 'json' };
import nestingListing from '../../workers/nesting/listing.json' with { type: 'json' };
import facadeListing from '../../workers/facade/listing.json' with { type: 'json' };

const APP = process.env.APP_URL || 'http://localhost:3000';
const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2);
const argValue = name => {
  const index = args.findIndex(value => value === name || value.startsWith(`${name}=`));
  if (index < 0) return '';
  return (args[index] === name ? args[index + 1] : args[index].slice(name.length + 1)) || '';
};
const ORG = argValue('--org');
const DEFINITION = argValue('--definition');

if (!ORG) {
  console.error('Usage: node server/scripts/author-org-csv-queue-import.js --org <organizationId> [--definition <id>] [--apply]');
  process.exit(1);
}

const TYPE_NAMES = Object.freeze({
  table: 'Таблица',
  queue: 'Очередь',
  project: 'Объект',
  library: 'Библиотека',
  entry: 'Позиция'
});
const ROW_PARAMETER_KEYS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'R']);
const KEY_TEMPLATE = `{typeName}|${ROW_PARAMETER_KEYS.map(key => `{${key}}`).join('|')}`;
const ROW_TYPE_COLUMN = 'Тип';
const ROW_COUNT_COLUMN = 'Кол-во';

const OWN_NODE_IDS = Object.freeze([
  'ciEntryRef', 'ciDesignRef',
  'ciRows', 'ciQueue', 'ciProject', 'ciLibraries', 'ciLibrary', 'ciTemplates',
  'ciRowTypeRaw', 'ciRowCountRaw', ...ROW_PARAMETER_KEYS.map(key => `ciRow${key}Raw`),
  'ciRowType', 'ciRowCount', ...ROW_PARAMETER_KEYS.map(key => `ciRow${key}`),
  'ciRow',
  'ciTemplatePairs', 'ciTemplateRight', 'ciTemplateNull', 'ciTemplateFound',
  'ciTemplateMatches',
  'ciPairRow', 'ciPairType', 'ciPairCount',
  ...ROW_PARAMETER_KEYS.map(key => `ciParam${key}`),
  'ciKeyParts', 'ciKey', 'ciRequests',
  'ciDesigns', 'ciDesignDecompose', 'ciDesignName', 'ciDesignNameParts',
  'ciDesignTypeName', 'ciDesignParamsRecord',
  ...ROW_PARAMETER_KEYS.map(key => `ciDesignParam${key}`),
  'ciDesignKeyParts', 'ciDesignKey', 'ciDesignWrappers',
  'ciExistingMatches', 'ciExistingRight', 'ciMissingNull', 'ciMissingMask', 'ciMissing',
  'ciMissingKey', 'ciUniqueMissing', 'ciMissingTemplatePairs', 'ciMissingTemplate',
  ...ROW_PARAMETER_KEYS.map(key => `ciMissingParam${key}`), 'ciMissingParams',
  'ciBakeDesign', 'ciNewDesignDecompose', 'ciNewKey', 'ciNewWrappers',
  'ciDesignPool', 'ciDesignEntityPool', 'ciDesignPairs', 'ciDesignRight', 'ciDesignFound',
  'ciDesignMatches', 'ciDesignEntityPairs',
  'ciEntryType', 'ciEntryCountRaw', 'ciEntryCount', 'ciEntryDesign', 'ciCreateEntries'
]);

function packServices() {
  return [documentsListing, techDrawingListing, nestingListing, facadeListing].flatMap(listing => (
    (listing.declarations.services || []).map(service => ({
      id: `plugin.${listing.pluginId}.${service.id}`,
      species: 'service',
      command: `plugin.${listing.pluginId}.${service.id}`,
      group: service.group || service.label || service.id,
      signature: service.signature,
      render: service.render || { label: service.label || service.id }
    }))
  ));
}

function authoritativeDeclaration(declaration) {
  if (!declaration) return null;
  const { _id, organizationId, scope, version, ...rest } = declaration;
  return rest;
}

function typeByName(types, name) {
  const found = types.filter(type => type.name === name);
  if (found.length !== 1) {
    throw new Error(`Expected one type named ${name}, found ${found.length}`);
  }
  return found[0];
}

function relationKeyFor(type, targetTypeId) {
  const key = Object.entries(type.fields || {}).find(([, field]) => (
    ['ref', 'entityRef'].includes(field?.base)
    && (field.accepts || []).includes(targetTypeId)
  ))?.[0];
  if (key) return key;
  return Object.entries(type.edges?.relations || {}).find(([, relation]) => (
    (relation.types || []).includes(targetTypeId)
  ))?.[0] || '';
}

function childLineageKey(parent, childTypeId) {
  return Object.values(parent.edges?.children || {}).find(edge => (
    (edge.types || []).includes(childTypeId)
  ))?.lineageKey || '';
}

function fieldIds(entry) {
  const byLabel = label => Object.entries(entry.fields || {}).find(([, field]) => field.label === label)?.[0] || '';
  const count = byLabel('Количество');
  const type = byLabel('Тип');
  if (!count || !type) throw new Error('Позиция must declare Количество and Тип rows');
  return { count, type, design: 'design' };
}

function updatedTableDeclaration(table) {
  const base = authoritativeDeclaration(table);
  const projections = (base.projections || []).filter(projection => projection.id !== 'rows');
  return {
    ...base,
    projections: [
      ...projections,
      {
        id: 'rows',
        label: 'Table rows',
        output: { base: 'list', itemType: { base: 'record' } },
        resolve: { service: `plugin.${documentsListing.pluginId}.table-rows` }
      }
    ]
  };
}

function updatedEntryDeclaration(entry) {
  const base = authoritativeDeclaration(entry);
  return {
    ...base,
    fields: {
      ...(base.fields || {}),
      design: {
        base: 'ref',
        accepts: ['cassette-design'],
        nullable: true,
        label: 'Макет'
      }
    }
  };
}

function domainFromTypes(types) {
  const registry = createTypeRegistry({ id: `org-csv-queue-import:${ORG}` });
  for (const type of types) {
    registry.defineType(type.scope === 'system' ? type : { ...type, scope: 'org', organizationId: ORG });
  }
  const baseDomain = {
    id: facadeListing.pluginId,
    label: facadeListing.name,
    commands: {},
    events: {},
    serviceContracts: {},
    construction: Object.fromEntries(Object.entries(facadeListing.declarations.constructions || {}).map(([typeId, modes]) => [
      typeId,
      { modes: Object.keys(modes) }
    ]))
  };
  return projectDomainFromView(registry, ORG, baseDomain, { packServices: packServices() });
}

function planDefinition(definition, types, adminRoleId) {
  const domain = domainFromTypes(types);
  const authored = authoredProcessDataFromGraphDocument(definition.data) || definition.data;
  const authoring = createDefinitionAuthoring(domain, null, authored);
  authoring.withDomain(domain);

  const table = typeByName(types, TYPE_NAMES.table);
  const queue = typeByName(types, TYPE_NAMES.queue);
  const project = typeByName(types, TYPE_NAMES.project);
  const library = typeByName(types, TYPE_NAMES.library);
  const entry = typeByName(types, TYPE_NAMES.entry);
  const entryFields = fieldIds(entry);
  const queueLineageKey = childLineageKey(queue, entry.id);
  if (!queueLineageKey) throw new Error('Очередь does not declare Позиция as a child');
  const projectLibraryKey = relationKeyFor(project, library.id);
  if (!projectLibraryKey) throw new Error('Объект does not declare its Библиотека relation');
  const tableNode = Object.values(authored.processNodes || {}).find(node => (
    node.kind === 'cts.construct'
    && node.typeId === table.id
    && node.construction?.mode === 'upload'
  ));
  if (!tableNode) throw new Error(`No ${TYPE_NAMES.table} upload construct in the definition`);

  for (const id of OWN_NODE_IDS) {
    if (authored.graph?.nodes?.some(node => node.id === id)) authoring.removeNode(id);
  }

  const writeAccess = { level: 'write', grants: [{ roleId: adminRoleId, level: 'write' }] };
  const recordType = { base: 'record', nullable: true };
  const stringType = { base: 'string', nullable: true };
  const jsonType = { base: 'json', nullable: true };
  const templateType = { base: 'entityRef', typeId: 'cassette-template', nullable: true };
  const designType = { base: 'entityRef', typeId: 'cassette-design', nullable: true };

  authoring.declareTypeRef({ id: 'ciEntryRef', typeId: entry.id });
  authoring.declareTypeRef({ id: 'ciDesignRef', typeId: 'cassette-design' });

  authoring.drop('extractProjection', { id: 'ciRows' });
  authoring.configure('ciRows', { typeId: table.id, projection: 'rows' });
  authoring.drop('parentEntity', { id: 'ciQueue' });
  authoring.configure('ciQueue', { typeId: table.id });
  authoring.drop('parentEntity', { id: 'ciProject' });
  authoring.configure('ciProject', { typeId: queue.id });
  authoring.drop('relatedEntities', { id: 'ciLibraries' });
  authoring.configure('ciLibraries', { typeId: project.id, relationKey: projectLibraryKey });
  authoring.drop('itemAtPosition', { id: 'ciLibrary' });
  authoring.setInputDefault('ciLibrary', 'index', 0);
  authoring.drop('childEntities', { id: 'ciTemplates' });
  authoring.configure('ciTemplates', { typeId: library.id });

  const rowFields = [
    ['ciRowTypeRaw', ROW_TYPE_COLUMN, 'ciRowType'],
    ['ciRowCountRaw', ROW_COUNT_COLUMN, 'ciRowCount'],
    ...ROW_PARAMETER_KEYS.map(key => [`ciRow${key}Raw`, key, `ciRow${key}`])
  ];
  for (const [rawId, path, trimId] of rowFields) {
    authoring.drop('recordField', { id: rawId });
    authoring.configure(rawId, { path, type: stringType });
    authoring.drop('text', { id: trimId });
    authoring.configure(trimId, { operation: 'trim' });
  }
  authoring.drop('constructRecord', { id: 'ciRow' });
  authoring.configure('ciRow', { fields: ['typeName', 'count', ...ROW_PARAMETER_KEYS] });

  authoring.drop('joinByKey', { id: 'ciTemplatePairs' });
  authoring.configure('ciTemplatePairs', {
    leftKey: 'typeName', rightKey: 'name', joinMode: 'left'
  });
  authoring.drop('recordField', { id: 'ciTemplateRight' });
  authoring.configure('ciTemplateRight', { path: 'right', type: { ...templateType } });
  authoring.drop('literal', { id: 'ciTemplateNull' });
  authoring.configure('ciTemplateNull', { type: { ...templateType }, typeId: 'cassette-template', value: null });
  authoring.drop('literal', { id: 'ciMissingNull' });
  authoring.configure('ciMissingNull', { type: { ...jsonType }, value: null });
  authoring.drop('compareValues', { id: 'ciTemplateFound' });
  authoring.configure('ciTemplateFound', { type: { ...templateType }, operation: 'neq' });
  authoring.drop('filterList', { id: 'ciTemplateMatches' });

  authoring.drop('recordField', { id: 'ciPairRow' });
  authoring.configure('ciPairRow', { path: 'left', type: { ...recordType } });
  authoring.drop('recordField', { id: 'ciPairType' });
  authoring.configure('ciPairType', { path: 'typeName', type: { ...stringType } });
  authoring.drop('recordField', { id: 'ciPairCount' });
  authoring.configure('ciPairCount', { path: 'count', type: { ...stringType } });
  for (const key of ROW_PARAMETER_KEYS) {
    authoring.drop('recordField', { id: `ciParam${key}` });
    authoring.configure(`ciParam${key}`, { path: key, type: { ...stringType } });
  }
  authoring.drop('constructRecord', { id: 'ciKeyParts' });
  authoring.configure('ciKeyParts', { fields: ['typeName', ...ROW_PARAMETER_KEYS] });
  authoring.drop('formatValue', { id: 'ciKey' });
  authoring.configure('ciKey', { template: KEY_TEMPLATE, sourceType: { base: 'record' }, outputType: { base: 'string' } });
  authoring.drop('constructRecord', { id: 'ciRequests' });
  authoring.configure('ciRequests', { fields: ['typeName', 'count', ...ROW_PARAMETER_KEYS, 'key'] });

  authoring.drop('allEntities', { id: 'ciDesigns' });
  authoring.configure('ciDesigns', { typeId: 'cassette-design' });
  authoring.drop('decomposeInstance', { id: 'ciDesignDecompose' });
  authoring.configure('ciDesignDecompose', { typeId: 'cassette-design' });
  authoring.drop('text', { id: 'ciDesignNameSplit' });
  authoring.configure('ciDesignNameSplit', { operation: 'split' });
  authoring.setInputDefault('ciDesignNameSplit', 'separator', ' · ');
  authoring.drop('itemAtPosition', { id: 'ciDesignTypeName' });
  authoring.setInputDefault('ciDesignTypeName', 'index', 0);
  authoring.drop('castValue', { id: 'ciDesignParamsRecord' });
  authoring.configure('ciDesignParamsRecord', { outputType: { base: 'record' } });
  for (const key of ROW_PARAMETER_KEYS) {
    authoring.drop('recordField', { id: `ciDesignParam${key}` });
    authoring.configure(`ciDesignParam${key}`, { path: key, type: { ...stringType } });
  }
  authoring.drop('constructRecord', { id: 'ciDesignKeyParts' });
  authoring.configure('ciDesignKeyParts', { fields: ['typeName', ...ROW_PARAMETER_KEYS] });
  authoring.drop('formatValue', { id: 'ciDesignKey' });
  authoring.configure('ciDesignKey', { template: KEY_TEMPLATE, sourceType: { base: 'record' }, outputType: { base: 'string' } });
  authoring.drop('constructRecord', { id: 'ciDesignWrappers' });
  authoring.configure('ciDesignWrappers', { fields: ['key', 'designId'] });

  authoring.drop('joinByKey', { id: 'ciExistingMatches' });
  authoring.configure('ciExistingMatches', {
    leftKey: 'key', rightKey: 'key', joinMode: 'left'
  });
  authoring.drop('recordField', { id: 'ciExistingRight' });
  authoring.configure('ciExistingRight', { path: 'right', type: { ...jsonType } });
  authoring.drop('compareValues', { id: 'ciMissingMask' });
  authoring.configure('ciMissingMask', { type: { ...jsonType }, operation: 'eq' });
  authoring.drop('filterList', { id: 'ciMissing' });
  authoring.drop('recordField', { id: 'ciMissingKey' });
  authoring.configure('ciMissingKey', { path: 'left.key', type: { ...stringType } });
  authoring.drop('removeDuplicates', { id: 'ciUniqueMissing' });

  authoring.drop('joinByKey', { id: 'ciMissingTemplatePairs' });
  authoring.configure('ciMissingTemplatePairs', { leftKey: 'typeName', rightKey: 'name' });
  authoring.drop('recordField', { id: 'ciMissingTemplate' });
  authoring.configure('ciMissingTemplate', { path: 'right', type: { ...templateType } });
  for (const key of ROW_PARAMETER_KEYS) {
    authoring.drop('recordField', { id: `ciMissingParam${key}` });
    authoring.configure(`ciMissingParam${key}`, { path: `left.${key}`, type: { ...stringType } });
  }
  authoring.drop('constructRecord', { id: 'ciMissingParams' });
  authoring.configure('ciMissingParams', { fields: [...ROW_PARAMETER_KEYS] });

  authoring.drop('construct', { id: 'ciBakeDesign' });
  authoring.wireDeclaration('ciDesignRef', 'ciBakeDesign', 'binds');
  authoring.configure('ciBakeDesign', { construction: { mode: 'render' }, access: writeAccess });
  authoring.drop('decomposeInstance', { id: 'ciNewDesignDecompose' });
  authoring.configure('ciNewDesignDecompose', { typeId: 'cassette-design' });
  authoring.drop('recordField', { id: 'ciNewKey' });
  authoring.configure('ciNewKey', { path: 'left.key', type: { ...stringType } });
  authoring.drop('constructRecord', { id: 'ciNewWrappers' });
  authoring.configure('ciNewWrappers', { fields: ['key', 'designId'] });
  authoring.drop('joinLists', { id: 'ciDesignPool' });
  authoring.configure('ciDesignPool', { type: { ...jsonType } });

  authoring.drop('joinByKey', { id: 'ciDesignPairs' });
  authoring.configure('ciDesignPairs', {
    leftKey: 'key', rightKey: 'key', joinMode: 'left'
  });
  authoring.drop('recordField', { id: 'ciDesignRight' });
  authoring.configure('ciDesignRight', { path: 'right', type: { ...jsonType } });
  authoring.drop('compareValues', { id: 'ciDesignFound' });
  authoring.configure('ciDesignFound', { type: { ...jsonType }, operation: 'neq' });
  authoring.drop('filterList', { id: 'ciDesignMatches' });
  authoring.drop('joinLists', { id: 'ciDesignEntityPool' });
  authoring.configure('ciDesignEntityPool', { type: { ...designType } });
  authoring.drop('joinByKey', { id: 'ciDesignEntityPairs' });
  authoring.configure('ciDesignEntityPairs', { leftKey: 'right.designId', rightKey: '_id' });

  authoring.drop('recordField', { id: 'ciEntryType' });
  authoring.configure('ciEntryType', { path: 'left.left.typeName', type: { ...stringType } });
  authoring.drop('recordField', { id: 'ciEntryCountRaw' });
  authoring.configure('ciEntryCountRaw', { path: 'left.left.count', type: { ...stringType } });
  authoring.drop('text', { id: 'ciEntryCount' });
  authoring.configure('ciEntryCount', { operation: 'toNumber', type: { base: 'number', nullable: true } });
  authoring.drop('recordField', { id: 'ciEntryDesign' });
  authoring.configure('ciEntryDesign', { path: 'right', type: { ...designType } });
  authoring.drop('construct', { id: 'ciCreateEntries' });
  authoring.wireDeclaration('ciEntryRef', 'ciCreateEntries', 'binds');
  authoring.configure('ciCreateEntries', { access: writeAccess });

  const connect = (source, sourcePort, target, targetPort) => authoring.connect(source, sourcePort, target, targetPort);
  const tableId = tableNode.id;

  connect(tableId, 'data:result', 'ciRows', 'data:entity');
  connect(tableId, 'data:result', 'ciQueue', 'data:entity');
  connect('ciQueue', 'data:result', 'ciProject', 'data:entity');
  connect('ciProject', 'data:result', 'ciLibraries', 'data:entity');
  connect('ciLibraries', 'data:result', 'ciLibrary', 'data:items');
  connect('ciLibrary', 'data:item', 'ciTemplates', 'data:entity');
  connect('ciTemplates', 'data:result', 'ciTemplatePairs', 'data:right');

  for (const [rawId, , trimId] of rowFields) {
    connect('ciRows', 'data:result', rawId, 'data:value');
    connect(rawId, 'data:value', trimId, 'data:value');
    connect(trimId, 'data:value', 'ciRow', `data:${trimId === 'ciRowType' ? 'typeName' : trimId === 'ciRowCount' ? 'count' : trimId.slice('ciRow'.length)}`);
  }

  connect('ciRow', 'data:record', 'ciTemplatePairs', 'data:left');
  connect('ciTemplatePairs', 'data:pairs', 'ciTemplateRight', 'data:value');
  connect('ciTemplateRight', 'data:value', 'ciTemplateFound', 'data:left');
  connect('ciTemplateNull', 'data:value', 'ciTemplateFound', 'data:right');
  connect('ciTemplatePairs', 'data:pairs', 'ciTemplateMatches', 'data:items');
  connect('ciTemplateFound', 'data:result', 'ciTemplateMatches', 'data:mask');

  connect('ciTemplateMatches', 'data:items', 'ciPairRow', 'data:value');
  connect('ciPairRow', 'data:value', 'ciPairType', 'data:value');
  connect('ciPairRow', 'data:value', 'ciPairCount', 'data:value');
  for (const key of ROW_PARAMETER_KEYS) connect('ciPairRow', 'data:value', `ciParam${key}`, 'data:value');
  connect('ciPairType', 'data:value', 'ciKeyParts', 'data:typeName');
  for (const key of ROW_PARAMETER_KEYS) connect(`ciParam${key}`, 'data:value', 'ciKeyParts', `data:${key}`);
  connect('ciKeyParts', 'data:record', 'ciKey', 'data:record');
  connect('ciPairType', 'data:value', 'ciRequests', 'data:typeName');
  connect('ciPairCount', 'data:value', 'ciRequests', 'data:count');
  for (const key of ROW_PARAMETER_KEYS) connect(`ciParam${key}`, 'data:value', 'ciRequests', `data:${key}`);
  connect('ciKey', 'data:value', 'ciRequests', 'data:key');

  connect('ciDesigns', 'data:result', 'ciDesignDecompose', 'data:entity');
  connect('ciDesignDecompose', 'data:name', 'ciDesignNameSplit', 'data:text');
  connect('ciDesignNameSplit', 'data:value', 'ciDesignTypeName', 'data:items');
  connect('ciDesignDecompose', 'data:fields.parameters', 'ciDesignParamsRecord', 'data:value');
  for (const key of ROW_PARAMETER_KEYS) connect('ciDesignParamsRecord', 'data:value', `ciDesignParam${key}`, 'data:value');
  connect('ciDesignTypeName', 'data:item', 'ciDesignKeyParts', 'data:typeName');
  for (const key of ROW_PARAMETER_KEYS) connect(`ciDesignParam${key}`, 'data:value', 'ciDesignKeyParts', `data:${key}`);
  connect('ciDesignKeyParts', 'data:record', 'ciDesignKey', 'data:record');
  connect('ciDesignKey', 'data:value', 'ciDesignWrappers', 'data:key');
  connect('ciDesignDecompose', 'data:_id', 'ciDesignWrappers', 'data:designId');

  connect('ciRequests', 'data:record', 'ciExistingMatches', 'data:left');
  connect('ciDesignWrappers', 'data:record', 'ciExistingMatches', 'data:right');
  connect('ciExistingMatches', 'data:pairs', 'ciExistingRight', 'data:value');
  connect('ciExistingRight', 'data:value', 'ciMissingMask', 'data:left');
  connect('ciMissingNull', 'data:value', 'ciMissingMask', 'data:right');
  connect('ciExistingMatches', 'data:pairs', 'ciMissing', 'data:items');
  connect('ciMissingMask', 'data:result', 'ciMissing', 'data:mask');
  connect('ciMissing', 'data:items', 'ciMissingKey', 'data:value');
  connect('ciMissing', 'data:items', 'ciUniqueMissing', 'data:items');
  connect('ciMissingKey', 'data:value', 'ciUniqueMissing', 'data:keys');

  connect('ciUniqueMissing', 'data:items', 'ciMissingTemplatePairs', 'data:left');
  connect('ciTemplates', 'data:result', 'ciMissingTemplatePairs', 'data:right');
  connect('ciMissingTemplatePairs', 'data:pairs', 'ciMissingTemplate', 'data:value');
  for (const key of ROW_PARAMETER_KEYS) connect('ciUniqueMissing', 'data:items', `ciMissingParam${key}`, 'data:value');
  for (const key of ROW_PARAMETER_KEYS) connect(`ciMissingParam${key}`, 'data:value', 'ciMissingParams', `data:${key}`);

  connect('ciMissingTemplate', 'data:value', 'ciBakeDesign', 'data:template');
  connect('ciMissingParams', 'data:record', 'ciBakeDesign', 'data:parameters');
  connect('ciBakeDesign', 'data:result', 'ciNewDesignDecompose', 'data:entity');
  connect('ciUniqueMissing', 'data:items', 'ciNewKey', 'data:value');
  connect('ciNewKey', 'data:value', 'ciNewWrappers', 'data:key');
  connect('ciNewDesignDecompose', 'data:_id', 'ciNewWrappers', 'data:designId');
  connect('ciDesignWrappers', 'data:record', 'ciDesignPool', 'data:left');
  connect('ciNewWrappers', 'data:record', 'ciDesignPool', 'data:right');

  connect('ciRequests', 'data:record', 'ciDesignPairs', 'data:left');
  connect('ciDesignPool', 'data:value', 'ciDesignPairs', 'data:right');
  connect('ciDesignPairs', 'data:pairs', 'ciDesignRight', 'data:value');
  connect('ciDesignRight', 'data:value', 'ciDesignFound', 'data:left');
  connect('ciMissingNull', 'data:value', 'ciDesignFound', 'data:right');
  connect('ciDesignPairs', 'data:pairs', 'ciDesignMatches', 'data:items');
  connect('ciDesignFound', 'data:result', 'ciDesignMatches', 'data:mask');

  connect('ciDesigns', 'data:result', 'ciDesignEntityPool', 'data:left');
  connect('ciBakeDesign', 'data:result', 'ciDesignEntityPool', 'data:right');
  connect('ciDesignMatches', 'data:items', 'ciDesignEntityPairs', 'data:left');
  connect('ciDesignEntityPool', 'data:value', 'ciDesignEntityPairs', 'data:right');

  connect('ciDesignEntityPairs', 'data:pairs', 'ciEntryType', 'data:value');
  connect('ciDesignEntityPairs', 'data:pairs', 'ciEntryCountRaw', 'data:value');
  connect('ciEntryCountRaw', 'data:value', 'ciEntryCount', 'data:value');
  connect('ciDesignEntityPairs', 'data:pairs', 'ciEntryDesign', 'data:value');
  connect('ciEntryType', 'data:value', 'ciCreateEntries', `data:fields.${entryFields.type}`);
  connect('ciEntryCount', 'data:value', 'ciCreateEntries', `data:fields.${entryFields.count}`);
  connect('ciEntryDesign', 'data:value', 'ciCreateEntries', `data:relations.${entryFields.design}`);
  connect('ciQueue', 'data:result', 'ciCreateEntries', `data:lineage.${queueLineageKey}`);

  connect(tableId, 'control:completed', 'ciBakeDesign', 'control:in');
  connect('ciBakeDesign', 'control:completed', 'ciCreateEntries', 'control:in');

  const data = authoring.definition();
  for (const key of ['history', 'activated']) {
    if (definition.data?.[key] !== undefined) data[key] = definition.data[key];
  }
  const validation = validateProcessDefinition(data, domain, {
    roles: { [adminRoleId]: { id: adminRoleId, label: 'Admin' } }
  });
  return { data, errors: validation.errors || [], warnings: validation.warnings || [], tableId };
}

const db = await connectDB();
const user = await db.collection('users').findOne({
  $or: [{ 'lineage.organizationId': ORG }, { 'memberships.organizationId': ORG }]
}, { sort: { _id: 1 } });
if (!user) {
  console.error(`No user found for organization ${ORG}`);
  process.exit(1);
}

const sessionId = randomBytes(24).toString('hex');
const headers = { 'content-type': 'application/json', cookie: `sessionId=${sessionId}` };

async function api(path, options = {}) {
  const response = await fetch(`${APP}${path}`, { headers, ...options });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} ${response.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : null;
}

async function organizationTypes() {
  return (await api('/api/admin/cts/types')).types || [];
}

async function defineType(declaration) {
  return await api('/api/admin/cts/types', { method: 'POST', body: JSON.stringify(declaration) });
}

await db.collection('sessions').insertOne({
  sessionId,
  userId: String(user._id),
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 15 * 60 * 1000)
});

try {
  const organization = await api(`/api/organizations/${ORG}`);
  const roles = Object.values(organization?.data?.roles || {});
  const adminRole = roles.find(role => String(role.label || '').toLowerCase() === 'admin') || roles[0];
  const adminRoleId = adminRole?.id || '';
  if (!adminRoleId) throw new Error('organization has no admin role');

  const definition = DEFINITION
    ? await api(`/api/process-definitions/${DEFINITION}`)
    : await api('/api/process-definitions/active');
  if (!definition?._id) throw new Error('No active process definition found');

  const currentTypes = await organizationTypes();
  const table = typeByName(currentTypes, TYPE_NAMES.table);
  const entry = typeByName(currentTypes, TYPE_NAMES.entry);
  const plannedTypes = currentTypes.map(type => {
    if (type.id === table.id) return { ...type, ...updatedTableDeclaration(table) };
    if (type.id === entry.id) return { ...type, ...updatedEntryDeclaration(entry) };
    return type;
  });

  const plan = planDefinition(definition, plannedTypes, adminRoleId);
  if (plan.errors.length) {
    console.error('Validation failed:');
    for (const error of plan.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else if (!APPLY) {
    const newNodes = Object.keys(plan.data.processNodes || {}).filter(id => !definition.data?.processNodes?.[id]);
    const newEdges = (plan.data.graph?.edges || []).filter(edge => !(definition.data?.graph?.edges || []).some(existing => existing.id === edge.id));
    console.log(`[dry-run] org ${ORG}, definition ${definition._id}`);
    console.log('[dry-run] would define Таблица rows projection and Позиция.design ref');
    console.log(`[dry-run] would add ${newNodes.length} process nodes and ${newEdges.length} edges`);
    console.log(`[dry-run] warnings: ${plan.warnings.length ? plan.warnings.join('; ') : '(none)'}`);
    process.exit(0);
  } else {
    await defineType(updatedTableDeclaration(table));
    await defineType(updatedEntryDeclaration(entry));
    const updatedTypes = await organizationTypes();
    const activated = planDefinition(definition, updatedTypes, adminRoleId);
    if (activated.errors.length) {
      console.error('Validation failed after type updates:');
      for (const error of activated.errors) console.error(`  - ${error}`);
      process.exitCode = 1;
    } else {
      await api(`/api/process-definitions/${definition._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ data: activated.data })
      });
      const checked = await api(`/api/process-definitions/${definition._id}/validate`, { method: 'POST' });
      if (checked?.errors?.length) {
        console.error('Server validation failed:');
        for (const error of checked.errors) console.error(`  - ${error}`);
        process.exitCode = 1;
      } else {
        await api(`/api/process-definitions/${definition._id}/activate`, { method: 'POST' });
        console.log(`Org ${ORG}: updated Таблица and Позиция, completed definition ${definition._id}; activated`);
      }
    }
  }
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await db.collection('sessions').deleteOne({ sessionId });
  process.exit(process.exitCode || 0);
}
