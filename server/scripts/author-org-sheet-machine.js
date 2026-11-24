// One-shot org authoring (demo process): adds the `sheet` and `machine`
// vocabulary and wires the nesting attempt's relations into the solve.
// The nesting attempt carries one sheet (width/height) and one machine
// (tool diameter); the solve reads those values in place of manual
// sheetWidth/sheetHeight/space prompts and stays runnable after a run.
//
//   node server/scripts/author-org-sheet-machine.js --org org-6a05940e
//   node server/scripts/author-org-sheet-machine.js --org org-6a05940e --apply
//
// Without --apply the script prints the plan and makes no writes.
import { randomBytes } from 'node:crypto';
import { connectDB } from '../db/mongo.js';
import { createTypeRegistry, projectDomainFromView } from '#packages/cts';
import { createDefinitionAuthoring } from '#packages/processes/authoring';
import facadeListing from '../../workers/facade/listing.json' with { type: 'json' };

const APP = process.env.APP_URL || 'http://localhost:3000';
const APPLY = process.argv.includes('--apply');
const args = process.argv.slice(2);
const orgArgIndex = args.findIndex(value => value === '--org' || value.startsWith('--org='));
const ORG = orgArgIndex < 0
  ? ''
  : (args[orgArgIndex] === '--org' ? args[orgArgIndex + 1] : args[orgArgIndex].slice(6)) || '';
const DEFINITION_ARG_INDEX = args.findIndex(value => value === '--definition' || value.startsWith('--definition='));
const DEFINITION = DEFINITION_ARG_INDEX < 0
  ? ''
  : (args[DEFINITION_ARG_INDEX] === '--definition' ? args[DEFINITION_ARG_INDEX + 1] : args[DEFINITION_ARG_INDEX].slice(13)) || '';

if (!ORG) {
  console.error('Usage: node server/scripts/author-org-sheet-machine.js --org <organizationId> [--definition <id>] [--apply]');
  process.exit(1);
}

const SHEET = {
  id: 'sheet',
  class: 'file',
  name: 'Sheet',
  payload: null,
  revisions: null,
  operators: {},
  edges: {},
  fields: {
    name: { base: 'string', identifier: true, label: 'Name' },
    width: { base: 'quantity', unit: 'mm', label: 'Width' },
    height: { base: 'quantity', unit: 'mm', label: 'Height' }
  }
};

const MACHINE = {
  id: 'machine',
  class: 'item',
  name: 'Machine',
  payload: null,
  revisions: null,
  operators: {},
  edges: {},
  fields: {
    name: { base: 'string', identifier: true, label: 'Name' },
    toolDiameter: { base: 'quantity', unit: 'mm', label: 'Tool diameter' }
  }
};

