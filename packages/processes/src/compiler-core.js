import { operationKindOf } from '../../cts/src/index.js';
import { normalizeWorkflow, resolveWorkflowStatePath } from '../../workflows/src/index.js';
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
import { projectUiAction, projectUiContractChannels } from './ui-contract-projection.js';
import { normalizeProcessType, sanitizeProcessType, processSocketsCompatible, processType } from './types.js';
import { createDataTree, isDataTree, authoredSocketDefault } from './data-tree.js';
import { normalizeHandle, lineageKeyForTypeId, lineageRelationsForParent, mergedHierarchyBindings } from './hierarchy-utils.js';

export const PROCESS_SCHEMA_VERSION = 1;
const ACCESS_ORDER = { none: 0, read: 1, write: 2, admin: 3 };
const MAPPED_MUTATION_KINDS = new Set([
  'effect.createEntity',
  'effect.updateEntity',
  'effect.changeStatus',
  'effect.archiveEntity',
  'effect.deleteEntity',
  'cts.construct',
  'cts.mutate',
  'cts.transition',
  'cts.remove'
]);
const NATIVE_EFFECT_KINDS = new Set([
  'cts.construct',
  'cts.mutate',
  'cts.transition',
  'cts.remove',
  'cts.command',
  'cts.service',
  'cts.conversion'
]);

function effectKindOf(record = {}) {
  return operationKindOf(record);
}

function isMappedMutation(record = {}) {
  return MAPPED_MUTATION_KINDS.has(record.kind) || MAPPED_MUTATION_KINDS.has(effectKindOf(record));
}

function isEffectRecord(record = {}) {
  const kind = effectKindOf(record);
  return NATIVE_EFFECT_KINDS.has(String(record.kind || '')) || kind.startsWith('effect.');
}

export {
  canvasToDefinition,
  definitionToCanvas,
  hasCanonicalProcessSource,
  validateCanvasSemantics,
  validateRoundTrip
} from './transpiler.js';

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

const REMOVED_STATUS_EFFECT_INPUTS = new Set(['metadata', 'lifecycle', 'region', 'path']);

function withoutRemovedStatusEffectEdges(graph, processNodes) {
  const recordByGraphId = new Map((graph.nodes || []).map(node => [
    String(node.id),
    processNodes[String(node.data?.refId || node.id)]
  ]));
  graph.edges = (graph.edges || []).filter(edge => {
    const record = recordByGraphId.get(String(edge.target));
    const kind = effectKindOf(record || {});
    if (!record || !['effect.changeStatus', 'effect.archiveEntity', 'cts.transition'].includes(kind)) return true;
    const handle = String(edge.targetHandle || '').replace(/^(input|data):/, '');
    return !REMOVED_STATUS_EFFECT_INPUTS.has(handle);
  });
  return graph;
}

const PRODUCER_ORIGIN_KINDS = new Set([
  'effect.createEntity',
  'effect.runProducer',
  'effect.runCommand',
  'cts.construct',
  'cts.command',
  'cts.service',
  'cts.conversion'
]);

function ownsProducerOutput(record = {}) {
  return PRODUCER_ORIGIN_KINDS.has(String(record.kind || '')) || PRODUCER_ORIGIN_KINDS.has(effectKindOf(record));
}

export function normalizeProcessDefinition(definition = {}, domain = {}) {
  const data = definition.data || definition;
  const graph = normalizeGraph(data.graph);
  const processNodes = inferCurrentTypeIds(inferOpenBlockEntries(
    normalizeProcessInputDefaults(normalizeProcessNodesForDomain(data.processNodes, domain), domain),
    graph,
    domain
  ), data.actions, data.screens);
  const producerOutputs = normalizeRecord(data.producerOutputs);
  // Only actual entity origins own producer provenance. Reads, field
  // projections, and consumer effects prune stale records/identities so a
  // lifecycle is never synthesized merely because data was read.
  for (const [recordId, node] of Object.entries(processNodes)) {
    if (ownsProducerOutput(node)) continue;
    delete node.producerOutputId;
    for (const [producerOutputId, output] of Object.entries(producerOutputs)) {
      if (String(output?.nodeId) === String(node.id || recordId)) delete producerOutputs[producerOutputId];
    }
  }
  withoutRemovedStatusEffectEdges(graph, processNodes);
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
    stateDefinitions: normalizeRecord(data.stateDefinitions),
    valueInputs: normalizeRecord(data.valueInputs),
    ctsTypes: normalizeRecord(data.ctsTypes),
    processNodes,
    screens: normalizeRecord(data.screens),
    compiled: data.compiled || null
  });
  return normalized;
}

