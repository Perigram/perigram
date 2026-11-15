import { effectKindOf } from './compiler-core.js';
import { inferProcessDataflowContracts } from './ports.js';
import { constructionInputsForContract, entityBlocks, resolveCatalogNodePorts } from './node-catalog.js';
import { createDataTree, isDataTree } from './data-tree.js';
import { normalizeHandle, lineageKeyForTypeId } from './hierarchy-utils.js';

const MAPPED_MUTATION_KINDS = new Set([
  'cts.construct',
  'cts.mutate',
  'cts.transition',
  'cts.remove'
]);
const REMOVED_STATUS_EFFECT_INPUTS = new Set(['metadata', 'lifecycle', 'region', 'path']);

function withoutRemovedStatusEffectEdges(graph, processNodes) {
  const recordByGraphId = new Map((graph.nodes || []).map(node => [
    String(node.id),
    processNodes[String(node.data?.refId || node.id)]
  ]));
  graph.edges = (graph.edges || []).filter(edge => {
    const record = recordByGraphId.get(String(edge.target));
    const kind = effectKindOf(record || {});
    if (!record || kind !== 'cts.transition') return true;
    const handle = String(edge.targetHandle || '').replace(/^(input|data):/, '');
    return !REMOVED_STATUS_EFFECT_INPUTS.has(handle);
  });
  return graph;
}

const PRODUCER_ORIGIN_KINDS = new Set([
  'cts.construct',
  'cts.command',
  'cts.service',
  'cts.conversion'
]);

function ownsProducerOutput(record = {}) {
  return PRODUCER_ORIGIN_KINDS.has(String(record.kind || ''));
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
    // Smuggled defaults on sockets the node does not declare die here —
    // only when the port set actually resolved (a draft overlay whose
    // domain gap fails resolution keeps its defaults with the item
    // fallback, the load-time contract).
    const resolved = ports.length > 0;
    const declared = Object.entries(record.inputDefaults)
      .filter(([socketId]) => !resolved || accessById.has(socketId));
    if (!declared.length) return [id, record];
    const mutationEffect = isMappedMutation(record);
    return [id, {
      ...record,
      inputDefaults: Object.fromEntries(declared.map(([socketId, value]) => {
        const access = accessById.get(socketId) || 'item';
        // Mapped mutation sockets declare List access; a scalar authored
        // default is one broadcast item, not an arity error.
        const shape = mutationEffect && access === 'list' && !Array.isArray(value) && !isDataTree(value) ? 'item' : access;
        return [socketId, isDataTree(value) ? value : createDataTree(value, shape)];
      }))
    }];
  }));
}


import {
  normalizeGraph,
  normalizeRecord,
  normalizeActions,
  entityLabelOf,
  normalizeConstruction,
  normalizeActionInputPolicy,
  catalogContext,
  catalogPortForHandle,
  entityFieldSchemas,
  entityFieldSchema,
  structuralFieldSchema,
  processDefaultValue,
  wiredHandlePaths
} from './compiler-core.js';

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
    // Smuggled defaults on sockets the node does not declare die here —
    // only when the port set actually resolved (a draft overlay whose
    // domain gap fails resolution keeps its defaults with the item
    // fallback, the load-time contract).
    const resolved = ports.length > 0;
    const declared = Object.entries(record.inputDefaults)
      .filter(([socketId]) => !resolved || accessById.has(socketId));
    if (!declared.length) return [id, record];
    const mutationEffect = isMappedMutation(record);
    return [id, {
      ...record,
      inputDefaults: Object.fromEntries(declared.map(([socketId, value]) => {
        const access = accessById.get(socketId) || 'item';
        // Mapped mutation sockets declare List access; a scalar authored
        // default is one broadcast item, not an arity error.
        const shape = mutationEffect && access === 'list' && !Array.isArray(value) && !isDataTree(value) ? 'item' : access;
        return [socketId, isDataTree(value) ? value : createDataTree(value, shape)];
      }))
    }];
  }));
}

export function plainProcessDefaults(defaults = {}) {
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
    // Palette law (SPEC §8): `value.logic` composes boolean algebra only.
    // Stored graphs authored before the split carried comparison ops on
    // it; loads migrate them one-way to `value.compare` (the value
    // comparison home) with the operation preserved.
    if (node?.kind === 'value.logic' && ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith'].includes(node.operation)) {
      return [id, { ...node, kind: 'value.compare' }];
    }
    // `value.cast` authors the target base alone: the input is the
    // universal json acceptor, so a persisted `sourceType` is retired
    // vocabulary and loads strip it one-way.
    if (node?.kind === 'value.cast' && 'sourceType' in node) {
      const { sourceType, ...rest } = node;
      return [id, rest];
    }
    // Stale-block pruning on persisted constructs: when the entity's
    // current field schema marks every field of a previously persisted
    // canonical block non-constructible, the block and its inline
    // defaults are removed before action derivation and validation;
    // unknown blocks stay validation errors.
    if (node?.kind === 'cts.construct' && node.typeId) {
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
      return [id, {
        ...node,
        blocks,
        ...(node.inputDefaults ? { inputDefaults } : {})
      }];
    }
    return [id, node];
  }));
}

