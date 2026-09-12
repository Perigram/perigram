import { normalizeWorkflow } from '../../workflows/src/index.js';
import {
  generatedScreenRoute,
  normalizeScreenContract,
  validateScreenContract
} from './screen-contract.js';
import {
  PROCESS_SCALAR_KINDS,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_STRUCTURES,
  inferProcessDataflowContracts,
  resolveProcessNodePorts,
  validateProcessEdges
} from './ports.js';
import { CONSUMER_EFFECT_KINDS, entityBlocks, getFieldPolicy, getProcessNodeDefinition, resolveCatalogNodePorts } from './node-catalog.js';
import { normalizeProcessType, sanitizeProcessType, processSocketsCompatible, processType } from './types.js';
import { createDataTree, isDataTree } from './data-tree.js';
import { normalizeHandle, lineageKeyForEntityType, lineageRelationsForParent } from './hierarchy-utils.js';

export const PROCESS_SCHEMA_VERSION = 1;
const ACCESS_ORDER = { none: 0, read: 1, write: 2, admin: 3 };

export {
  canvasToDefinition,
  definitionToCanvas,
  hasCanonicalProcessSource,
  validateCanvasSemantics,
  validateRoundTrip
} from './transpiler.js';

export {
  createTemplate
} from './templates.js';

export {
  PROCESS_SCALAR_KINDS,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_STRUCTURES,
  inferProcessDataflowContracts,
  normalizePortSpec,
  portSpecsCompatible,
  resolveProcessNodePorts,
  resolveNodePort,
  validateProcessEdges
} from './ports.js';

export {
  PROCESS_DESIGNER_PALETTE_GROUPS,
  createProcessDesignerContract
} from './designer.js';

export { resolveProcessActionInputContext } from './algebra.js';
export {
  PROCESS_PROTOCOL_VERSION,
  PROCESS_OPERATION_LEVELS,
  PROCESS_BASE_TYPES,
  PROCESS_DATA_ACCESS,
  PROCESS_SOCKET_ROLES,
  formatProcessType,
  normalizeProcessSocket,
  normalizeProcessType,
  sanitizeProcessType,
  processSocketsCompatible,
  processType,
  processTypesCompatible
} from './types.js';
export * from './data-tree.js';
export { migrateProcessDefinitionV4 } from './migration-v4.js';
export {
  PROCESS_NODE_CATALOG,
  PROCESS_NODE_FAMILIES,
  getProcessNodeDefinition,
  processNodeDefinitionsForFamily,
  requireProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';
export {
  applyPatch,
  evaluateEntityPredicate,
  executeProcessDataNode
} from './evaluator.js';
export {
  PROCESS_RUN_STATUSES,
  PROCESS_STEP_STATUSES,
  advanceProcessRun,
  createProcessRun,
  previewProcessDataflow,
  runProcessUntilSettled
} from './orchestration.js';

export function createDefaultCreatedWorkflow(label = 'Lifecycle') {
  return normalizeWorkflow({
    schemaVersion: 2,
    primaryRegion: 'main',
    regions: {
      main: {
        label,
        initial: 'CREATED',
        states: { CREATED: { canUpdateMeta: true } },
        transitions: []
      }
    }
  });
}

export function normalizeProcessDefinition(definition = {}, domain = {}) {
  const data = definition.data || definition;
  const graph = normalizeGraph(data.graph);
  const processNodes = inferCurrentEntityTypes(inferOpenBlockEntries(
    normalizeProcessInputDefaults(normalizeProcessNodesForDomain(data.processNodes, domain), domain),
    graph,
    domain
  ), data.actions, data.screens);
  const producerOutputs = normalizeRecord(data.producerOutputs);
  // Consumer effects own no producer outputs: prune stale records/identities
  // (pre-protocol definitions minted them per node) so the workflow stays
  // anchored at the origin of each entity path.
  for (const [recordId, node] of Object.entries(processNodes)) {
    if (!CONSUMER_EFFECT_KINDS.includes(node.kind)) continue;
    delete node.producerOutputId;
    for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
      if (String(output?.nodeId) === String(node.id || recordId)) delete producerOutputs[producerOutputId];
    }
  }
  const effectActions = deriveEffectActions(data.actions, processNodes, graph, domain, producerOutputs);
  const normalized = inferProcessDataflowContracts({
    schemaVersion: data.schemaVersion || PROCESS_SCHEMA_VERSION,
    dataflowVersion: data.dataflowVersion,
    sourceTemplateId: data.sourceTemplateId || null,
    sourceProcessDefinitionId: data.sourceProcessDefinitionId || null,
    graph,
    roleGrants: normalizeRecord(data.roleGrants),
    servicePrincipals: normalizeRecord(data.servicePrincipals),
    producerOutputs,
    actions: normalizeActions(deriveRelationMutationActions(effectActions, domain)),
    services: normalizeRecord(data.services),
    sockets: normalizeRecord(data.sockets),
    statusDefinitions: normalizeRecord(data.statusDefinitions),
    valueInputs: normalizeRecord(data.valueInputs),
    processNodes,
    screens: normalizeRecord(data.screens),
    compiled: data.compiled || null
  });
  return normalized;
}

function inferCurrentEntityTypes(processNodes = {}, actions = {}, screens = {}) {
  const contextTypes = new Set([
    ...Object.values(normalizeRecord(actions)),
    ...Object.values(normalizeRecord(screens))
  ].flatMap(record => [record?.entityType, ...(record?.inputs || []).map(input => input?.entityType)])
    .filter(Boolean));
  if (contextTypes.size !== 1) return processNodes;
  const [entityType] = contextTypes;
  return Object.fromEntries(Object.entries(processNodes).map(([id, node]) => [id,
    node?.kind === 'read.currentEntity' && !node.entityType
      ? { ...node, entityType, entityTypeInferred: true }
      : node
  ]));
}

function inferOpenBlockEntries(processNodes = {}, graph = {}, domain = {}) {
  const inferred = Object.fromEntries(Object.entries(processNodes).map(([id, node]) => [id, {
    ...node,
    ...(Array.isArray(node?.entries) ? { entries: node.entries.map(entry => ({ ...entry })) } : {})
  }]));
  const recordsByGraphId = new Map((graph.nodes || []).map(node => [
    String(node.id),
    inferred[String(node.data?.refId || node.id)]
  ]));
  for (const edge of graph.edges || []) {
    const target = recordsByGraphId.get(String(edge.target));
    const entryId = normalizeHandle(edge.targetHandle).replace(/^entry:/, '');
    if (!target || !entryId || target.compositionMode !== 'ancestors') continue;
    const entry = target.entries?.find(item => item.id === entryId);
    const source = recordsByGraphId.get(String(edge.source));
    if (!entry || !source) continue;
    let outputs = [];
    try { outputs = resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs; } catch { outputs = []; }
    const sourcePort = catalogPortForHandle(outputs, edge.sourceHandle);
    const entityType = sourcePort?.type?.entityType || sourcePort?.type?.itemType?.entityType || source.entityType || '';
    if (!entityType) continue;
    entry.entityType = entityType;
    entry.key = entry.key || lineageKeyForEntityType(entityType);
  }
  return inferred;
}

function normalizeProcessInputDefaults(processNodes = {}, domain = {}) {
  return Object.fromEntries(Object.entries(processNodes).map(([id, record]) => {
    if (!record?.inputDefaults) return [id, record];
    let ports = [];
    try { ports = resolveCatalogNodePorts(record, catalogContext(domain, record)).inputs; } catch { ports = []; }
    const accessById = new Map(ports.map(port => [port.id, port.access || 'item']));
    const mutationEffect = ['effect.createEntity', 'effect.updateEntity', 'effect.changeStatus', 'effect.archiveEntity', 'effect.deleteEntity'].includes(record.kind);
    return [id, {
      ...record,
      inputDefaults: Object.fromEntries(Object.entries(record.inputDefaults).map(([socketId, value]) => {
        const access = accessById.get(socketId) || 'item';
        // Mapped mutation sockets declare List access; a scalar authored
        // default is one broadcast item, not an arity error.
        const shape = mutationEffect && access === 'list' && !Array.isArray(value) && !isDataTree(value) ? 'item' : access;
        return [socketId, isDataTree(value) ? value : createDataTree(value, shape)];
      }))
    }];
  }));
}

function processDefaultValue(value) {
  return isDataTree(value) ? value.branches[0]?.items?.[0] : value;
}

function plainProcessDefaults(defaults = {}) {
  return Object.fromEntries(Object.entries(defaults || {}).map(([key, value]) => [key, processDefaultValue(value)]));
}

function normalizeProcessNodesForDomain(value = {}, domain = {}) {
  return Object.fromEntries(Object.entries(normalizeRecord(value)).map(([id, node]) => {
    if (Array.isArray(node?.entries)) {
      node = {
        ...node,
        entries: node.entries.map(({ cardinality, operation, ...entry }) => entry)
      };
    }
    if (node?.kind === 'effect.archiveEntity' && node.entityType) {
      const workflow = domain.workflows?.[node.entityType];
      const archiveTransition = Object.values(workflow?.regions || {})
        .flatMap(region => region.transitions || [])
        .find(transition => transition.to === 'ARCHIVED' && transition.intent);
      return [id, { ...node, archiveIntent: archiveTransition?.intent || '' }];
    }
    if (node?.kind !== 'effect.createEntity' || !node.entityType) return [id, node];
    const schemas = entityFieldSchemas(domain, node.entityType);
    const declaredBlocks = new Set(entityBlocks(domain, node.entityType));
    const knownBlocks = new Set([...schemas.map(field => field.block), ...declaredBlocks]);
    const allowedBlocks = new Set(schemas
      .filter(field => field.constructible !== false)
      .map(field => field.block));
    for (const block of declaredBlocks) {
      if (domain.blockComposition?.[block] && !['origin', 'status', 'provenance', 'summary'].includes(block)) {
        allowedBlocks.add(block);
      }
    }
    const persistedBlocks = Array.isArray(node.blocks) ? node.blocks : [];
    const blocks = persistedBlocks.filter(block => !knownBlocks.has(block) || allowedBlocks.has(block));
    const removedBlocks = new Set(persistedBlocks.filter(block => knownBlocks.has(block) && !allowedBlocks.has(block)));
    const inputDefaults = Object.fromEntries(Object.entries(node.inputDefaults || {})
      .filter(([path]) => !removedBlocks.has(String(path).split('.')[0])));
    const construction = normalizeConstruction(node.construction, node.entityType, domain);
    return [id, {
      ...node,
      blocks,
      construction,
      ...(node.inputDefaults ? { inputDefaults } : {})
    }];
  }));
}

function deriveEffectActions(actions = {}, processNodes = {}, graph = {}, domain = {}, producerOutputs = {}) {
  const derived = { ...(actions || {}) };
  for (const [nodeId, node] of Object.entries(processNodes)) {
    if (!node.kind?.startsWith('effect.')) continue;
    const actionId = String(node.entryTriggerId || node.id || nodeId);
    const actionKind = ({
      'effect.createEntity': 'createEntity',
      'effect.runProducer': 'createEntity',
      'effect.updateEntity': 'updateEntity',
      'effect.archiveEntity': 'archiveEntity',
      'effect.deleteEntity': 'deleteEntity',
      'effect.runCommand': 'runCommand',
      'effect.sendEntity': 'sendToOrganization',
      'effect.generateAttachment': 'runCommand'
    })[node.kind];
    if (!actionKind) continue;
    const promptContract = effectPromptContract(nodeId, node, processNodes, graph, domain);
    const fields = promptContract.fields;
    const suppliedFields = new Set([
      ...Object.keys(promptContract.defaults),
      ...promptContract.wiredFields
    ]);
    const statusTo = processDefaultValue(node.inputDefaults?.['status.state.primary']) || node.status?.to || '';
    // Consumer effects bind to the upstream producer of their entity input
    // wire; a stale own-node binding from a persisted draft is ignored.
    const producerOutputId = CONSUMER_EFFECT_KINDS.includes(node.kind)
      ? upstreamProducerOutputId({ graph, processNodes, producerOutputs }, node) || ''
      : node.producerOutputId || derived[actionId]?.producerOutputId || '';
    derived[actionId] = {
      ...(derived[actionId] || {}),
      id: actionId,
      label: node.label || derived[actionId]?.label || actionKind,
      actionKind,
      ...(producerOutputId ? { producerOutputId } : {}),
      entityType: node.entityType || derived[actionId]?.entityType || '',
      commandId: node.commandId || derived[actionId]?.commandId || '',
      parentEntityType: promptContract.parentEntityType || derived[actionId]?.parentEntityType || '',
      construction: node.kind === 'effect.createEntity'
        ? node.construction?.mode === 'genericCreate' && node.blocks?.length
          ? { mode: 'genericCreate', inputs: [], blockComposed: true }
          : {
              ...(node.construction || derived[actionId]?.construction || {}),
              blockComposed: Boolean(node.blocks?.length)
            }
        : (node.construction || derived[actionId]?.construction || {}),
      mutation: {
        ...(derived[actionId]?.mutation || {}),
        fields,
        blocks: [...(node.blocks || [])],
        relationContracts: promptContract.relationContracts
      },
      inputPolicy: {
        ...(derived[actionId]?.inputPolicy || {}),
        prompt: fields.some(path => !suppliedFields.has(path)),
        fields: fields.map(path => ({
          id: `field:${path}`,
          path,
          type: promptContract.schemas.find(field => field.path === path)?.type?.base || 'json',
          prompt: !suppliedFields.has(path),
          required: !suppliedFields.has(path)
            && promptContract.schemas.find(field => field.path === path)?.required === true,
          ...(Object.hasOwn(promptContract.defaults, path) ? { default: promptContract.defaults[path] } : {})
        }))
      },
      access: node.access || derived[actionId]?.access || { level: 'write', grants: [] },
      trigger: node.trigger || derived[actionId]?.trigger || { mode: 'manual' },
      status: { ...(derived[actionId]?.status || {}), ...(statusTo ? { to: statusTo } : {}) },
      statusRef: node.statusRef || derived[actionId]?.statusRef || '',
      inputs: Array.isArray(node.inputs) ? node.inputs.map(input => ({ ...input })) : [],
      outputs: Array.isArray(node.outputs) ? node.outputs.map(output => ({ ...output })) : [],
      events: [{ id: 'completed', label: `${node.label || actionKind} completed`, kind: 'event' }]
    };
  }
  return derived;
}

function deriveRelationMutationActions(actions = {}, domain = {}) {
  const derived = { ...actions };
  for (const [sourceActionId, sourceAction] of Object.entries(actions)) {
    if ((sourceAction.trigger?.mode || 'manual') !== 'manual') continue;
    for (const relation of sourceAction.mutation?.relationContracts || []) {
      if (!sourceAction.entityType || !relation.key || !relation.targetType) continue;
      for (const operation of ['link', 'unlink']) {
        const creatorAction = relation.creator?.actionId ? actions[relation.creator.actionId] : null;
        const creator = creatorAction
          ? (() => {
              const construction = normalizeConstruction(creatorAction.construction, creatorAction.entityType, domain);
              const inputPolicy = normalizeActionInputPolicy(
                creatorAction.inputPolicy,
                construction,
                creatorAction.entityType,
                domain
              );
              return {
              actionId: creatorAction.id || relation.creator.actionId,
              entityType: creatorAction.entityType,
              construction,
              inputPolicy
            };
            })()
          : relation.creator;
        const id = `${sourceActionId}:${operation}:${relation.key}`;
        const input = {
          id: `relation:${relation.key}`,
          label: relation.targetType.replace(/_/g, ' '),
          path: `relations.${relation.key}`,
          type: 'entity',
          entityType: relation.targetType,
          relationKey: relation.key,
          cardinality: relation.cardinality || 'one',
          required: true,
          prompt: operation === 'link',
          ...(operation === 'link' && creator ? { creator } : {})
        };
        derived[id] = {
          id,
          label: `${operation === 'link' ? 'Link' : 'Unlink'} ${relation.targetType.replace(/_/g, ' ')}`,
          actionKind: 'updateEntity',
          producerOutputId: sourceAction.producerOutputId,
          entityType: sourceAction.entityType,
          relationMutation: {
            key: relation.key,
            targetType: relation.targetType,
            cardinality: relation.cardinality || 'one',
            operation,
            ...(relation.association ? { association: relation.association } : {}),
            ...(operation === 'link' && creator ? { creator } : {})
          },
          mutation: { fields: [`relations.${relation.key}`], relationContracts: [relation] },
          inputPolicy: operation === 'link'
            ? { prompt: true, fields: [input] }
            : { prompt: false, fields: [] },
          access: sourceAction.access,
          trigger: { mode: 'manual' },
          inputs: [
            { id: 'entity', entityType: sourceAction.entityType, required: true },
            input
          ],
          outputs: [{ id: 'entity', entityType: sourceAction.entityType }]
        };
      }
    }
  }
  return derived;
}

function effectPromptContract(nodeId, node, processNodes, graph, domain = {}) {
  const consumerFieldSchema = path => entityFieldSchema(domain, node.entityType, path)
    || structuralFieldSchema(domain, path);
  if (Array.isArray(node.fields) && node.fields.length) {
    return {
      fields: node.fields,
      defaults: plainProcessDefaults(node.inputDefaults),
      wiredFields: [],
      schemas: (node.fields || []).map(consumerFieldSchema).filter(Boolean),
      parentEntityType: node.parentEntityType || ''
    };
  }
  const graphNode = (graph?.nodes || []).find(item => String(item.data?.refId || item.id) === String(nodeId));
  if (!graphNode) return { fields: [], defaults: {}, wiredFields: [], schemas: [], parentEntityType: '' };
  const recordByGraphNode = new Map((graph.nodes || []).map(item => [
    String(item.id),
    processNodes[String(item.data?.refId || item.id)]
  ]));
  const composers = (graph.edges || [])
    .filter(edge => String(edge.target) === String(graphNode.id))
    .map(edge => recordByGraphNode.get(String(edge.source)))
    .filter(record => ['record.composeBlock', 'record.modifyBlock'].includes(record?.kind));
  const schemas = composers
    .flatMap(record => (record.fields || []).map(consumerFieldSchema))
    .filter(Boolean);
  const wiredFields = composers.flatMap(composer => {
    const composerNode = (graph.nodes || []).find(item => String(item.data?.refId || item.id) === String(composer.id));
    if (!composerNode) return [];
    const wiredHandles = new Set((graph.edges || [])
      .filter(edge => String(edge.target) === String(composerNode.id))
      .map(edge => String(edge.targetHandle || '').replace(/^(input|data):/, '')));
    return [
      ...(composer.fields || []).filter(path => wiredHandles.has(path)),
      ...(composer.entries || [])
        .filter(entry => wiredHandles.has(`entry:${entry.id}`))
        .map(entry => `${composer.block}.${entry.key}`)
    ];
  });
  const composerFields = [...new Set(composers.flatMap(record => [
    ...(record.fields || []),
    ...(record.entries || []).map(entry => `${record.block}.${entry.key}`).filter(path => !path.endsWith('.'))
  ]))];
  const defaultIdentityFields = node.kind === 'effect.createEntity'
    && node.construction?.mode === 'genericCreate'
    && !composers.some(record => record.block === 'identity')
    ? ['identity.name']
    : [];
  const fields = [...new Set([...composerFields, ...defaultIdentityFields])];
  const resolvedSchemas = fields.map(consumerFieldSchema).filter(Boolean);
  const allSchemas = [...schemas, ...resolvedSchemas.filter(schema => !schemas.some(item => item.path === schema.path))];
  const parentTypes = [...new Set(allSchemas
    .filter(field => field.block === 'lineage' && field.type?.entityType !== 'organization')
    .map(field => field.type?.entityType)
    .filter(Boolean))];
  const relationContracts = composers
    .filter(record => record.compositionMode === 'relations' || record.block === 'relations')
    .flatMap(record => (record.entries || []).map(entry => {
      const declared = declaredRelationForTarget(domain, node.entityType, entry.entityType, entry.key);
      const composerNode = (graph.nodes || []).find(item => String(item.data?.refId || item.id) === String(record.id));
      const entryEdge = composerNode && (graph.edges || []).find(edge => (
        String(edge.target) === String(composerNode.id)
        && normalizeHandle(edge.targetHandle) === `entry:${entry.id}`
      ));
      const sourceRecord = entryEdge ? recordByGraphNode.get(String(entryEdge.source)) : null;
      let sourcePort = null;
      if (sourceRecord && entryEdge) {
        try {
          sourcePort = catalogPortForHandle(
            resolveCatalogNodePorts(sourceRecord, catalogContext(domain, sourceRecord)).outputs,
            entryEdge.sourceHandle
          );
        } catch {}
      }
      const processCreator = sourceRecord?.kind === 'effect.createEntity'
        && sourceRecord.entityType === (declared?.targetType || entry.entityType)
        ? { actionId: String(sourceRecord.id) }
        : null;
      return {
      ownerType: node.entityType,
      key: declared?.key || entry.key,
      targetType: declared?.targetType || entry.entityType,
      cardinality: declared?.cardinality || (entry.type?.base === 'array' || sourcePort?.type?.base === 'array' ? 'many' : 'one'),
      ...(processCreator ? { creator: processCreator } : {}),
      ...(hasDomainAttachmentKinds(declared?.targetType || entry.entityType, domain) ? {
        creator: {
          entityType: declared?.targetType || entry.entityType,
          attachmentKinds: attachmentCreatorKinds(entry.attachmentKinds, domain)
        }
      } : {})
    };
    }))
    .filter(relation => relation.key && relation.targetType);
  return {
    fields,
    defaults: Object.assign({}, ...composers.map(record => plainProcessDefaults(record.inputDefaults))),
    wiredFields,
    schemas: allSchemas,
    parentEntityType: node.parentEntityType || (parentTypes.length === 1 ? parentTypes[0] : ''),
    relationContracts
  };
}