function facadePackServices() {
  return (facadeListing.declarations.services || []).map(service => ({
    id: `plugin.${facadeListing.pluginId}.${service.id}`,
    species: 'service',
    command: `plugin.${facadeListing.pluginId}.${service.id}`,
    group: service.group || service.label || service.id,
    signature: service.signature,
    render: service.render || { label: service.label || service.id }
  }));
}

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
    : {
        'lineage.organizationId': ORG,
        'data.processNodes.solve': { $exists: true },
        'data.graph.nodes': { $elemMatch: { id: 'attemptCtx' } }
      },
  { sort: { _id: -1 } }
);
if (!definitionDoc) {
  console.error(`No nesting process definition found for organization ${ORG}`);
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

async function organizationTypes() {
  return await api('/api/admin/cts/types');
}

function declarationFor(typeId, types) {
  return types.find(type => type.id === typeId) || null;
}

async function defineType(declaration) {
  return await api('/api/admin/cts/types', {
    method: 'POST',
    body: JSON.stringify(declaration)
  });
}

function authoritativeDeclaration(declaration) {
  if (!declaration) return null;
  const { _id, organizationId, scope, version, ...rest } = declaration;
  return rest;
}

function updatedAttemptDeclaration(attempt) {
  const base = authoritativeDeclaration(attempt);
  if (!base) throw new Error('nesting-attempt declaration is missing');
  return {
    ...base,
    edges: {
      ...(base.edges || {}),
      relations: {
        ...(base.edges?.relations || {}),
        sheet: { types: ['sheet'], onRemove: 'detach', cardinality: 'one' },
        machine: { types: ['machine'], onRemove: 'detach', cardinality: 'one' }
      }
    }
  };
}

function domainFromTypes(types) {
  const registry = createTypeRegistry({ id: `org-sheet-machine:${ORG}` });
  for (const type of types) {
    registry.defineType(type.scope === 'system' ? type : { ...type, scope: 'org', organizationId: ORG });
  }
  const packServices = facadePackServices();
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
  return projectDomainFromView(registry, ORG, baseDomain, { packServices });
}

function planDefinition(definition, types, adminRoleId) {
  const domain = domainFromTypes(types);
  const authoring = createDefinitionAuthoring(domain, null, definition.data);
  authoring.withDomain(domain);
  const adminAccess = {
    level: 'admin',
    grants: [{ roleId: adminRoleId, level: 'admin' }]
  };

  if (definition.data.processNodes?.solve) {
    authoring.configure('solve', { state: {} });
  }

  const sheetConstruct = definition.data.processNodes?.mkSheet || null;
  const rebuildSheet = Boolean(sheetConstruct && sheetConstruct.typeId !== 'sheet');
  if (rebuildSheet) authoring.removeNode('mkSheet');

  for (const [refId, typeId] of [
    ['sheetTypeRef', 'sheet'],
    ['machineRef', 'machine'],
    ['designSourceRef', 'cassette-design']
  ]) {
    if (!definition.data.graph.nodes?.some(node => node.id === refId)) {
      authoring.declareTypeRef({ id: refId, typeId });
    }
  }

  // Queue entries may reference a library cassette design outside the
  // queue's child tree. Project every cassette design; the entry-design
  // join then resolves the referenced design wherever it lives.
  const designsNode = definition.data.processNodes?.designs || null;
  const retargetDesigns = !designsNode
    || designsNode.kind !== 'cts.read'
    || designsNode.select !== 'all'
    || designsNode.typeId !== 'cassette-design';
  if (retargetDesigns) {
    authoring.removeNode('designs');
    authoring.drop('allEntities', { id: 'designs' });
    authoring.wireDeclaration('designSourceRef', 'designs', 'binds');
    authoring.connect('designs', 'data:result', 'polygons', 'data:entity');
  }
  for (const [nodeId, refId, rebuild] of [
    ['mkSheet', 'sheetTypeRef', rebuildSheet],
    ['mkMachine', 'machineRef', false]
  ]) {
    if (rebuild || !definition.data.processNodes?.[nodeId]) {
      authoring.drop('construct', { id: nodeId });
      authoring.wireDeclaration(refId, nodeId, 'binds');
      authoring.configure(nodeId, { access: adminAccess });
    }
  }

  for (const [nodeId, relationKey] of [['attemptSheet', 'sheet'], ['attemptMachine', 'machine']]) {
    if (!definition.data.processNodes?.[nodeId]) {
      authoring.drop('relatedEntities', { id: nodeId });
      authoring.configure(nodeId, { typeId: 'nesting-attempt', relationKey });
    }
  }
  for (const [nodeId, typeId, path] of [
    ['sheetWidthValue', 'sheet', 'fields.width'],
    ['sheetHeightValue', 'sheet', 'fields.height'],
    ['toolDiameterValue', 'machine', 'fields.toolDiameter']
  ]) {
    if (!definition.data.processNodes?.[nodeId]) {
      authoring.drop('getField', { id: nodeId });
      authoring.configure(nodeId, { typeId });
      authoring.setInputDefault(nodeId, 'field', path);
    }
  }

  // The nesting-polygons projection returns one item per design (designId
  // + all workpiece parts). The entry's design ref lives under the
  // relation slot; its id is the join key.
  if (definition.data.processNodes?.entryParts) {
    authoring.configure('entryParts', { leftKey: 'relations.design.id', rightKey: 'designId' });
  }
  if (definition.data.processNodes?.entryPolygons) {
    authoring.configure('entryPolygons', { path: 'right.polygonParts' });
  }
  if (definition.data.processNodes?.jobItems) {
    authoring.configure('jobItems', { fields: ['designId', 'polygonParts', 'count'] });
  }
  if (definition.data.processNodes?.allPolygons) {
    authoring.removeNode('allPolygons');
  }
  if (!definition.data.processNodes?.entryDesignId) {
    authoring.drop('recordField', { id: 'entryDesignId' });
    authoring.configure('entryDesignId', { path: 'right.designId', type: { base: 'id' } });
  }

  const edges = definition.data.graph.edges || [];
  const connected = (source, sourceHandle, target, targetHandle) => edges.some(edge => (
    edge.source === source
    && edge.sourceHandle === sourceHandle
    && edge.target === target
    && edge.targetHandle === targetHandle
  ));
  const wires = [
    ['attemptCtx', 'data:result', 'attemptSheet', 'data:entity'],
    ['attemptCtx', 'data:result', 'attemptMachine', 'data:entity'],
    ['attemptSheet', 'data:result', 'sheetWidthValue', 'data:entity'],
    ['attemptSheet', 'data:result', 'sheetHeightValue', 'data:entity'],
    ['attemptMachine', 'data:result', 'toolDiameterValue', 'data:entity'],
    ['sheetWidthValue', 'data:value', 'solve', 'data:sheetWidth'],
    ['sheetHeightValue', 'data:value', 'solve', 'data:sheetHeight'],
    ['toolDiameterValue', 'data:value', 'solve', 'data:space'],
    ['designs', 'data:result', 'polygons', 'data:entity'],
    ['polygons', 'data:result', 'entryParts', 'data:right'],
    ['entryParts', 'data:pairs', 'entryDesignId', 'data:value'],
    ['entryDesignId', 'data:value', 'jobItems', 'data:designId']
  ];
  for (const [source, sourceHandle, target, targetHandle] of wires) {
    if (!connected(source, sourceHandle, target, targetHandle)) {
      authoring.connect(source, sourceHandle, target, targetHandle);
    }
  }

  const data = authoring.definition();
  for (const key of ['history', 'activated']) {
    if (definition.data?.[key] !== undefined) data[key] = definition.data[key];
  }
  return data;
}

// Queue entries store their design ref under `relations.design` and their
// count as a plain number (the dialog scalarizes quantity drafts to
// `value`). Older orgs may carry the bare id under `fields.design` and
// `{ value }` objects from unscalarized number drafts; normalize both so
// the join key and the count read what creates write.
async function normalizeQueueEntryDesignRefs() {
  const entries = await db.collection('items')
    .find({ organizationId: ORG, type: 'queue-entry' })
    .toArray();
  let changed = 0;
  for (const entry of entries) {
    const set = {};
    const unset = {};
    const design = entry.relations?.design ?? entry.fields?.design;
    const designId = design && typeof design === 'object' ? String(design.id ?? '') : String(design ?? '');
    if (designId) set['relations.design'] = { type: 'cassette-design', id: designId };
    if (entry.fields?.design !== undefined) unset['fields.design'] = '';
    const count = entry.fields?.count;
    if (count && typeof count === 'object' && !Array.isArray(count) && count.value !== undefined) {
      set['fields.count'] = count.value;
    }
    if (!Object.keys(set).length && !Object.keys(unset).length) continue;
    changed += 1;
    if (!APPLY) continue;
    await db.collection('items').updateOne(
      { _id: entry._id },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) }
    );
  }
  return changed;
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

  const firstTypes = (await organizationTypes()).types || [];
  const attempt = declarationFor('nesting-attempt', firstTypes);
  if (!attempt) throw new Error('organization has no nesting-attempt type');

  if (!APPLY) {
    const plannedTypes = [
      ...firstTypes.filter(type => !['nesting-attempt', 'sheet', 'machine'].includes(type.id)),
      SHEET,
      MACHINE,
      updatedAttemptDeclaration(attempt)
    ];
    const draft = planDefinition(definitionDoc, plannedTypes, adminRoleId);
    const newNodes = Object.keys(draft.processNodes || {}).filter(id => !definitionDoc.data.processNodes?.[id]);
    const newEdges = (draft.graph?.edges || []).filter(edge => !(definitionDoc.data.graph?.edges || []).some(existing => existing.id === edge.id));
    const designRefs = await normalizeQueueEntryDesignRefs();
    console.log(`[dry-run] org ${ORG}, definition ${definitionId}`);
    console.log('[dry-run] would define types: sheet, machine, nesting-attempt(with sheet/machine relations)');
    console.log(`[dry-run] would normalize ${designRefs} queue-entry row(s)`);
    console.log(`[dry-run] would add nodes: ${newNodes.join(', ')}`);
    console.log(`[dry-run] would add edges: ${newEdges.map(edge => `${edge.source}->${edge.target}`).join(', ')}`);
    process.exit(0);
  }

  await defineType(SHEET);
  await defineType(MACHINE);
  await defineType(updatedAttemptDeclaration(attempt));

  const definitionTypes = (await organizationTypes()).types || [];
  const definition = await api(`/api/process-definitions/${definitionId}`);
  const data = planDefinition(definition, definitionTypes, adminRoleId);
  const designRefs = await normalizeQueueEntryDesignRefs();
  const patched = await api(`/api/process-definitions/${definitionId}`, {
    method: 'PATCH',
    body: JSON.stringify({ data })
  });
  await api(`/api/process-definitions/${definitionId}/activate`, { method: 'POST' });
  console.log(`Org ${ORG}: authored sheet + machine on definition ${definitionId} (${patched?.identity?.name || ''}); normalized ${designRefs} queue-entry row(s); activated`);
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
} finally {
  await db.collection('sessions').deleteOne({ sessionId });
  process.exit(process.exitCode || 0);
}