function deriveEffectActions(actions = {}, processNodes = {}, graph = {}, domain = {}, producerOutputs = {}) {
  const derived = { ...(actions || {}) };
  for (const [nodeId, node] of Object.entries(processNodes)) {
    if (!isEffectRecord(node)) continue;
    const classification = effectKindOf(node);
    const actionId = String(node.entryTriggerId || node.id || nodeId);
    const actionKind = ({
      'cts.construct': 'createEntity',
      'cts.mutate': 'updateEntity',
      'cts.transition': node.archiveIntent ? 'archiveEntity' : 'updateEntity',
      'cts.remove': 'deleteEntity',
      'cts.command': 'runCommand',
      'cts.service': 'runCommand',
      'cts.conversion': 'runCommand',
      'cts.emit': 'emitEvent'
    })[classification];
    if (!actionKind) continue;

    const promptContract = effectPromptContract(nodeId, node, processNodes, graph, domain);
    const fields = promptContract.fields;
    const suppliedFields = new Set([
      ...Object.keys(promptContract.defaults),
      ...promptContract.wiredFields
    ]);
    const stateTo = ['cts.mutate', 'cts.transition'].includes(classification)
      ? (processDefaultValue(node.inputDefaults?.state)
        || processDefaultValue(node.inputDefaults?.status)
        || processDefaultValue(node.inputDefaults?.['states.main'])
        || node.state?.to
        || '')
      : (classification === 'cts.construct'
        ? (processDefaultValue(node.inputDefaults?.state) || '')
        : '');
    const consumer = ['cts.mutate', 'cts.transition', 'cts.remove'].includes(classification);
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
      construction: classification === 'cts.construct'
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
          ...(promptContract.schemas.find(field => field.path === path)?.control
            ? { control: promptContract.schemas.find(field => field.path === path).control }
            : {}),
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
      ...(node.guard ? { guard: node.guard } : {}),
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
  // One pair per entry: the first manual action over the entry owns the
  // derivation, so two constructs over the same type and relation mint one
  // Link/Unlink pair.
  const derivedEntries = new Set();
  for (const [sourceActionId, sourceAction] of Object.entries(actions)) {
    if ((sourceAction.trigger?.mode || 'manual') !== 'manual') continue;
    // Relation mutations are ENTRY-level: one authored relation (one
    // storage key) compiles to one Link/Unlink pair accepting every
    // declared target type of the entry — never per-target buttons. The
    // caption names the authored field label (raw type ids never reach
    // captions), falling back to the single target's authored label,
    // else the key.
    const contractsByKey = new Map();
    for (const relation of sourceAction.mutation?.relationContracts || []) {
      if (!sourceAction.typeId || !relation.key || !relation.targetType) continue;
      if (!contractsByKey.has(relation.key)) {
        contractsByKey.set(relation.key, {
          key: relation.key,
          contracts: [],
          targetTypes: [],
          cardinality: relation.cardinality || 'one',
          association: relation.association || null,
          creator: null
        });
      }
      const entry = contractsByKey.get(relation.key);
      entry.contracts.push(relation);
      if (!entry.targetTypes.includes(relation.targetType)) entry.targetTypes.push(relation.targetType);
      if (relation.cardinality === 'many') entry.cardinality = 'many';
      if (relation.association && !entry.association) entry.association = relation.association;
      if (relation.where && !entry.where) entry.where = relation.where;
      if (relation.unlink === 'delete') entry.unlink = 'delete';
      if (relation.creator && !entry.creator) entry.creator = relation.creator;
    }
    for (const entry of contractsByKey.values()) {
      const relationLabel = relationEntryLabel(domain, sourceAction.typeId, entry);
      for (const operation of ['link', 'unlink']) {
        const entryKey = `${sourceAction.typeId}:${operation}:${entry.key}`;
        if (derivedEntries.has(entryKey)) continue;
        derivedEntries.add(entryKey);
        const creatorAction = entry.creator?.actionId ? actions[entry.creator.actionId] : null;
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
              actionId: creatorAction.id || entry.creator.actionId,
              typeId: creatorAction.typeId,
              construction,
              inputPolicy
            };
            })()
          : entry.creator;
        const id = `${sourceActionId}:${operation}:${entry.key}`;
        const input = {
          id: `relation:${entry.key}`,
          label: relationLabel,
          path: `relations.${entry.key}`,
          type: 'entity',
          ...(entry.targetTypes.length === 1
            ? { typeId: entry.targetTypes[0] }
            : { accepts: entry.targetTypes }),
          relationKey: entry.key,
          cardinality: entry.cardinality,
          required: true,
          prompt: operation === 'link',
          ...(entry.where ? { where: entry.where } : {}),
          ...(operation === 'link' && creator ? { creator } : {})
        };
        derived[id] = {
          id,
          label: `${operation === 'link' ? 'Link' : 'Unlink'} ${relationLabel}`,
          actionKind: 'updateEntity',
          producerOutputId: sourceAction.producerOutputId,
          typeId: sourceAction.typeId,
          relationMutation: {
            key: entry.key,
            targetTypes: entry.targetTypes,
            cardinality: entry.cardinality,
            operation,
            ...(entry.where ? { where: entry.where } : {}),
            ...(entry.association ? { association: entry.association } : {}),
            ...(operation === 'unlink' && entry.unlink ? { unlink: entry.unlink } : {}),
            ...(operation === 'link' && creator ? { creator } : {})
          },
          mutation: { fields: [`relations.${entry.key}`], relationContracts: entry.contracts },
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

// The relation entry's authored label: the owner type's declared field
// for the relation key first (SPEC §4 display dictionary), else the
// single accepted target's authored render label, else the key.
function relationEntryLabel(domain = {}, ownerType = '', entry = {}) {
  const field = (domain.fieldSchemas?.[ownerType] || [])
    .find(schema => schema.path === `data.${entry.key}` || schema.path === entry.key);
  if (field?.label) return field.label;
  if (entry.targetTypes.length === 1) {
    return entityLabelOf(domain, entry.targetTypes[0]) || entry.key;
  }
  return entry.key;
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
      // Construct-addressable relation inputs carry their declared-edge
      // contracts on the mutation, so the runtime's relation normalize
      // accepts the write from the construction-input channel too. Only
      // AUTHORED inputs mint contracts — the contract-normalized list
      // would derive link actions for relations the author never wired.
      relationContracts: (node.construction?.inputs || [])
        .flatMap(input => {
          const path = String(input.id || input.path || '');
          if (!path.startsWith('relations.')) return [];
          const key = path.split('.')[1] || '';
          return declaredRelationContracts(domain, node.typeId, input.typeId, key);
        }),
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
    .filter(record => record?.kind === 'cts.compose');
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
  // No identity.name ghost: a create prompt offers only what the author
  // composed or the construction contract declares (rows, edges). The
  // stored name arrives through the composed identity block or the
  // declared identifier row — never a compiler-invented prompt field.
  const fields = [...new Set([...composerFields])];
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
      const processCreator = sourceRecord?.kind === 'cts.construct'
        && sourceRecord.typeId === (declared?.targetType || entry.typeId)
        ? { actionId: String(sourceRecord.id) }
        : null;
      return {
      ownerType: node.typeId,
      key: declared?.key || entry.key,
      targetType: declared?.targetType || entry.typeId,
      cardinality: declared?.cardinality || (entry.type?.base === 'array' || sourcePort?.type?.base === 'array' ? 'many' : 'one'),
      ...(declared?.where ? { where: declared.where } : {}),
      ...(declared?.unlink === 'delete' ? { unlink: 'delete' } : {}),
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
  // Construct-addressable relation inputs (constructionInputsForContract
  // exposes them as sockets) carry their declared-edge contracts on the
  // action too, so the runtime's relation normalize accepts the write
  // whichever channel delivered the value — composer or construction
  // input.
  const constructionRelationContracts = (node.construction?.inputs || [])
    .flatMap(input => {
      const path = String(input.id || input.path || '');
      if (!path.startsWith('relations.')) return [];
      const key = path.split('.')[1] || '';
      return declaredRelationContracts(domain, node.typeId, input.typeId, key);
    })
    .filter(contract => !relationContracts.some(existing => (
      existing.key === contract.key && existing.targetType === contract.targetType
    )));
  return {
    fields,
    defaults: Object.assign({}, ...composers.map(record => plainProcessDefaults(record.inputDefaults))),
    wiredFields,
    schemas: allSchemas,
    parentTypeId: node.parentTypeId || (parentTypes.length === 1 ? parentTypes[0] : ''),
    relationContracts: [...relationContracts, ...constructionRelationContracts]
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

// A relation edge accepting several target types is ONE edge: the
// construction input carries no single typeId, and the declared contracts
// cover every accepted target (the runtime resolves each written ref
// against the contract matching the ref's own type).
function declaredRelationContracts(domain = {}, ownerType = '', targetType = '', key = '') {
  const byKey = (domain.relations || []).filter(relation => (
    relation.ownerType === ownerType && relation.key === key
  ));
  const pinned = targetType ? byKey.filter(relation => relation.targetType === targetType) : byKey;
  return (pinned.length ? pinned : byKey)
    .filter(relation => relation.targetType)
    .map(relation => ({
      ownerType,
      key: relation.key,
      targetType: relation.targetType,
      cardinality: relation.cardinality || 'one',
      ...(relation.where ? { where: relation.where } : {}),
      ...(relation.unlink ? { unlink: relation.unlink } : {})
    }));
}