function hasDomainAttachmentKinds(entityType = '', domain = {}) {
  const construction = domain.construction?.[entityType];
  if (!construction) return false;
  const inputs = [
    ...(construction.inputs || []),
    ...Object.values(construction.modeInputs || {}).flat()
  ];
  return inputs.some(input => (
    input?.creator?.entityType === entityType
    && Boolean(input.creator.attachmentKinds)
  ));
}

function attachmentCreatorKinds(selectedKinds = [], domain = {}) {
  const definitions = Object.values(domain.attachmentKinds || {});
  const kinds = selectedKinds.length
    ? selectedKinds.map(kind => typeof kind === 'string' ? kind : kind.kind)
    : definitions
      .filter(kind => ['upload', 'capture', 'editor'].includes(kind.creation?.mode))
      .map(kind => kind.kind || kind.id);
  return kinds.filter(Boolean).map(kind => ({
    kind,
    creation: domain.attachmentKinds?.[kind]?.creation || { mode: 'workflow' }
  }));
}

function declaredRelationForTarget(domain = {}, ownerType = '', targetType = '', key = '') {
  const matches = (domain.relations || []).filter(relation => (
    relation.ownerType === ownerType && relation.targetType === targetType && relation.key === key
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function requiredEffectCapability(kind = '') {
  if (kind === 'effect.createEntity' || kind === 'effect.runProducer') return 'create';
  if (kind === 'effect.updateEntity') return 'processUpdate';
  if (kind === 'effect.changeStatus') return 'statusMutation';
  if (kind === 'effect.archiveEntity') return 'archive';
  if (kind === 'effect.deleteEntity') return 'delete';
  return null;
}

export function validateProcessDefinition(definition = {}, domain = {}, { roles = {}, capabilities } = {}) {
  const process = normalizeProcessDefinition(definition, domain);
  const lineageBindings = compileLineageBindings(process, domain);
  const organizationRoles = normalizeRoleCatalog(roles);
  const errors = [];
  const diagnostics = [];
  const warnings = [];
  const nodeIds = new Set(process.graph.nodes.map(node => node.id));
  const entities = new Set((domain.entities || []).map(entity => entity.type));
  const commands = new Set(Object.keys(domain.commands || {}));

  for (const edge of process.graph.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} references missing source node ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} references missing target node ${edge.target}`);
  }
  errors.push(...validateProcessEdges(process));
  if (Number(process.dataflowVersion) === PROCESS_DATAFLOW_VERSION) {
    const edgeDiagnostics = validateDataflowEdges(process, domain);
    diagnostics.push(...edgeDiagnostics);
    errors.push(...edgeDiagnostics.map(diagnostic => diagnostic.message));
  }

  for (const node of process.graph.nodes) {
    const refId = node.data?.refId;
    if (!refId) continue;
    if (node.type === 'role' && !organizationRoles[refId]) errors.push(`Role node ${node.id} references missing organization role ${refId}`);
    if (node.type === 'entity' && !process.producerOutputs[refId]) errors.push(`Entity node ${node.id} references missing producer output ${refId}`);
    if (node.type === 'action' && !process.actions[refId]) errors.push(`Action node ${node.id} references missing action ${refId}`);
    if (node.type === 'service' && !process.services[refId]) errors.push(`Service node ${node.id} references missing service ${refId}`);
    if (node.type === 'socket' && !process.sockets[refId]) errors.push(`Socket node ${node.id} references missing socket ${refId}`);
    if (node.type === 'statusDefinition' && !process.statusDefinitions[refId]) errors.push(`Status node ${node.id} references missing status definition ${refId}`);
    if (node.type === 'valueInput' && !process.valueInputs[refId]) errors.push(`Value node ${node.id} references missing value input ${refId}`);
    if (node.type === 'processNode' && !process.processNodes[refId]) errors.push(`Process node ${node.id} references missing process node ${refId}`);
  }

  for (const [producerOutputId, output] of Object.entries(process.producerOutputs)) {
    if (producerOutputId !== output.producerOutputId) errors.push(`Producer output key ${producerOutputId} must match producerOutputId`);
    if (!output.nodeId || !output.outputSocketId) errors.push(`Producer output ${producerOutputId} requires nodeId and outputSocketId`);
    if (producerOutputId !== `${output.nodeId}:${output.outputSocketId}`) errors.push(`Producer output ${producerOutputId} must be derived from nodeId and outputSocketId`);
    if (!entities.has(output.entityType)) errors.push(`Producer output ${producerOutputId} uses unknown entity type ${output.entityType}`);
    validateFieldList(output.fields?.read, domain, output.entityType, `producer output ${producerOutputId} read fields`, errors, 'read');
    validateFieldList(output.fields?.write, domain, output.entityType, `producer output ${producerOutputId} write fields`, errors, 'write');
    validateFieldList(output.fields?.private, domain, output.entityType, `producer output ${producerOutputId} private fields`, errors, 'admin');
    for (const relationKey of output.relations || []) {
      if (!(domain.relations || []).some(relation => relation.ownerType === output.entityType && relation.key === relationKey)) {
        errors.push(`Producer output ${producerOutputId} uses undeclared relation ${output.entityType}.${relationKey}`);
      }
    }
    try {
      const lifecycle = compileLifecycle(output, domain);
      for (const [regionId, region] of Object.entries(lifecycle.regions || {})) {
        const stateIds = Object.keys(region.states || {});
        if (!stateIds.length) continue;
        if (!region.initial) {
          errors.push(`Producer output ${producerOutputId} region ${regionId} declares states ${stateIds.join(', ')} but no entry state`);
        } else if (!region.states[region.initial]) {
          errors.push(`Producer output ${producerOutputId} region ${regionId} entry state ${region.initial} is not declared`);
        }
      }
    } catch (error) {
      errors.push(`Producer output ${producerOutputId} lifecycle is invalid: ${error.message}`);
    }
  }

  for (const [serviceId, service] of Object.entries(process.services)) {
    if (service.commandId && !commands.has(service.commandId)) errors.push(`Service ${serviceId} uses unknown command ${service.commandId}`);
    for (const principalId of [...(service.access?.runPrincipals || []), ...(service.access?.viewPrincipals || [])]) {
      if (!process.servicePrincipals[principalId]) errors.push(`Service ${serviceId} references missing service principal ${principalId}`);
    }
    for (const input of service.inputs || []) {
      if (input.entityType && !entities.has(input.entityType)) errors.push(`Service ${serviceId} input ${input.id} uses unknown entity type ${input.entityType}`);
    }
    for (const output of service.outputs || []) {
      if (output.entityType && !entities.has(output.entityType)) errors.push(`Service ${serviceId} output ${output.id} uses unknown entity type ${output.entityType}`);
    }
  }

  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  for (const [actionId, action] of Object.entries(process.actions)) {
    const actionWindow = actionWindows.get(actionId);
    const resolvedActionEntityType = actionEntityType(action)
      || actionWindow?.input?.entityType
      || actionWindow?.outputs?.[0]?.entityType
      || null;
    if (resolvedActionEntityType && !action.producerOutputId) {
      errors.push(`Action ${actionId} on ${resolvedActionEntityType} requires producerOutputId`);
    } else if (action.producerOutputId) {
      const producerOutput = process.producerOutputs?.[action.producerOutputId];
      if (!producerOutput) {
        errors.push(`Action ${actionId} uses unknown producerOutputId ${action.producerOutputId}`);
      } else if (resolvedActionEntityType && producerOutput.entityType !== resolvedActionEntityType) {
        errors.push(`Action ${actionId} producerOutputId emits ${producerOutput.entityType}, not ${resolvedActionEntityType}`);
      }
    }
    validateAction(actionId, action, { entities, commands, roles: organizationRoles, domain, errors, statusDefinitions: process.statusDefinitions, process, lineageBindings });
  }

  for (const [nodeId, node] of Object.entries(process.processNodes)) {
    validateProcessNode(nodeId, node, { entities, domain, errors });
  }
  if (capabilities) {
    validateEffectCapabilities(process, domain, capabilities, errors);
  }
  for (const [inputId, input] of Object.entries(process.valueInputs)) {
    if (!PROCESS_SCALAR_KINDS.includes(input.valueType)) errors.push(`Value input ${inputId} uses unknown type ${input.valueType || '(empty)'}`);
    if (!PROCESS_STRUCTURES.includes(input.structure || 'item')) errors.push(`Value input ${inputId} uses unknown structure ${input.structure}`);
  }
  validateProcessNodeConnections(process, errors, domain);

  for (const [statusId, status] of Object.entries(process.statusDefinitions)) {
    if (!status.statusId) errors.push(`Status definition ${statusId} must define statusId`);
    if (status.entityType && !entities.has(status.entityType)) errors.push(`Status definition ${statusId} uses unknown entity type ${status.entityType}`);
  }

  for (const [socketId, socket] of Object.entries(process.sockets)) {
    if (!entities.has(socket.entityType)) errors.push(`Socket ${socketId} uses unknown entity type ${socket.entityType}`);
    validateFieldList(socket.projection?.fields, domain, socket.entityType, `socket ${socketId} projection fields`, errors);
    validateFieldList(socket.projection?.excludeFields, domain, socket.entityType, `socket ${socketId} excluded fields`, errors);
    if (socket.receiverLifecycle?.mode === 'custom') {
      try {
        compileLifecycle({ entityType: socket.entityType, lifecycle: socket.receiverLifecycle }, domain);
      } catch (error) {
        errors.push(`Socket ${socketId} receiver lifecycle is invalid: ${error.message}`);
      }
    }
  }

  for (const [screenId, screen] of Object.entries(process.screens)) {
    if (!screen || typeof screen !== 'object' || Array.isArray(screen)) {
      validateScreenContract(screen, { screenId, entities, actions: process.actions, errors });
      continue;
    }
    if (!screen.route) errors.push(`Screen ${screenId} must define a route`);
    for (const roleId of screen.roleIds || []) {
      if (!organizationRoles[roleId]) errors.push(`Screen ${screenId} references missing organization role ${roleId}`);
    }
    validateScreenContract(screen, { screenId, entities, actions: process.actions, errors });
  }

  for (const roleId of Object.keys(process.roleGrants)) {
    if (!organizationRoles[roleId]) errors.push(`Process grants reference missing organization role ${roleId}`);
  }

  warnings.push(...unreachableNodeDiagnostics(process));

  return { ok: errors.length === 0, errors, warnings, diagnostics, definition: process };
}

// Pure/read subgraphs stay valid on purpose; this reports the nodes whose
// values can never reach a persistence effect or any other operational sink,
// so an inspect-only island is surfaced as non-operational instead of failing.
function unreachableNodeDiagnostics(process = {}) {
  const nodes = (process.graph?.nodes || []).filter(node => node.type === 'processNode');
  const recordsByGraphId = new Map(nodes.map(node => [
    String(node.id),
    process.processNodes?.[String(node.data?.refId || node.id)]
  ]));
  const predecessors = new Map(nodes.map(node => [String(node.id), []]));
  for (const edge of process.graph?.edges || []) {
    if (!predecessors.has(String(edge.target))) continue;
    predecessors.get(String(edge.target)).push(String(edge.source));
  }
  const operational = [];
  for (const [nodeId, record] of recordsByGraphId) {
    if (record?.kind?.startsWith('effect.')) operational.push(nodeId);
  }
  const reachingOperational = new Set(operational);
  const queue = [...operational];
  while (queue.length) {
    const current = queue.shift();
    for (const predecessor of predecessors.get(current) || []) {
      if (reachingOperational.has(predecessor)) continue;
      reachingOperational.add(predecessor);
      queue.push(predecessor);
    }
  }
  const warnings = [];
  for (const [nodeId, record] of recordsByGraphId) {
    if (reachingOperational.has(nodeId)) continue;
    warnings.push(`Process node ${nodeId} (${record?.kind || 'unknown'}) is non-operational: its values cannot reach any persistence effect`);
  }
  return warnings;
}

// Inputs whose value is resolvable from the manual run context even without a
// wire, fallback, or prompt: the current entity, the change-status target, and
// the initial create status.
const CONTEXT_RESOLVABLE_PORTS = new Set(['entity', 'parent', 'status', 'status.state.primary']);

function edgeHandle(handle = '') {
  return String(handle || '').replace(/^(input|output|data|control|success|failure):/, '');
}

function isDataEdge(edge = {}) {
  return edge.role !== 'control'
    && !String(edge.sourceHandle || '').startsWith('control:')
    && !String(edge.targetHandle || '').startsWith('control:');
}

// One emptiness rule shared by authored fallbacks and domain defaults: an
// explicit null/undefined is absence and never satisfies; entity/block values
// must be non-null references; entity-list/array/attachment values must be
// non-empty; enum/status values must be a declared member; unconstrained
// primitives accept any type-valid value including ''/0/false. A scalar on a
// List/Tree-declared socket is one broadcast item and satisfies by the scalar
// rules; only actual arrays/trees use the collection non-empty rule.
function inputValueSatisfies(value, port, declared = {}) {
  const scalar = isDataTree(value) ? value.branches?.[0]?.items?.[0] : value;
  if (scalar === null || scalar === undefined) return false;
  const type = port.type || {};
  const base = type.base || type.kind || '';
  const collection = base === 'array' || base === 'entity_list'
    || ((port.access === 'list' || port.access === 'tree')
      && (Array.isArray(scalar) || Boolean(scalar && typeof scalar === 'object' && Array.isArray(scalar.branches))));
  if (collection) {
    if (Array.isArray(scalar)) return scalar.length > 0;
    if (scalar && typeof scalar === 'object' && Array.isArray(scalar.branches)) {
      return scalar.branches.some(branch => Array.isArray(branch.items) && branch.items.length > 0);
    }
    return false;
  }
  if (['entity', 'entityRef', 'revisionRef'].includes(base)) {
    if (typeof scalar !== 'object') return false;
    return Boolean(scalar.id || scalar._id || scalar.identity || scalar.entityId || scalar.type);
  }
  if (['block', 'predicate', 'patch', 'record', 'taskRef'].includes(base)) return typeof scalar === 'object';
  if (base === 'attachmentRef' || base === 'attachment' || base === 'opaque') {
    return typeof scalar === 'string' ? scalar.length > 0 : typeof scalar === 'object';
  }
  if (base === 'enum' || base === 'status') {
    if (typeof scalar !== 'string' || scalar === '') return false;
    const options = Array.isArray(declared.options) ? declared.options : [];
    if (!options.length) return true;
    const members = options.map(option => typeof option === 'object' && option !== null ? option.value : option);
    return members.includes(scalar);
  }
  return true;
}

// The manual action surface prompts the inputs it can ask the user for: Link
// targets, the manual generic Create identity block, typed construction inputs
// that are not explicitly non-promptable, and command parameters/entities whose
// display contract exposes them. A prompt only ever satisfies a manual path.
function promptableInputIds(record = {}, domain = {}) {
  const ids = new Set();
  const kind = record.kind;
  const construction = record.construction || {};
  const contract = domain.construction?.[record.entityType] || {};
  const modeInputs = contract.modeInputs?.[construction.mode] || [];
  const declaredInputs = Array.isArray(construction.inputs) ? construction.inputs : [];
  const contractInputs = Array.isArray(contract.inputs) ? contract.inputs : [];
  if (kind === 'effect.createEntity' || kind === 'effect.runProducer') {
    if (kind === 'effect.createEntity' && construction.mode === 'genericCreate') {
      ids.add('identity');
      ids.add('name');
    }
    for (const input of [...modeInputs, ...declaredInputs, ...contractInputs]) {
      if (!input) continue;
      if (input.prompt !== false && input.id) ids.add(input.id);
      if (input.path && input.path !== 'name') ids.add(input.path);
    }
  }
  if (kind === 'effect.runCommand') {
    const command = domain.commands?.[record.commandId] || {};
    for (const input of command.input?.abstractEntities || []) {
      if (input.prompt !== false && (input.name || input.type || input.capability)) {
        ids.add(input.name || input.type || input.capability);
      }
    }
    for (const input of command.input?.entities || []) {
      if (input.prompt !== false && (input.name || input.type)) ids.add(input.name || input.type);
    }
    for (const input of command.input?.parameters || []) {
      if (input.display !== 'hidden' && input.name) ids.add(input.name);
    }
  }
  return ids;
}

// The domain-declared metadata (default, options) for a required input port.
function declaredInputMetadata(record = {}, domain = {}, portId = '') {
  const construction = record.construction || {};
  const contract = domain.construction?.[record.entityType] || {};
  const constructionInputs = [
    ...(construction.inputs || []),
    ...(contract.modeInputs?.[construction.mode] || []),
    ...(contract.inputs || [])
  ];
  const constructionMatch = constructionInputs.find(input => (input.id || input.path) === portId);
  if (constructionMatch) return constructionMatch;
  const command = domain.commands?.[record.commandId] || {};
  const commandInputs = [
    ...(command.input?.abstractEntities || []),
    ...(command.input?.entities || []),
    ...(command.input?.parameters || [])
  ];
  return commandInputs.find(input => (input.name || input.type || input.capability) === portId) || {};
}

// Exactly one activation-time availability contract for required inputs. A
// required input is satisfied by a connected upstream value, an authored
// fallback, a domain-owned default, a generated manual prompt (manual actions
// only), or the run context (manual actions only). A prompt or run context
// never satisfies an automatically evaluated path, so an event-triggered effect
// must be complete without a UI prompt.
export function validateRequiredInputAvailability(process = {}, domain = {}) {
  const errors = [];
  const nodes = process.graph?.nodes || [];
  const edges = process.graph?.edges || [];
  for (const [recordId, record] of Object.entries(process.processNodes || {})) {
    if (!record?.kind?.startsWith('effect.')) continue;
    const manual = (record.trigger?.mode || 'manual') === 'manual';
    const graphNode = nodes.find(node => String(node.data?.refId || node.id) === String(recordId));
    let ports = [];
    try { ports = resolveCatalogNodePorts(record, catalogContext(domain, record)).inputs; } catch { continue; }
    const promptable = promptableInputIds(record, domain);
    for (const port of ports.filter(item => item.role === 'data' && item.required)) {
      const sources = [];
      if (edges.some(edge => String(edge.target) === String(graphNode?.id)
        && isDataEdge(edge) && edgeHandle(edge.targetHandle) === port.id)) {
        sources.push('connected');
      }
      if (Object.hasOwn(record.inputDefaults || {}, port.id)
        && inputValueSatisfies(record.inputDefaults[port.id], port, declaredInputMetadata(record, domain, port.id))) {
        sources.push('fallback');
      }
      const declared = declaredInputMetadata(record, domain, port.id);
      if (Object.hasOwn(declared, 'default')
        && inputValueSatisfies(declared.default, port, declared)) {
        sources.push('default');
      }
      if (manual) {
        if (promptable.has(port.id)) sources.push('prompt');
        if (CONTEXT_RESOLVABLE_PORTS.has(port.id)) sources.push('runtime context');
      }
      if (!sources.length) {
        const producerContext = record.producerOutputId
          ? ` of producer output ${record.producerOutputId}`
          : '';
        errors.push({
          message:
            `Required input ${port.id} on ${record.kind} node ${record.label || recordId}${producerContext} has no available source `
            + (manual ? '(connected, fallback, default, manual prompt, or runtime context)' : '(connected, fallback, or default; a manual prompt cannot satisfy an automatically evaluated path)'),
          nodeId: String(graphNode?.id || recordId),
          socketId: port.id,
          ...(record.producerOutputId ? { producerOutputId: record.producerOutputId } : {})
        });
      }
    }
  }
  return errors;
}

// A consumer effect's producer context is the upstream producer of its
// entity input wire: follow incoming data edges (through consumer nodes)
// until an origin node or join provides the identity. The graph path by
// which the entity enters supplies the workflow context.
function upstreamProducerOutputId(process, node, visited = new Set()) {
  if (!node?.id || visited.has(String(node.id))) return null;
  visited.add(String(node.id));
  const recordsByGraphId = new Map((process.graph?.nodes || []).map(graphNode => [
    String(graphNode.id),
    (process.processNodes || {})[String(graphNode.data?.refId || graphNode.id)]
  ]));
  for (const edge of process.graph?.edges || []) {
    if (String(edge.target) !== String(node.id)) continue;
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) continue;
    if (source.kind === 'producer.join' && source.selectedProducerOutputId) {
      const selected = process.producerOutputs?.[source.selectedProducerOutputId];
      if (selected) return source.selectedProducerOutputId;
      continue;
    }
    if (source.producerOutputId && process.producerOutputs?.[source.producerOutputId]) {
      return source.producerOutputId;
    }
    if (CONSUMER_EFFECT_KINDS.includes(source.kind)) {
      const upstream = upstreamProducerOutputId(process, source, visited);
      if (upstream) return upstream;
    }
  }
  // Read sources and unmarked origins resolve by single same-type candidate,
  // exactly like downstream identity resolution does.
  const sourceEntityType = node?.entityType;
  if (sourceEntityType) {
    const matching = Object.values(process.producerOutputs || {})
      .filter(output => output?.entityType === sourceEntityType);
    if (matching.length === 1) return matching[0].producerOutputId;
  }
  return null;
}

function resolveSourceProducerOutputId(process, source, sourcePort) {
  if (!source?.id) return null;
  // An explicit producer-path Join routes its output under the producer
  // output its configuration selects, so downstream identity resolution sees
  // exactly one producer.
  if (source.kind === 'producer.join' && source.selectedProducerOutputId) {
    return process.producerOutputs?.[source.selectedProducerOutputId]
      ? source.selectedProducerOutputId
      : null;
  }
  if (CONSUMER_EFFECT_KINDS.includes(source.kind)) {
    return upstreamProducerOutputId(process, source);
  }
  const candidates = Object.values(process.producerOutputs || {})
    .filter(output => output?.nodeId === source.id);
  const exactKey = sourcePort?.id ? `${source.id}:${sourcePort.id}` : '';
  const exact = exactKey && candidates.find(output => (
    output.producerOutputId === exactKey || output.outputSocketId === sourcePort.id
  ));
  if (exact) return exact.producerOutputId;
  const portEntityType = sourcePort?.type?.entityType || sourcePort?.type?.itemType?.entityType || '';
  const matching = portEntityType
    ? candidates.filter(output => output.entityType === portEntityType)
    : candidates;
  return matching.length === 1 ? matching[0].producerOutputId : null;
}

export function validateLineageBindingResolution(process = {}, domain = {}) {
  const errors = [];
  const push = (message, anchors = {}) => errors.push({ message, ...anchors });
  const recordsByGraphId = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.processNodes || {})[String(node.data?.refId || node.id)]
  ]));
  for (const edge of process.graph?.edges || []) {
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || target.compositionMode !== 'ancestors') continue;
    const handle = normalizeHandle(edge.targetHandle);
    if (!handle.startsWith('entry:')) continue;
    const entryId = handle.replace(/^entry:/, '');
    const entry = (target.entries || []).find(item => item.id === entryId);
    const anchors = { edgeId: edge.id, nodeId: String(edge.target), socketId: handle };
    if (!entry) {
      push(`Edge ${edge.id} targets missing lineage entry ${entryId} on ${target.id || target.label}`, anchors);
      continue;
    }
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) {
      push(`Edge ${edge.id} cannot resolve lineage source node ${String(edge.source)} for entry ${entry.id} on ${target.id}`, anchors);
      continue;
    }
    let sourcePort = null;
    try {
      sourcePort = catalogPortForHandle(
        resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs,
        edge.sourceHandle
      );
    } catch { sourcePort = null; }
    const portEntityType = sourcePort?.type?.entityType || sourcePort?.type?.itemType?.entityType || '';
    const ancestorType = portEntityType || source.entityType || entry.entityType || '';
    if (!ancestorType) {
      push(`Edge ${edge.id} cannot resolve an ancestor entity type for lineage entry ${entry.id} on ${target.id} from source ${source.id}`, anchors);
      continue;
    }
    if (ancestorType === 'organization') {
      push(`Edge ${edge.id} lineage entry ${entry.id} on ${target.id} cannot use organization as an ancestor`, anchors);
      continue;
    }
    const lineageKey = entry.key || lineageKeyForEntityType(ancestorType);
    if (!lineageKey) {
      push(`Edge ${edge.id} lineage entry ${entry.id} on ${target.id} has no lineage key for ancestor type ${ancestorType}`, anchors);
      continue;
    }
    if (portEntityType && sourcePort?.id
      && !resolveSourceProducerOutputId(process, source, sourcePort)) {
      push(
        `Edge ${edge.id} lineage source socket ${source.id}:${sourcePort.id} on ${source.id} emits entity type ${portEntityType} `
        + `but has no resolvable producer output record`,
        anchors
      );
    }
  }
  return errors;
}

export function compileProcessDefinition(definition = {}, domain = {}, { roles = {} } = {}) {
  const organizationRoles = normalizeRoleCatalog(roles);
  const validation = validateProcessDefinition(definition, domain, { roles: organizationRoles });
  if (!validation.ok) {
    const error = new Error(validation.errors.join('; '));
    error.validation = validation;
    throw error;
  }

  const process = validation.definition;
  const lineageBindings = compileLineageBindings(process, domain);
  const compiledRoles = compileRoles(process, domain, organizationRoles, lineageBindings);
  const compiledScreens = compileScreens(process, domain, compiledRoles, lineageBindings);
  const workflows = compileWorkflows(process, domain, lineageBindings);
  const fieldPolicies = compileFieldPolicies(process.producerOutputs, domain);
  const compiledActions = compileActions(process.actions, process, domain, lineageBindings);
  const producerOutputs = Object.fromEntries(Object.entries(process.producerOutputs).map(([producerOutputId, output]) => [producerOutputId, {
    ...output,
    producerOutputId,
    workflow: workflows[producerOutputId],
    fieldPolicy: fieldPolicies[producerOutputId],
    actions: Object.values(compiledActions).filter(action => action.producerOutputId === producerOutputId),
    lineageBindings: lineageBindings.filter(binding => binding.producerOutputId === producerOutputId)
  }]));

  return {
    schemaVersion: PROCESS_SCHEMA_VERSION,
    activatedAt: new Date().toISOString(),
    roles: compiledRoles,
    servicePrincipals: process.servicePrincipals,
    producerOutputs,
    actions: compiledActions,
    statusDefinitions: compileStatusDefinitions(process.statusDefinitions),
    valueInputs: compileValueInputs(process.valueInputs),
    processNodes: compileProcessNodes(process.processNodes),
    services: compileServices(process.services),
    sockets: compileSockets(process.sockets),
    screens: compiledScreens,
    lineageBindings,
    warnings: validation.warnings
  };
}

export function compileLineageBindings(process = {}, domain = {}) {
  const bindings = [];
  const processNodes = process.processNodes || {};
  const graph = process.graph || {};
  const recordsByGraphId = new Map((graph.nodes || []).map(node => [
    String(node.id),
    processNodes[String(node.data?.refId || node.id)]
  ]));
  for (const edge of graph.edges || []) {
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || target.compositionMode !== 'ancestors') continue;
    const entryId = normalizeHandle(edge.targetHandle).replace(/^entry:/, '');
    const entry = target.entries?.find(item => item.id === entryId);
    if (!entry) continue;
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) continue;
    let outputs = [];
    try { outputs = resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs; } catch { outputs = []; }
    const sourcePort = catalogPortForHandle(outputs, edge.sourceHandle);
    const sourceProducerOutputId = resolveSourceProducerOutputId(process, source, sourcePort)
      || source.producerOutputId || null;
    const ancestorType = sourcePort?.type?.entityType
      || sourcePort?.type?.itemType?.entityType
      || source.entityType
      || entry.entityType
      || '';
    if (!ancestorType) continue;
    const lineageKey = entry.key || lineageKeyForEntityType(ancestorType);
    const consumers = (graph.edges || [])
      .filter(candidate => String(candidate.source) === String(edge.target))
      .filter(candidate => normalizeHandle(candidate.sourceHandle) === 'block')
      .filter(candidate => normalizeHandle(candidate.targetHandle) === 'lineage')
      .map(candidate => ({ node: recordsByGraphId.get(String(candidate.target)), edge: candidate }))
      .filter(({ node }) => node);
    const producerConsumers = consumers.filter(({ node }) => (
      ['effect.createEntity', 'effect.runProducer'].includes(node.kind)
    ));
    if (!lineageKey || ancestorType === 'organization') continue;
    if (producerConsumers.length) {
      for (const { node } of producerConsumers) {
        const childEntityType = node.entityType || target.targetEntityType || target.entityType || '';
        if (!childEntityType) continue;
      bindings.push({
        childEntityType,
        ancestorEntityType: ancestorType,
        lineageKey,
        producerOutputId: node.producerOutputId || null,
        sourceProducerOutputId,
        sourceNode: String(edge.source),
        sourceSocket: String(edge.sourceHandle || ''),
        consumingNode: String(edge.target),
        consumingSocket: String(edge.targetHandle || '')
      });
      }
      continue;
    }
    const childTypes = [...new Set([
      target.targetEntityType,
      target.entityType,
      ...consumers.map(({ node }) => node.entityType)
    ].filter(Boolean))];
    if (!childTypes.length) continue;
    for (const childEntityType of childTypes) {
      bindings.push({
        childEntityType,
        ancestorEntityType: ancestorType,
        lineageKey,
        producerOutputId: null,
        sourceProducerOutputId,
        sourceNode: String(edge.source),
        sourceSocket: String(edge.sourceHandle || ''),
        consumingNode: String(edge.target),
        consumingSocket: String(edge.targetHandle || '')
      });
    }
  }
  const unique = new Map(bindings.map(binding => [
    [
      binding.producerOutputId,
      binding.sourceProducerOutputId,
      binding.childEntityType,
      binding.ancestorEntityType,
      binding.lineageKey,
      binding.sourceNode,
      binding.sourceSocket,
      binding.consumingNode,
      binding.consumingSocket
    ].join(':'),
    binding
  ]));
  return [...unique.values()];
}

export function resolveRoleAssignmentAccess({ compiled, assignment, domain = {} } = {}) {
  if (!assignment || (assignment.status && assignment.status !== 'active')) return emptyAssignmentAccess();
  return compileAssignmentAccess({
    assignment,
    roles: compiled?.roles || {},
    screens: compiled?.screens || {},
    lineageBindings: compiled?.lineageBindings || [],
    domain
  });
}

export function resolveEffectiveAccess({ access } = {}) {
  return access?.permissions || {};
}

export function resolveNavigation({ access } = {}) {
  return access?.navigation || [];
}

export function resolveScreens({ access } = {}) {
  return access?.screens || [];
}

function normalizeGraph(graph = {}) {
  return {
    nodes: Array.isArray(graph.nodes) ? graph.nodes.map(normalizeNode) : [],
    edges: Array.isArray(graph.edges) ? graph.edges.map(normalizeEdge) : [],
    viewport: {
      x: Number(graph.viewport?.x || 0),
      y: Number(graph.viewport?.y || 0),
      zoom: Number(graph.viewport?.zoom || 1)
    }
  };
}

function normalizeNode(node = {}) {
  return {
    id: String(node.id || ''),
    type: node.type || 'default',
    position: {
      x: Number(node.position?.x || 0),
      y: Number(node.position?.y || 0)
    },
    data: node.data && typeof node.data === 'object' ? node.data : {}
  };
}

function normalizeEdge(edge = {}) {
  const sourceHandle = edge.sourceHandle || inferEdgeHandle(edge, 'source');
  const targetHandle = edge.targetHandle || inferEdgeHandle(edge, 'target');
  return {
    id: String(edge.id || `${edge.source || ''}-${edge.target || ''}`),
    source: String(edge.source || ''),
    target: String(edge.target || ''),
    sourceHandle,
    targetHandle,
    type: edge.type || 'default',
    data: edge.data && typeof edge.data === 'object' ? edge.data : {}
  };
}

function inferEdgeHandle(edge = {}, side = 'source') {
  const dataKey = side === 'source' ? 'sourceHandle' : 'targetHandle';
  if (edge.data?.[dataKey]) return edge.data[dataKey];
  const id = String(edge.id || '');
  const pattern = side === 'source'
    ? /(?:^|[-])((?:output)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/
    : /(?:^|[-])((?:input|data)(?::[A-Za-z0-9_.:]+)?)(?=[-]|$)/;
  const match = id.match(pattern);
  return match?.[1] || null;
}

function normalizeRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

function normalizeActions(value) {
  return Object.fromEntries(Object.entries(normalizeRecord(value)).map(([id, action]) => [id, normalizeActionRecord(action)]));
}

function normalizeActionRecord(action = {}) {
  if (action.actionKind !== 'changeStatus') return { ...action };
  const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', entityType, required: false });
  }
  if (!inputs.some(input => input.id === 'status')) {
    inputs.push({
      id: 'status',
      kind: 'status',
      statusRef: action.statusRef || null,
      status: action.status?.to || action.access?.statusTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    entityType,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      statusFrom: action.access?.statusFrom || action.status?.from || '',
      statusTo: action.access?.statusTo || action.status?.to || ''
    }
  };
}

function compileLifecycle(profile = {}, domain = {}) {
  const lifecycle = profile.lifecycle || {};
  if (lifecycle.mode === 'defaultCreated' || !lifecycle.mode) return createDefaultCreatedWorkflow(profile.label || profile.entityType);
  if (lifecycle.mode === 'domainDefault') {
    const workflow = domain.workflows?.[profile.entityType];
    if (!workflow) return createDefaultCreatedWorkflow(profile.label || profile.entityType);
    return normalizeWorkflow(workflow);
  }
  if (lifecycle.mode === 'custom') return normalizeWorkflow(lifecycle.workflow);
  throw new Error(`Unknown lifecycle mode ${lifecycle.mode}`);
}

function compileWorkflows(process = {}, domain = {}, lineageBindings = []) {
  const workflows = {};
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  const graphContext = buildActionGraphContext(process);
  for (const output of Object.values(process.producerOutputs || {})) {
    workflows[output.producerOutputId] = compileLifecycle(output, domain);
  }

  const builders = new Map(Object.entries(workflows).map(([producerOutputId, workflow]) => [
    producerOutputId,
    workflowBuilderFromWorkflow(workflow)
  ]));

  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const kind = action.actionKind || 'createEntity';
    if (!['createEntity', 'updateEntity'].includes(kind)) continue;
    const entityType = actionEntityType(action) || actionWindows.get(actionId)?.outputs?.[0]?.entityType || actionWindows.get(actionId)?.input?.entityType;
    if (!entityType || !action.producerOutputId) continue;
    const builder = primaryRegionBuilder(ensureWorkflowBuilder(builders, action.producerOutputId));

    if (kind === 'createEntity') {
      const targetState = actionTargetState(action, process);
      if (targetState) addWorkflowState(builder, targetState);
      continue;
    }

    const to = actionTargetState(action, process);
    const access = normalizeActionAccess(action.access);
    if (!to) continue;

    for (const source of workflowTransitionSources(actionId, action, entityType, graphContext, actionWindows)) {
      const from = source.status;
      if (!from) continue;
      addWorkflowState(builder, from);
      addWorkflowState(builder, to);
      upsertWorkflowTransition(builder, {
        from,
        to,
        processRoleIds: actionExposureRoleIdsForInput(action, access, source.window)
      });
    }
  }

  for (const [producerOutputId, builder] of builders) {
    if (!Object.values(builder.regions).some(region => Object.keys(region.states).length)) continue;
    for (const region of Object.values(builder.regions)) {
      applyStatusDefinitionMetadata(region, process.producerOutputs?.[producerOutputId]?.entityType, process.statusDefinitions);
    }
    workflows[producerOutputId] = normalizeWorkflow({
      ...builder.contracts,
      schemaVersion: 2,
      primaryRegion: builder.primaryRegion,
      regions: Object.fromEntries(Object.entries(builder.regions).map(([regionId, region]) => [regionId, {
        ...region.contracts,
        initial: region.initial,
        states: region.states,
        transitions: region.transitions
      }]))
    });
  }

  return workflows;
}

function workflowTransitionSources(actionId, action = {}, entityType = '', graphContext, actionWindows) {
  const sources = [];
  const edges = graphContext.incomingByActionId.get(actionId) || [];

  for (const edge of edges) {
    if (!isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceWindow = outputWindowForHandle(actionWindows.get(edge.sourceActionId), edge.sourceHandle);
    if (!sourceWindow?.status) continue;
    if (entityType && sourceWindow.entityType && sourceWindow.entityType !== entityType) continue;
    sources.push({ status: sourceWindow.status, window: sourceWindow });
  }

  const fallbackStatus = action.status?.from
    || action.access?.statusFrom
    || action.inputs?.find(input => input.status)?.status
    || '';
  if (fallbackStatus) sources.push({ status: fallbackStatus, window: actionWindows.get(actionId)?.input || null });

  const seen = new Set();
  return sources.filter(source => {
    if (!source.status || seen.has(source.status)) return false;
    seen.add(source.status);
    return true;
  });
}

function applyStatusDefinitionMetadata(builder, entityType, statusDefinitions = {}) {
  for (const definition of Object.values(statusDefinitions || {})) {
    if (definition.entityType && definition.entityType !== entityType) continue;
    const statusId = definition.statusId || definition.id;
    if (!statusId || !builder.states[statusId]) continue;
    builder.states[statusId] = {
      ...(builder.states[statusId] || {}),
      label: definition.label || statusId,
      color: definition.color || definition.severity || '',
      severity: definition.severity || definition.color || '',
      icon: definition.icon || '',
      ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
    };
  }
}

const WORKFLOW_STRUCTURAL_KEYS = new Set(['schemaVersion', 'primaryRegion', 'initial', 'states', 'transitions', 'regions']);
const REGION_STRUCTURAL_KEYS = new Set(['id', 'initial', 'states', 'transitions']);

function carriedContracts(source = {}, structuralKeys) {
  return Object.fromEntries(Object.entries(source).filter(([key]) => !structuralKeys.has(key)));
}

function workflowBuilderFromWorkflow(workflow = {}) {
  const sourceRegions = workflow.regions && typeof workflow.regions === 'object' ? workflow.regions : {};
  const primaryRegion = workflow.primaryRegion || (sourceRegions.main ? 'main' : Object.keys(sourceRegions)[0]) || 'main';
  const regions = {};
  for (const [regionId, region] of Object.entries(sourceRegions)) {
    regions[regionId] = {
      contracts: carriedContracts(region, REGION_STRUCTURAL_KEYS),
      initial: region.initial || '',
      states: { ...(region.states || {}) },
      transitions: [...(region.transitions || [])]
    };
  }
  if (!Object.keys(regions).length) {
    regions[primaryRegion] = { contracts: {}, initial: '', states: {}, transitions: [] };
  }
  return {
    contracts: carriedContracts(workflow, WORKFLOW_STRUCTURAL_KEYS),
    primaryRegion,
    regions
  };
}

function primaryRegionBuilder(builder) {
  return builder.regions[builder.primaryRegion] || Object.values(builder.regions)[0];
}

function ensureWorkflowBuilder(builders, entityType) {
  if (!builders.has(entityType)) {
    builders.set(entityType, workflowBuilderFromWorkflow());
  }
  return builders.get(entityType);
}

function addWorkflowState(builder, state) {
  if (!state) return;
  builder.states[state] ||= { canUpdateMeta: true };
}

function upsertWorkflowTransition(builder, transition) {
  const existing = builder.transitions.find(item => item.from === transition.from && item.to === transition.to);
  if (existing) {
    existing.processRoleIds = [...new Set([...(existing.processRoleIds || []), ...(transition.processRoleIds || [])])];
    if (transition.access?.permissions?.length) {
      existing.access ||= {};
      existing.access.permissions = mergeTransitionPermissions(existing.access.permissions || [], transition.access.permissions);
    }
    return;
  }
  builder.transitions.push(transition);
}

function mergeTransitionPermissions(existing = [], next = []) {
  const merged = [...existing];
  for (const permission of next) {
    if (merged.some(item => item.feature === permission.feature && item.level === permission.level && item.entityType === permission.entityType)) continue;
    merged.push(permission);
  }
  return merged;
}

function actionEntityType(action = {}) {
  return action.entityType
    || action.inputs?.find(input => input.entityType)?.entityType
    || action.outputs?.find(output => output.entityType)?.entityType
    || '';
}

export function compileAssignmentAccess({ assignment = {}, roles = {}, screens = {}, lineageBindings = [], domain = {} } = {}) {
  const permissions = {};
  const screenMap = new Map();
  const actionMap = new Map();
  const incompleteBindings = [];
  const roleIds = assignment.roleIds || [];
  for (const roleId of roleIds) {
    const role = roles[roleId];
    if (!role) continue;
    for (const grant of role.grants || []) {
      const compiledGrant = compileGrantForAssignment(grant, assignment);
      if (compiledGrant.incomplete.length) {
        incompleteBindings.push(...compiledGrant.incomplete.map(binding => ({ roleId, feature: grant.feature, binding })));
        continue;
      }
      permissions[grant.feature] ||= [];
      permissions[grant.feature].push(compiledGrant.grant);
    }
    for (const action of role.actions || []) {
      const existing = actionMap.get(action.actionId) || {};
      actionMap.set(action.actionId, {
        ...existing,
        ...action,
        sourceRoleIds: [...new Set([...(existing.sourceRoleIds || []), roleId])]
      });
    }
  }
  for (const screen of Object.values(screens)) {
    const sourceRoleIds = roleIds.filter(roleId => screenAppliesToRole(screen, roleId));
    if (!sourceRoleIds.length) continue;
    for (const roleId of sourceRoleIds) {
      const compiledScreen = compileScreenForAssignment(screen, assignment, roleId);
      if (compiledScreen.incomplete.length) {
        incompleteBindings.push(...compiledScreen.incomplete.map(binding => ({ roleId, screenId: screen.id, binding })));
        continue;
      }
      if (![screen.required, ...(screen.sources || []).map(source => source.required)].every(required => requirementHasAuthoredGrant(required, permissions))) continue;
      mergeCompiledScreen(screenMap, compiledScreen.screen);
    }
  }
  const screensList = [...screenMap.values()];
  const homeScreen = compileHomeScreenForAssignment({ assignment, screens: screensList, lineageBindings, domain });
  const userScreens = homeScreen ? [homeScreen, ...screensList] : screensList;
  const screenNavigation = userScreens.map(screenToNavigation);
  return {
    roleIds,
    permissions,
    navigation: dedupeNavigation(screenNavigation),
    screens: userScreens,
    actions: [...actionMap.values()],
    incompleteBindings
  };
}

export function compileHomeScreenForAssignment({ assignment = {}, screens = [], lineageBindings = [], domain = {} } = {}) {
  const sections = topLevelHomeSections(screens, domain);
  if (!sections.length) return null;
  const screenKey = `home_${assignment.userId || assignment.id || 'user'}`;
  return {
    id: screenKey,
    screenKey,
    label: 'Home',
    kind: 'home',
    template: 'home',
    placement: 'home',
    route: generatedScreenRoute(screenKey),
    sourceRoute: generatedScreenRoute(screenKey),
    roleIds: assignment.roleIds || [],
    sources: sections.map(section => ({
      id: section.sourceId,
      label: section.label,
      entityType: section.entityType,
      mode: 'list',
      required: section.required || null,
      filters: section.filters || {},
      lineageBindings: lineageBindings.map(binding => ({ ...binding }))
    })),
    regions: sections.map(section => ({
      id: `${section.sourceId}_section`,
      label: section.label,
      slot: 'main',
      sourceId: section.sourceId,
      surface: 'card',
      actions: section.actions || [],
      screenKey: section.screenKey,
      route: section.route
    })),
    actions: [...new Set(sections.flatMap(section => section.actions || []))]
  };
}

function topLevelHomeSections(screens = [], domain = {}) {
  const listScreens = screens.filter(screen => screen.template === 'entityList' && screen.entityType && screen.sources?.some(source => source.mode === 'list'));
  const sectionsByEntity = new Map();
  for (const screen of listScreens) {
    if (sectionsByEntity.has(screen.entityType)) {
      const existing = sectionsByEntity.get(screen.entityType);
      existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
      continue;
    }
    const source = screen.sources.find(item => item.mode === 'list') || {};
    sectionsByEntity.set(screen.entityType, {
      entityType: screen.entityType,
      sourceId: `home_${screen.entityType}`,
      label: screen.label || screen.entityType,
      required: source.required || screen.required || null,
      filters: source.filters || {},
      actions: screen.actions || [],
      screenKey: screen.screenKey,
      route: screen.route
    });
  }
  return [...sectionsByEntity.values()];
}

function compileRoles(process = {}, domain = {}, organizationRoles = {}, lineageBindings = []) {
  const graphContext = buildActionGraphContext(process);
  const roles = Object.fromEntries(Object.entries(organizationRoles).map(([roleId, role]) => [roleId, {
    id: role.id || roleId,
    label: role.label || role.id || roleId,
    grants: Array.isArray(process.roleGrants?.[roleId]) ? [...process.roleGrants[roleId]] : [],
    actions: []
  }]));
  for (const profile of Object.values(process.producerOutputs || {})) {
    const feature = resolveEntityFeature(domain, profile.entityType);
    for (const level of ['read', 'write', 'admin']) {
      for (const roleId of profile.allowedRoles?.[level] || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        upsertGrant(roles[roleId].grants, { feature, level });
      }
    }
  }
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const access = normalizeActionAccess(action.access);
    const actionWindow = actionWindows.get(actionId);
    for (const grant of actionWindow?.grants || []) {
      for (const roleId of grant.roleIds || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        upsertGrant(roles[roleId].grants, grant);
      }
    }
    if ((action.trigger?.mode || 'manual') !== 'manual') continue;
    const exposedRoleIds = actionExposureRoleIds(action, access, actionWindow);
    for (const roleId of exposedRoleIds) {
      if (!roles[roleId]) continue;
      const feature = exposedActionFeature(action, actionWindow, access, domain);
      const parentEntityType = effectiveActionParentEntityType(action, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
      const resolvedEntityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || actionWindow?.outputs?.[0]?.entityType || null;
      const exposedAction = resolvedEntityType && !action.entityType ? { ...action, entityType: resolvedEntityType } : action;
      if (action.relationMutation?.creator?.entityType) {
        const creatorScope = actionWindow?.grants
          ?.find(grant => grant.roleIds?.includes(roleId))?.scope;
        upsertGrant(roles[roleId].grants, {
          feature: resolveEntityFeature(domain, action.relationMutation.creator.entityType),
          level: 'write',
          ...(creatorScope ? { scope: creatorScope } : {})
        });
      }
      if (action.relationMutation?.operation === 'link' && action.relationMutation.targetType) {
        upsertGrant(roles[roleId].grants, {
          feature: resolveEntityFeature(domain, action.relationMutation.targetType),
          level: 'read'
        });
      }
      const inputs = actionInputsForExposure(exposedAction, parentEntityType, domain).map(input => (
        input.id === 'entity' && !input.entityType && resolvedEntityType ? { ...input, entityType: resolvedEntityType } : input
      ));
      const outputs = action.outputs || [];
      roles[roleId].actions.push({
        actionId: action.id || actionId,
        label: displayActionLabel(action, actionId, process),
        level: 'run',
        actionKind: action.actionKind || 'createEntity',
        commandId: action.commandId || null,
        feature,
        entityType: resolvedEntityType,
        parentEntityType: parentEntityType || null,
        parentRevision: resolveParentRevision(action.parentRevision, parentEntityType, domain),
        status: actionStatusForExposure(action, actionWindow, access, process),
        relationMutation: action.relationMutation || null,
        construction: (action.actionKind || 'createEntity') === 'createEntity'
          ? normalizeConstruction(action.construction, action.entityType, domain)
          : null,
        inputPolicy: compiledInputPolicy(action, domain),
        inputs,
        outputs,
        contracts: compileActionEntityContracts(exposedAction, inputs, outputs, actionWindow, domain)
      });
    }
  }
  return roles;
}

function exposedActionFeature(action = {}, actionWindow = null, access = {}, domain = {}) {
  const kind = action.actionKind || 'createEntity';
  if (kind === 'runCommand' && actionWindow?.input?.feature) {
    return actionWindow.input.feature;
  }
  return actionWindow?.primaryGrant?.feature || grantFromAction(action, access, domain)?.feature || null;
}

// Authored action roles are the primary declaration of whom the action
// belongs to: they receive the surfaced action and the status-scoped grant
// for the resulting state. Executability derived from the input window only
// fills in when the action declares no roles of its own.
function actionExposureRoleIds(action = {}, access = {}, actionWindow = null) {
  const kind = action.actionKind || 'createEntity';
  const explicitGrants = access.grants?.length ? access.grants : grantsFromRoleIds(access.roleIds || [], access.level);
  const explicit = explicitGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  if (kind === 'updateEntity' && actionTargetState(action)) {
    const executable = executableRoleIdsForWindow(actionWindow?.input, access);
    if (executable.length) return [...new Set(executable)];
  }
  return [...new Set((actionWindow?.outputs || []).flatMap(output => {
    const grants = output.roleGrants || grantsFromRoleIds(output.roleIds || [], output.level || access.level);
    return grants
      .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
      .map(grant => grant.roleId);
  }))];
}

function actionExposureRoleIdsForInput(action = {}, access = {}, inputWindow = null) {
  const explicitGrants = access.grants?.length ? access.grants : grantsFromRoleIds(access.roleIds || [], access.level);
  const explicit = explicitGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  if ((action.actionKind || 'createEntity') !== 'updateEntity' || !actionTargetState(action)) return actionExposureRoleIds(action, access, null);
  const executable = executableRoleIdsForWindow(inputWindow, access);
  if (executable.length) return [...new Set(executable)];
  return actionExposureRoleIds(action, access, null);
}

function executableRoleIdsForWindow(window = null, access = {}) {
  const incomingRoleGrants = window?.roleGrants || grantsFromRoleIds(window?.roleIds || [], window?.level || access.level);
  return incomingRoleGrants
    .filter(grant => ACCESS_ORDER[normalizeAccessLevel(grant.level)] >= ACCESS_ORDER.write)
    .map(grant => grant.roleId)
    .filter(Boolean);
}

function actionStatusForExposure(action = {}, actionWindow = null, access = {}, process = {}) {
  const status = compileActionStatus(action, process);
  const inputStatus = actionWindow?.input?.status || '';
  if (!status.from && inputStatus) status.from = inputStatus;
  const targetStatus = actionTargetState(action, process) || access.statusTo || actionWindow?.outputs?.[0]?.status || '';
  if (!status.to && targetStatus) status.to = targetStatus;
  return status;
}

function grantFromAction(action = {}, access = {}, domain = {}) {
  const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType;
  const feature = entityType ? resolveEntityFeature(domain, entityType) : null;
  if (!feature || !access.roleIds?.length) return null;
  const grant = {
    feature,
    level: access.level || 'write'
  };
  if (action.actionKind === 'createEntity') {
    const to = action.status?.to || '';
    if (to) grant.rule = { fact: 'primaryStatus', equals: to };
  }
  if (action.actionKind === 'updateEntity' && actionTargetState(action)) {
    const from = access.statusFrom || action.status?.from || '';
    const to = access.statusTo || action.status?.to || '';
    if (from || to) grant.transitions = [{ from: from || undefined, to: to || undefined }];
    if (to) grant.rule = { fact: 'primaryStatus', equals: to };
  }
  return grant;
}

function upsertGrant(grants, next) {
  const normalized = normalizeCompiledGrant(next);
  const existing = grants.find(grant => grantKey(grant) === grantKey(normalized));
  if (!existing) {
    grants.push(normalized);
    return;
  }
  if (ACCESS_ORDER[normalized.level] > ACCESS_ORDER[existing.level || 'read']) existing.level = normalized.level;
}

function normalizeCompiledGrant(grant = {}) {
  const { roleIds, sourceActionId, sourcePath, ...rest } = grant;
  return JSON.parse(JSON.stringify(rest));
}

function grantKey(grant = {}) {
  return JSON.stringify({
    feature: grant.feature,
    scope: grant.scope || null,
    transitions: grant.transitions || null,
    rule: grant.rule || null,
    actions: grant.actions || null
  });
}

function compileActionAccessWindows(process = {}, domain = {}, lineageBindings = []) {
  const actionEntries = Object.entries(process.actions || {});
  const graphContext = buildActionGraphContext(process);
  const windows = new Map();
  const pending = new Map(actionEntries);

  while (pending.size) {
    let progressed = false;
    for (const [actionId, action] of [...pending.entries()]) {
      const incoming = incomingWindowForAction(actionId, action, graphContext, windows);
      const hasGraphInput = graphContext.incomingByActionId.has(actionId);
      if (hasGraphInput && !incoming) continue;
      const window = compileActionWindow(actionId, action, incoming, domain, process, lineageBindings);
      windows.set(actionId, window);
      pending.delete(actionId);
      progressed = true;
    }
    if (!progressed) {
      for (const [actionId, action] of pending) {
        windows.set(actionId, compileActionWindow(actionId, action, null, domain, process, lineageBindings));
      }
      break;
    }
  }

  return windows;
}

function buildActionGraphContext(process = {}) {
  const actionNodeById = new Map();
  const actionIdByNodeId = new Map();
  for (const node of process.graph?.nodes || []) {
    const refId = String(node.data?.refId || node.id || '');
    const processNode = node.type === 'processNode' ? process.processNodes?.[refId] : null;
    if (node.type !== 'action' && !processNode?.kind?.startsWith('effect.')) continue;
    const actionId = String(processNode?.entryTriggerId || processNode?.id || refId);
    if (!actionId) continue;
    actionNodeById.set(actionId, node);
    actionIdByNodeId.set(String(node.id), actionId);
  }

  const incomingByActionId = new Map();
  const parentIncomingByActionId = new Map();
  for (const edge of process.graph?.edges || []) {
    const targetActionId = actionIdByNodeId.get(String(edge.target));
    const sourceActionId = actionIdByNodeId.get(String(edge.source));
    if (!targetActionId || !sourceActionId) continue;
    const incoming = incomingByActionId.get(targetActionId) || [];
    incoming.push({
      sourceActionId,
      sourceHandle: edge.sourceHandle || null,
      targetHandle: edge.targetHandle || null
    });
    incomingByActionId.set(targetActionId, incoming);
    if (isParentTargetHandle(edge.targetHandle)) {
      const parentOutput = actionOutputForHandle(process.actions?.[sourceActionId], edge.sourceHandle);
      if (parentOutput?.entityType) {
        parentIncomingByActionId.set(targetActionId, {
          entityType: parentOutput.entityType,
          status: parentOutput.status || '',
          parentInput: true
        });
      }
    }
  }

  return { actionNodeById, actionIdByNodeId, incomingByActionId, parentIncomingByActionId };
}

function isParentTargetHandle(targetHandle = '') {
  const handle = String(targetHandle || '');
  return handle === 'parent' || handle === 'input:parent' || handle.endsWith(':parent');
}

function isEntityTargetHandle(targetHandle = '') {
  const handle = String(targetHandle || '');
  return !handle || handle === 'input' || handle === 'entity' || handle === 'input:entity' || handle.endsWith(':entity');
}

function actionOutputForHandle(action = {}, sourceHandle = '') {
  const outputs = action?.outputs || [];
  if (!outputs.length) return null;
  if (!sourceHandle || sourceHandle === 'output') return outputs.find(output => output.entityType) || outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return outputs.find(output => output.id === id || output.handleId === sourceHandle)
    || outputs.find(output => output.entityType)
    || outputs[0]
    || null;
}

function incomingWindowForAction(actionId, action = {}, graphContext, windows) {
  const edges = graphContext.incomingByActionId.get(actionId) || [];
  for (const edge of edges) {
    const sourceWindow = outputWindowForHandle(windows.get(edge.sourceActionId), edge.sourceHandle);
    if (sourceWindow) return sourceWindow;
  }
  if (edges.length) return null;
  const input = action.inputs?.find(item => item.entityType);
  if (!input) return null;
  return {
    entityType: input.entityType,
    status: input.status || '',
    level: normalizeActionAccess(action.access).level,
    roleIds: [],
    roleGrants: [],
    scope: null,
    sourcePath: `input:${actionId}:${input.id || 'entity'}`
  };
}

function outputWindowForHandle(actionWindow, sourceHandle) {
  if (!actionWindow) return null;
  if (!sourceHandle || sourceHandle === 'output') return actionWindow.outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return actionWindow.outputs.find(output => output.handleId === sourceHandle || output.id === id) || actionWindow.outputs[0] || null;
}

function compileActionWindow(actionId, action = {}, incoming = null, domain = {}, process = {}, lineageBindings = []) {
  const kind = action.actionKind || 'createEntity';
  const access = normalizeActionAccess(action.access);
  const entityType = actionEntityType(action) || incoming?.entityType || '';
  const statusTo = actionTargetState(action, process) || access.statusTo || incoming?.status || '';
  const feature = entityType ? resolveEntityFeature(domain, entityType) : null;
  const inheritedRoleGrants = incoming?.roleGrants || grantsFromRoleIds(incoming?.roleIds || [], incoming?.level || access.level);
  const explicitRoleGrants = access.grants || grantsFromRoleIds(access.roleIds || [], access.level);
  const hasExplicitRoleGrants = hasExplicitActionRoleGrants(action.access);
  const useInherited = inheritedRoleGrants.length && (
    (kind === 'updateEntity' && Boolean(actionTargetState(action, process)) && !access.modified) ||
    (kind === 'runCommand' && !hasExplicitRoleGrants && !access.modified)
  );
  const roleGrants = useInherited ? inheritedRoleGrants : explicitRoleGrants;
  const roleIds = [...new Set(roleGrants.map(grant => grant.roleId).filter(Boolean))];
  const level = maxGrantLevel(roleGrants, useInherited ? (incoming.level || access.level) : access.level);
  const scope = deriveActionWindowScope(action, incoming, lineageBindings);
  const outputs = [];
  const grants = [];

  if (['createEntity', 'updateEntity'].includes(kind) && feature && entityType) {
    const status = kind === 'updateEntity'
      ? (actionTargetState(action, process) || incoming?.status || action.inputs?.find(input => input.status)?.status || '')
      : statusTo;
    const window = {
      id: outputSocketId(action, kind),
      handleId: outputHandleId(action, kind),
      entityType,
      feature,
      status,
      level,
      roleIds,
      roleGrants,
      scope,
      sourcePath: [incoming?.sourcePath, actionId, status].filter(Boolean).join('>')
    };
    outputs.push(window);
    grants.push(...windowGrants(window, action, access));
  }

  if (kind === 'runCommand' && incoming) {
    const commandOutputs = commandOutputEntityTypes(domain, action.commandId);
    for (const outputEntityType of commandOutputs) {
      const outputFeature = resolveEntityFeature(domain, outputEntityType);
      if (!outputFeature) continue;
      const outputScope = deriveCommandOutputScope(outputEntityType, incoming, lineageBindings);
      const window = {
        id: outputEntityType,
        handleId: `output:${outputEntityType}`,
        entityType: outputEntityType,
        feature: outputFeature,
        status: '',
        level,
        roleIds,
        roleGrants,
        scope: outputScope,
        sourcePath: [incoming?.sourcePath, actionId, outputEntityType].filter(Boolean).join('>')
      };
      outputs.push(window);
      grants.push(...windowGrants(window, action, access));
    }
  }

  return {
    actionId,
    kind,
    input: incoming,
    outputs,
    grants,
    primaryGrant: grants[0] || null
  };
}

function grantsFromRoleIds(roleIds = [], level = 'write') {
  return [...new Set(roleIds)]
    .filter(Boolean)
    .map(roleId => ({ roleId, level: normalizeAccessLevel(level) }));
}

function maxGrantLevel(grants = [], fallback = 'write') {
  return grants.reduce((level, grant) => (
    ACCESS_ORDER[normalizeAccessLevel(grant.level)] > ACCESS_ORDER[level]
      ? normalizeAccessLevel(grant.level)
      : level
  ), normalizeAccessLevel(fallback));
}

function hasExplicitActionRoleGrants(access = {}) {
  if (Array.isArray(access.grants)) return access.grants.some(grant => grant?.roleId);
  if (Array.isArray(access.roleIds)) return access.roleIds.some(Boolean);
  return false;
}

function outputSocketId(action = {}, kind = '') {
  return action.outputs?.find(output => output.entityType)?.id || (kind === 'createEntity' ? 'created' : 'entity');
}

function outputHandleId(action = {}, kind = '') {
  const outputs = action.outputs || [];
  if (outputs.length <= 1) return 'output';
  const id = outputSocketId(action, kind);
  const index = outputs.findIndex(output => output.id === id);
  return `output:${id || Math.max(index, 0)}`;
}

function effectiveActionParentEntityType(action = {}, incoming = null, lineageBindings = []) {
  const entityType = action.entityType || action.outputs?.find(output => output.entityType)?.entityType || '';
  const compiledParents = [...new Set(lineageBindings
    .filter(binding => binding.childEntityType === entityType && binding.ancestorEntityType)
    .map(binding => binding.ancestorEntityType))];
  const candidates = [
    ...compiledParents,
    incoming?.parentInput ? incoming.entityType : '',
    !incoming?.parentInput ? incoming?.entityType : ''
  ].filter(Boolean);

  for (const parentType of candidates) {
    if (!parentSupportedByLineage(lineageBindings, entityType, parentType)) continue;
    return parentType;
  }
  return '';
}

function parentSupportedByLineage(lineageBindings = [], entityType = '', parentType = '') {
  if (!entityType || !parentType) return false;
  return Boolean(parentRelationForChild(entityType, parentType, lineageBindings));
}

function actionInputsForExposure(action = {}, parentEntityType = '', domain = {}) {
  if (action.actionKind === 'runCommand') {
    return commandActionInputs(domain.commands?.[action.commandId] || {});
  }
  if ((action.actionKind || 'createEntity') !== 'createEntity') return action.inputs || [];
  const inputs = (action.inputs || []).map(input => {
    if (input.id !== 'parent') return input;
    return {
      ...input,
      label: parentEntityType || 'Parent entity',
      entityType: parentEntityType || '',
      required: false,
      status: parentEntityType ? input.status || '' : ''
    };
  });
  if (parentEntityType && !inputs.some(input => input.id === 'parent')) {
    inputs.unshift({
      id: 'parent',
      label: parentEntityType,
      entityType: parentEntityType,
      required: false
    });
  }
  const construction = normalizeConstruction(action.construction, action.entityType, domain) || { inputs: [] };
  const constructionInputs = new Map((construction.inputs || []).map(input => [input.id || input.path, input]));
  const contract = constructionContract(domain, action.entityType);
  return inputs.filter(input => (
    !contract?.derived
    || !input.constructionInputId
    || constructionInputs.has(input.constructionInputId)
  )).map(input => {
    const constructionInput = constructionInputs.get(input.constructionInputId)
      || constructionInputs.get(input.id)
      || constructionInputs.get(String(input.id || '').replace(/^data:/, ''))
      || constructionInputs.get(input.path);
    if (!constructionInput) return input;
    return {
      ...input,
      ...constructionInput,
      id: input.id,
      dataPath: input.dataPath || constructionInput.path,
      kind: input.kind || constructionInput.type,
      constructionInputId: input.constructionInputId || constructionInput.id
    };
  });
}

function commandActionInputs(command = {}) {
  const abstractInputs = command.input?.abstractEntities || [];
  const acceptedTypes = new Set(abstractInputs.flatMap(input => input.accepts || []));
  return [
    ...abstractInputs.map(input => ({
      id: input.name || input.type || input.capability,
      label: input.label || input.name,
      entityType: input.type || '',
      capability: input.capability || '',
      accepts: input.accepts || [],
      required: Boolean(input.required),
      multiple: Boolean(input.multiple),
      abstract: true,
      prompt: false
    })),
    ...(command.input?.entities || [])
      .filter(input => !acceptedTypes.has(input.type))
      .map(input => ({
        id: input.name || input.type,
        label: input.label || input.name || input.type,
        entityType: input.type,
        kind: 'entity',
        required: Boolean(input.required),
        prompt: input.prompt !== false,
        path: `entities.${input.name || input.type}`
      })),
    ...(command.input?.parameters || []).map(input => ({
      id: input.name,
      label: input.label || input.name,
      kind: input.type === 'object' ? 'json' : input.type || 'data',
      type: input.type || 'string',
      options: input.options || [],
      optionsFromEntity: input.optionsFromEntity || '',
      default: input.default ?? null,
      required: Boolean(input.required && input.default === undefined),
      prompt: input.display !== 'hidden',
      path: `parameters.${input.name}`,
      dataPath: `parameters.${input.name}`,
      entityType: input.entityType || '',
      editor: input.editor || '',
      templateFieldId: input.templateFieldId || ''
    }))
  ];
}

function deriveActionWindowScope(action = {}, incoming = null, lineageBindings = []) {
  const access = normalizeActionAccess(action.access);
  if (access.scope) return { ...access.scope };
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if ((action.actionKind || 'createEntity') !== 'createEntity') return inheritedScope;
  const parentType = effectiveActionParentEntityType(action, incoming, lineageBindings);
  if (!parentType || !incoming) return inheritedScope;
  const parentKey = parentRelationForChild(action.entityType, parentType, lineageBindings)?.lineageKey;
  if (!parentKey) return inheritedScope;
  if (inheritedScope?.entityId && !inheritedScope[parentKey]) {
    const { entityId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [parentKey]: entityId };
  }
  return inheritedScope;
}

function commandOutputEntityTypes(domain = {}, commandId = '') {
  const output = domain.commands?.[commandId]?.output || {};
  return [...new Set((output.entities || []).map(entry => entry?.type).filter(Boolean))];
}

function deriveCommandOutputScope(outputEntityType = '', incoming = null, lineageBindings = []) {
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if (!incoming?.entityType) return inheritedScope;
  const relation = parentRelationForChild(outputEntityType, incoming.entityType, lineageBindings);
  if (!relation) return inheritedScope;
  if (inheritedScope?.entityId && !inheritedScope[relation.lineageKey]) {
    const { entityId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [relation.lineageKey]: entityId };
  }
  return inheritedScope;
}

function windowGrants(window = {}, action = {}, access = {}) {
  const grouped = new Map();
  for (const roleGrant of window.roleGrants || grantsFromRoleIds(window.roleIds || [], window.level)) {
    if (!roleGrant.roleId) continue;
    const { roleId, ...dimensions } = roleGrant;
    const normalized = { ...dimensions, level: normalizeAccessLevel(dimensions.level || window.level) };
    const key = JSON.stringify(normalized);
    if (!grouped.has(key)) grouped.set(key, { dimensions: normalized, roleIds: [] });
    grouped.get(key).roleIds.push(roleId);
  }
  return [...grouped.values()].map(({ dimensions, roleIds }) => windowGrant(window, action, access, dimensions, [...new Set(roleIds)]));
}

function windowGrant(window = {}, action = {}, access = {}, dimensions = {}, roleIds = window.roleIds || []) {
  const grant = {
    ...dimensions,
    feature: window.feature,
    level: normalizeAccessLevel(dimensions.level || window.level || 'read'),
    roleIds,
    sourceActionId: action.id,
    sourcePath: window.sourcePath
  };
  if (window.scope) grant.scope = { ...(dimensions.scope || {}), ...window.scope };
  if (window.status) grant.rule = mergeGrantRules(dimensions.rule, { fact: 'primaryStatus', equals: window.status });
  if ((action.actionKind || 'createEntity') === 'updateEntity' && actionTargetState(action)) {
    const from = access.statusFrom || action.status?.from || '';
    const to = access.statusTo || action.status?.to || window.status || '';
    if (from || to) grant.transitions = [...(dimensions.transitions || []), { from: from || undefined, to: to || undefined }];
  }
  return grant;
}

function mergeGrantRules(left, right) {
  if (!left) return right;
  if (!right) return left;
  return { all: [left, right] };
}

function resolveEntityFeature(domain = {}, entityType) {
  const entity = (domain.entities || []).find(item => item.type === entityType);
  if (entity?.collection) return entity.collection;
  const fieldPolicy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  return entityType;
}

function compileGrantForAssignment(grant = {}, assignment = {}) {
  const incomplete = [];
  const serialized = JSON.parse(JSON.stringify({
    level: grant.level || 'read',
    actions: grant.actions,
    scope: grant.scope,
    transitions: grant.transitions,
    rule: grant.rule
  }));
  replacePlaceholders(serialized, assignment.bindings || {}, incomplete);
  return { grant: serialized, incomplete };
}

function replacePlaceholders(value, bindings, incomplete) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = replacePlaceholders(value[index], bindings, incomplete);
    }
    return value;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) value[key] = replacePlaceholders(child, bindings, incomplete);
    return value;
  }
  if (typeof value !== 'string' || !value.includes('$assignment.')) return value;
  if (value.startsWith('$assignment.') && value.match(/\$assignment\./g)?.length === 1) {
    const binding = value.slice('$assignment.'.length);
    const resolved = getByPath(bindings, binding);
    if (resolved === undefined || resolved === null || resolved === '') incomplete.push(binding);
    return resolved;
  }
  return value.replace(/\$assignment\.([A-Za-z0-9_.-]+)/g, (match, binding) => {
    const resolved = getByPath(bindings, binding);
    if (resolved === undefined || resolved === null || resolved === '') {
      incomplete.push(binding);
      return match;
    }
    return String(resolved);
  });
}

function normalizeRoleCatalog(roles = {}) {
  return Object.fromEntries(Object.entries(normalizeRecord(roles)).map(([roleId, role]) => [roleId, {
    id: role.id || roleId,
    label: role.label || role.id || roleId
  }]));
}

function emptyAssignmentAccess() {
  return { roleIds: [], bindings: {}, permissions: {}, screens: [], navigation: [], actions: [], incompleteBindings: [] };
}

export function compileScreens(processOrScreens = {}, domain = {}, compiledRoles = {}, lineageBindings = []) {
  const screens = processOrScreens.screens || processOrScreens;
  const inferredScreens = inferScreensFromRoleGrants({
    screens,
    roles: compiledRoles,
    domain,
    producerOutputs: processOrScreens.producerOutputs || {},
    actions: processOrScreens.actions || {},
    graph: processOrScreens.graph || {},
    lineageBindings
  });
  return Object.fromEntries(Object.entries({ ...screens, ...inferredScreens }).map(([id, screen]) => {
    const normalized = normalizeScreenContract(screen);
    const sources = normalized.sources.map(source => withCompiledLineage(source, normalized, lineageBindings));
    return [id, {
      id: normalized.id || id,
      label: normalized.label || normalized.id || id,
      labelKey: normalized.labelKey || null,
      kind: normalized.kind || 'route',
      template: normalized.template,
      route: normalized.route || '',
      sourceRoute: normalized.sourceRoute || normalized.route || '',
      placement: normalized.placement || 'hub',
      entityType: normalized.entityType || null,
      required: normalized.required || null,
      roleIds: normalized.roleIds || [],
      scope: normalized.scope || {},
      bindings: normalized.bindings || {},
      sources,
      regions: normalized.regions,
      actions: normalized.actions || []
    }];
  }));
}

function withCompiledLineage(source = {}, screen = {}, lineageBindings = []) {
  if (screen.template !== 'entityList' || source.mode !== 'list' || source.entityType !== screen.entityType) return source;
  return { ...source, lineageBindings: lineageBindings.map(binding => ({ ...binding })) };
}

function inferScreensFromRoleGrants({ screens = {}, roles = {}, domain = {}, producerOutputs = {}, actions = {}, graph = {}, lineageBindings = [] } = {}) {
  const inferred = {};
  const graphContext = buildActionGraphContext({ actions, graph });
  const existingKeys = new Set(Object.values(screens).flatMap(screen => {
    const roleIds = screen.roleIds?.length ? screen.roleIds : Object.keys(roles);
    const feature = screen.required?.feature || featureFromEntityType(domain, screen.entityType);
    return roleIds.map(roleId => `${roleId}:${feature || ''}`).filter(key => !key.endsWith(':'));
  }));

  for (const [roleId, role] of Object.entries(roles)) {
    const grantsByFeature = groupGrantsByFeature(role.grants || []);
    for (const [feature, grants] of grantsByFeature) {
      const entityType = entityTypeFromFeature(domain, feature)
        || entityTypeFromProducerOutputs(producerOutputs, domain, feature);
      if (!entityType || existingKeys.has(`${roleId}:${feature}`)) continue;
      const id = `auto_${roleId}_${entityType}`;
      const detailId = `${id}_detail`;
      const required = aggregateScreenRequirement(feature, grants);
      const directActions = inferredScreenActions(role.actions || [], feature);
      const detailDirectActions = inferredDetailScreenActions(role.actions || [], feature);
      const childRegions = childRegionsForParentDetail({
        role,
        parentEntityType: entityType,
        domain,
        actions,
        graphContext,
        lineageBindings
      });
      const contextualActions = contextualParentActions(role.actions || [], entityType, domain, actions, graphContext, lineageBindings);
      inferred[id] = {
        id,
        label: `${role.label || roleId} ${entityType}`,
        kind: 'entityList',
        template: 'entityList',
        placement: 'hub',
        entityType,
        required,
        roleIds: [roleId],
        actions: directActions
      };
      inferred[detailId] = {
        id: detailId,
        label: `${role.label || roleId} ${entityType} detail`,
        kind: 'entityDetail',
        template: 'entityDetail',
        placement: 'detail',
        entityType,
        required,
        roleIds: [roleId],
        sources: [{
          id: entityType,
          entityType,
          mode: 'single',
          required,
          identifier: '$screen.scope.entityId'
        }, ...childRegions.sources],
        regions: [{
          id: 'main',
          slot: 'main',
          sourceId: entityType,
          surface: 'detail',
          actions: [...new Set([...detailDirectActions, ...contextualActions])]
        }, ...childRegions.regions],
        actions: [...new Set([...detailDirectActions, ...contextualActions, ...childRegions.actionIds])]
      };
      existingKeys.add(`${roleId}:${feature}`);
    }
  }

  return inferred;
}

function inferredScreenActions(roleActions = [], feature) {
  return roleActions
    .filter(action => action.feature === feature)
    .map(action => action.actionId);
}

function inferredDetailScreenActions(roleActions = [], feature) {
  return roleActions
    .filter(action => action.feature === feature)
    .filter(action => (action.actionKind || 'createEntity') !== 'createEntity')
    .map(action => action.actionId);
}

function contextualParentActions(roleActions = [], parentEntityType = '', domain = {}, processActions = {}, graphContext = buildActionGraphContext({ actions: processActions }), lineageBindings = []) {
  return roleActions
    .filter((roleAction) => {
      const actionId = roleAction.actionId || roleAction.id;
      const processAction = processActions[actionId] || {};
      const parentIncoming = graphContext.parentIncomingByActionId.get(actionId);
      if (!isParentBoundCreateAction(roleAction, processAction, parentIncoming, lineageBindings)) return false;
      const actionParent = effectiveActionParentEntityType({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
      if (actionParent !== parentEntityType) return false;
      const childEntityType = roleAction.entityType || processAction.entityType || '';
      return !parentRelationForChild(childEntityType, parentEntityType, lineageBindings);
    })
    .map(action => action.actionId);
}

function isParentBoundCreateAction(roleAction = {}, processAction = {}, parentIncoming = null, lineageBindings = []) {
  const kind = roleAction.actionKind || processAction.actionKind || 'createEntity';
  const parentEntityType = effectiveActionParentEntityType({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
  return kind === 'createEntity' && Boolean(parentEntityType);
}

function childRegionsForParentDetail({ role = {}, parentEntityType = '', domain = {}, actions = {}, graphContext = buildActionGraphContext({ actions }), lineageBindings = [] } = {}) {
  const sourcesByEntity = new Map();
  const regions = [];
  const actionIds = [];
  const grantsByFeature = groupGrantsByFeature(role.grants || []);
  const childRelations = lineageRelationsForParent(parentEntityType, lineageBindings) || [];

  for (const relation of childRelations) {
    if (!relation.childType || !relation.lineageKey) continue;
    const childFeature = featureFromEntityType(domain, relation.childType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    if (!childGrants.length) continue;
    ensureChildRegion({
      sourcesByEntity,
      regions,
      childEntityType: relation.childType,
      childFeature,
      childGrants,
      parentIdKey: relation.lineageKey
    });
  }

  for (const action of role.actions || []) {
    const actionId = action.actionId || action.id;
    const processAction = actions[actionId] || {};
    const kind = action.actionKind || processAction.actionKind || 'createEntity';
    const actionParent = effectiveActionParentEntityType({ ...processAction, ...action }, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
    if (kind !== 'createEntity' || actionParent !== parentEntityType) continue;
    const childEntityType = action.entityType || processAction.entityType || '';
    if (!childEntityType) continue;
    const parentRelation = parentRelationForChild(childEntityType, parentEntityType, lineageBindings);
    if (!parentRelation) continue;
    const childFeature = featureFromEntityType(domain, childEntityType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    const region = ensureChildRegion({
      sourcesByEntity,
      regions,
      childEntityType,
      childFeature,
      childGrants,
      parentIdKey: parentRelation.lineageKey
    });
    if (actionId && !region.actions.includes(actionId)) region.actions.push(actionId);
    if (actionId) actionIds.push(actionId);
  }
  return {
    sources: [...sourcesByEntity.values()],
    regions,
    actionIds
  };
}

function ensureChildRegion({ sourcesByEntity, regions, childEntityType, childFeature, childGrants = [], parentIdKey } = {}) {
  const sourceId = `${childEntityType}_children`;
  if (!sourcesByEntity.has(sourceId)) {
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: childEntityType,
      entityType: childEntityType,
      mode: 'list',
      required: aggregateScreenRequirement(childFeature, childGrants),
      filters: { [parentIdKey]: '$screen.scope.entityId' }
    });
  }
  let region = regions.find(item => item.sourceId === sourceId);
  if (!region) {
    region = {
      id: `${sourceId}_region`,
      slot: 'main',
      sourceId,
      surface: 'card',
      actions: []
    };
    regions.push(region);
  }
  return region;
}

function parentRelationForChild(childEntityType = '', parentEntityType = '', lineageBindings = []) {
  const binding = lineageBindings.find(binding =>
    binding.childEntityType === childEntityType
    && (!parentEntityType || binding.ancestorEntityType === parentEntityType)
    && binding.lineageKey
  );
  if (!binding) return null;
  return { childType: binding.childEntityType, parentType: binding.ancestorEntityType, lineageKey: binding.lineageKey };
}

function groupGrantsByFeature(grants = []) {
  const map = new Map();
  for (const grant of grants) {
    if (!grant?.feature) continue;
    if (!map.has(grant.feature)) map.set(grant.feature, []);
    map.get(grant.feature).push(grant);
  }
  return map;
}

function aggregateScreenRequirement(feature, grants = []) {
  if (grants.length === 1) {
    const grant = grants[0];
    return {
      feature,
      level: 'read',
      scope: grant.scope,
      transitions: grant.transitions,
      rule: grant.rule
    };
  }
  const rules = grants.map(grant => grant.rule).filter(Boolean);
  const scopes = grants.map(grant => grant.scope).filter(Boolean);
  return {
    feature,
    level: 'read',
    ...(rules.length ? { rule: { any: rules } } : {}),
    ...(scopes.length === 1 ? { scope: scopes[0] } : {})
  };
}

function entityTypeFromFeature(domain = {}, feature) {
  return (domain.entities || []).find(entity => !entity.meta && (
    entity.collection === feature ||
    entity.type === feature ||
    `${entity.type}s` === feature
  ))?.type || null;
}

function entityTypeFromProducerOutputs(producerOutputs = {}, domain = {}, feature) {
  const entityType = Object.values(producerOutputs)
    .find(profile => resolveEntityFeature(domain, profile.entityType) === feature)
    ?.entityType || null;
  const definition = (domain.entities || []).find(entity => entity.type === entityType);
  return definition?.meta ? null : entityType;
}

function featureFromEntityType(domain = {}, entityType) {
  if (!entityType) return null;
  return resolveEntityFeature(domain, entityType);
}

function screenAppliesToRole(screen = {}, roleId) {
  return !screen.roleIds?.length || screen.roleIds.includes(roleId);
}

function compileScreenForAssignment(screen = {}, assignment = {}, roleId = null) {
  const incomplete = [];
  const scoped = JSON.parse(JSON.stringify({
    id: screen.id,
    label: screen.label,
    labelKey: screen.labelKey,
    kind: screen.kind,
    template: screen.template,
    route: screen.route,
    sourceRoute: screen.sourceRoute || screen.route,
    placement: screen.placement,
    entityType: screen.entityType,
    required: screen.required,
    scope: { ...(screen.scope || {}), ...(screen.bindings || {}) },
    sources: screen.sources || [],
    regions: screen.regions || [],
    actions: screen.actions || [],
    sourceRoleIds: roleId ? [roleId] : []
  }));
  replacePlaceholders(scoped, assignment.bindings || {}, incomplete);
  const screenKey = scoped.screenKey || makeScreenKey(scoped);
  return {
    incomplete,
    screen: {
      ...scoped,
      screenKey,
      route: generatedScreenRoute(screenKey)
    }
  };
}

function makeScreenKey(screen = {}) {
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [screen.id, ...(scopeValues.length ? scopeValues : [screen.route])].filter(Boolean).map(String).join(':');
}

function mergeCompiledScreen(screenMap, screen) {
  const mergeKey = screenMergeKey(screen);
  screen.screenKey = mergeKey;
  screen.route = generatedScreenRoute(mergeKey);
  const existing = screenMap.get(mergeKey);
  if (!existing) {
    screenMap.set(mergeKey, screen);
    return;
  }
  existing.required = mergeRequirements(existing.required, screen.required);
  existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
  existing.sourceRoleIds = [...new Set([...(existing.sourceRoleIds || []), ...(screen.sourceRoleIds || [])])];
  existing.roleIds = [...new Set([...(existing.roleIds || []), ...(screen.roleIds || [])])];
  existing.sources = mergeScreenSources(existing.sources || [], screen.sources || []);
  existing.regions = mergeScreenRegions(existing.regions || [], screen.regions || []);
}

function screenMergeKey(screen = {}) {
  if (screen.template === 'home') return screen.screenKey || screen.id;
  if (!String(screen.id || '').startsWith('auto_') || !screen.entityType) return screen.screenKey || screen.id;
  const suffix = screen.template === 'entityDetail' ? '_detail' : '';
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [`auto_${screen.entityType}${suffix}`, ...scopeValues].filter(Boolean).map(String).join(':');
}

function mergeScreenSources(existing = [], next = []) {
  const byKey = new Map(existing.map(source => [sourceMergeKey(source), { ...source }]));
  for (const source of next) {
    const key = sourceMergeKey(source);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...source });
      continue;
    }
    current.required = mergeRequirements(current.required, source.required);
    current.filters = { ...(current.filters || {}), ...(source.filters || {}) };
  }
  return [...byKey.values()];
}

function sourceMergeKey(source = {}) {
  return [
    source.entityType || source.id,
    source.mode || '',
    JSON.stringify(source.filters || {}),
    source.identifier || ''
  ].join(':');
}

function mergeScreenRegions(existing = [], next = []) {
  const byKey = new Map(existing.map(region => [regionMergeKey(region), { ...region, actions: [...(region.actions || [])] }]));
  for (const region of next) {
    const key = regionMergeKey(region);
    const current = byKey.get(key);
    if (!current) {
      byKey.set(key, { ...region, actions: [...(region.actions || [])] });
      continue;
    }
    current.actions = [...new Set([...(current.actions || []), ...(region.actions || [])])];
  }
  return [...byKey.values()];
}

function regionMergeKey(region = {}) {
  return [region.sourceId || region.id, region.slot || '', region.surface || ''].join(':');
}

function mergeRequirements(left = null, right = null) {
  if (!left) return right || null;
  if (!right) return left || null;
  if (left.feature !== right.feature) return left;
  const rules = [left.rule, right.rule].flatMap(flattenRequirementRules).filter(Boolean);
  const scopes = [left.scope, right.scope].filter(Boolean);
  const transitions = [left.transitions, right.transitions].flatMap(item => Array.isArray(item) ? item : [item]).filter(Boolean);
  return {
    feature: left.feature,
    level: 'read',
    ...(rules.length === 1 ? { rule: rules[0] } : {}),
    ...(rules.length > 1 ? { rule: { any: dedupeObjects(rules) } } : {}),
    ...(scopes.length === 1 ? { scope: scopes[0] } : {}),
    ...(transitions.length ? { transitions: dedupeObjects(transitions) } : {})
  };
}

function flattenRequirementRules(rule) {
  if (!rule) return [];
  if (Array.isArray(rule.any)) return rule.any.flatMap(flattenRequirementRules);
  return [rule];
}

function dedupeObjects(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function screenToNavigation(screen = {}) {
  return {
    id: screen.screenKey || screen.id,
    route: screen.route,
    requires: screen.required || null,
    screenId: screen.id,
    screenKey: screen.screenKey
  };
}

function dedupeNavigation(items = []) {
  const byKey = new Map();
  for (const item of items) {
    if (!item?.route) continue;
    byKey.set(item.id || item.route, item);
  }
  return [...byKey.values()];
}

function compileFieldPolicies(producerOutputs = {}, domain = {}) {
  const policies = {};
  for (const profile of Object.values(producerOutputs)) {
    policies[profile.producerOutputId] = {
      read: profile.fields?.read || [],
      write: profile.fields?.write || [],
      private: profile.fields?.private || [],
      relations: (domain.relations || []).filter(relation => (
        relation.ownerType === profile.entityType && (profile.relations || []).includes(relation.key)
      ))
    };
  }
  return policies;
}

function compileServices(services = {}) {
  return Object.fromEntries(Object.entries(services).map(([id, service]) => [id, {
    id: service.id || id,
    enabled: true,
    commandId: service.commandId || null,
    principals: {
      run: service.access?.runPrincipals || [],
      view: service.access?.viewPrincipals || []
    },
    billing: compileServiceBilling(service.billing),
    inputs: service.inputs || [],
    outputs: service.outputs || []
  }]));
}

function compileServiceBilling(billing = {}) {
  const tokenCost = Number(billing.tokenCost);
  if (billing.mode !== 'prepaidTokens' || !Number.isFinite(tokenCost) || tokenCost <= 0) {
    return { mode: 'none', tokenCost: 0, meterKey: null };
  }
  return {
    mode: 'prepaidTokens',
    tokenCost,
    meterKey: billing.meterKey || null
  };
}

function compileSockets(sockets = {}) {
  return Object.fromEntries(Object.entries(sockets).map(([id, socket]) => [id, {
    id: socket.id || id,
    label: socket.label || socket.id || id,
    direction: socket.direction === 'inbound' ? 'inbound' : 'outbound',
    entityType: socket.entityType || null,
    projection: socket.projection || { fields: [], excludeFields: [] },
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated', workflow: null },
    access: {
      sendRoles: socket.access?.sendRoles || [],
      receiveRoles: socket.access?.receiveRoles || []
    },
    inputs: socket.direction === 'inbound'
      ? []
      : [{ id: 'entity', entityType: socket.entityType, required: true }],
    outputs: socket.direction === 'inbound'
      ? [{ id: 'received', entityType: socket.entityType, status: initialSocketStatus(socket) }]
      : [{ id: 'projection', entityType: socket.entityType, projection: true, fields: socket.projection?.fields || [] }]
  }]));
}

function initialSocketStatus(socket = {}) {
  const lifecycle = socket.receiverLifecycle || {};
  if (lifecycle.mode === 'custom') {
    const workflow = normalizeWorkflow(lifecycle.workflow || createDefaultCreatedWorkflow(socket.entityType));
    const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
    return region?.initial || '';
  }
  return '';
}

export function compileActions(actions = {}, process = {}, domain = {}, lineageBindings = []) {
  const graphContext = buildActionGraphContext(process);
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  return Object.fromEntries(Object.entries(actions).map(([id, action]) => {
    const parentEntityType = effectiveActionParentEntityType(action, graphContext.parentIncomingByActionId.get(id), lineageBindings);
    const actionWindow = actionWindows.get(id);
    const resolvedEntityType = actionEntityType(action) || actionWindow?.input?.entityType || actionWindow?.outputs?.[0]?.entityType || null;
    if (resolvedEntityType && !action.producerOutputId) throw new Error(`Action ${id} requires producerOutputId`);
    const producerOutput = action.producerOutputId ? process.producerOutputs?.[action.producerOutputId] : null;
    if (action.producerOutputId && !producerOutput) throw new Error(`Action ${id} uses unknown producerOutputId ${action.producerOutputId}`);
    if (producerOutput && producerOutput.entityType !== resolvedEntityType) {
      throw new Error(`Action ${id} producerOutputId emits ${producerOutput.entityType}, not ${resolvedEntityType}`);
    }
    const normalizedAction = resolvedEntityType && !action.entityType ? { ...action, entityType: resolvedEntityType } : action;
    const inputs = actionInputsForExposure(normalizedAction, parentEntityType, domain).map(input => (
      input.id === 'entity' && !input.entityType && resolvedEntityType ? { ...input, entityType: resolvedEntityType } : input
    ));
    const outputs = action.outputs || [];
    return [id, {
      id: action.id || id,
      label: displayActionLabel(action, id, process),
      actionKind: action.actionKind || 'createEntity',
      producerOutputId: action.producerOutputId || null,
      entityType: resolvedEntityType,
      parentEntityType: parentEntityType || null,
      parentRevision: resolveParentRevision(action.parentRevision, parentEntityType, domain),
      commandId: action.commandId || null,
      status: compileActionStatus(action, process),
      mutation: action.mutation || { fields: [] },
      relationMutation: action.relationMutation || null,
      projection: action.projection || null,
      construction: normalizeConstruction(action.construction, action.entityType, domain),
      inputPolicy: compiledInputPolicy(action, domain),
      statusRef: action.statusRef || null,
      access: normalizeActionAccess(action.access),
      trigger: {
        mode: action.trigger?.mode || 'manual'
      },
      inputs,
      outputs,
      contracts: compileActionEntityContracts(normalizedAction, inputs, outputs, actionWindow, domain),
      events: action.events || []
    }];
  }));
}

function compileActionEntityContracts(action = {}, inputs = [], outputs = [], actionWindow = null, domain = {}) {
  const inputContracts = inputs
    .filter(input => input.entityType)
    .map(input => ({
      id: input.id || 'entity',
      kind: input.multiple ? 'entity_list' : 'entity',
      entityType: input.entityType,
      required: false,
      status: input.status || null,
      relationKey: input.relationKey || null,
      cardinality: input.cardinality || null
    }));
  const outputContracts = outputs
    .filter(output => output.entityType)
    .map(output => ({
      id: output.id || 'entity',
      kind: output.multiple ? 'entity_list' : 'entity',
      entityType: output.entityType,
      status: output.status || null
    }));
  const entityType = actionEntityType(action);
  if (action.actionKind === 'createEntity' && entityType && !outputContracts.some(contract => contract.entityType === entityType)) {
    outputContracts.push({ id: 'created', kind: 'entity', entityType, status: actionTargetState(action) || null });
  }
  if (action.actionKind === 'updateEntity' && entityType) {
    if (!inputContracts.some(contract => contract.entityType === entityType)) {
      inputContracts.unshift({ id: 'entity', kind: 'entity', entityType, required: false, status: actionWindow?.input?.status || null });
    }
    if (!outputContracts.some(contract => contract.entityType === entityType)) {
      outputContracts.push({ id: 'entity', kind: 'entity', entityType, status: actionTargetState(action) || actionWindow?.outputs?.[0]?.status || null });
    }
  }
  if (action.actionKind === 'runCommand') {
    for (const outputType of commandOutputEntityTypes(domain, action.commandId)) {
      if (!outputContracts.some(contract => contract.entityType === outputType)) {
        outputContracts.push({ id: outputType, kind: 'entity_list', entityType: outputType, status: null });
      }
    }
  }
  return { inputs: inputContracts, outputs: outputContracts };
}

function compileActionStatus(action = {}, process = {}) {
  const target = actionTargetState(action, process);
  const metadata = action.statusRef ? statusDefinitionMetadata(process.statusDefinitions?.[action.statusRef]) : {};
  return {
    ...(action.status || {}),
    ...metadata,
    ...(target ? { to: target } : {})
  };
}

function actionTargetState(action = {}, process = {}) {
  const statusRef = action.statusRef;
  const referenced = statusRef ? process.statusDefinitions?.[statusRef] : null;
  return referenced?.statusId
    || action.status?.to
    || action.access?.statusTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function statusDefinitionMetadata(definition = {}) {
  if (!definition) return {};
  return {
    ...(definition.label ? { label: definition.label } : {}),
    ...(definition.color || definition.severity ? { color: definition.color || definition.severity } : {}),
    ...(definition.severity || definition.color ? { severity: definition.severity || definition.color } : {}),
    ...(definition.icon ? { icon: definition.icon } : {})
  };
}

function compileStatusDefinitions(statusDefinitions = {}) {
  return Object.fromEntries(Object.entries(statusDefinitions).map(([id, definition]) => [id, {
    id: definition.id || id,
    entityType: definition.entityType || '',
    statusId: definition.statusId || definition.id || id,
    label: definition.label || definition.statusId || id,
    color: definition.color || '',
    severity: definition.severity || definition.color || '',
    icon: definition.icon || '',
    region: definition.region || '',
    ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
  }]));
}

function compileValueInputs(valueInputs = {}) {
  return Object.fromEntries(Object.entries(valueInputs).map(([id, input]) => [id, {
    id: input.id || id,
    label: input.label || input.id || id,
    valueType: input.valueType || 'string',
    structure: input.structure || 'item',
    value: input.value ?? '',
    icon: input.icon || ''
  }]));
}

function compileProcessNodes(processNodes = {}) {
  return Object.fromEntries(Object.entries(processNodes).map(([id, node]) => [id, {
    id: node.id || id,
    label: node.label || node.kind || id,
    kind: node.kind || 'entityDecompose',
    mode: node.mode || '',
    entityType: node.entityType || '',
    relationEntityType: node.relationEntityType || '',
    relationKey: node.relationKey || '',
    relationCardinality: node.relationCardinality || '',
    block: node.block || '',
    path: Array.isArray(node.path) ? [...node.path] : node.path || '',
    valueType: node.valueType || '',
    structure: node.structure || 'item',
    operation: node.operation || '',
    region: node.region || '',
    archiveIntent: node.archiveIntent || '',
    metadata: node.metadata ? clonePlain(node.metadata) : null,
    lifecycle: node.lifecycle ? clonePlain(node.lifecycle) : null,
    template: node.template || '',
    inputs: Array.isArray(node.inputs) ? node.inputs.map(input => ({ ...input })) : [],
    outputs: Array.isArray(node.outputs) ? node.outputs.map(output => ({ ...output })) : []
  }]));
}

function normalizeConstruction(construction = {}, entityType = '', domain = {}) {
  const contract = constructionContract(domain, entityType);
  if (!contract) return null;
  const source = construction || {};
  const modes = Array.isArray(contract.modes) ? contract.modes : [];
  const mode = source.mode
    ? source.mode
    : (modes.includes(contract.defaultMode) ? contract.defaultMode : (modes[0] || ''));
  const declaredInputs = Array.isArray(source.inputs) ? source.inputs : [];
  const blocksOwnConstruction = source.blockComposed && mode === 'genericCreate';
  const contractInputs = (contract.modeInputs?.[mode] || contract.inputs || [])
    .filter(input => !blocksOwnConstruction || (
      input.id !== 'name'
      && input.path !== 'name'
      && !isCanonicalBlockConstructionPath(input.path)
    ));
  const inputsById = new Map(contractInputs.map(input => {
    const normalizedInput = normalizeConstructionInput(input, domain);
    return [normalizedInput.id || normalizedInput.path, normalizedInput];
  }));
  for (const input of declaredInputs) {
    const key = input.id || input.path;
    const contractInput = inputsById.get(key);
    if (contract.derived && !contractInput) continue;
    inputsById.set(key, contractInput
      ? mergeConstructionInput(contractInput, input)
      : { ...input }
    );
  }
  return {
    mode,
    ...(source.blockComposed ? { blockComposed: true } : {}),
    inputs: [...inputsById.values()]
  };
}

function isCanonicalBlockConstructionPath(path = '') {
  return ['identity', 'lineage', 'relations', 'specs', 'data', 'status', 'attachments', 'summary', 'provenance']
    .some(block => String(path).startsWith(`${block}.`));
}

function normalizeConstructionInput(input = {}, domain = {}) {
  if (typeof input.creator?.attachmentKinds !== 'string') {
    return { ...input };
  }
  return {
    ...input,
    creator: {
      ...input.creator,
      attachmentKinds: Object.values(domain.attachmentKinds || {})
        .filter(kind => ['upload', 'capture', 'editor'].includes(kind.creation?.mode))
        .map(kind => ({ kind: kind.kind || kind.id, creation: kind.creation }))
    }
  };
}

function resolveParentRevision(parentRevision = {}, parentEntityType = '', domain = {}) {
  const contract = domain.revisions?.[parentEntityType] || {};
  const scopes = Array.isArray(contract.scopes) ? contract.scopes : [];
  const requestedScope = parentRevision.scope || contract.defaultScope || scopes[0] || '';
  return {
    enabled: parentRevision.enabled === true,
    scope: scopes.includes(requestedScope) ? requestedScope : (contract.defaultScope || scopes[0] || requestedScope)
  };
}

function mergeConstructionInput(contractInput = {}, declaredInput = {}) {
  return {
    ...declaredInput,
    ...contractInput,
    ...(contractInput.creator || declaredInput.creator ? {
      creator: { ...(contractInput.creator || {}), ...(declaredInput.creator || {}) }
    } : {}),
    default: declaredInput.default ?? contractInput.default,
    value: declaredInput.value ?? contractInput.value,
    prompt: declaredInput.prompt ?? contractInput.prompt,
    required: Boolean(declaredInput.required === true || contractInput.required === true)
  };
}

function normalizeInputPolicy(inputPolicy = {}) {
  return {
    prompt: inputPolicy.prompt !== false,
    fields: Array.isArray(inputPolicy.fields)
      ? inputPolicy.fields.map(field => ({ ...field, required: field.required === true }))
      : []
  };
}

function normalizeActionInputPolicy(inputPolicy = {}, construction = {}, entityType = '', domain = {}) {
  const normalizedConstruction = normalizeConstruction(construction, entityType, domain) || { inputs: [] };
  const policyFields = Array.isArray(inputPolicy.fields) ? inputPolicy.fields : [];
  const fieldsById = new Map(
    normalizedConstruction.inputs
      .filter(input => input.prompt)
      .map(input => [input.id || input.path, { ...input }])
  );
  for (const field of policyFields) {
    const key = field.id || field.path;
    const constructionField = normalizedConstruction.inputs.find(input => (input.id || input.path) === key);
    if (constructionContract(domain, entityType)?.derived && !constructionField) continue;
    const merged = constructionField
      ? mergeConstructionInput(constructionField, field)
      : {
          ...(fieldsById.get(key) || {}),
          ...field
        };
    if (merged.prompt || !constructionField) fieldsById.set(key, { ...merged });
    else fieldsById.delete(key);
  }
  const fields = [...fieldsById.values()];
  return {
    prompt: inputPolicy.prompt !== false && fields.some(field => field.prompt),
    fields
  };
}

function compiledInputPolicy(action = {}, domain = {}) {
  return (action.actionKind || 'createEntity') === 'createEntity'
    ? normalizeActionInputPolicy(action.inputPolicy, action.construction, action.entityType, domain)
    : normalizeInputPolicy(action.inputPolicy);
}

function displayActionLabel(action = {}, id = '', process = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action.actionKind)) return explicit;

  const entityType = action.entityType
    || action.inputs?.find(input => input.entityType)?.entityType
    || action.outputs?.find(output => output.entityType)?.entityType
    || '';
  if ((action.actionKind || 'createEntity') === 'createEntity') {
    return ['Create', entityTypeLabel(entityType), action.status?.to].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'updateEntity') {
    if (actionTargetState(action, process)) return statusTargetLabel(action, process) || ['Move', entityTypeLabel(entityType), action.status?.to].filter(Boolean).join(' ');
    return ['Update', entityTypeLabel(entityType)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'runCommand') {
    return ['Run', action.commandId].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'sendToOrganization') {
    return ['Send', entityTypeLabel(entityType)].filter(Boolean).join(' ');
  }
  return action.actionKind || id;
}

function statusTargetLabel(action = {}, process = {}) {
  const referenced = action.statusRef ? process.statusDefinitions?.[action.statusRef] : null;
  return referenced?.label
    || referenced?.statusId
    || action.status?.label
    || action.status?.to
    || action.access?.statusTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function isGenericActionLabel(label, actionKind = '') {
  const normalized = label.trim().toLowerCase();
  const generic = new Set(['create', 'status', 'service', 'update', 'send', 'action', actionKind?.toLowerCase?.()].filter(Boolean));
  return generic.has(normalized);
}

function entityTypeLabel(entityType = '') {
  return entityType ? entityType.replace(/_/g, ' ') : '';
}

function normalizeActionAccess(access = {}) {
  const level = normalizeAccessLevel(access.level);
  const grants = Array.isArray(access.grants)
    ? access.grants
        .filter(grant => grant?.roleId)
        .map(grant => ({ ...grant, roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
    : grantsFromRoleIds(Array.isArray(access.roleIds) ? access.roleIds : [], level);
  return {
    level: maxGrantLevel(grants, level),
    roleIds: [...new Set(grants.map(grant => grant.roleId))],
    grants,
    modified: Boolean(access.modified),
    scope: access.scope && typeof access.scope === 'object' && !Array.isArray(access.scope) ? { ...access.scope } : null,
    statusFrom: typeof access.statusFrom === 'string' ? access.statusFrom : '',
    statusTo: typeof access.statusTo === 'string' ? access.statusTo : ''
  };
}

function requirementHasAuthoredGrant(required = null, permissions = {}) {
  if (!required?.feature) return true;
  const requiredLevel = normalizeAccessLevel(required.level || 'read');
  return (permissions[required.feature] || []).some(grant => {
    if (ACCESS_ORDER[normalizeAccessLevel(grant.level || 'read')] < ACCESS_ORDER[requiredLevel]) return false;
    if (grant.actions && required.actions && Object.entries(required.actions).some(([action, enabled]) => enabled === true && grant.actions[action] !== true)) return false;
    return true;
  });
}

function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors, statusDefinitions = {}, process = {}, lineageBindings = [] }) {
  const kind = action.actionKind || 'createEntity';
  const normalizedAccess = normalizeActionAccess(action.access);
  if (!['createEntity', 'updateEntity', 'archiveEntity', 'deleteEntity', 'runCommand', 'sendToOrganization'].includes(kind)) {
    errors.push(`Action ${actionId} uses unknown action kind ${kind}`);
    return;
  }
  if (kind === 'runCommand') {
    if (!action.commandId) errors.push(`Action ${actionId} must select a command`);
    if (action.commandId && !commands.has(action.commandId)) errors.push(`Action ${actionId} uses unknown command ${action.commandId}`);
  } else if (!['updateEntity', 'archiveEntity', 'deleteEntity'].includes(kind)) {
    if (!action.entityType) errors.push(`Action ${actionId} must select an entity type`);
    if (action.entityType && !entities.has(action.entityType)) errors.push(`Action ${actionId} uses unknown entity type ${action.entityType}`);
  }
  if (action.parentEntityType && !entities.has(action.parentEntityType)) {
    errors.push(`Action ${actionId} uses unknown parent entity type ${action.parentEntityType}`);
  }
  const hasTargetStatus = Boolean(action.status?.to || (action.statusRef && statusDefinitions[action.statusRef]));
  if (kind === 'createEntity' && !hasTargetStatus) {
    errors.push(`Action ${actionId} must define target status`);
  }
  if (kind === 'createEntity') {
    validateConstruction(actionId, action, domain, errors);
    validateParentRevision(actionId, action, domain, errors, process, lineageBindings);
  }
  if (kind === 'updateEntity') {
    const entityType = action.inputs?.find(input => input.entityType)?.entityType || action.entityType || inferConnectedActionEntityType(actionId, process);
    if (!entityType) errors.push(`Action ${actionId} must receive an entity input`);
    if (entityType && !entities.has(entityType)) errors.push(`Action ${actionId} input uses unknown entity type ${entityType}`);
    const processRelationFields = new Set((action.mutation?.relationContracts || []).map(relation => `relations.${relation.key}`));
    const policyFields = (action.mutation?.fields || []).filter(field => !processRelationFields.has(field));
    validateFieldList(
      policyFields,
      domain,
      entityType,
      `action ${actionId} update fields`,
      errors,
      normalizedAccess.level
    );
    validateMutationGrantLevels(actionId, policyFields, domain, entityType, normalizedAccess.grants, errors);
    if (!(action.mutation?.fields || []).length && !hasTargetStatus) {
      errors.push(`Action ${actionId} must connect at least one writable field, relation, or status`);
    }
  }
  if (kind === 'archiveEntity' || kind === 'deleteEntity') {
    const entityType = action.entityType || action.inputs?.find(input => input.entityType)?.entityType || inferConnectedActionEntityType(actionId, process);
    if (!entityType) errors.push(`Action ${actionId} must receive an entity input`);
    if (entityType && !entities.has(entityType)) errors.push(`Action ${actionId} input uses unknown entity type ${entityType}`);
    if (kind === 'deleteEntity' && normalizedAccess.level !== 'admin') errors.push(`Action ${actionId} must use admin access for hard deletion`);
    if (kind === 'deleteEntity' && (action.trigger?.mode || 'manual') !== 'manual') errors.push(`Action ${actionId} hard deletion must be manual`);
  }
  const canInheritAccess = kind === 'runCommand' && action.inputs?.some(input => input.entityType);
  if ((!action.access && !canInheritAccess) || !Array.isArray(normalizedAccess.grants) || !['read', 'write', 'admin'].includes(normalizedAccess.level)) {
    errors.push(`Action ${actionId} must define access grants`);
  }
  if (kind === 'sendToOrganization') {
    validateFieldList(action.projection?.fields, domain, action.entityType, `action ${actionId} projection fields`, errors);
    validateFieldList(action.projection?.excludeFields, domain, action.entityType, `action ${actionId} excluded fields`, errors);
  }
  const triggerMode = action.trigger?.mode || 'manual';
  if (!['manual', 'event', 'date', 'entityChanged', 'domainEvent'].includes(triggerMode)) {
    errors.push(`Action ${actionId} uses unknown trigger mode ${triggerMode}`);
  }
  for (const roleId of normalizedAccess.roleIds) {
    if (!roles[roleId]) errors.push(`Action ${actionId} references missing access role ${roleId}`);
  }
  if (action.statusRef && !statusDefinitions[action.statusRef]) {
    errors.push(`Action ${actionId} references missing status definition ${action.statusRef}`);
  }
}

function validateParentRevision(actionId, action = {}, domain = {}, errors = [], process = {}, lineageBindings = []) {
  if (action.parentRevision?.enabled !== true) return;
  const graphContext = buildActionGraphContext(process);
  const parentEntityType = effectiveActionParentEntityType(action, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
  if (!parentEntityType) {
    errors.push(`Action ${actionId} cannot pin a revision without a declared containment parent`);
    return;
  }
  const contract = domain.revisions?.[parentEntityType];
  if (!contract?.scopes?.length) {
    errors.push(`Action ${actionId} cannot pin ${parentEntityType}; the entity has no revision contract`);
    return;
  }
  const scope = action.parentRevision.scope || contract.defaultScope;
  if (!contract.scopes.includes(scope)) {
    errors.push(`Action ${actionId} uses unknown ${parentEntityType} revision scope ${scope || '(empty)'}`);
  }
}

function inferConnectedActionEntityType(actionId, process = {}) {
  const actionNodeIds = new Set((process.graph?.nodes || [])
    .filter(node => {
      const refId = String(node.data?.refId || node.id);
      const processNode = node.type === 'processNode' ? process.processNodes?.[refId] : null;
      return (node.type === 'action' && refId === String(actionId))
        || (processNode?.kind?.startsWith('effect.') && String(processNode.entryTriggerId || processNode.id || refId) === String(actionId));
    })
    .map(node => String(node.id)));
  for (const edge of process.graph?.edges || []) {
    if (!actionNodeIds.has(String(edge.target)) || !isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceNode = (process.graph?.nodes || []).find(node => String(node.id) === String(edge.source));
    const sourceRefId = String(sourceNode?.data?.refId || sourceNode?.id || '');
    const sourceRecord = sourceNode?.type === 'processNode' ? process.processNodes?.[sourceRefId] : null;
    const sourceActionId = sourceNode?.type === 'action'
      ? sourceRefId
      : sourceRecord?.kind?.startsWith('effect.') ? String(sourceRecord.id || sourceRefId) : '';
    const sourceAction = process.actions?.[sourceActionId];
    const sourceType = sourceAction && actionEntityType(sourceAction);
    if (sourceType) return sourceType;
  }
  return '';
}

function validateEffectCapabilities(process = {}, domain = {}, capabilities = {}, errors = []) {
  for (const [nodeId, node] of Object.entries(process.processNodes || {})) {
    if (!node.entityType) continue;
    const capability = requiredEffectCapability(node.kind);
    if (!capability) continue;
    if (capability === 'statusMutation') {
      if (!domain.workflows?.[node.entityType]) {
        errors.push(`Process node ${nodeId} cannot change ${node.entityType}: entity has no status workflow`);
      }
      continue;
    }
    const record = capabilities[node.entityType];
    if (capability === 'create') {
      const construction = normalizeConstruction(node.construction, node.entityType, domain);
      const mode = construction?.mode || '';
      if (!record || !(Array.isArray(record.createModes) ? record.createModes : []).includes(mode)) {
        errors.push(`Process node ${nodeId} cannot create ${node.entityType} with construction mode ${mode || '(none)'}: no registered runtime handler`);
      }
      continue;
    }
    if (!record || record[capability] !== true) {
      const verb = capability === 'delete' ? 'delete' : capability === 'archive' ? 'archive' : 'update';
      errors.push(`Process node ${nodeId} cannot ${verb} ${node.entityType}: entity service lacks ${capability} support`);
    }
  }
}

function validateProcessNode(nodeId, node = {}, { entities, domain, errors }) {
  const kind = node.kind || '';
  if (kind.includes('.')) {
    validateDataflowProcessNode(nodeId, node, { entities, domain, errors });
    return;
  }
  const kinds = [
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify',
    'blockRead', 'blockCompose', 'blockModify',
    'cast', 'fallback', 'stringOp', 'compare', 'logic', 'entityCondition', 'predicateLogic', 'listLength'
  ];
  if (!kinds.includes(kind)) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${kind}`);
    return;
  }
  for (const key of ['entityType', 'relationEntityType']) {
    if (node[key] && !entities.has(node[key])) {
      errors.push(`Process node ${nodeId} uses unknown ${key} ${node[key]}`);
    }
  }
  if ([
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify', 'entityCondition', 'predicateLogic',
    'blockRead', 'blockCompose', 'blockModify'
  ].includes(kind) && !node.entityType) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.block) {
    errors.push(`Process node ${nodeId} must select a canonical block`);
  }
  if (node.block && ['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind)
    && !entityBlocks(domain, node.entityType).includes(node.block)) {
    errors.push(`Process node ${nodeId} uses block ${node.block} outside ${node.entityType}`);
  }
  if (kind === 'entityRef' && node.mode === 'related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.entityType && item.key === node.relationKey);
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.entityType}`);
    if (relation && node.relationEntityType && node.relationEntityType !== relation.targetType) {
      errors.push(`Process node ${nodeId} relation ${node.relationKey} must target ${relation.targetType}`);
    }
  }
  if (['entityField', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.path) errors.push(`Process node ${nodeId} must define a field path`);
  if (node.path && ['entityField', 'blockRead'].includes(kind)) {
    validateFieldList([node.path], domain, node.entityType, `process node ${nodeId} field`, errors, 'read');
  }
  if (node.path && ['blockCompose', 'blockModify'].includes(kind)) {
    validateFieldList([node.path], domain, node.entityType, `process node ${nodeId} field`, errors, 'write');
  }
  if (['stringOp', 'compare', 'logic', 'entityCondition', 'predicateLogic', 'entitySelect'].includes(kind) && !node.operation) {
    errors.push(`Process node ${nodeId} must define an operation`);
  }
  const operations = {
    stringOp: ['concat', 'template', 'replace', 'lower', 'upper', 'trim'],
    compare: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'],
    logic: ['and', 'or', 'xor', 'not'],
    entityCondition: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'],
    predicateLogic: ['and', 'or', 'xor', 'not'],
    entitySelect: ['first', 'last', 'index']
  };
  if (operations[kind] && !operations[kind].includes(node.operation)) {
    errors.push(`Process node ${nodeId} uses unknown ${kind} operation ${node.operation || '(empty)'}`);
  }
  if (kind === 'entityCondition') {
    const allowed = {
      string: ['eq', 'neq', 'contains', 'exists'],
      number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
      date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
      boolean: ['eq', 'neq', 'exists'],
      json: ['exists']
    }[node.valueType] || [];
    if (node.operation && !allowed.includes(node.operation)) {
      errors.push(`Process node ${nodeId} cannot use ${node.operation} with ${node.valueType || 'unknown'} fields`);
    }
  }
  if (kind === 'stringOp' && node.operation === 'template' && !String(node.template || '').includes('{value}')) {
    errors.push(`Process node ${nodeId} template must contain {value}`);
  }
  if (!PROCESS_STRUCTURES.includes(node.structure || 'item')) errors.push(`Process node ${nodeId} uses unknown structure ${node.structure}`);
  if (['cast', 'fallback', 'entityField', 'blockRead', 'blockCompose', 'blockModify', 'compare', 'entityCondition'].includes(kind)
    && !PROCESS_SCALAR_KINDS.includes(node.valueType)) {
    errors.push(`Process node ${nodeId} uses unknown value type ${node.valueType || '(empty)'}`);
  }
  if (kind === 'entityCondition' && !node.path) errors.push(`Process node ${nodeId} must select a field`);
  if (kind === 'entityCondition' && node.path) {
    validateFieldList([node.path], domain, node.entityType, `process node ${nodeId} field`, errors, 'read');
  }
}

function validateDataflowProcessNode(nodeId, node, { entities, domain, errors }) {
  const definition = getProcessNodeDefinition(node.kind);
  if (!definition) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${node.kind}`);
    return;
  }
  if (node.entityType && !entities.has(node.entityType)) {
    errors.push(`Process node ${nodeId} uses unknown entityType ${node.entityType}`);
  }
  if (processNodeRequiresEntityType(node.kind) && !node.entityType) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (['record.getField', 'record.fieldChange', 'predicate.field'].includes(node.kind)) {
    if (!node.path) errors.push(`Process node ${nodeId} must select a field`);
    const openBlock = node.kind === 'record.getField' ? domain.blockComposition?.[node.block] : null;
    const schema = node.kind === 'record.getField'
      ? structuralFieldSchema(domain, node.path)
      : entityFieldSchema(domain, node.entityType, node.path);
    if (node.path && !schema && !openBlock) errors.push(`Process node ${nodeId} uses undeclared field ${node.path}`);
    if (openBlock && node.path && !String(node.path).startsWith(`${node.block}.`)) {
      errors.push(`Process node ${nodeId} field ${node.path} does not belong to block ${node.block}`);
    }
    if (openBlock?.mode === 'ancestors') {
      if (node.type?.base !== 'entityRef' || !entities.has(node.type.entityType)) {
        errors.push(`Process node ${nodeId} must select a lineage entity type`);
      }
    }
    if (openBlock?.mode === 'relations') {
      const entityType = node.type?.base === 'array' ? node.type.itemType?.entityType : node.type?.entityType;
      const validType = node.type?.base === 'entityRef'
        || (node.type?.base === 'array' && node.type.itemType?.base === 'entityRef');
      if (!validType || !entities.has(entityType)) errors.push(`Process node ${nodeId} must select a relation entity type`);
    }
    if (schema && node.kind === 'record.fieldChange' && schema.writable === false) {
      errors.push(`Process node ${nodeId} cannot modify read-only field ${node.entityType}.${node.path}`);
    }
  }
  if (['record.composeBlock', 'record.modifyBlock'].includes(node.kind)) {
    if (!node.block) errors.push(`Process node ${nodeId} must select a block`);
    if (['origin', 'status', 'provenance', 'summary'].includes(node.block)) {
      errors.push(`Process node ${nodeId} cannot author managed block ${node.block}`);
    }
    const composition = domain.blockComposition?.[node.block];
    if (composition && node.compositionMode !== composition.mode) {
      errors.push(`Process node ${nodeId} has the wrong composition mode for ${node.block}`);
    }
    if (composition) validateOpenBlockEntries(nodeId, node, composition, entities, domain, errors);
    else if (!node.fields?.length) errors.push(`Process node ${nodeId} must select at least one block field`);
    for (const path of composition ? [] : (node.fields || [])) {
      const schema = structuralFieldSchema(domain, path);
      if (!schema) errors.push(`Process node ${nodeId} uses undeclared block field ${path}`);
      if (schema && schema.block !== node.block) {
        errors.push(`Process node ${nodeId} field ${path} does not belong to block ${node.block}`);
      }
      const requiredAccess = node.kind === 'record.composeBlock' ? 'constructible' : 'writable';
      if (schema && schema[requiredAccess] === false) {
        errors.push(`Process node ${nodeId} cannot ${node.kind === 'record.composeBlock' ? 'compose' : 'modify'} managed field ${path}`);
      }
    }
  }
  if (node.kind === 'record.getField') {
    const schema = structuralFieldSchema(domain, node.path);
    if (schema && schema.block !== node.block) {
      errors.push(`Process node ${nodeId} field ${node.path} does not belong to block ${node.block}`);
    }
  }
  if (node.kind === 'record.deconstruct' && !node.blocks?.length) {
    errors.push(`Process node ${nodeId} must expose at least one declared block`);
  }
  if (['record.getBlock', 'record.deconstruct'].includes(node.kind)
    && node.entityType && entities.has(node.entityType)) {
    const declaredBlocks = entityBlocks(domain, node.entityType);
    const selectedBlocks = node.kind === 'record.getBlock' ? [node.block].filter(Boolean) : (node.blocks || []);
    for (const block of selectedBlocks) {
      if (!declaredBlocks.includes(block)) {
        errors.push(`Process node ${nodeId} uses block ${block} outside ${node.entityType}`);
      }
    }
  }
  if (['effect.createEntity', 'effect.updateEntity'].includes(node.kind)) {
    const statusTarget = processDefaultValue(node.inputDefaults?.['status.state.primary']) || node.status?.to || node.statusRef;
    if (node.kind === 'effect.updateEntity' && !node.blocks?.length && !statusTarget) {
      errors.push(`Process node ${nodeId} must accept at least one writable block or status`);
    }
    if (node.kind === 'effect.createEntity') {
      const construction = normalizeConstruction(node.construction, node.entityType, domain);
      const contract = constructionContract(domain, node.entityType);
      if (!contract || !construction) {
        errors.push(`Process node ${nodeId} cannot create ${node.entityType}: entity has no construction contract`);
      } else {
        if (!contract.modes.includes(construction.mode)) {
          errors.push(`Process node ${nodeId} cannot create ${node.entityType} with construction mode ${construction.mode}`);
        }
        if (contract.derived && construction.mode === 'genericCreate') {
          errors.push(`Process node ${nodeId} must use a typed construction mode for derived entity ${node.entityType}`);
        }
      }
    }
    const allowedBlocks = new Set(entityFieldSchemas(domain, node.entityType)
      .filter(field => node.kind === 'effect.createEntity'
        ? field.constructible !== false
        : field.writable !== false)
      .map(field => field.block));
    if (node.kind === 'effect.createEntity') {
      for (const block of entityBlocks(domain, node.entityType)) {
        if (domain.blockComposition?.[block] && !['origin', 'status', 'provenance', 'summary'].includes(block)) {
          allowedBlocks.add(block);
        }
      }
    }
    for (const block of node.blocks || []) {
      if (!allowedBlocks.has(block) || ['origin', 'status', 'provenance', 'summary'].includes(block)) {
        errors.push(`Process node ${nodeId} cannot persist block ${block}`);
      }
    }
  }
  if (node.kind === 'effect.runProducer') {
    const construction = normalizeConstruction(node.construction, node.entityType, domain);
    const contract = constructionContract(domain, node.entityType);
    if (!(domain.producers || []).some(producer => producer.id === node.producerId)) {
      errors.push(`Process node ${nodeId} must select a registered producer`);
    }
    if (!contract || !construction || !contract.modes.includes(construction.mode) || construction.mode === 'genericCreate') {
      errors.push(`Process node ${nodeId} must use a declared service construction mode for ${node.entityType}`);
    }
  }
  if (node.kind.startsWith('effect.') && !['manual', 'event'].includes(node.trigger?.mode || 'manual')) {
    errors.push(`Process node ${nodeId} uses unknown trigger mode ${node.trigger?.mode}`);
  }
  if (node.type) {
    try {
      normalizeProcessType(sanitizeProcessType(node.type));
    } catch (error) {
      errors.push(`Process node ${nodeId} has invalid type: ${error.message}`);
    }
  }
  if (node.kind === 'read.related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.entityType && item.key === (node.relationKey || node.relation));
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.entityType}`);
  }
  if (node.kind === 'effect.runCommand' && (!node.commandId || !domain.commands?.[node.commandId])) {
    errors.push(`Process node ${nodeId} must select a registered command`);
  }
  try {
    resolveCatalogNodePorts(node, {
      fieldSchema: processNodeUsesStructuralFields(node.kind)
        ? structuralFieldSchema(domain, node.path)
        : entityFieldSchema(domain, node.entityType, node.path),
      fieldSchemas: processNodeUsesStructuralFields(node.kind)
        ? blockFieldSchemas(domain, node.block)
        : entityFieldSchemas(domain, node.entityType),
      blockComposition: domain.blockComposition?.[node.block] || null,
      command: domain.commands?.[node.commandId] || null
    });
  } catch (error) {
    errors.push(`Process node ${nodeId} has invalid sockets: ${error.message}`);
  }
}

function validateOpenBlockEntries(nodeId, node, composition, entities, domain, errors) {
  const entries = Array.isArray(node.entries) ? node.entries : [];
  if (!entries.length) {
    errors.push(`Process node ${nodeId} must define at least one block entry`);
    return;
  }
  const ids = new Set();
  const keys = new Set();
  for (const entry of entries) {
    if (!entry?.id || ids.has(entry.id)) errors.push(`Process node ${nodeId} has a missing or duplicate entry id`);
    ids.add(entry?.id);
    if (['ancestors', 'relations'].includes(composition.mode)) {
      if (!entry.entityType || !entities.has(entry.entityType)) {
        errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} must select an entity type`);
      }
    }
    const key = String(entry.key || '').trim();
    if (!key || keys.has(key)) errors.push(`Process node ${nodeId} has a missing or duplicate entry key`);
    keys.add(key);
    if (composition.mode === 'relations' && entry.attachmentKinds?.length) {
      const kinds = new Map(Object.values(domain.attachmentKinds || {}).map(kind => [kind.kind || kind.id, kind]));
      const targetHasAttachmentKinds = Object.values(domain.attachmentKinds || {}).some(kind => (
        (Array.isArray(kind.entityTypes) ? kind.entityTypes.includes(entry.entityType) : true)
        && ['upload', 'capture', 'editor'].includes(kind.creation?.mode)
      ));
      if (!targetHasAttachmentKinds) {
        errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} can create upload targets only for entities with user-creatable attachment kinds`);
      }
      if (!entry.attachmentKinds?.length) {
        errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} must select an upload attachment kind`);
      }
      for (const kind of entry.attachmentKinds || []) {
        if (!kinds.has(kind) || !['upload', 'capture', 'editor'].includes(kinds.get(kind)?.creation?.mode)) {
          errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} creator requires a user-creatable attachment kind`);
        }
      }
    }
    if (composition.mode === 'entries') {
      try {
        normalizeProcessType(sanitizeProcessType(entry.type));
      } catch (error) {
        errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} has invalid type: ${error.message}`);
      }
    }
    if (composition.mode === 'attachments') {
      const kinds = new Set(Object.values(domain.attachmentKinds || {}).map(kind => kind.kind || kind.id));
      if (!entry.attachmentKind || !kinds.has(entry.attachmentKind)) {
        errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} must select a declared attachment kind`);
      }
    }
  }
}

// Edge diagnostics are structured records so the designer can focus the exact
// graph element; `errors` strings are derived from `message` at the assembly
// boundary.
function validateDataflowEdges(process, domain) {
  const errors = [];
  const push = (message, anchors = {}) => errors.push({ message, ...anchors });
  const entityEdgesByTarget = new Map();
  const graphNodes = new Map((process.graph?.nodes || []).map(node => [String(node.id), node]));
  for (const edge of process.graph?.edges || []) {
    const sourceNode = graphNodes.get(String(edge.source));
    const targetNode = graphNodes.get(String(edge.target));
    const sourceRecord = process.processNodes?.[String(sourceNode?.data?.refId || sourceNode?.id || '')];
    const targetRecord = process.processNodes?.[String(targetNode?.data?.refId || targetNode?.id || '')];
    if (!sourceRecord || !targetRecord) continue;
    const sourcePorts = resolveCatalogNodePorts(sourceRecord, catalogContext(domain, sourceRecord)).outputs;
    const targetPorts = resolveCatalogNodePorts(targetRecord, catalogContext(domain, targetRecord)).inputs;
    const sourcePort = catalogPortForHandle(sourcePorts, edge.sourceHandle);
    const targetPort = catalogPortForHandle(targetPorts, edge.targetHandle);
    if (!sourcePort) {
      push(`Edge ${edge.id} references missing output ${edge.sourceHandle} on ${sourceRecord.id}`,
        { edgeId: edge.id, nodeId: String(edge.target), socketId: String(edge.sourceHandle || '') });
      continue;
    }
    if (!targetPort) {
      push(`Edge ${edge.id} references missing input ${edge.targetHandle} on ${targetRecord.id}`,
        { edgeId: edge.id, nodeId: String(edge.target), socketId: String(edge.targetHandle || '') });
      continue;
    }
    const edgeSourceEntityType = sourcePort.type?.entityType || sourcePort.type?.itemType?.entityType || '';
    const edgeSourceProducerId = edgeSourceEntityType
      ? resolveSourceProducerOutputId(process, sourceRecord, sourcePort)
      : null;
    const producerLabel = edgeSourceProducerId ? ` from producer output ${edgeSourceProducerId}` : '';
    const compatibility = processSocketsCompatible(sourcePort, targetPort);
    if (!compatibility.ok) {
      push(`Edge ${edge.id}${producerLabel} is incompatible: ${compatibility.reason}`, {
        edgeId: edge.id,
        nodeId: String(edge.target),
        socketId: targetPort.id,
        ...(edgeSourceProducerId ? { producerOutputId: edgeSourceProducerId } : {})
      });
    }
    if (compatibility.ok
      && ['record.composeBlock', 'record.modifyBlock'].includes(sourceRecord.kind)
      && ['effect.createEntity', 'effect.updateEntity'].includes(targetRecord.kind)) {
      const requiredAccess = targetRecord.kind === 'effect.createEntity' ? 'constructible' : 'writable';
      const targetBlocks = new Set(entityBlocks(domain, targetRecord.entityType));
      const sourcePaths = sourceRecord.compositionMode
        ? (sourceRecord.entries || []).map(entry => `${sourceRecord.block}.${entry.key}`).filter(path => !path.endsWith('.undefined'))
        : (sourceRecord.fields || []);
      for (const path of sourcePaths) {
        const targetSchemas = entityFieldSchemas(domain, targetRecord.entityType)
          .filter(field => field.block === sourceRecord.block);
        const targetSchema = entityFieldSchema(domain, targetRecord.entityType, path);
        const openBlockAccepted = targetRecord.kind === 'effect.createEntity'
          && Boolean(sourceRecord.compositionMode)
          && targetBlocks.has(sourceRecord.block)
          && !['origin', 'status', 'provenance', 'summary'].includes(sourceRecord.block);
        const openRelationsAccepted = sourceRecord.compositionMode === 'relations'
          && targetSchemas.some(field => field[requiredAccess] !== false);
        const wholeBlockAccepted = path === sourceRecord.block
          && targetSchemas.some(field => field[requiredAccess] !== false);
        if (!openBlockAccepted && !openRelationsAccepted && !wholeBlockAccepted && (!targetSchema || targetSchema[requiredAccess] === false)) {
          push(`Edge ${edge.id} cannot send ${path} to ${targetRecord.entityType}: field is not ${requiredAccess}`,
            { edgeId: edge.id, nodeId: String(edge.target), socketId: targetPort.id });
        }
        if (sourceRecord.compositionMode && sourceRecord.compositionMode !== 'relations' && targetSchema) {
          const key = path.slice(sourceRecord.block.length + 1);
          const entry = (sourceRecord.entries || []).find(item => item.key === key);
          const sourceType = openCompositionEntryType(entry, sourceRecord.compositionMode, sourceRecord.compositionValueBase);
          if (sourceType && !processTypesEquivalent(sourceType, targetSchema.type)) {
            push(`Edge ${edge.id} cannot send ${path} to ${targetRecord.entityType}: composed entry type does not match the entity field`,
              { edgeId: edge.id, nodeId: String(edge.target), socketId: targetPort.id });
          }
        }
      }
    }
    if (compatibility.ok) {
      const portEntityType = sourcePort.type?.entityType || sourcePort.type?.itemType?.entityType || '';
      const portEntityStream = sourcePort.type?.base === 'entity'
        || (sourcePort.type?.base === 'array' && sourcePort.type?.itemType?.base === 'entity');
      if (portEntityStream && portEntityType) {
        const producerOutputId = resolveSourceProducerOutputId(process, sourceRecord, sourcePort);
        if (producerOutputId) {
          entityEdgesByTarget.set(targetRecord.id, [
            ...(entityEdgesByTarget.get(targetRecord.id) || []),
            { edgeId: edge.id, socketId: targetPort.id, producerOutputId, entityType: portEntityType }
          ]);
        }
      }
    }
  }
  errors.push(...validateProducerJoinAndConvergence(process, domain, entityEdgesByTarget));
  for (const role of ['data', 'control']) {
    const cycle = findGraphCycle(process, role);
    if (cycle.length) push(`${role === 'data' ? 'Data' : 'Control'} graph contains a cycle: ${cycle.join(' → ')}`);
  }
  const triggers = (process.graph?.nodes || []).filter(node => {
    const record = process.processNodes?.[String(node.data?.refId || node.id)];
    return record?.kind?.endsWith('Trigger')
      || (record?.kind?.startsWith('effect.') && record.trigger?.mode === 'manual');
  });
  const reachable = reachableControlNodes(process, triggers.map(node => String(node.id)));
  for (const node of process.graph?.nodes || []) {
    const record = process.processNodes?.[String(node.data?.refId || node.id)];
    if ((record?.kind?.startsWith('effect.') || record?.kind?.startsWith('control.'))
      && !record.kind.endsWith('Trigger') && !reachable.has(String(node.id))) {
      push(`Operational node ${record.id || node.id} is not reachable from a trigger`, { nodeId: String(node.id) });
    }
  }
  return errors;
}

// Same-type producer paths may converge only through an explicit
// `producer.join` whose configuration selects the surviving producer output.
// Every other consumer receiving entity streams from two distinct producer
// outputs of the same entity type is an implicit workflow convergence and is
// rejected with the responsible node, producer outputs, and edges named.
function validateProducerJoinAndConvergence(process, domain, entityEdgesByTarget) {
  const errors = [];
  const push = (message, anchors = {}) => errors.push({ message, ...anchors });
  const recordsById = new Map(Object.entries(process.processNodes || {})
    .map(([id, record]) => [record.id || id, record]));
  const graphIdFor = new Map((process.graph?.nodes || []).map(node => [
    String(node.data?.refId || node.id),
    String(node.id)
  ]));
  for (const [targetId, entries] of entityEdgesByTarget) {
    const record = recordsById.get(targetId);
    if (!record) continue;
    const nodeId = graphIdFor.get(targetId) || targetId;
    if (record.kind === 'producer.join') {
      const sockets = new Map(entries.map(entry => [entry.socketId, entry]));
      for (const input of ['primary', 'secondary']) {
        if (!sockets.has(input)) {
          push(`Join ${record.id || targetId} requires a connected ${input} entity stream`, { nodeId, socketId: input });
        }
      }
      const candidateIds = [...new Set(entries.map(entry => entry.producerOutputId))];
      if (!record.selectedProducerOutputId) {
        if (candidateIds.length) {
          push(`Join ${record.id || targetId} must select the resulting producer output from ${candidateIds.join(', ')}`, { nodeId });
        }
      } else if (!candidateIds.includes(record.selectedProducerOutputId)) {
        push(
          `Join ${record.id || targetId} selects producer output ${record.selectedProducerOutputId}, `
          + `which is not among its connected sources ${candidateIds.join(', ')}`,
          { nodeId, producerOutputId: record.selectedProducerOutputId }
        );
      }
      continue;
    }
    const byType = new Map();
    for (const entry of entries) {
      let producers = byType.get(entry.entityType);
      if (!producers) {
        producers = new Map();
        byType.set(entry.entityType, producers);
      }
      producers.set(entry.producerOutputId, entry);
    }
    for (const [entityType, producers] of byType) {
      if (producers.size < 2) continue;
      const [first, second] = [...producers.values()];
      push(
        `${record.kind} node ${record.id || targetId} implicitly converges ${entityType} producer outputs `
        + `${first.producerOutputId} (edge ${first.edgeId}) and ${second.producerOutputId} (edge ${second.edgeId}); `
        + `use an explicit producer join`,
        { nodeId, edgeId: first.edgeId, socketId: first.socketId, producerOutputId: first.producerOutputId }
      );
    }
  }
  return errors;
}

function catalogContext(domain, record) {
  return {
    fieldSchema: processNodeUsesStructuralFields(record.kind)
      ? structuralFieldSchema(domain, record.path)
      : entityFieldSchema(domain, record.entityType, record.path),
    fieldSchemas: processNodeUsesStructuralFields(record.kind)
      ? blockFieldSchemas(domain, record.block)
      : entityFieldSchemas(domain, record.entityType),
    blockComposition: domain.blockComposition?.[record.block] || null,
    command: domain.commands?.[record.commandId] || null
  };
}

function openCompositionEntryType(entry = {}, mode = '', valueBase = 'json') {
  if (!entry) return null;
  if (mode === 'ancestors' || mode === 'relations') {
    if (entry.type?.base) return processType(entry.type.base, entry.type);
    return processType('entityRef', { entityType: entry.entityType });
  }
  if (mode === 'attachments') {
    return processType('attachmentRef', { attachmentKind: entry.attachmentKind });
  }
  return processType(entry.type?.base || valueBase, entry.type || {});
}

function processTypesEquivalent(left = {}, right = {}) {
  if (left.base !== right.base) return false;
  for (const qualifier of ['entityType', 'attachmentKind', 'enumId', 'unit']) {
    if ((left[qualifier] || '') !== (right[qualifier] || '')) return false;
  }
  if (left.base === 'array') return processTypesEquivalent(left.itemType || {}, right.itemType || {});
  return true;
}

function catalogPortForHandle(ports, handle) {
  const clean = String(handle || '').replace(/^(input|output|data|control|success|failure):/, '');
  return ports.find(port => port.id === clean)
    || ((!clean || ['input', 'output'].includes(clean)) && ports.length === 1 ? ports[0] : null);
}

function findGraphCycle(process, role) {
  const adjacency = new Map();
  for (const edge of process.graph?.edges || []) {
    const edgeRole = edge.role || (String(edge.sourceHandle || '').startsWith('control:') ? 'control' : 'data');
    if (edgeRole !== role) continue;
    const list = adjacency.get(String(edge.source)) || [];
    list.push(String(edge.target));
    adjacency.set(String(edge.source), list);
  }
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  function visit(node) {
    if (visiting.has(node)) return [...path.slice(path.indexOf(node)), node];
    if (visited.has(node)) return [];
    visiting.add(node);
    path.push(node);
    for (const target of adjacency.get(node) || []) {
      const cycle = visit(target);
      if (cycle.length) return cycle;
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return [];
  }
  for (const node of adjacency.keys()) {
    const cycle = visit(node);
    if (cycle.length) return cycle;
  }
  return [];
}

function reachableControlNodes(process, starts) {
  const reached = new Set(starts);
  const pending = [...starts];
  while (pending.length) {
    const source = pending.shift();
    for (const edge of process.graph?.edges || []) {
      const role = edge.role || (String(edge.sourceHandle || '').startsWith('control:') ? 'control' : 'data');
      if (role !== 'control' || String(edge.source) !== source || reached.has(String(edge.target))) continue;
      reached.add(String(edge.target));
      pending.push(String(edge.target));
    }
  }
  return reached;
}

function validateProcessNodeConnections(process = {}, errors = [], domain = {}) {
  for (const graphNode of process.graph?.nodes || []) {
    if (graphNode.type !== 'processNode') continue;
    const nodeId = String(graphNode.data?.refId || graphNode.id || '');
    const record = process.processNodes?.[nodeId];
    if (!record) continue;
    const contract = record.kind?.includes('.')
      ? resolveCatalogNodePorts(record, catalogContext(domain, record))
      : resolveProcessNodePorts(record);
    const counts = new Map();
    for (const edge of (process.graph?.edges || []).filter(item => String(item.target) === String(graphNode.id))) {
      const handle = String(edge.targetHandle || '').replace(/^(input|data|control):/, '');
      const inputId = (!handle || handle === 'input') && contract.inputs.length === 1
        ? contract.inputs[0].id
        : handle;
      if (!inputId) continue;
      counts.set(inputId, (counts.get(inputId) || 0) + 1);
    }
    for (const input of contract.inputs) {
      if ((counts.get(input.id) || 0) > 1 && !input.multiple) errors.push(`Process node ${nodeId} input ${input.id} has more than one connected value`);
    }
  }
}

function entityFieldSchemas(domain = {}, entityType = '') {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

function entityFieldSchema(domain, entityType, path) {
  return entityFieldSchemas(domain, entityType).find(field => field.path === path) || null;
}

function blockFieldSchemas(domain = {}, block = '') {
  if (block) return domain.blockSchemas?.[block] || [];
  return Object.values(domain.blockSchemas || {}).flat();
}

function blockFieldSchema(domain, path) {
  return blockFieldSchemas(domain, String(path || '').split('.')[0])
    .find(field => field.path === path) || null;
}

function structuralFieldSchema(domain, path) {
  return blockFieldSchema(domain, path)
    || blockFieldSchema(domain, String(path || '').split('.')[0]);
}

function processNodeUsesStructuralFields(kind = '') {
  return ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(kind);
}

function processNodeRequiresEntityType(kind = '') {
  if (['record.getField', 'record.composeBlock', 'record.modifyBlock', 'record.construct', 'effect.runCommand'].includes(kind)) return false;
  return ['record.', 'predicate.', 'read.', 'effect.'].some(prefix => kind.startsWith(prefix));
}

function validateConstruction(actionId, action = {}, domain = {}, errors = []) {
  const entityType = action.entityType || '';
  const contract = constructionContract(domain, entityType);
  const construction = normalizeConstruction(action.construction, entityType, domain);
  if (!contract || !construction) {
    errors.push(`Action ${actionId} cannot create ${entityType}: entity has no construction contract`);
    return;
  }
  if (!contract.modes.includes(construction.mode)) {
    errors.push(`Action ${actionId} cannot create ${entityType} with construction mode ${construction.mode}`);
  }
  if (contract.derived && construction.mode === 'genericCreate') {
    errors.push(`Action ${actionId} must use a typed construction mode for derived entity ${entityType}`);
  }
  if (construction.blockComposed && construction.mode === 'genericCreate') return;
}

function constructionContract(domain = {}, entityType = '') {
  return domain.construction?.[entityType] || null;
}

function validateFieldList(fields = [], domain = {}, entityType, label, errors, access = 'read') {
  if (!Array.isArray(fields)) return;
  if (access === 'construct') {
    const schemas = entityFieldSchemas(domain, entityType);
    for (const field of fields) {
      const schema = schemas.find(item => item.path === field);
      if (!schema || schema.constructible === false) {
        errors.push(`${label} contains non-constructible field: ${field}`);
      }
    }
    return;
  }
  const policy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (!policy) {
    if (fields.length) errors.push(`${label} cannot be checked because ${entityType} has no field-access policy`);
    return;
  }
  const allowed = access === 'admin'
    ? [...(policy.write || []), ...(policy.admin || [])]
    : access === 'write'
      ? [...(policy.write || [])]
      : [...(policy.read || [])];
  for (const field of fields) {
    if (!fieldPathAllowed(field, allowed)) errors.push(`${label} contains field outside base policy: ${field}`);
  }
}

function validateMutationGrantLevels(actionId, fields = [], domain = {}, entityType = '', grants = [], errors = []) {
  const policy = getFieldPolicy(domain.fieldAccess || {}, entityType);
  if (!policy || !Array.isArray(fields)) return;
  const adminOnly = fields.filter(field => (
    !fieldPathAllowed(field, policy.write || []) && fieldPathAllowed(field, policy.admin || [])
  ));
  if (!adminOnly.length) return;
  for (const grant of grants || []) {
    if (grant.level === 'admin') continue;
    errors.push(`Action ${actionId} grants ${grant.roleId} ${grant.level} access to admin-only field ${adminOnly[0]}`);
  }
}

function fieldPathAllowed(path, allowed = []) {
  if (!path || typeof path !== 'string') return false;
  return allowed.some(pattern => pattern === path || (pattern.endsWith('.*') && (path === pattern.slice(0, -2) || path.startsWith(pattern.slice(0, -1)))));
}

function getByPath(source, path) {
  return String(path).split('.').filter(Boolean).reduce((value, key) => value?.[key], source);
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}