function inferCurrentTypeIds(processNodes = {}, actions = {}, screens = {}) {
  const contextTypes = new Set([
    ...Object.values(normalizeRecord(actions)),
    ...Object.values(normalizeRecord(screens))
  ].flatMap(record => [record?.typeId, ...(record?.inputs || []).map(input => input?.typeId)])
    .filter(Boolean));
  if (contextTypes.size !== 1) return processNodes;
  const [typeId] = contextTypes;
  return Object.fromEntries(Object.entries(processNodes).map(([id, node]) => [id,
    node?.kind === 'cts.read' && node.select === 'current' && !node.typeId
      ? { ...node, typeId, typeIdInferred: true }
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
    const typeId = sourcePort?.type?.typeId || sourcePort?.type?.itemType?.typeId || source.typeId || '';
    if (!typeId) continue;
    entry.typeId = typeId;
    entry.key = entry.key || lineageKeyForTypeId(typeId);
  }
  return inferred;
}

function normalizeProcessInputDefaults(processNodes = {}, domain = {}) {
  return Object.fromEntries(Object.entries(processNodes).map(([id, record]) => {
    if (!record?.inputDefaults) return [id, record];
    let ports = [];
    try { ports = resolveCatalogNodePorts(record, catalogContext(domain, record)).inputs; } catch { ports = []; }
    const accessById = new Map(ports.map(port => [port.id, port.access || 'item']));
    const mutationEffect = isMappedMutation(record);
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
    if (node?.kind === 'effect.archiveEntity' && node.typeId) {
      const workflow = domain.workflows?.[node.typeId];
      const archiveTransition = Object.values(workflow?.regions || {})
        .flatMap(region => region.transitions || [])
        .find(transition => transition.to === 'ARCHIVED' && transition.intent);
      return [id, { ...node, archiveIntent: archiveTransition?.intent || '' }];
    }
    if (node?.kind !== 'effect.createEntity' || !node.typeId) return [id, node];
    const schemas = entityFieldSchemas(domain, node.typeId);
    const declaredBlocks = new Set(entityBlocks(domain, node.typeId));
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
    const construction = normalizeConstruction(node.construction, node.typeId, domain);
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
    if (!isEffectRecord(node)) continue;
    const classification = effectKindOf(node);
    const actionId = String(node.entryTriggerId || node.id || nodeId);
    const actionKind = ({
      'effect.createEntity': 'createEntity',
      'effect.runProducer': 'createEntity',
      'effect.updateEntity': 'updateEntity',
      'effect.changeStatus': 'updateEntity',
      'effect.archiveEntity': 'archiveEntity',
      'effect.deleteEntity': 'deleteEntity',
      'effect.runCommand': 'runCommand',
      'effect.sendEntity': 'sendToOrganization',
      'effect.generateAttachment': 'runCommand'
    })[classification];
    if (!actionKind) continue;

    const promptContract = effectPromptContract(nodeId, node, processNodes, graph, domain);
    const fields = promptContract.fields;
    const suppliedFields = new Set([
      ...Object.keys(promptContract.defaults),
      ...promptContract.wiredFields
    ]);
    const stateTo = ['effect.updateEntity', 'effect.changeStatus', 'effect.archiveEntity'].includes(classification)
      ? (processDefaultValue(node.inputDefaults?.state)
        || processDefaultValue(node.inputDefaults?.status)
        || processDefaultValue(node.inputDefaults?.['states.main'])
        || node.state?.to
        || '')
      : (classification === 'effect.createEntity'
        ? (processDefaultValue(node.inputDefaults?.state) || '')
        : '');
    const consumer = ['effect.updateEntity', 'effect.changeStatus', 'effect.archiveEntity', 'effect.deleteEntity'].includes(classification);
    const producerOutputId = consumer
      ? node.producerOutputId || ''
      : node.producerOutputId || derived[actionId]?.producerOutputId || '';

    derived[actionId] = {
      ...(derived[actionId] || {}),
      id: actionId,
      label: node.label || derived[actionId]?.label || actionKind,
      actionKind,
      ...(producerOutputId ? { producerOutputId } : {}),
      typeId: node.typeId || derived[actionId]?.typeId || '',
      commandId: node.commandId || derived[actionId]?.commandId || '',
      parentTypeId: promptContract.parentTypeId || derived[actionId]?.parentTypeId || '',
      construction: classification === 'effect.createEntity'
        ? node.construction?.mode === 'genericCreate' && isBlockComposedCreate(nodeId, node, graph)
          ? { mode: 'genericCreate', inputs: [], blockComposed: true }
          : {
              ...(node.construction || derived[actionId]?.construction || {}),
              ...(isBlockComposedCreate(nodeId, node, graph) ? { blockComposed: true } : {})
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
      ...(stateTo || node.state?.from ? {
        state: {
          ...(derived[actionId]?.state || {}),
          ...(node.state?.axis ? { axis: node.state.axis } : {}),
          ...(node.state?.from ? { from: node.state.from } : {}),
          ...(stateTo ? { to: stateTo } : {})
        }
      } : {}),
      stateRef: node.stateRef || derived[actionId]?.stateRef || '',
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
      if (!sourceAction.typeId || !relation.key || !relation.targetType) continue;
      for (const operation of ['link', 'unlink']) {
        const creatorAction = relation.creator?.actionId ? actions[relation.creator.actionId] : null;
        const creator = creatorAction
          ? (() => {
              const construction = normalizeConstruction(creatorAction.construction, creatorAction.typeId, domain);
              const inputPolicy = normalizeActionInputPolicy(
                creatorAction.inputPolicy,
                construction,
                creatorAction.typeId,
                domain
              );
              return {
              actionId: creatorAction.id || relation.creator.actionId,
              typeId: creatorAction.typeId,
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
          typeId: relation.targetType,
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
          typeId: sourceAction.typeId,
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
            { id: 'entity', typeId: sourceAction.typeId, required: true },
            input
          ],
          outputs: [{ id: 'entity', typeId: sourceAction.typeId }]
        };
      }
    }
  }
  return derived;
}

// A generic create is block-composed only when block data actually arrives
// from the graph — a wired composer edge into one of the create's
// block sockets (each accepted block renders its own `data:<block>`
// input). The `blocks` list is the designer's presentation of the type's
// canonical blocks (persisted on every construct node) and never implies
// composition: reading presence as composition suppressed every typed
// construction input — rows, lineage, name — into name-only dialogs.
function isBlockComposedCreate(nodeId, node, graph) {
  const blocks = new Set((node.blocks || []).map(block => String(block)));
  if (!blocks.size) return false;
  return (graph?.edges || []).some(edge => (
    String(edge.target) === String(nodeId)
    && blocks.has(normalizeHandle(edge.targetHandle))
  ));
}

function wiredHandlePaths(nodeId, graph, allowed = null) {
  const graphNode = (graph?.nodes || []).find(item =>
    String(item.data?.refId || item.id) === String(nodeId));
  if (!graphNode) return [];
  return (graph?.edges || [])
    .filter(edge => String(edge.target) === String(graphNode.id))
    .map(edge => normalizeHandle(edge.targetHandle))
    .filter(path => path && path !== 'entity' && path !== 'in')
    .filter(path => !allowed || allowed.has(path));
}

function effectPromptContract(nodeId, node, processNodes, graph, domain = {}) {
  const consumerFieldSchema = path => entityFieldSchema(domain, node.typeId, path)
    || structuralFieldSchema(domain, path);
  const nativeKind = String(node.kind || '');
  if (nativeKind === 'cts.construct') {
    const construction = normalizeConstruction(node.construction, node.typeId, domain) || {};
    const inputs = construction.inputs || [];
    const fields = inputs.map(input => input.path || input.id).filter(Boolean);
    return {
      fields,
      defaults: plainProcessDefaults(node.inputDefaults),
      wiredFields: wiredHandlePaths(nodeId, graph, new Set(fields)),
      schemas: inputs.map(input => ({
        path: input.path || input.id,
        type: input.type,
        required: input.required === true
      })),
      parentTypeId: ''
    };
  }
  if (nativeKind === 'cts.mutate') {
    const defaults = plainProcessDefaults(node.inputDefaults);
    const fields = [...new Set([
      ...wiredHandlePaths(nodeId, graph),
      ...Object.keys(defaults)
    ])].filter(path => !['entity', 'note'].includes(path));
    return {
      fields,
      defaults,
      wiredFields: wiredHandlePaths(nodeId, graph, new Set(fields)),
      schemas: fields.map(consumerFieldSchema).filter(Boolean),
      parentTypeId: node.parentTypeId || ''
    };
  }
  if (nativeKind === 'cts.transition' || nativeKind === 'cts.remove') {
    return { fields: [], defaults: {}, wiredFields: [], schemas: [], parentTypeId: '' };
  }
  if (Array.isArray(node.fields) && node.fields.length) {
    return {
      fields: node.fields,
      defaults: plainProcessDefaults(node.inputDefaults),
      wiredFields: [],
      schemas: (node.fields || []).map(consumerFieldSchema).filter(Boolean),
      parentTypeId: node.parentTypeId || ''
    };
  }
  const graphNode = (graph?.nodes || []).find(item => String(item.data?.refId || item.id) === String(nodeId));
  if (!graphNode) return { fields: [], defaults: {}, wiredFields: [], schemas: [], parentTypeId: '' };
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
  const defaultIdentityFields = effectKindOf(node) === 'effect.createEntity'
    && node.construction?.mode === 'genericCreate'
    && !composers.some(record => record.block === 'identity')
    ? ['identity.name']
    : [];
  const fields = [...new Set([...composerFields, ...defaultIdentityFields])];
  const resolvedSchemas = fields.map(consumerFieldSchema).filter(Boolean);
  const allSchemas = [...schemas, ...resolvedSchemas.filter(schema => !schemas.some(item => item.path === schema.path))];
  const parentTypes = [...new Set(allSchemas
    .filter(field => field.block === 'lineage' && field.type?.typeId !== 'organization')
    .map(field => field.type?.typeId)
    .filter(Boolean))];
  const relationContracts = composers
    .filter(record => record.compositionMode === 'relations' || record.block === 'relations')
    .flatMap(record => (record.entries || []).map(entry => {
      const declared = declaredRelationForTarget(domain, node.typeId, entry.typeId, entry.key);
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
        && sourceRecord.typeId === (declared?.targetType || entry.typeId)
        ? { actionId: String(sourceRecord.id) }
        : null;
      return {
      ownerType: node.typeId,
      key: declared?.key || entry.key,
      targetType: declared?.targetType || entry.typeId,
      cardinality: declared?.cardinality || (entry.type?.base === 'array' || sourcePort?.type?.base === 'array' ? 'many' : 'one'),
      ...(processCreator ? { creator: processCreator } : {}),
      ...(hasDomainAttachmentKinds(declared?.targetType || entry.typeId, domain) ? {
        creator: {
          typeId: declared?.targetType || entry.typeId,
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
    parentTypeId: node.parentTypeId || (parentTypes.length === 1 ? parentTypes[0] : ''),
    relationContracts
  };
}

function hasDomainAttachmentKinds(typeId = '', domain = {}) {
  const construction = domain.construction?.[typeId];
  if (!construction) return false;
  const inputs = [
    ...(construction.inputs || []),
    ...Object.values(construction.modeInputs || {}).flat()
  ];
  return inputs.some(input => (
    input?.creator?.typeId === typeId
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
    if (node.type === 'stateDefinition' && !process.stateDefinitions[refId]) errors.push(`Status node ${node.id} references missing status definition ${refId}`);
    if (node.type === 'valueInput' && !process.valueInputs[refId]) errors.push(`Value node ${node.id} references missing value input ${refId}`);
    if (node.type === 'processNode' && !process.processNodes[refId]) errors.push(`Process node ${node.id} references missing process node ${refId}`);
  }

  for (const [producerOutputId, output] of Object.entries(process.producerOutputs)) {
    if (producerOutputId !== output.producerOutputId) errors.push(`Producer output key ${producerOutputId} must match producerOutputId`);
    if (!output.nodeId || !output.outputSocketId) errors.push(`Producer output ${producerOutputId} requires nodeId and outputSocketId`);
    if (producerOutputId !== `${output.nodeId}:${output.outputSocketId}`) errors.push(`Producer output ${producerOutputId} must be derived from nodeId and outputSocketId`);
    if (!entities.has(output.typeId)) errors.push(`Producer output ${producerOutputId} uses unknown entity type ${output.typeId}`);
    validateFieldList(output.fields?.read, domain, output.typeId, `producer output ${producerOutputId} read fields`, errors, 'read');
    validateFieldList(output.fields?.write, domain, output.typeId, `producer output ${producerOutputId} write fields`, errors, 'write');
    validateFieldList(output.fields?.private, domain, output.typeId, `producer output ${producerOutputId} private fields`, errors, 'admin');
    for (const relationKey of output.relations || []) {
      if (!(domain.relations || []).some(relation => relation.ownerType === output.typeId && relation.key === relationKey)) {
        errors.push(`Producer output ${producerOutputId} uses undeclared relation ${output.typeId}.${relationKey}`);
      }
    }
    try {
      const lifecycle = compileLifecycle(output, domain);
      // A vocabulary-less producer compiles no machine (stateless type):
      // null lifecycle is valid, there is simply nothing to validate.
      for (const [regionId, region] of Object.entries(lifecycle?.regions || {})) {
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
      if (input.typeId && !entities.has(input.typeId)) errors.push(`Service ${serviceId} input ${input.id} uses unknown entity type ${input.typeId}`);
    }
    for (const output of service.outputs || []) {
      if (output.typeId && !entities.has(output.typeId)) errors.push(`Service ${serviceId} output ${output.id} uses unknown entity type ${output.typeId}`);
    }
  }

  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  for (const [actionId, action] of Object.entries(process.actions)) {
    const actionWindow = actionWindows.get(actionId);
    const resolvedActionTypeId = actionTypeId(action)
      || actionWindow?.input?.typeId
      || actionWindow?.outputs?.[0]?.typeId
      || null;
    if (resolvedActionTypeId && !action.producerOutputId && action.actionKind === 'createEntity') {
      errors.push(`Action ${actionId} on ${resolvedActionTypeId} requires producerOutputId`);
    } else if (action.producerOutputId) {
      const producerOutput = process.producerOutputs?.[action.producerOutputId];
      if (!producerOutput) {
        errors.push(`Action ${actionId} uses unknown producerOutputId ${action.producerOutputId}`);
      } else if (resolvedActionTypeId && producerOutput.typeId !== resolvedActionTypeId) {
        errors.push(`Action ${actionId} producerOutputId emits ${producerOutput.typeId}, not ${resolvedActionTypeId}`);
      }
    }
    validateAction(actionId, action, { entities, commands, roles: organizationRoles, domain, errors, stateDefinitions: process.stateDefinitions, process, lineageBindings });
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

  const stateDefinitionIds = new Set(Object.values(process.stateDefinitions)
    .map(status => status.stateId)
    .filter(Boolean));
  for (const [stateId, status] of Object.entries(process.stateDefinitions)) {
    if (!status.stateId) errors.push(`Status definition ${stateId} must define stateId`);
    if (status.typeId && !entities.has(status.typeId)) errors.push(`Status definition ${stateId} uses unknown entity type ${status.typeId}`);
    const parentStatusId = status.parentStatusId || '';
    if (!parentStatusId) continue;
    if (!stateDefinitionIds.has(parentStatusId)) {
      errors.push(`Status definition ${stateId} references unknown parent status ${parentStatusId}`);
      continue;
    }
    const seen = new Set([status.stateId]);
    let cursor = status;
    while (cursor?.parentStatusId) {
      if (seen.has(cursor.parentStatusId)) {
        errors.push(`Status definition ${stateId} has a cyclic parent status chain`);
        break;
      }
      seen.add(cursor.parentStatusId);
      cursor = Object.values(process.stateDefinitions).find(item => item.stateId === cursor.parentStatusId) || null;
    }
  }

  for (const [socketId, socket] of Object.entries(process.sockets)) {
    if (!entities.has(socket.typeId)) errors.push(`Socket ${socketId} uses unknown entity type ${socket.typeId}`);
    validateFieldList(socket.projection?.fields, domain, socket.typeId, `socket ${socketId} projection fields`, errors);
    validateFieldList(socket.projection?.excludeFields, domain, socket.typeId, `socket ${socketId} excluded fields`, errors);
    if (socket.receiverLifecycle?.mode === 'custom') {
      try {
        compileLifecycle({ typeId: socket.typeId, lifecycle: socket.receiverLifecycle }, domain);
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

  // Inference owns default stations (crystallization Phase 4): an
  // authored screen that is projection-equal to the station inference
  // would emit is redundant — it suppresses nothing and must be deleted,
  // not maintained by hand.
  const compiledRoles = compileRoles(process, domain, organizationRoles, lineageBindings);
  for (const hit of redundantAuthoredScreens(process, domain, compiledRoles, lineageBindings)) {
    errors.push(`Screen ${hit.id} duplicates the inferred station for role ${hit.roleId} (${hit.typeId}) — delete it; default stations are inference-owned`);
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
// The sink set reads the catalog's family table — any species of the effects
// family is itself a persistence sink, native or legacy twin alike.
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
    if (getProcessNodeDefinition(String(record?.kind || ''))?.family === 'effects') operational.push(nodeId);
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
    warnings.push(`Process node ${nodeId} (${humanizedKindLabel(record?.kind)}) is non-operational: its values cannot reach any persistence effect`);
  }
  return warnings;
}

// Inputs whose value is resolvable from the manual run context even without a
// wire, fallback, or prompt: the current entity, the change-status target, and
// the initial create status.
const CONTEXT_RESOLVABLE_PORTS = new Set(['entity', 'parent', 'status', 'states.main', 'state']);

function edgeHandle(handle = '') {
  return String(handle || '').replace(/^(input|output|data|control|success|failure):/, '');
}

// Diagnostics speak the designer's vocabulary, never the persisted kind
// strings: the catalog's operation label humanized (createEntity -> Create
// entity), with the canvas node id, so an author can find the element. An
// authored node label wins; the raw-kind echo the designer sync persists as
// `label` (for example `cts.construct`) is ignored.
function humanizedKindLabel(kind = '') {
  const definition = getProcessNodeDefinition(kind);
  const words = String(definition?.label || kind || 'node')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(word => word.toLowerCase());
  if (!words.length) return 'Node';
  return [words[0].charAt(0).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(' ');
}

function diagnosticNodeName(record = {}, nodeId = '') {
  // A label that is itself a catalog kind is the designer sync's raw-kind
  // echo (`node.label = node.kind`, the species kind before lowering), not
  // an authored name.
  const label = record.label && !getProcessNodeDefinition(record.label) ? String(record.label) : '';
  const authored = label && label !== record.kind ? label : '';
  const reference = `${humanizedKindLabel(record.kind)} node ${nodeId}`;
  return authored ? `${authored} (${reference})` : reference;
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
    return Boolean(scalar.id || scalar._id || scalar.identity || scalar.instanceId || scalar.type);
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
  const contract = domain.construction?.[record.typeId] || {};
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
  const contract = domain.construction?.[record.typeId] || {};
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
            `Required input ${port.id} on ${diagnosticNodeName(record, String(graphNode?.id || recordId))}${producerContext} has no available source `
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
  const sourceTypeId = node?.typeId;
  if (sourceTypeId) {
    const matching = Object.values(process.producerOutputs || {})
      .filter(output => output?.typeId === sourceTypeId);
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
  const portTypeId = sourcePort?.type?.typeId || sourcePort?.type?.itemType?.typeId || '';
  const matching = portTypeId
    ? candidates.filter(output => output.typeId === portTypeId)
    : candidates;
  return matching.length === 1 ? matching[0].producerOutputId : null;
}

// The declared lineage input for a native `lineage.<lineageKey>` socket:
// construction inputs are the catalog's port source (the designer persists
// the derived domain input there); the top-level socket list mirrors it.
function declaredLineageInput(record = {}, handle = '') {
  const matches = input => input && (
    normalizeHandle(input.id) === handle
    || normalizeHandle(input.path) === handle
  );
  return (record.construction?.inputs || []).find(matches)
    || (record.inputs || []).find(matches)
    || null;
}

function declaredAncestorTypeId(input = {}) {
  return input.typeId || input.type?.typeId || '';
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
    const portTypeId = sourcePort?.type?.typeId || sourcePort?.type?.itemType?.typeId || '';
    const ancestorType = portTypeId || source.typeId || entry.typeId || '';
    if (!ancestorType) {
      push(`Edge ${edge.id} cannot resolve an ancestor entity type for lineage entry ${entry.id} on ${target.id} from source ${source.id}`, anchors);
      continue;
    }
    if (ancestorType === 'organization') {
      push(`Edge ${edge.id} lineage entry ${entry.id} on ${target.id} cannot use organization as an ancestor`, anchors);
      continue;
    }
    const lineageKey = entry.key || lineageKeyForTypeId(ancestorType);
    if (!lineageKey) {
      push(`Edge ${edge.id} lineage entry ${entry.id} on ${target.id} has no lineage key for ancestor type ${ancestorType}`, anchors);
      continue;
    }
    if (portTypeId && sourcePort?.id
      && !resolveSourceProducerOutputId(process, source, sourcePort)) {
      push(
        `Edge ${edge.id} lineage source socket ${source.id}:${sourcePort.id} on ${source.id} emits entity type ${portTypeId} `
        + `but has no resolvable producer output record`,
        anchors
      );
    }
  }
  // Native parity: a typed `lineage.<lineageKey>` socket on a
  // lineage-persisting construct resolves by the same rules, so a dropped
  // native binding is an activation failure too.
  for (const edge of process.graph?.edges || []) {
    const handle = normalizeHandle(edge.targetHandle);
    if (!handle.startsWith('lineage.') || handle === 'lineage.') continue;
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || !['effect.createEntity', 'effect.runProducer'].includes(effectKindOf(target))) continue;
    const anchors = { edgeId: edge.id, nodeId: String(edge.target), socketId: handle };
    const declared = declaredLineageInput(target, handle);
    if (!declared) {
      push(`Edge ${edge.id} targets lineage socket ${handle} missing on ${target.id || target.label}`, anchors);
      continue;
    }
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) {
      push(`Edge ${edge.id} cannot resolve lineage source node ${String(edge.source)} for socket ${handle} on ${target.id}`, anchors);
      continue;
    }
    let sourcePort = null;
    try {
      sourcePort = catalogPortForHandle(
        resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs,
        edge.sourceHandle
      );
    } catch { sourcePort = null; }
    const portTypeId = sourcePort?.type?.typeId || sourcePort?.type?.itemType?.typeId || '';
    const ancestorType = portTypeId || source.typeId || declaredAncestorTypeId(declared) || '';
    if (!ancestorType) {
      push(`Edge ${edge.id} cannot resolve an ancestor entity type for lineage socket ${handle} on ${target.id} from source ${source.id}`, anchors);
      continue;
    }
    if (ancestorType === 'organization') {
      push(`Edge ${edge.id} lineage socket ${handle} on ${target.id} cannot use organization as an ancestor`, anchors);
      continue;
    }
    if (portTypeId && sourcePort?.id
      && !resolveSourceProducerOutputId(process, source, sourcePort)) {
      push(
        `Edge ${edge.id} lineage source socket ${source.id}:${sourcePort.id} on ${source.id} emits entity type ${portTypeId} `
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
  const workflows = compileWorkflows(process, domain, lineageBindings);
  const workflowByType = {};
  for (const [producerOutputId, workflow] of Object.entries(workflows)) {
    const typeId = process.producerOutputs?.[producerOutputId]?.typeId;
    if (typeId && !workflowByType[typeId]) workflowByType[typeId] = workflow;
  }
  const compiledRoles = compileRoles(process, domain, organizationRoles, lineageBindings, workflows);
  const compiledScreens = compileScreens(process, domain, compiledRoles, lineageBindings);
  const fieldPolicies = compileFieldPolicies(process.producerOutputs, domain);
  // The compiled machine is the authority on the execution channel too: a
  // status-mutating action whose edge the machine dropped is not part of
  // the contract, so no surface renders it and the run API resolves none.
  const compiledActions = Object.fromEntries(Object.entries(compileActions(process.actions, process, domain, lineageBindings))
    .filter(([, action]) => action.actionKind !== 'updateEntity'
      || !action.state?.to
      || !workflowDropsNoOp(workflowByType[action.typeId], action.state.from, action.state.to)));
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
    stateDefinitions: compileStatusDefinitions(process.stateDefinitions),
    valueInputs: compileValueInputs(process.valueInputs),
    processNodes: compileProcessNodes(process.processNodes),
    services: compileServices(process.services),
    sockets: compileSockets(process.sockets),
    screens: projectUiContractChannels({ screens: compiledScreens }).screens,
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
    const ancestorType = sourcePort?.type?.typeId
      || sourcePort?.type?.itemType?.typeId
      || source.typeId
      || entry.typeId
      || '';
    if (!ancestorType) continue;
    const lineageKey = entry.key || lineageKeyForTypeId(ancestorType);
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
        const childTypeId = node.typeId || target.targetTypeId || target.typeId || '';
        if (!childTypeId) continue;
      bindings.push({
        childTypeId,
        parentTypeId: ancestorType,
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
      target.targetTypeId,
      target.typeId,
      ...consumers.map(({ node }) => node.typeId)
    ].filter(Boolean))];
    if (!childTypes.length) continue;
    for (const childTypeId of childTypes) {
      bindings.push({
        childTypeId,
        parentTypeId: ancestorType,
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
  // Native species wiring: a typed `lineage.<lineageKey>` data socket on a
  // lineage-persisting construct, fed by an entity-emitting output — the
  // graph-authored hierarchy without a compose-block node. Same binding
  // identity and fields as the composed path; the declared input's type
  // only backfills an ancestor the wire cannot resolve.
  for (const edge of graph.edges || []) {
    const handle = normalizeHandle(edge.targetHandle);
    if (!handle.startsWith('lineage.') || handle === 'lineage.') continue;
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || !['effect.createEntity', 'effect.runProducer'].includes(effectKindOf(target))) continue;
    const declared = declaredLineageInput(target, handle);
    if (!declared) continue;
    const childTypeId = target.typeId || target.targetTypeId || '';
    if (!childTypeId) continue;
    const source = recordsByGraphId.get(String(edge.source));
    if (!source) continue;
    let outputs = [];
    try { outputs = resolveCatalogNodePorts(source, catalogContext(domain, source)).outputs; } catch { outputs = []; }
    const sourcePort = catalogPortForHandle(outputs, edge.sourceHandle);
    const ancestorType = sourcePort?.type?.typeId
      || sourcePort?.type?.itemType?.typeId
      || source.typeId
      || declaredAncestorTypeId(declared)
      || '';
    if (!ancestorType || ancestorType === 'organization') continue;
    const sourceProducerOutputId = resolveSourceProducerOutputId(process, source, sourcePort)
      || source.producerOutputId || null;
    bindings.push({
      childTypeId,
      parentTypeId: ancestorType,
      lineageKey: handle.slice('lineage.'.length),
      producerOutputId: target.producerOutputId || null,
      sourceProducerOutputId,
      sourceNode: String(edge.source),
      sourceSocket: String(edge.sourceHandle || ''),
      consumingNode: String(edge.target),
      consumingSocket: String(edge.targetHandle || '')
    });
  }
  const unique = new Map(bindings.map(binding => [
    [
      binding.producerOutputId,
      binding.sourceProducerOutputId,
      binding.childTypeId,
      binding.parentTypeId,
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
    actions: compiled?.actions || {},
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
    // `type`-role edges are canvas binding gestures (type node -> species
    // node); the binding itself lives in the record's type field. They are
    // not dataflow and never reach validation.
    edges: Array.isArray(graph.edges)
      ? graph.edges.map(normalizeEdge).filter(edge => edge.role !== 'type')
      : [],
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
  const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || '';
  const inputs = [...(action.inputs || [])];
  if (!inputs.some(input => input.id === 'entity')) {
    inputs.unshift({ id: 'entity', kind: 'entity', typeId, required: false });
  }
  if (!inputs.some(input => input.id === 'state')) {
    inputs.push({
      id: 'state',
      kind: 'state',
      stateRef: action.stateRef || null,
      state: action.state?.to || action.access?.stateTo || '',
      required: false
    });
  }
  return {
    ...action,
    actionKind: 'updateEntity',
    typeId,
    inputs,
    mutation: action.mutation || { fields: [] },
    access: {
      ...(action.access || {}),
      stateFrom: action.access?.stateFrom || action.state?.from || '',
      stateTo: action.access?.stateTo || action.state?.to || ''
    }
  };
}

// Lifecycle machines are authored data only (SPEC §7: graph-derived at
// compile, never invented): the draft's state records seed the vocabulary,
// compiled actions contribute transitions, and a producer whose type has no
// authored vocabulary compiles NO machine — instances of such types are
// stateless and creation writes no status. There is no synthesized CREATED
// lifecycle: a state nobody declared is not vocabulary.
function compileLifecycle(profile = {}, domain = {}) {
  const lifecycle = profile.lifecycle || {};
  if (lifecycle.mode === 'custom') return lifecycle.workflow ? normalizeWorkflow(lifecycle.workflow) : null;
  // 'defaultCreated' and 'domainDefault' share one contract now: the
  // declared machine when the domain carries one, otherwise the draft's
  // seeded vocabulary (handled by the caller), otherwise no machine. The
  // historical CREATED minting is gone — authored vocabulary only.
  const workflow = domain.workflows?.[profile.typeId] || null;
  return workflow ? normalizeWorkflow(workflow) : null;
}

// State nesting is authored by wiring a state node into another state node
// (SPEC §7): source child, target parent, edge role `type` label `nested`.
function stateNestingPairs(process = {}) {
  const nodeById = new Map((process.graph?.nodes || []).map(node => [String(node.id), node]));
  const valueOf = node => {
    if (!node || node.type !== 'ctsState') return '';
    const refId = String(node.data?.refId || node.id);
    return String(node.data?.value || process.ctsTypes?.[refId]?.value || '');
  };
  const pairs = [];
  for (const edge of process.graph?.edges || []) {
    const source = nodeById.get(String(edge.source));
    const target = nodeById.get(String(edge.target));
    if (source?.type !== 'ctsState' || target?.type !== 'ctsState') continue;
    const handle = String(edge.targetHandle || '').replace(/^(input|data):/, '');
    if (handle !== 'state') continue;
    // The wire points from parent to child: the source state is the parent,
    // the state it feeds into (the target's `state` input) is its child.
    const parent = valueOf(source);
    const child = valueOf(target);
    if (child && parent && child !== parent) pairs.push({ child, parent });
  }
  return pairs;
}

function findStateEntry(states = {}, value = '', path = []) {
  const name = String(value || '');
  if (!name) return null;
  for (const [key, definition] of Object.entries(states || {})) {
    if (key === name) return { definition, container: states, name: key, path: [...path, key] };
    const nested = definition?.states && findStateEntry(definition.states, name, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function nestRegionStates(region = {}, pairs = []) {
  let progressed = true;
  let guard = 0;
  while (progressed && guard++ < 200) {
    progressed = false;
    for (const { child, parent } of pairs) {
      const childEntry = findStateEntry(region.states, child);
      const parentEntry = findStateEntry(region.states, parent);
      if (!childEntry || !parentEntry) continue;
      if (childEntry.container === region.states) {
        // still flat: attach under parent
      } else {
        continue;
      }
      if (childEntry.path.join('.') === parentEntry.path.join('.')) continue;
      parentEntry.definition.states ||= {};
      parentEntry.definition.states[childEntry.name] = childEntry.definition;
      parentEntry.definition.initial ||= childEntry.name;
      delete childEntry.container[childEntry.name];
      progressed = true;
    }
  }
}

// Canonical dotted path of a state value in the (possibly nested) tree.
function stateCanonicalPath(region = {}, value = '') {
  const entry = findStateEntry(region.states, value);
  return entry ? entry.path.join('.') : '';
}

function compileWorkflows(process = {}, domain = {}, lineageBindings = []) {
  const workflows = {};
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  const graphContext = buildActionGraphContext(process);
  for (const output of Object.values(process.producerOutputs || {})) {
    const workflow = compileLifecycle(output, domain);
    if (workflow) workflows[output.producerOutputId] = workflow;
  }

  const builders = new Map(Object.entries(workflows).map(([producerOutputId, workflow]) => [
    producerOutputId,
    workflowBuilderFromWorkflow(workflow)
  ]));

  // Graph-derived vocabulary (SPEC §7): the draft's state records seed the
  // machine for every producer of their type — terminal flags ride the
  // records; nothing else supplies states.
  const stateRecordsByType = new Map();
  const unscopedStateRecords = [];
  for (const record of Object.values(process.ctsTypes || {})) {
    if (record?.kind !== 'state' || !record.value) continue;
    // A state node is a value token (SPEC §7): unscoped records satisfy
    // any bound type — the same rule the binding check applies. An
    // unscoped token that validation accepts is machine vocabulary for
    // every producer, or validation accepts what compilation drops.
    if (!record.typeId) {
      unscopedStateRecords.push(record);
      continue;
    }
    const list = stateRecordsByType.get(record.typeId) || [];
    list.push(record);
    stateRecordsByType.set(record.typeId, list);
  }
  for (const output of Object.values(process.producerOutputs || {})) {
    // A custom-authored lifecycle is the contract as written: vocabulary
    // seeding never replaces it.
    if (output.lifecycle?.mode === 'custom') continue;
    const records = [...(stateRecordsByType.get(output.typeId) || []), ...unscopedStateRecords];
    if (!records.length) continue;
    // A declared vocabulary replaces the fallback machine entirely: no
    // synthesized CREATED — the draft's records are the whole vocabulary
    // and the construct's state default is the initial.
    const builder = workflowBuilderFromWorkflow();
    builders.set(output.producerOutputId, builder);
    const region = primaryRegionBuilder(builder);
    for (const record of records) {
      region.states[record.value] ||= {
        canUpdateMeta: true,
        ...(record.terminal === true ? { isTerminal: true } : {}),
        ...(record.label ? { label: record.label } : {}),
        ...((record.severity || record.color) ? { severity: record.severity || record.color } : {}),
        ...(record.icon ? { icon: record.icon } : {})
      };
    }
  }

  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const kind = action.actionKind || 'createEntity';
    if (!['createEntity', 'updateEntity'].includes(kind)) continue;
    const typeId = actionTypeId(action) || actionWindows.get(actionId)?.outputs?.[0]?.typeId || actionWindows.get(actionId)?.input?.typeId;
    if (!typeId) continue;

    if (!action.producerOutputId) {
      const to = actionTargetState(action, process);
      const access = normalizeActionAccess(action.access);
      if (kind !== 'updateEntity' || !to) continue;
      const outputs = Object.values(process.producerOutputs || {})
        .filter(output => output.typeId === typeId);
      for (const output of outputs) {
        const workflowBuilder = builders.get(output.producerOutputId);
        if (!workflowBuilder) continue;
        const regionId = action.state?.axis || workflowBuilder.primaryRegion;
        const region = workflowBuilder.regions[regionId] || primaryRegionBuilder(workflowBuilder);
        // A transition compiles concrete declared state-to-state edges.
        // The from-states are the arrival states of instances on its
        // entity wire — the wiring's status windows, exactly what the
        // producer-bound branch and the action window derive from. An
        // authored `from` narrows to that one edge (legacy reference
        // data); nothing wildcard or enumerated enters the machine.
        const wiredFroms = declaredTransitionSources(actionId, action, typeId, graphContext, actionWindows)
          .map(source => source.status)
          .filter(Boolean);
        if (!wiredFroms.length) continue;
        for (const from of wiredFroms) {
          addWorkflowState(region, from);
          addWorkflowState(region, to);
          upsertWorkflowTransition(region, {
            from,
            to,
            processRoleIds: actionExposureRoleIdsForInput(action, access, null)
          });
        }
      }
      continue;
    }

    const builder = primaryRegionBuilder(ensureWorkflowBuilder(builders, action.producerOutputId));

    if (kind === 'createEntity') {
      const targetState = actionTargetState(action, process);
      if (targetState) {
        addWorkflowState(builder, targetState);
        // The construct's state default is the machine's initial (SPEC §7):
        // no declaration owns an initial.
        if (!builder.initial) builder.initial = targetState;
      }
      continue;
    }

    const to = actionTargetState(action, process);
    const access = normalizeActionAccess(action.access);
    if (!to) continue;

    for (const source of declaredTransitionSources(actionId, action, typeId, graphContext, actionWindows)) {
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

  const nestingPairs = stateNestingPairs(process);
  for (const [producerOutputId, builder] of builders) {
    if (!Object.values(builder.regions).some(region => Object.keys(region.states).length)) continue;
    for (const region of Object.values(builder.regions)) {
      applyStatusDefinitionMetadata(region, process.producerOutputs?.[producerOutputId]?.typeId, process.stateDefinitions);
      nestRegionStates(region, nestingPairs);
      if (region.initial) region.initial = stateCanonicalPath(region, region.initial) || region.initial;
      region.transitions = (region.transitions || [])
        .map(transition => ({
          ...transition,
          from: stateCanonicalPath(region, transition.from) || transition.from,
          to: stateCanonicalPath(region, transition.to) || transition.to
        }))
        .filter(transition => transition.from && transition.to && transition.from !== transition.to);
      // A machine requires an entry (SPEC §7): the construct's state
      // default authors it; when none is authored yet, the first declared
      // state record supplies a deterministic entry so the vocabulary
      // compiles — authoring the construct default replaces it.
      if (!region.initial) {
        region.initial = Object.keys(region.states)[0] || '';
      }
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

function workflowTransitionSources(actionId, action = {}, typeId = '', graphContext, actionWindows) {
  const sources = [];
  const edges = graphContext.incomingByActionId.get(actionId) || [];

  for (const edge of edges) {
    if (!isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceWindow = outputWindowForHandle(actionWindows.get(edge.sourceActionId), edge.sourceHandle);
    if (!sourceWindow?.status) continue;
    if (typeId && sourceWindow.typeId && sourceWindow.typeId !== typeId) continue;
    sources.push({ status: sourceWindow.status, window: sourceWindow });
  }

  const fallbackStatus = action.state?.from
    || action.access?.stateFrom
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

function applyStatusDefinitionMetadata(builder, typeId, stateDefinitions = {}) {
  for (const definition of Object.values(stateDefinitions || {})) {
    if (definition.typeId && definition.typeId !== typeId) continue;
    const stateId = definition.stateId || definition.id;
    if (!stateId) continue;
    const decorated = {
      label: definition.label || stateId,
      color: definition.color || definition.severity || '',
      severity: definition.severity || definition.color || '',
      icon: definition.icon || '',
      ...(definition.lifecycle ? { lifecycle: clonePlain(definition.lifecycle) } : {})
    };
    const parentStatusId = definition.parentStatusId || '';
    if (parentStatusId) {
      const parent = builder.states[parentStatusId];
      if (!parent) continue;
      parent.states ||= {};
      const canonicalChild = `${parentStatusId}.${stateId}`;
      const flattenedExisting = builder.states[canonicalChild];
      const existing = parent.states[canonicalChild] || parent.states[stateId] || flattenedExisting;
      if (existing) {
        if (flattenedExisting) {
          parent.states = { [stateId]: { ...flattenedExisting, ...decorated } };
          if (!parent.initial) parent.initial = stateId;
          delete builder.states[canonicalChild];
        } else {
          parent.states[canonicalChild] = { ...existing, ...decorated };
          delete parent.states[stateId];
        }
        continue;
      }
      parent.states[stateId] = { ...(parent.states[stateId] || {}), ...decorated };
      continue;
    }
    if (!builder.states[stateId]) continue;
    builder.states[stateId] = { ...(builder.states[stateId] || {}), ...decorated };
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

function ensureWorkflowBuilder(builders, typeId) {
  if (!builders.has(typeId)) {
    builders.set(typeId, workflowBuilderFromWorkflow());
  }
  return builders.get(typeId);
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
    if (merged.some(item => item.feature === permission.feature && item.level === permission.level && item.typeId === permission.typeId)) continue;
    merged.push(permission);
  }
  return merged;
}

function actionTypeId(action = {}) {
  return action.typeId
    || action.inputs?.find(input => input.typeId)?.typeId
    || action.outputs?.find(output => output.typeId)?.typeId
    || '';
}

// The exposure keys a projected manifest record does not redefine: identity
// and type aliases, parent context, prompt policy, and relation mutation.
// Colliding keys the UI contract owns (actionKind, construction, fields,
// label, status, typeId, trigger, access, relation) are stripped here.
function exposureFieldsOf(action = {}) {
  const {
    actionKind: _actionKind, construction: _construction, fields: _fields,
    label: _label, status: _status, typeId: _typeId, trigger: _trigger,
    access: _access, relation: _relation, ...exposure
  } = action;
  return exposure;
}

export function compileAssignmentAccess({ assignment = {}, roles = {}, screens = {}, actions = {}, lineageBindings = [], domain = {} } = {}) {
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
      // The manifest action entry is the projected UI contract record; the
      // rich exposure window (status from, feature, contracts) stays in the
      // roles channel for grant derivation and the run API. Its non-projected
      // fields (actionId, typeId, parent context, input policy,
      // relation mutation) ride along under their legacy keys so the legacy
      // renderer surfaces and the server manifest consumers keep working;
      // the projected keys stay authoritative.
      const projected = projectUiAction(action);
      const actionId = action.actionId || action.id;
      const existing = actionMap.get(actionId) || {};
      actionMap.set(actionId, {
        ...existing,
        ...(projected || { ...action, id: actionId }),
        ...exposureFieldsOf(action),
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
  // Detail screens stay paired with their list screen: they open by entity
  // context and never appear as duplicate top-level destinations.
  const screenNavigation = userScreens
    .filter(screen => screen.placement !== 'detail')
    .map(screenToNavigation);
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
  const sections = topLevelHomeSections(screens, mergedHierarchyBindings(lineageBindings, domain));
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
      typeId: section.typeId,
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

function topLevelHomeSections(screens = [], hierarchy = []) {
  const listScreens = screens.filter(screen => screen.template === 'typeList' && screen.typeId && screen.sources?.some(source => source.mode === 'list'));
  const sectionsByType = new Map();
  for (const screen of listScreens) {
    const typeId = screen.typeId;
    if (sectionsByType.has(typeId)) {
      const existing = sectionsByType.get(typeId);
      existing.actions = [...new Set([...(existing.actions || []), ...(screen.actions || [])])];
      continue;
    }
    const source = screen.sources.find(item => item.mode === 'list') || {};
    sectionsByType.set(typeId, {
      typeId,
      sourceId: `home_${typeId}`,
      label: screen.label || typeId,
      required: source.required || screen.required || null,
      filters: source.filters || {},
      actions: screen.actions || [],
      screenKey: screen.screenKey,
      route: screen.route
    });
  }
  // Declared and compiled hierarchy both scope the home: a section whose
  // type is a child of another sectioned type is suppressed — it remains
  // reachable through its parent's detail child region.
  const sectionTypes = new Set(sectionsByType.keys());
  const childTypes = new Set(hierarchy
    .filter(relation => sectionTypes.has(relation.parentTypeId)
      && relation.childTypeId !== relation.parentTypeId)
    .map(relation => relation.childTypeId));
  return [...sectionsByType.values()].filter(section => !childTypes.has(section.typeId));
}

function compileRoles(process = {}, domain = {}, organizationRoles = {}, lineageBindings = [], workflows = {}) {
  const graphContext = buildActionGraphContext(process);
  const workflowByType = {};
  for (const [producerOutputId, workflow] of Object.entries(workflows || {})) {
    const typeId = process.producerOutputs?.[producerOutputId]?.typeId;
    if (typeId && !workflowByType[typeId]) workflowByType[typeId] = workflow;
  }
  const roles = Object.fromEntries(Object.entries(organizationRoles).map(([roleId, role]) => [roleId, {
    id: role.id || roleId,
    label: role.label || role.id || roleId,
    grants: Array.isArray(process.roleGrants?.[roleId]) ? [...process.roleGrants[roleId]] : [],
    actions: []
  }]));
  for (const profile of Object.values(process.producerOutputs || {})) {
    const feature = resolveEntityFeature(domain, profile.typeId);
    for (const level of ['read', 'write', 'admin']) {
      for (const roleId of profile.allowedRoles?.[level] || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        // The authored entity type rides on the grant so screen inference
        // resolves the type the graph actually produces; the feature alone
        // cannot distinguish types sharing one collection (org file-class
        // types all project onto one shared collection).
        upsertGrant(roles[roleId].grants, { feature, level, ...(profile.typeId ? { typeId: profile.typeId } : {}) });
      }
    }
  }
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  for (const [actionId, action] of Object.entries(process.actions || {})) {
    const access = normalizeActionAccess(action.access);
    const actionWindow = actionWindows.get(actionId);
    const actionTypeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || actionWindow?.outputs?.[0]?.typeId || '';
    for (const grant of actionWindow?.grants || []) {
      for (const roleId of grant.roleIds || []) {
        if (!roles[roleId]) continue;
        roles[roleId].grants ||= [];
        upsertGrant(roles[roleId].grants, actionTypeId ? { ...grant, typeId: actionTypeId } : grant);
      }
    }
    if ((action.trigger?.mode || 'manual') !== 'manual') continue;
    const exposedRoleIds = actionExposureRoleIds(action, access, actionWindow);
    for (const roleId of exposedRoleIds) {
      if (!roles[roleId]) continue;
      const feature = exposedActionFeature(action, actionWindow, access, domain);
      const parentTypeId = effectiveActionParentTypeId(action, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
      const resolvedTypeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || actionWindow?.outputs?.[0]?.typeId || null;
      const exposedAction = resolvedTypeId && !action.typeId ? { ...action, typeId: resolvedTypeId } : action;
      if (action.relationMutation?.creator?.typeId) {
        const creatorScope = actionWindow?.grants
          ?.find(grant => grant.roleIds?.includes(roleId))?.scope;
        upsertGrant(roles[roleId].grants, {
          feature: resolveEntityFeature(domain, action.relationMutation.creator.typeId),
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
      const inputs = actionInputsForExposure(exposedAction, parentTypeId, domain).map(input => (
        input.id === 'entity' && !input.typeId && resolvedTypeId ? { ...input, typeId: resolvedTypeId } : input
      ));
      const outputs = action.outputs || [];
      const exposureState = actionStatusForExposure(
        action,
        actionWindow,
        access,
        process,
        wiringArrivalState(actionId, exposedAction, resolvedTypeId, graphContext, actionWindows)
      );
      // The machine is the authority: a status-mutating action whose edge
      // the machine did not declare (a no-op arrival-to-target pair) is not
      // exposed, so no surface offers a transition execution would refuse.
      if ((action.actionKind || 'createEntity') === 'updateEntity' && exposureState.to
        && workflowDropsNoOp(workflowByType[resolvedTypeId], exposureState.from, exposureState.to)) {
        continue;
      }
      roles[roleId].actions.push({
        actionId: action.id || actionId,
        label: displayActionLabel(action, actionId, process, domain),
        level: 'run',
        actionKind: action.actionKind || 'createEntity',
        commandId: action.commandId || null,
        feature,
        typeId: resolvedTypeId,
        parentTypeId: parentTypeId || null,
        parentRevision: resolveParentRevision(action.parentRevision, parentTypeId, domain),
        state: exposureState,
        relationMutation: action.relationMutation || null,
        construction: (action.actionKind || 'createEntity') === 'createEntity'
          ? normalizeConstruction(action.construction, action.typeId, domain)
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

function workflowDeclaresEdge(workflow, from, to) {
  if (!workflow) return true;
  const region = workflow.regions?.[workflow.primaryRegion]
    || Object.values(workflow.regions || {})[0]
    || null;
  if (!region || !to) return true;
  const fromPath = resolveWorkflowStatePath(region, from || region.initial) || (from || region.initial);
  const toPath = resolveWorkflowStatePath(region, to) || to;
  return (region.transitions || []).some(transition => (
    transition.from === fromPath
    && (resolveWorkflowStatePath(region, transition.to) || transition.to) === toPath
  ));
}

// Entering a state lands on its initial child, so a status action whose
// arrival leaf equals its target leaf moves nowhere: it is a no-op, not a
// transition, and belongs to neither the execution channel nor the manifest.
function workflowDropsNoOp(workflow, from, to) {
  if (!workflow || !to) return false;
  const region = workflow.regions?.[workflow.primaryRegion]
    || Object.values(workflow.regions || {})[0]
    || null;
  if (!region) return false;
  const fromPath = resolveWorkflowStatePath(region, from || region.initial) || (from || region.initial);
  const toPath = resolveWorkflowStatePath(region, to) || to;
  return Boolean(fromPath) && fromPath === toPath;
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

function actionStatusForExposure(action = {}, actionWindow = null, access = {}, process = {}, wiredFrom = '') {
  // The exposed/manifest action carries the same wiring arrival as the
  // execution channel: compileActionStatus derives `from` from the same
  // wiring fact the machine edge and the compiled action use. The action
  // window's arrival (carried under `status`) is the fallback.
  const status = compileActionStatus(action, process, wiredFrom);
  // The incoming action window carries the arrival state under `status`
  // (compileActionWindow); the exposed/manifest action must keep it as
  // `from` so generated surfaces scope the button to the states the
  // transition actually leaves. Reading `.state` here silently dropped it.
  const inputStatus = actionWindow?.input?.status || actionWindow?.input?.state || '';
  if (!status.from && inputStatus) status.from = inputStatus;
  const targetState = actionTargetState(action, process) || access.stateTo || actionWindow?.outputs?.[0]?.state || '';
  if (!status.to && targetState) status.to = targetState;
  return status;
}

function grantFromAction(action = {}, access = {}, domain = {}) {
  const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId;
  const feature = typeId ? resolveEntityFeature(domain, typeId) : null;
  if (!feature || !access.roleIds?.length) return null;
  const grant = {
    feature,
    level: access.level || 'write'
  };
  if (action.actionKind === 'createEntity') {
    const to = action.state?.to || '';
    if (to) grant.rule = { fact: 'primaryState', equals: to };
  }
  if (action.actionKind === 'updateEntity' && actionTargetState(action)) {
    const from = access.stateFrom || action.state?.from || '';
    const to = access.stateTo || action.state?.to || '';
    if (from || to) grant.transitions = [{ from: from || undefined, to: to || undefined }];
    if (to) grant.rule = { fact: 'primaryState', equals: to };
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
    // Types sharing one collection are separate grant identities — without
    // this, the second type's grant merges into the first and its screens
    // never infer.
    typeId: grant.typeId || null,
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
    // Native species records (cts.*) are executable graph citizens beside
    // the legacy effect.* kinds — the wiring context must see them or no
    // v5 graph derives arrival states, machine edges, or action windows.
    if (node.type !== 'action' && !String(processNode?.kind || '').match(/^(effect|cts)\./)) continue;
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
      if (parentOutput?.typeId) {
        parentIncomingByActionId.set(targetActionId, {
          typeId: parentOutput.typeId,
          state: parentOutput.state || '',
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
  if (!sourceHandle || sourceHandle === 'output') return outputs.find(output => output.typeId) || outputs[0] || null;
  const id = String(sourceHandle).replace(/^output:/, '');
  return outputs.find(output => output.id === id || output.handleId === sourceHandle)
    || outputs.find(output => output.typeId)
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
  const input = action.inputs?.find(item => item.typeId);
  if (!input) return null;
  return {
    typeId: input.typeId,
    state: input.state || '',
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
  const typeId = actionTypeId(action) || incoming?.typeId || '';
  const stateTo = actionTargetState(action, process) || access.stateTo || incoming?.status || '';
  const feature = typeId ? resolveEntityFeature(domain, typeId) : null;
  const inheritedRoleGrants = incoming?.roleGrants || grantsFromRoleIds(incoming?.roleIds || [], incoming?.level || access.level);
  const explicitRoleGrants = access.grants || grantsFromRoleIds(access.roleIds || [], access.level);
  const hasExplicitRoleGrants = hasExplicitActionRoleGrants(action.access);
  const useInherited = inheritedRoleGrants.length && (
    (kind === 'updateEntity' && Boolean(actionTargetState(action, process)) && !access.modified) ||
    (kind === 'runCommand' && !hasExplicitRoleGrants && !access.modified)
  );
  let roleGrants = useInherited ? inheritedRoleGrants : explicitRoleGrants;
  // A root create with no authored action roles of its own inherits its
  // producer output's create rights: write/admin `allowedRoles` open the
  // created-status window, so the class-level create action surfaces to the
  // roles that hold create rights on the type even when the action record
  // itself was never granted explicitly.
  if (!roleGrants.length && !useInherited && kind === 'createEntity' && !incoming) {
    roleGrants = producerOutputRoleGrants(process, action);
  }
  const roleIds = [...new Set(roleGrants.map(grant => grant.roleId).filter(Boolean))];
  const level = maxGrantLevel(roleGrants, useInherited ? (incoming.level || access.level) : access.level);
  const scope = deriveActionWindowScope(action, incoming, lineageBindings);
  const outputs = [];
  const grants = [];

  if (['createEntity', 'updateEntity'].includes(kind) && feature && typeId) {
    const status = kind === 'updateEntity'
      ? (actionTargetState(action, process) || incoming?.status || action.inputs?.find(input => input.status)?.status || '')
      : stateTo;
    const window = {
      id: outputSocketId(action, kind),
      handleId: outputHandleId(action, kind),
      typeId,
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
    const commandOutputs = commandOutputTypeIds(domain, action.commandId);
    for (const outputTypeId of commandOutputs) {
      const outputFeature = resolveEntityFeature(domain, outputTypeId);
      if (!outputFeature) continue;
      const outputScope = deriveCommandOutputScope(outputTypeId, incoming, lineageBindings);
      const window = {
        id: outputTypeId,
        handleId: `output:${outputTypeId}`,
        typeId: outputTypeId,
        feature: outputFeature,
        state: '',
        level,
        roleIds,
        roleGrants,
        scope: outputScope,
        sourcePath: [incoming?.sourcePath, actionId, outputTypeId].filter(Boolean).join('>')
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

// Create rights declared on the producer output profile (`allowedRoles`),
// flattened to explicit grant rows: admin roles keep admin, write roles
// that are not also admin get write.
function producerOutputRoleGrants(process = {}, action = {}) {
  const profile = action.producerOutputId
    ? (process.producerOutputs || {})[action.producerOutputId]
    : null;
  const allowed = profile?.allowedRoles || {};
  const admins = new Set(allowed.admin || []);
  return [
    ...[...admins].map(roleId => ({ roleId, level: 'admin' })),
    ...(allowed.write || [])
      .filter(roleId => !admins.has(roleId))
      .map(roleId => ({ roleId, level: 'write' }))
  ];
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
  return action.outputs?.find(output => output.typeId)?.id || (kind === 'createEntity' ? 'created' : 'entity');
}

function outputHandleId(action = {}, kind = '') {
  const outputs = action.outputs || [];
  if (outputs.length <= 1) return 'output';
  const id = outputSocketId(action, kind);
  const index = outputs.findIndex(output => output.id === id);
  return `output:${id || Math.max(index, 0)}`;
}

function effectiveActionParentTypeId(action = {}, incoming = null, lineageBindings = []) {
  const typeId = action.typeId || action.outputs?.find(output => output.typeId)?.typeId || '';
  const compiledParents = [...new Set(lineageBindings
    .filter(binding => binding.childTypeId === typeId && binding.parentTypeId)
    .map(binding => binding.parentTypeId))];
  const candidates = [
    ...compiledParents,
    incoming?.parentInput ? incoming.typeId : '',
    !incoming?.parentInput ? incoming?.typeId : ''
  ].filter(Boolean);

  for (const parentType of candidates) {
    if (!parentSupportedByLineage(lineageBindings, typeId, parentType)) continue;
    return parentType;
  }
  return '';
}

function parentSupportedByLineage(lineageBindings = [], typeId = '', parentType = '') {
  if (!typeId || !parentType) return false;
  return Boolean(parentRelationForChild(typeId, parentType, lineageBindings));
}

function actionInputsForExposure(action = {}, parentTypeId = '', domain = {}) {
  if (action.actionKind === 'runCommand') {
    return commandActionInputs(domain.commands?.[action.commandId] || {});
  }
  if ((action.actionKind || 'createEntity') !== 'createEntity') return action.inputs || [];
  const inputs = (action.inputs || []).map(input => {
    if (input.id !== 'parent') return input;
    return {
      ...input,
      label: parentTypeId || 'Parent entity',
      typeId: parentTypeId || '',
      required: false,
      state: parentTypeId ? input.state || '' : ''
    };
  });
  if (parentTypeId && !inputs.some(input => input.id === 'parent')) {
    inputs.unshift({
      id: 'parent',
      label: parentTypeId,
      typeId: parentTypeId,
      required: false
    });
  }
  const construction = normalizeConstruction(action.construction, action.typeId, domain) || { inputs: [] };
  const constructionInputs = new Map((construction.inputs || []).map(input => [input.id || input.path, input]));
  const contract = constructionContract(domain, action.typeId);
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
      typeId: input.type || '',
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
        typeId: input.type,
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
      typeId: input.typeId || '',
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
  const parentType = effectiveActionParentTypeId(action, incoming, lineageBindings);
  if (!parentType || !incoming) return inheritedScope;
  const parentKey = parentRelationForChild(action.typeId, parentType, lineageBindings)?.lineageKey;
  if (!parentKey) return inheritedScope;
  if (inheritedScope?.instanceId && !inheritedScope[parentKey]) {
    const { instanceId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [parentKey]: instanceId };
  }
  return inheritedScope;
}

function commandOutputTypeIds(domain = {}, commandId = '') {
  const output = domain.commands?.[commandId]?.output || {};
  return [...new Set((output.entities || []).map(entry => entry?.type).filter(Boolean))];
}

function deriveCommandOutputScope(outputTypeId = '', incoming = null, lineageBindings = []) {
  const inheritedScope = incoming?.scope ? { ...incoming.scope } : null;
  if (!incoming?.typeId) return inheritedScope;
  const relation = parentRelationForChild(outputTypeId, incoming.typeId, lineageBindings);
  if (!relation) return inheritedScope;
  if (inheritedScope?.instanceId && !inheritedScope[relation.lineageKey]) {
    const { instanceId, ...lineageScope } = inheritedScope;
    return { ...lineageScope, [relation.lineageKey]: instanceId };
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
  if (window.status) grant.rule = mergeGrantRules(dimensions.rule, { fact: 'primaryState', equals: window.status });
  if ((action.actionKind || 'createEntity') === 'updateEntity' && actionTargetState(action)) {
    const from = access.stateFrom || action.state?.from || '';
    const to = access.stateTo || action.state?.to || window.status || '';
    if (from || to) grant.transitions = [...(dimensions.transitions || []), { from: from || undefined, to: to || undefined }];
  }
  return grant;
}

function mergeGrantRules(left, right) {
  if (!left) return right;
  if (!right) return left;
  return { all: [left, right] };
}

function resolveEntityFeature(domain = {}, typeId) {
  const entity = (domain.entities || []).find(item => item.type === typeId);
  if (entity?.collection) return entity.collection;
  const fieldPolicy = getFieldPolicy(domain.fieldAccess || {}, typeId);
  if (fieldPolicy?.feature) return fieldPolicy.feature;
  return typeId;
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
      typeId: normalized.typeId || null,
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
  if (screen.template !== 'typeList' || source.mode !== 'list' || source.typeId !== screen.typeId) return source;
  return { ...source, lineageBindings: lineageBindings.map(binding => ({ ...binding })) };
}

function inferScreensFromRoleGrants({ screens = {}, roles = {}, domain = {}, producerOutputs = {}, actions = {}, graph = {}, lineageBindings = [] } = {}) {
  const inferred = {};
  const graphContext = buildActionGraphContext({ actions, graph });
  // Authored stations are per-kind deltas: an authored typeList or
  // instanceDetail suppresses only the inferred station it equals in kind,
  // while any other authored template for the role + feature stands in for
  // both generated stations (a chrome screen replaces the feature's
  // generated surfaces as a whole).
  const existingKeys = new Set(Object.values(screens).flatMap(screen => {
    const roleIds = screen.roleIds?.length ? screen.roleIds : Object.keys(roles);
    const feature = screen.required?.feature || featureFromTypeId(domain, screen.typeId);
    const station = screen.typeId || feature;
    if (!station) return [];
    const isList = screen.template === 'typeList' || screen.kind === 'typeList';
    const isDetail = screen.template === 'instanceDetail' || screen.kind === 'instanceDetail';
    const kinds = isList ? ['list'] : isDetail ? ['detail'] : ['list', 'detail'];
    return roleIds.flatMap(roleId => kinds.map(kind => `${roleId}:${station}:${kind}`));
  }));

  for (const [roleId, role] of Object.entries(roles)) {
    const grantsByFeature = groupGrantsByFeature(role.grants || []);
    for (const [feature, grants] of grantsByFeature) {
      // Grants derived from actions and producer outputs carry the entity
      // type they were authored against — inference emits one screen per
      // such type, so org-authored types sharing one collection (feature)
      // each get their own surface instead of collapsing onto an arbitrary
      // pack sibling. Feature-only grants keep the legacy resolution.
      const authoredTypes = [...new Set(grants.map(grant => grant.typeId).filter(Boolean))];
      const resolvedTypes = authoredTypes.length
        ? authoredTypes
        : [typeIdFromFeature(domain, feature) || typeIdFromProducerOutputs(producerOutputs, domain, feature)].filter(Boolean);
      for (const typeId of resolvedTypes) {
      const listSuppressed = existingKeys.has(`${roleId}:${typeId}:list`) || existingKeys.has(`${roleId}:${feature}:list`);
      const detailSuppressed = existingKeys.has(`${roleId}:${typeId}:detail`) || existingKeys.has(`${roleId}:${feature}:detail`);
      if (listSuppressed && detailSuppressed) continue;
      const id = `auto_${roleId}_${typeId}`;
      const detailId = `${id}_detail`;
      const required = aggregateScreenRequirement(feature, grants);
      const directActions = inferredScreenActions(role.actions || [], feature, typeId);
      const detailDirectActions = inferredDetailScreenActions(role.actions || [], feature, typeId);
      const childRegions = childRegionsForParentDetail({
        role,
        parentTypeId: typeId,
        domain,
        actions,
        graphContext,
        lineageBindings
      });
      const contextualActions = contextualParentActions(role.actions || [], typeId, domain, actions, graphContext, mergedHierarchyBindings(lineageBindings, domain));
      if (!listSuppressed) inferred[id] = {
        id,
        label: entityLabelOf(domain, typeId) || typeId,
        kind: 'typeList',
        template: 'typeList',
        placement: 'hub',
        typeId,
        required,
        roleIds: [roleId],
        sources: [{
          id: typeId,
          typeId,
          mode: 'list',
          required
        }],
        // Class-level actions (create) attach to the list's main region —
        // the surface the generator renders buttons on; screen-level
        // actions alone were never drawn.
        regions: [{
          id: 'main',
          slot: 'main',
          sourceId: typeId,
          surface: 'table',
          actions: directActions
        }],
        actions: directActions
      };
      if (!detailSuppressed) inferred[detailId] = {
        id: detailId,
        label: entityLabelOf(domain, typeId) || typeId,
        kind: 'instanceDetail',
        template: 'instanceDetail',
        placement: 'detail',
        typeId,
        required,
        roleIds: [roleId],
        sources: [{
          id: typeId,
          typeId,
          mode: 'single',
          required,
          identifier: '$screen.scope.instanceId'
        }, ...childRegions.sources],
        regions: [{
          id: 'main',
          slot: 'main',
          sourceId: typeId,
          surface: 'detail',
          actions: [...new Set([...detailDirectActions, ...contextualActions])]
        }, ...childRegions.regions],
        actions: [...new Set([...detailDirectActions, ...contextualActions, ...childRegions.actionIds])]
      };
      existingKeys.add(`${roleId}:${typeId}:list`);
      existingKeys.add(`${roleId}:${typeId}:detail`);
      }
      existingKeys.add(`${roleId}:${feature}:list`);
      existingKeys.add(`${roleId}:${feature}:detail`);
    }
  }

  return inferred;
}

// Crystallization Phase 4 — inference owns default stations. Detector for
// authored screens that are projection-equal to the station
// `inferScreensFromRoleGrants` would emit for the same role + type: such
// screens only suppress an identical inference and are hand-maintained
// slop. Pure comparison: the inference runs with an empty authored set
// (no existingKeys suppression), both sides project through
// `normalizeScreenContract`, and equivalence covers exactly the fields
// inference sets — any authored customization (label, route, bindings,
// extra sources/regions) makes the screen NOT redundant.
export function redundantAuthoredScreens(process = {}, domain = {}, compiledRoles = {}, lineageBindings = []) {
  const authored = process.screens || {};
  if (!Object.keys(authored).length || !Object.keys(compiledRoles || {}).length) return [];
  const pureInferred = inferScreensFromRoleGrants({
    screens: {},
    roles: compiledRoles,
    domain,
    producerOutputs: process.producerOutputs || {},
    actions: process.actions || {},
    graph: process.graph || {},
    lineageBindings
  });
  const inferredByKey = new Map();
  for (const candidate of Object.values(pureInferred)) {
    const roleId = candidate.roleIds?.[0];
    if (!roleId || !candidate.typeId) continue;
    inferredByKey.set(
      `${roleId}:${candidate.typeId}:${candidate.template}`,
      projectScreenForInferenceEquivalence(normalizeScreenContract(candidate))
    );
  }
  const redundant = [];
  const seen = new Set();
  for (const [id, screen] of Object.entries(authored)) {
    if (!screen || typeof screen !== 'object') continue;
    const normalized = normalizeScreenContract(screen);
    const roleIds = normalized.roleIds?.length ? normalized.roleIds : Object.keys(compiledRoles);
    for (const roleId of roleIds) {
      const key = `${roleId}:${normalized.typeId}:${normalized.template}`;
      const inferredProjection = inferredByKey.get(key);
      if (!inferredProjection || seen.has(id)) continue;
      const projection = projectScreenForInferenceEquivalence({ ...normalized, roleIds: [roleId] });
      if (canonicalJson(projection) === canonicalJson(inferredProjection)) {
        seen.add(id);
        redundant.push({ id, roleId, typeId: normalized.typeId, template: normalized.template });
      }
    }
  }
  return redundant;
}

// Script-facing wrapper: the same detection over a raw definition and
// the organization role catalog, without a prior validation pass (the
// sweep must run on definitions whose slop would fail validation).
export function detectRedundantScreens(definition = {}, domain = {}, roles = {}) {
  const process = normalizeProcessDefinition(definition, domain);
  const lineageBindings = compileLineageBindings(process, domain);
  const organizationRoles = normalizeRoleCatalog(roles);
  const compiledRoles = compileRoles(process, domain, organizationRoles, lineageBindings);
  return redundantAuthoredScreens(process, domain, compiledRoles, lineageBindings);
}

function projectScreenForInferenceEquivalence(screen = {}) {
  return {
    label: screen.label ?? null,
    kind: screen.kind ?? null,
    template: screen.template ?? null,
    placement: screen.placement ?? null,
    typeId: screen.typeId ?? null,
    required: screen.required ?? null,
    roleIds: [...(screen.roleIds || [])],
    sources: screen.sources || [],
    regions: screen.regions || [],
    actions: screen.actions || []
  };
}

// Canonical form for projection equivalence: null- and undefined-valued
// entries are absent. Inference's requirement aggregation spells "unset"
// grant conditions as undefined keys (`rule`, `scope`, `transitions`),
// while any JSON-persisted authored record drops them — null and absent
// are the same projection, and only non-null differences distinguish an
// override from inference slop.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter(key => value[key] !== null && value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

// Screen actions attach by the screen's entity type when the action knows
// one (org-type actions must not attach to a sibling type's screen through
// a shared feature); feature-only actions keep the feature match.
function actionTargetsScreenType(action = {}, typeId = '', feature = '') {
  return action.typeId ? action.typeId === typeId : action.feature === feature;
}

function inferredScreenActions(roleActions = [], feature, typeId = '') {
  return roleActions
    .filter(action => actionTargetsScreenType(action, typeId, feature))
    .map(action => action.actionId);
}

function inferredDetailScreenActions(roleActions = [], feature, typeId = '') {
  return roleActions
    .filter(action => actionTargetsScreenType(action, typeId, feature))
    .filter(action => (action.actionKind || 'createEntity') !== 'createEntity')
    .map(action => action.actionId);
}

function contextualParentActions(roleActions = [], parentTypeId = '', domain = {}, processActions = {}, graphContext = buildActionGraphContext({ actions: processActions }), lineageBindings = []) {
  return roleActions
    .filter((roleAction) => {
      const actionId = roleAction.actionId || roleAction.id;
      const processAction = processActions[actionId] || {};
      const parentIncoming = graphContext.parentIncomingByActionId.get(actionId);
      if (!isParentBoundCreateAction(roleAction, processAction, parentIncoming, lineageBindings)) return false;
      const actionParent = effectiveActionParentTypeId({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
      if (actionParent !== parentTypeId) return false;
      const childTypeId = roleAction.typeId || processAction.typeId || '';
      return !parentRelationForChild(childTypeId, parentTypeId, lineageBindings);
    })
    .map(action => action.actionId);
}

function isParentBoundCreateAction(roleAction = {}, processAction = {}, parentIncoming = null, lineageBindings = []) {
  const kind = roleAction.actionKind || processAction.actionKind || 'createEntity';
  const parentTypeId = effectiveActionParentTypeId({ ...processAction, ...roleAction }, parentIncoming, lineageBindings);
  return kind === 'createEntity' && Boolean(parentTypeId);
}

function childRegionsForParentDetail({ role = {}, parentTypeId = '', domain = {}, actions = {}, graphContext = buildActionGraphContext({ actions }), lineageBindings = [] } = {}) {
  const sourcesByEntity = new Map();
  const regions = [];
  const actionIds = [];
  const grantsByFeature = groupGrantsByFeature(role.grants || []);
  // Presentation placement reads the merged hierarchy: compiled lineage
  // bindings first, declared containment (children edges) filling pairs
  // the graph never composed.
  const hierarchy = mergedHierarchyBindings(lineageBindings, domain);
  const childRelations = lineageRelationsForParent(parentTypeId, hierarchy) || [];

  for (const relation of childRelations) {
    if (!relation.childType || !relation.lineageKey) continue;
    const childFeature = featureFromTypeId(domain, relation.childType);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    if (!childGrants.length) continue;
    ensureChildRegion({
      sourcesByEntity,
      regions,
      childTypeId: relation.childType,
      childFeature,
      childGrants,
      parentIdKey: relation.lineageKey
    });
  }

  for (const action of role.actions || []) {
    const actionId = action.actionId || action.id;
    const processAction = actions[actionId] || {};
    const kind = action.actionKind || processAction.actionKind || 'createEntity';
    const actionParent = effectiveActionParentTypeId({ ...processAction, ...action }, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
    const childTypeId = action.typeId || processAction.typeId || '';
    if (!childTypeId) continue;
    // A root create whose construction prompts a lineage parent belongs to
    // that parent's child region: the declared children edge makes the
    // pair valid and the picker binds the created child under the opened
    // parent.
    const constructionParent = constructionLineageParentTypeId({ ...processAction, ...action }, parentTypeId);
    if (kind !== 'createEntity' || (actionParent !== parentTypeId && constructionParent !== parentTypeId)) continue;
    const parentRelation = parentRelationForChild(childTypeId, parentTypeId, hierarchy)
      || (constructionParent === parentTypeId
        ? declaredParentRelation(childTypeId, parentTypeId, domain)
        : null);
    if (!parentRelation) continue;
    const childFeature = featureFromTypeId(domain, childTypeId);
    if (!childFeature) continue;
    const childGrants = grantsByFeature.get(childFeature) || [];
    const region = ensureChildRegion({
      sourcesByEntity,
      regions,
      childTypeId,
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

function ensureChildRegion({ sourcesByEntity, regions, childTypeId, childFeature, childGrants = [], parentIdKey } = {}) {
  const sourceId = `${childTypeId}_children`;
  if (!sourcesByEntity.has(sourceId)) {
    sourcesByEntity.set(sourceId, {
      id: sourceId,
      label: childTypeId,
      typeId: childTypeId,
      mode: 'list',
      required: aggregateScreenRequirement(childFeature, childGrants),
      filters: { [parentIdKey]: '$screen.scope.instanceId' }
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

// The parent a root create's construction prompts: a lineage input whose
// declared entity type matches the region parent (the org children-edge
// picker). Only the construction contract is consulted — graph parents
// still come from compiled lineage bindings.
function constructionLineageParentTypeId(action = {}, parentTypeId = '') {
  if (!parentTypeId) return '';
  return (action.construction?.inputs || [])
    .filter(input => String(input.id || input.path || '').startsWith('lineage.'))
    .some(input => input.typeId === parentTypeId || input.type?.typeId === parentTypeId)
    ? parentTypeId
    : '';
}

function declaredParentRelation(childTypeId = '', parentTypeId = '', domain = {}) {
  const triple = (domain.containment || []).find(candidate => (
    candidate.childType === childTypeId && candidate.parentType === parentTypeId
  ));
  return triple ? { childType: childTypeId, parentType: parentTypeId, lineageKey: triple.lineageKey } : null;
}

function parentRelationForChild(childTypeId = '', parentTypeId = '', lineageBindings = []) {
  const binding = lineageBindings.find(binding =>
    binding.childTypeId === childTypeId
    && (!parentTypeId || binding.parentTypeId === parentTypeId)
    && binding.lineageKey
  );
  if (!binding) return null;
  return { childType: binding.childTypeId, parentType: binding.parentTypeId, lineageKey: binding.lineageKey };
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

// Read-level requirements for inferred surfaces: lineage scope rides along
// (a read may be parent-scoped), but state-scoped grant windows — the status
// rules and transitions of state-changing actions — never do. A read list
// gated by a transition's target states hides every instance outside them
// (stateless instances, states the wiring no longer targets); those windows
// govern what a role may CHANGE. An authored status window on an authored
// screen keeps scoping its reads — only the implicit derivation dies here.
function aggregateScreenRequirement(feature, grants = []) {
  if (grants.length === 1) {
    const grant = grants[0];
    return {
      feature,
      level: 'read',
      scope: grant.scope
    };
  }
  const scopes = grants.map(grant => grant.scope).filter(Boolean);
  return {
    feature,
    level: 'read',
    ...(scopes.length === 1 ? { scope: scopes[0] } : {})
  };
}

// Grant features resolve to a type by exact type identity only. The
// per-class collection names ('files', 'items', 'groups', 'processes')
// are shared by every type of that class by design: attributing a
// collection-level feature to whichever type composes first is mount
// order dependent, so a shared collection attributes a screen only when
// exactly one non-meta type stores in it — otherwise the grant carries
// no attributable entity and inference skips it.
function typeIdFromFeature(domain = {}, feature) {
  const entities = (domain.entities || []).filter(entity => !entity.meta);
  const exact = entities.filter(entity => entity.type === feature || `${entity.type}s` === feature);
  if (exact.length === 1) return exact[0].type;
  if (exact.length > 1) return null;
  const sharers = entities.filter(entity => entity.collection === feature);
  return sharers.length === 1 ? sharers[0].type : null;
}

function typeIdFromProducerOutputs(producerOutputs = {}, domain = {}, feature) {
  const typeId = Object.values(producerOutputs)
    .find(profile => resolveEntityFeature(domain, profile.typeId) === feature)
    ?.typeId || null;
  const definition = (domain.entities || []).find(entity => entity.type === typeId);
  return definition?.meta ? null : typeId;
}

function entityLabelOf(domain = {}, typeId = '') {
  return (domain.entities || []).find(entity => entity.type === typeId)?.label || null;
}

function featureFromTypeId(domain = {}, typeId) {
  if (!typeId) return null;
  return resolveEntityFeature(domain, typeId);
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
    typeId: screen.typeId || null,
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
  const typeId = screen.typeId;
  if (!String(screen.id || '').startsWith('auto_') || !typeId) return screen.screenKey || screen.id;
  const suffix = screen.template === 'instanceDetail' ? '_detail' : '';
  const scopeValues = Object.values(screen.scope || {}).filter(value => value !== undefined && value !== null && value !== '');
  return [`auto_${typeId}${suffix}`, ...scopeValues].filter(Boolean).map(String).join(':');
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
    source.typeId || source.typeId || source.id,
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
        relation.ownerType === profile.typeId && (profile.relations || []).includes(relation.key)
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
    typeId: socket.typeId || null,
    projection: socket.projection || { fields: [], excludeFields: [] },
    receiverLifecycle: socket.receiverLifecycle || { mode: 'defaultCreated', workflow: null },
    access: {
      sendRoles: socket.access?.sendRoles || [],
      receiveRoles: socket.access?.receiveRoles || []
    },
    inputs: socket.direction === 'inbound'
      ? []
      : [{ id: 'entity', typeId: socket.typeId, required: true }],
    outputs: socket.direction === 'inbound'
      ? [{ id: 'received', typeId: socket.typeId, status: initialSocketStatus(socket) }]
      : [{ id: 'projection', typeId: socket.typeId, projection: true, fields: socket.projection?.fields || [] }]
  }]));
}

function initialSocketStatus(socket = {}) {
  const lifecycle = socket.receiverLifecycle || {};
  if (lifecycle.mode === 'custom' && lifecycle.workflow) {
    const workflow = normalizeWorkflow(lifecycle.workflow);
    const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
    return region?.initial || '';
  }
  return '';
}

export function compileActions(actions = {}, process = {}, domain = {}, lineageBindings = []) {
  const graphContext = buildActionGraphContext(process);
  const actionWindows = compileActionAccessWindows(process, domain, lineageBindings);
  return Object.fromEntries(Object.entries(actions).map(([id, action]) => {
    const parentTypeId = effectiveActionParentTypeId(action, graphContext.parentIncomingByActionId.get(id), lineageBindings);
    const actionWindow = actionWindows.get(id);
    const resolvedTypeId = actionTypeId(action) || actionWindow?.input?.typeId || actionWindow?.outputs?.[0]?.typeId || null;
    if (resolvedTypeId && !action.producerOutputId && action.actionKind === 'createEntity') {
      throw new Error(`Action ${id} requires producerOutputId`);
    }
    const producerOutput = action.producerOutputId ? process.producerOutputs?.[action.producerOutputId] : null;
    if (action.producerOutputId && !producerOutput) throw new Error(`Action ${id} uses unknown producerOutputId ${action.producerOutputId}`);
    if (producerOutput && producerOutput.typeId !== resolvedTypeId) {
      throw new Error(`Action ${id} producerOutputId emits ${producerOutput.typeId}, not ${resolvedTypeId}`);
    }
    const normalizedAction = resolvedTypeId && !action.typeId ? { ...action, typeId: resolvedTypeId } : action;
    const inputs = actionInputsForExposure(normalizedAction, parentTypeId, domain).map(input => (
      input.id === 'entity' && !input.typeId && resolvedTypeId ? { ...input, typeId: resolvedTypeId } : input
    ));
    const outputs = action.outputs || [];
    return [id, {
      id: action.id || id,
      // The domain resolves the target entity's authored render label —
      // raw type ids never reach button captions on this channel either.
      label: displayActionLabel(action, id, process, domain),
      actionKind: action.actionKind || 'createEntity',
      producerOutputId: action.producerOutputId || null,
      typeId: resolvedTypeId,
      parentTypeId: parentTypeId || null,
      parentRevision: resolveParentRevision(action.parentRevision, parentTypeId, domain),
      commandId: action.commandId || null,
      state: compileActionStatus(action, process, wiringArrivalState(id, normalizedAction, resolvedTypeId, graphContext, actionWindows)),
      mutation: action.mutation || { fields: [] },
      relationMutation: action.relationMutation || null,
      projection: action.projection || null,
      // The construction contract is the create form: only create actions
      // carry it. Hydrating the type's default contract onto deletes and
      // transitions opened the create dialog for every non-create action
      // (planActionLaunch keys off construction.inputs).
      construction: (action.actionKind || 'createEntity') === 'createEntity'
        ? normalizeConstruction(action.construction, action.typeId, domain)
        : null,
      inputPolicy: compiledInputPolicy(action, domain),
      stateRef: action.stateRef || null,
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
    .filter(input => input.typeId)
    .map(input => ({
      id: input.id || 'entity',
      kind: input.multiple ? 'entity_list' : 'entity',
      typeId: input.typeId,
      required: false,
      state: input.state || null,
      relationKey: input.relationKey || null,
      cardinality: input.cardinality || null
    }));
  const outputContracts = outputs
    .filter(output => output.typeId)
    .map(output => ({
      id: output.id || 'entity',
      kind: output.multiple ? 'entity_list' : 'entity',
      typeId: output.typeId,
      state: output.state || null
    }));
  const typeId = actionTypeId(action);
  if (action.actionKind === 'createEntity' && typeId && !outputContracts.some(contract => contract.typeId === typeId)) {
    outputContracts.push({ id: 'created', kind: 'entity', typeId, state: actionTargetState(action) || null });
  }
  if (action.actionKind === 'updateEntity' && typeId) {
    if (!inputContracts.some(contract => contract.typeId === typeId)) {
      inputContracts.unshift({ id: 'entity', kind: 'entity', typeId, required: false, state: actionWindow?.input?.state || null });
    }
    if (!outputContracts.some(contract => contract.typeId === typeId)) {
      outputContracts.push({ id: 'entity', kind: 'entity', typeId, status: actionTargetState(action) || actionWindow?.outputs?.[0]?.state || null });
    }
  }
  if (action.actionKind === 'runCommand') {
    for (const outputType of commandOutputTypeIds(domain, action.commandId)) {
      if (!outputContracts.some(contract => contract.typeId === outputType)) {
        outputContracts.push({ id: outputType, kind: 'entity_list', typeId: outputType, status: null });
      }
    }
  }
  return { inputs: inputContracts, outputs: outputContracts };
}

function compileActionStatus(action = {}, process = {}, wiredFrom = '') {
  const target = actionTargetState(action, process);
  const metadata = action.stateRef ? stateDefinitionMetadata(process.stateDefinitions?.[action.stateRef]) : {};
  return {
    ...(action.state || {}),
    ...metadata,
    ...(target ? { to: target } : {}),
    // The wiring's arrival state scopes the action to the states its
    // transition is declared from — the same fact the machine edge
    // derives. An authored from wins (legacy reference data); a wiring
    // with several arrival states stays unscoped on the manifest (the
    // machine still guards execution server-side).
    ...(!action.state?.from && wiredFrom ? { from: wiredFrom } : {})
  };
}

// The declared transition sources of a status-mutating action: incoming
// entity-edge status windows, narrowed to an authored `from` when legacy
// reference data carries one. The ONE derivation the machine edges, the
// action window, and run availability consume — no consumer re-derives
// the wiring independently.
function declaredTransitionSources(actionId, action = {}, typeId = '', graphContext, actionWindows) {
  if ((action.actionKind || 'createEntity') !== 'updateEntity') return [];
  // Every arrival window on the action's entity wires declares an edge —
  // a loop-back wire is as real as the first one — and an authored `from`
  // is a fallback for legacy data without wires, never a filter on the
  // wiring.
  return workflowTransitionSources(actionId, action, typeId, graphContext, actionWindows);
}

// The single arrival state the wiring declares, when unambiguous — the
// manifest's scoping fact. State-bound effects of every kind scope by
// it: a delete wired from one state renders only there (per-state delete
// buttons), exactly like an update's transition window. The machine-edge
// derivation (declaredTransitionSources) stays update-only — deletes
// author no machine edges.
function wiringArrivalState(actionId, action = {}, typeId = '', graphContext, actionWindows) {
  const sources = workflowTransitionSources(actionId, action, typeId, graphContext, actionWindows);
  return sources.length === 1 ? sources[0].status : '';
}

function actionTargetState(action = {}, process = {}) {
  const stateRef = action.stateRef;
  const referenced = stateRef ? process.stateDefinitions?.[stateRef] : null;
  return referenced?.stateId
    || action.state?.to
    || action.access?.stateTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function stateDefinitionMetadata(definition = {}) {
  if (!definition) return {};
  return {
    ...(definition.label ? { label: definition.label } : {}),
    ...(definition.color || definition.severity ? { color: definition.color || definition.severity } : {}),
    ...(definition.severity || definition.color ? { severity: definition.severity || definition.color } : {}),
    ...(definition.icon ? { icon: definition.icon } : {})
  };
}

function compileStatusDefinitions(stateDefinitions = {}) {
  return Object.fromEntries(Object.entries(stateDefinitions).map(([id, definition]) => [id, {
    id: definition.id || id,
    typeId: definition.typeId || '',
    stateId: definition.stateId || definition.id || id,
    label: definition.label || definition.stateId || id,
    color: definition.color || '',
    severity: definition.severity || definition.color || '',
    icon: definition.icon || '',
    region: definition.region || '',
    parentStatusId: definition.parentStatusId || '',
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
    typeId: node.typeId || '',
    relationTypeId: node.relationTypeId || '',
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

function normalizeConstruction(construction = {}, typeId = '', domain = {}) {
  const contract = constructionContract(domain, typeId);
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
    // Declared inputs may re-carry the authored 'userCreatable' selector
    // over the contract's expanded kinds; one final idempotent pass keeps
    // every emitted creator on the canonical expanded [{ kind, creation }]
    // shape whatever the action node declared.
    inputs: [...inputsById.values()].map(input => normalizeConstructionInput(input, domain))
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

function resolveParentRevision(parentRevision = {}, parentTypeId = '', domain = {}) {
  const contract = domain.revisions?.[parentTypeId] || {};
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

function normalizeActionInputPolicy(inputPolicy = {}, construction = {}, typeId = '', domain = {}) {
  const normalizedConstruction = normalizeConstruction(construction, typeId, domain) || { inputs: [] };
  const policyFields = Array.isArray(inputPolicy.fields) ? inputPolicy.fields : [];
  const fieldsById = new Map(
    normalizedConstruction.inputs
      .filter(input => input.prompt)
      .map(input => [input.id || input.path, { ...input }])
  );
  // One prompt row per addressed value: a policy field keyed `field:<path>`
  // addresses the same value as the construction input carrying that path,
  // so it merges into that input instead of adding a second row.
  const keyOfConstructionPath = path => {
    const input = normalizedConstruction.inputs.find(candidate => (candidate.id || candidate.path) === path);
    return input ? (input.id || input.path) : null;
  };
  for (const field of policyFields) {
    const key = field.id || field.path;
    const constructionKey = keyOfConstructionPath(field.path) || key;
    const constructionField = normalizedConstruction.inputs.find(input => (input.id || input.path) === constructionKey);
    if (constructionContract(domain, typeId)?.derived && !constructionField) continue;
    const merged = constructionField
      ? mergeConstructionInput(constructionField, field)
      : {
          ...(fieldsById.get(constructionKey) || {}),
          ...field,
          ...(constructionKey !== key ? { id: constructionKey } : {})
        };
    if (merged.prompt || !constructionField) fieldsById.set(constructionKey, { ...merged, ...(constructionKey !== key ? { id: constructionKey } : {}) });
    else fieldsById.delete(constructionKey);
  }
  const fields = [...fieldsById.values()].map(field => normalizeConstructionInput(field, domain));
  return {
    prompt: inputPolicy.prompt !== false && fields.some(field => field.prompt),
    fields
  };
}

function compiledInputPolicy(action = {}, domain = {}) {
  return (action.actionKind || 'createEntity') === 'createEntity'
    ? normalizeActionInputPolicy(action.inputPolicy, action.construction, action.typeId, domain)
    : normalizeInputPolicy(action.inputPolicy);
}

function displayActionLabel(action = {}, id = '', process = {}, domain = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericActionLabel(explicit, action.actionKind)) return explicit;

  const typeId = action.typeId
    || action.inputs?.find(input => input.typeId)?.typeId
    || action.outputs?.find(output => output.typeId)?.typeId
    || '';
  if ((action.actionKind || 'createEntity') === 'createEntity') {
    // The create caption names the target class only: the initial state is
    // process machinery the surface reveals after creation, never button copy.
    return ['Create', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'updateEntity') {
    if (actionTargetState(action, process)) return stateTargetLabel(action, process) || ['Move', typeIdLabel(domain, typeId), action.state?.to].filter(Boolean).join(' ');
    return ['Update', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'deleteEntity') {
    return ['Delete', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'runCommand') {
    return ['Run', action.commandId].filter(Boolean).join(' ');
  }
  if (action.actionKind === 'sendToOrganization') {
    return ['Send', typeIdLabel(domain, typeId)].filter(Boolean).join(' ');
  }
  return action.actionKind || id;
}

function stateTargetLabel(action = {}, process = {}) {
  const referenced = action.stateRef ? process.stateDefinitions?.[action.stateRef] : null;
  return referenced?.label
    || referenced?.stateId
    || action.state?.label
    || action.state?.to
    || action.access?.stateTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function isGenericActionLabel(label, actionKind = '') {
  const normalized = label.trim().toLowerCase();
  // Raw node-kind strings the designer saves as default labels are
  // machinery vocabulary, not captions — every species spelling (v5
  // cts.* and the retired v4 effect.*) included: a caption that is just
  // the record's kind derives from the action kind below.
  const generic = new Set([
    'create', 'status', 'service', 'update', 'send', 'action',
    'cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove',
    'cts.read', 'cts.field', 'cts.command', 'cts.service', 'cts.conversion',
    'effect.createentity', 'effect.runproducer', 'effect.updateentity',
    'effect.changestatus', 'effect.archiveentity', 'effect.deleteentity',
    'effect.runcommand', 'effect.sendentity',
    actionKind?.toLowerCase?.()
  ].filter(Boolean));
  return generic.has(normalized);
}

function typeIdLabel(domain = {}, typeId = '') {
  if (!typeId) return '';
  return entityLabelOf(domain, typeId) || typeId.replace(/_/g, ' ');
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
    stateFrom: typeof access.stateFrom === 'string' ? access.stateFrom : '',
    stateTo: typeof access.stateTo === 'string' ? access.stateTo : ''
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

function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors, stateDefinitions = {}, process = {}, lineageBindings = [] }) {
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
    if (!action.typeId) errors.push(`Action ${actionId} must select an entity type`);
    if (action.typeId && !entities.has(action.typeId)) errors.push(`Action ${actionId} uses unknown entity type ${action.typeId}`);
  }
  if (action.parentTypeId && !entities.has(action.parentTypeId)) {
    errors.push(`Action ${actionId} uses unknown parent entity type ${action.parentTypeId}`);
  }
  const hasTargetStatus = Boolean(action.state?.to || (action.stateRef && stateDefinitions[action.stateRef]));
  if (kind === 'createEntity') {
    validateConstruction(actionId, action, domain, errors);
    validateParentRevision(actionId, action, domain, errors, process, lineageBindings);
  }
  if (kind === 'updateEntity') {
    const typeId = action.inputs?.find(input => input.typeId)?.typeId || action.typeId || inferConnectedActionTypeId(actionId, process);
    if (!typeId) errors.push(`Action ${actionId} must receive an entity input`);
    if (typeId && !entities.has(typeId)) errors.push(`Action ${actionId} input uses unknown entity type ${typeId}`);
    const processRelationFields = new Set((action.mutation?.relationContracts || []).map(relation => `relations.${relation.key}`));
    const policyFields = (action.mutation?.fields || []).filter(field => !processRelationFields.has(field));
    validateFieldList(
      policyFields,
      domain,
      typeId,
      `action ${actionId} update fields`,
      errors,
      normalizedAccess.level
    );
    validateMutationGrantLevels(actionId, policyFields, domain, typeId, normalizedAccess.grants, errors);
    if (!(action.mutation?.fields || []).length && !hasTargetStatus) {
      errors.push(`Action ${actionId} must connect at least one writable field, relation, or status`);
    }
  }
  if (kind === 'archiveEntity' || kind === 'deleteEntity') {
    const typeId = action.typeId || action.inputs?.find(input => input.typeId)?.typeId || inferConnectedActionTypeId(actionId, process);
    if (!typeId) errors.push(`Action ${actionId} must receive an entity input`);
    if (typeId && !entities.has(typeId)) errors.push(`Action ${actionId} input uses unknown entity type ${typeId}`);
    if (kind === 'deleteEntity' && normalizedAccess.level !== 'admin') errors.push(`Action ${actionId} must use admin access for hard deletion`);
    if (kind === 'deleteEntity' && (action.trigger?.mode || 'manual') !== 'manual') errors.push(`Action ${actionId} hard deletion must be manual`);
  }
  const canInheritAccess = kind === 'runCommand' && action.inputs?.some(input => input.typeId);
  if ((!action.access && !canInheritAccess) || !Array.isArray(normalizedAccess.grants) || !['read', 'write', 'admin'].includes(normalizedAccess.level)) {
    errors.push(`Action ${actionId} must define access grants`);
  }
  if (kind === 'sendToOrganization') {
    validateFieldList(action.projection?.fields, domain, action.typeId, `action ${actionId} projection fields`, errors);
    validateFieldList(action.projection?.excludeFields, domain, action.typeId, `action ${actionId} excluded fields`, errors);
  }
  const triggerMode = action.trigger?.mode || 'manual';
  if (!['manual', 'event', 'date', 'entityChanged', 'domainEvent'].includes(triggerMode)) {
    errors.push(`Action ${actionId} uses unknown trigger mode ${triggerMode}`);
  }
  for (const roleId of normalizedAccess.roleIds) {
    if (!roles[roleId]) errors.push(`Action ${actionId} references missing access role ${roleId}`);
  }
  if (action.stateRef && !stateDefinitions[action.stateRef]) {
    errors.push(`Action ${actionId} references missing status definition ${action.stateRef}`);
  }
}

function validateParentRevision(actionId, action = {}, domain = {}, errors = [], process = {}, lineageBindings = []) {
  if (action.parentRevision?.enabled !== true) return;
  const graphContext = buildActionGraphContext(process);
  const parentTypeId = effectiveActionParentTypeId(action, graphContext.parentIncomingByActionId.get(actionId), lineageBindings);
  if (!parentTypeId) {
    errors.push(`Action ${actionId} cannot pin a revision without a declared containment parent`);
    return;
  }
  const contract = domain.revisions?.[parentTypeId];
  if (!contract?.scopes?.length) {
    errors.push(`Action ${actionId} cannot pin ${parentTypeId}; the entity has no revision contract`);
    return;
  }
  const scope = action.parentRevision.scope || contract.defaultScope;
  if (!contract.scopes.includes(scope)) {
    errors.push(`Action ${actionId} uses unknown ${parentTypeId} revision scope ${scope || '(empty)'}`);
  }
}

function inferConnectedActionTypeId(actionId, process = {}) {
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
    const sourceType = sourceAction && actionTypeId(sourceAction);
    if (sourceType) return sourceType;
  }
  return '';
}

function validateEffectCapabilities(process = {}, domain = {}, capabilities = {}, errors = []) {
  for (const [nodeId, node] of Object.entries(process.processNodes || {})) {
    if (!node.typeId) continue;
    const capability = requiredEffectCapability(node.kind);
    if (!capability) continue;
    if (capability === 'statusMutation') {
      if (!domain.workflows?.[node.typeId]) {
        errors.push(`Process node ${nodeId} cannot change ${node.typeId}: entity has no status workflow`);
      }
      continue;
    }
    const record = capabilities[node.typeId];
    if (capability === 'create') {
      const construction = normalizeConstruction(node.construction, node.typeId, domain);
      const mode = construction?.mode || '';
      if (!record || !(Array.isArray(record.createModes) ? record.createModes : []).includes(mode)) {
        errors.push(`Process node ${nodeId} cannot create ${node.typeId} with construction mode ${mode || '(none)'}: no registered runtime handler`);
      }
      continue;
    }
    if (!record || record[capability] !== true) {
      const verb = capability === 'delete' ? 'delete' : capability === 'archive' ? 'archive' : 'update';
      errors.push(`Process node ${nodeId} cannot ${verb} ${node.typeId}: entity service lacks ${capability} support`);
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
  for (const key of ['typeId', 'relationTypeId']) {
    if (node[key] && !entities.has(node[key])) {
      errors.push(`Process node ${nodeId} uses unknown ${key} ${node[key]}`);
    }
  }
  if ([
    'entityQuery', 'entityRef', 'entityDecompose', 'entityField', 'entityFilter', 'entitySelect', 'entityCompose', 'entityModify', 'entityCondition', 'predicateLogic',
    'blockRead', 'blockCompose', 'blockModify'
  ].includes(kind) && !node.typeId) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.block) {
    errors.push(`Process node ${nodeId} must select a canonical block`);
  }
  if (node.block && ['entityModify', 'blockRead', 'blockCompose', 'blockModify'].includes(kind)
    && !entityBlocks(domain, node.typeId).includes(node.block)) {
    errors.push(`Process node ${nodeId} uses block ${node.block} outside ${node.typeId}`);
  }
  if (kind === 'entityRef' && node.mode === 'related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.typeId && item.key === node.relationKey);
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.typeId}`);
    if (relation && node.relationTypeId && node.relationTypeId !== relation.targetType) {
      errors.push(`Process node ${nodeId} relation ${node.relationKey} must target ${relation.targetType}`);
    }
  }
  if (['entityField', 'blockRead', 'blockCompose', 'blockModify'].includes(kind) && !node.path) errors.push(`Process node ${nodeId} must define a field path`);
  if (node.path && ['entityField', 'blockRead'].includes(kind)) {
    validateFieldList([node.path], domain, node.typeId, `process node ${nodeId} field`, errors, 'read');
  }
  if (node.path && ['blockCompose', 'blockModify'].includes(kind)) {
    validateFieldList([node.path], domain, node.typeId, `process node ${nodeId} field`, errors, 'write');
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
    validateFieldList([node.path], domain, node.typeId, `process node ${nodeId} field`, errors, 'read');
  }
}

function validateDataflowProcessNode(nodeId, node, { entities, domain, errors }) {
  const definition = getProcessNodeDefinition(node.kind);
  if (!definition) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${node.kind}`);
    return;
  }
  const classification = effectKindOf(node);
  if (node.typeId && !entities.has(node.typeId)) {
    errors.push(`Process node ${nodeId} uses unknown typeId ${node.typeId}`);
  }
  if (processNodeRequiresTypeId(node.kind) && !node.typeId) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (node.kind === 'cts.field') {
    const fieldPath = String(authoredSocketDefault(node.inputDefaults?.field) || '');
    if (!fieldPath) errors.push(`Process node ${nodeId} must select a field`);
    if (fieldPath && node.typeId && !entityFieldSchema(domain, node.typeId, fieldPath)) {
      errors.push(`Process node ${nodeId} uses undeclared field ${fieldPath}`);
    }
  }
  if (['record.getField', 'record.fieldChange', 'predicate.field'].includes(node.kind)) {
    if (!node.path) errors.push(`Process node ${nodeId} must select a field`);
    const openBlock = node.kind === 'record.getField' ? domain.blockComposition?.[node.block] : null;
    const schema = node.kind === 'record.getField'
      ? structuralFieldSchema(domain, node.path)
      : entityFieldSchema(domain, node.typeId, node.path);
    if (node.path && !schema && !openBlock) errors.push(`Process node ${nodeId} uses undeclared field ${node.path}`);
    if (openBlock && node.path && !String(node.path).startsWith(`${node.block}.`)) {
      errors.push(`Process node ${nodeId} field ${node.path} does not belong to block ${node.block}`);
    }
    if (openBlock?.mode === 'ancestors') {
      if (node.type?.base !== 'entityRef' || !entities.has(node.type.typeId)) {
        errors.push(`Process node ${nodeId} must select a lineage entity type`);
      }
    }
    if (openBlock?.mode === 'relations') {
      const typeId = node.type?.base === 'array' ? node.type.itemType?.typeId : node.type?.typeId;
      const validType = node.type?.base === 'entityRef'
        || (node.type?.base === 'array' && node.type.itemType?.base === 'entityRef');
      if (!validType || !entities.has(typeId)) errors.push(`Process node ${nodeId} must select a relation entity type`);
    }
    if (schema && node.kind === 'record.fieldChange' && schema.writable === false) {
      errors.push(`Process node ${nodeId} cannot modify read-only field ${node.typeId}.${node.path}`);
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
    && node.typeId && entities.has(node.typeId)) {
    const declaredBlocks = entityBlocks(domain, node.typeId);
    const selectedBlocks = node.kind === 'record.getBlock' ? [node.block].filter(Boolean) : (node.blocks || []);
    for (const block of selectedBlocks) {
      if (!declaredBlocks.includes(block)) {
        errors.push(`Process node ${nodeId} uses block ${block} outside ${node.typeId}`);
      }
    }
  }
  if (['effect.createEntity', 'effect.updateEntity'].includes(classification)) {
    const stateTarget = processDefaultValue(node.inputDefaults?.state)
      || processDefaultValue(node.inputDefaults?.['states.main'])
      || node.state?.to || node.stateRef;
    if (classification === 'effect.updateEntity' && node.kind !== 'cts.mutate' && !node.blocks?.length && !stateTarget) {
      errors.push(`Process node ${nodeId} must accept at least one writable block or status`);
    }
    if (classification === 'effect.createEntity') {
      const construction = normalizeConstruction(node.construction, node.typeId, domain);
      const contract = constructionContract(domain, node.typeId);
      if (!contract || !construction) {
        errors.push(`Process node ${nodeId} cannot create ${node.typeId}: entity has no construction contract`);
      } else {
        if (!contract.modes.includes(construction.mode)) {
          errors.push(`Process node ${nodeId} cannot create ${node.typeId} with construction mode ${construction.mode}`);
        }
        if (contract.derived && construction.mode === 'genericCreate') {
          errors.push(`Process node ${nodeId} must use a typed construction mode for derived entity ${node.typeId}`);
        }
      }
    }
    const allowedBlocks = new Set(entityFieldSchemas(domain, node.typeId)
      .filter(field => classification === 'effect.createEntity'
        ? field.constructible !== false
        : field.writable !== false)
      .map(field => field.block));
    if (classification === 'effect.createEntity') {
      for (const block of entityBlocks(domain, node.typeId)) {
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
  if (classification === 'effect.runProducer') {
    const construction = normalizeConstruction(node.construction, node.typeId, domain);
    const contract = constructionContract(domain, node.typeId);
    if (!(domain.producers || []).some(producer => producer.id === node.producerId)) {
      errors.push(`Process node ${nodeId} must select a registered producer`);
    }
    if (!contract || !construction || !contract.modes.includes(construction.mode) || construction.mode === 'genericCreate') {
      errors.push(`Process node ${nodeId} must use a declared service construction mode for ${node.typeId}`);
    }
  }
  if (isEffectRecord(node) && !['manual', 'event'].includes(node.trigger?.mode || 'manual')) {
    errors.push(`Process node ${nodeId} uses unknown trigger mode ${node.trigger?.mode}`);
  }
  if (node.type) {
    try {
      normalizeProcessType(sanitizeProcessType(node.type));
    } catch (error) {
      errors.push(`Process node ${nodeId} has invalid type: ${error.message}`);
    }
  }
  if (node.kind === 'cts.read' && node.select === 'related') {
    const relation = (domain.relations || []).find(item => item.ownerType === node.typeId && item.key === (node.relationKey || node.relation));
    if (!relation) errors.push(`Process node ${nodeId} must select a declared relation for ${node.typeId}`);
  }
  if (classification === 'effect.runCommand' && (!node.commandId || !domain.commands?.[node.commandId])) {
    errors.push(`Process node ${nodeId} must select a registered command`);
  }
  try {
    resolveCatalogNodePorts(node, {
      fieldSchema: processNodeUsesStructuralFields(node.kind)
        ? structuralFieldSchema(domain, node.path)
        : entityFieldSchema(domain, node.typeId, node.path),
      fieldSchemas: processNodeUsesStructuralFields(node.kind)
        ? blockFieldSchemas(domain, node.block)
        : entityFieldSchemas(domain, node.typeId),
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
      if (!entry.typeId || !entities.has(entry.typeId)) {
        errors.push(`Process node ${nodeId} entry ${entry.id || '(unknown)'} must select an entity type`);
      }
    }
    const key = String(entry.key || '').trim();
    if (!key || keys.has(key)) errors.push(`Process node ${nodeId} has a missing or duplicate entry key`);
    keys.add(key);
    if (composition.mode === 'relations' && entry.attachmentKinds?.length) {
      const kinds = new Map(Object.values(domain.attachmentKinds || {}).map(kind => [kind.kind || kind.id, kind]));
      const targetHasAttachmentKinds = Object.values(domain.attachmentKinds || {}).some(kind => (
        (Array.isArray(kind.typeIds) ? kind.typeIds.includes(entry.typeId) : true)
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
    const edgeSourceTypeId = sourcePort.type?.typeId || sourcePort.type?.itemType?.typeId || '';
    const edgeSourceProducerId = edgeSourceTypeId
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
      const targetBlocks = new Set(entityBlocks(domain, targetRecord.typeId));
      const sourcePaths = sourceRecord.compositionMode
        ? (sourceRecord.entries || []).map(entry => `${sourceRecord.block}.${entry.key}`).filter(path => !path.endsWith('.undefined'))
        : (sourceRecord.fields || []);
      for (const path of sourcePaths) {
        const targetSchemas = entityFieldSchemas(domain, targetRecord.typeId)
          .filter(field => field.block === sourceRecord.block);
        const targetSchema = entityFieldSchema(domain, targetRecord.typeId, path);
        const openBlockAccepted = targetRecord.kind === 'effect.createEntity'
          && Boolean(sourceRecord.compositionMode)
          && targetBlocks.has(sourceRecord.block)
          && !['origin', 'status', 'provenance', 'summary'].includes(sourceRecord.block);
        const openRelationsAccepted = sourceRecord.compositionMode === 'relations'
          && targetSchemas.some(field => field[requiredAccess] !== false);
        const wholeBlockAccepted = path === sourceRecord.block
          && targetSchemas.some(field => field[requiredAccess] !== false);
        if (!openBlockAccepted && !openRelationsAccepted && !wholeBlockAccepted && (!targetSchema || targetSchema[requiredAccess] === false)) {
          push(`Edge ${edge.id} cannot send ${path} to ${targetRecord.typeId}: field is not ${requiredAccess}`,
            { edgeId: edge.id, nodeId: String(edge.target), socketId: targetPort.id });
        }
        if (sourceRecord.compositionMode && sourceRecord.compositionMode !== 'relations' && targetSchema) {
          const key = path.slice(sourceRecord.block.length + 1);
          const entry = (sourceRecord.entries || []).find(item => item.key === key);
          const sourceType = openCompositionEntryType(entry, sourceRecord.compositionMode, sourceRecord.compositionValueBase);
          if (sourceType && !processTypesEquivalent(sourceType, targetSchema.type)) {
            push(`Edge ${edge.id} cannot send ${path} to ${targetRecord.typeId}: composed entry type does not match the entity field`,
              { edgeId: edge.id, nodeId: String(edge.target), socketId: targetPort.id });
          }
        }
      }
    }
    if (compatibility.ok) {
      const portTypeId = sourcePort.type?.typeId || sourcePort.type?.itemType?.typeId || '';
      const portEntityStream = sourcePort.type?.base === 'entity'
        || (sourcePort.type?.base === 'array' && sourcePort.type?.itemType?.base === 'entity');
      if (portEntityStream && portTypeId) {
        const producerOutputId = resolveSourceProducerOutputId(process, sourceRecord, sourcePort);
        if (producerOutputId) {
          entityEdgesByTarget.set(targetRecord.id, [
            ...(entityEdgesByTarget.get(targetRecord.id) || []),
            { edgeId: edge.id, socketId: targetPort.id, producerOutputId, typeId: portTypeId }
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
      let producers = byType.get(entry.typeId);
      if (!producers) {
        producers = new Map();
        byType.set(entry.typeId, producers);
      }
      producers.set(entry.producerOutputId, entry);
    }
    for (const [typeId, producers] of byType) {
      if (producers.size < 2) continue;
      const [first, second] = [...producers.values()];
      push(
        `${record.kind} node ${record.id || targetId} implicitly converges ${typeId} producer outputs `
        + `${first.producerOutputId} (edge ${first.edgeId}) and ${second.producerOutputId} (edge ${second.edgeId}); `
        + `use an explicit producer join`,
        { nodeId, edgeId: first.edgeId, socketId: first.socketId, producerOutputId: first.producerOutputId }
      );
    }
  }
  return errors;
}

function catalogContext(domain, record) {
  const fieldPath = record.kind === 'cts.field'
    ? (record.inputDefaults?.field || '')
    : record.path;
  return {
    fieldSchema: processNodeUsesStructuralFields(record.kind)
      ? structuralFieldSchema(domain, fieldPath)
      : entityFieldSchema(domain, record.typeId, fieldPath),
    fieldSchemas: processNodeUsesStructuralFields(record.kind)
      ? blockFieldSchemas(domain, record.block)
      : entityFieldSchemas(domain, record.typeId),
    blockComposition: domain.blockComposition?.[record.block] || null,
    command: domain.commands?.[record.commandId] || null
  };
}

function openCompositionEntryType(entry = {}, mode = '', valueBase = 'json') {
  if (!entry) return null;
  if (mode === 'ancestors' || mode === 'relations') {
    if (entry.type?.base) return processType(entry.type.base, entry.type);
    return processType('entityRef', { typeId: entry.typeId });
  }
  if (mode === 'attachments') {
    return processType('attachmentRef', { attachmentKind: entry.attachmentKind });
  }
  return processType(entry.type?.base || valueBase, entry.type || {});
}

function processTypesEquivalent(left = {}, right = {}) {
  if (left.base !== right.base) return false;
  for (const qualifier of ['typeId', 'attachmentKind', 'enumId', 'unit']) {
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

function entityFieldSchemas(domain = {}, typeId = '') {
  const key = String(typeId || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

function entityFieldSchema(domain, typeId, path) {
  return entityFieldSchemas(domain, typeId).find(field => field.path === path) || null;
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

function processNodeRequiresTypeId(kind = '') {
  if (['record.getField', 'record.composeBlock', 'record.modifyBlock', 'record.construct', 'effect.runCommand'].includes(kind)) return false;
  return ['record.', 'predicate.', 'read.', 'effect.'].some(prefix => kind.startsWith(prefix));
}

function validateConstruction(actionId, action = {}, domain = {}, errors = []) {
  const typeId = action.typeId || '';
  const contract = constructionContract(domain, typeId);
  const construction = normalizeConstruction(action.construction, typeId, domain);
  if (!contract || !construction) {
    errors.push(`Action ${actionId} cannot create ${typeId}: entity has no construction contract`);
    return;
  }
  if (!contract.modes.includes(construction.mode)) {
    errors.push(`Action ${actionId} cannot create ${typeId} with construction mode ${construction.mode}`);
  }
  if (contract.derived && construction.mode === 'genericCreate') {
    errors.push(`Action ${actionId} must use a typed construction mode for derived entity ${typeId}`);
  }
  if (construction.blockComposed && construction.mode === 'genericCreate') return;
}

function constructionContract(domain = {}, typeId = '') {
  return domain.construction?.[typeId] || null;
}

function validateFieldList(fields = [], domain = {}, typeId, label, errors, access = 'read') {
  if (!Array.isArray(fields)) return;
  if (access === 'construct') {
    const schemas = entityFieldSchemas(domain, typeId);
    for (const field of fields) {
      const schema = schemas.find(item => item.path === field);
      if (!schema || schema.constructible === false) {
        errors.push(`${label} contains non-constructible field: ${field}`);
      }
    }
    return;
  }
  const policy = getFieldPolicy(domain.fieldAccess || {}, typeId);
  if (!policy) {
    if (fields.length) errors.push(`${label} cannot be checked because ${typeId} has no field-access policy`);
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

function validateMutationGrantLevels(actionId, fields = [], domain = {}, typeId = '', grants = [], errors = []) {
  const policy = getFieldPolicy(domain.fieldAccess || {}, typeId);
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
