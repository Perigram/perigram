import { durationMs } from '@perigram/cts';
import { PROCESS_SCALAR_KINDS, PROCESS_STRUCTURES, resolveProcessNodePorts } from './ports.js';
import { entityBlocks, EFFECT_SPECIES_KINDS, getFieldPolicy, getProcessNodeDefinition, resolveCatalogNodePorts } from './node-catalog.js';
import { normalizeProcessType, sanitizeProcessType, processSocketsCompatible, processType } from './types.js';
import {
  effectKindOf,
  isEffectRecord,
  requiredEffectCapability,
  resolveSourceProducerOutputId,
  actionTypeId,
  buildActionGraphContext,
  isEntityTargetHandle,
  effectiveActionParentTypeId,
  normalizeConstruction,
  normalizeActionAccess,
  catalogContext,
  catalogPortForHandle,
  entityFieldSchemas,
  entityFieldSchema,
  structuralFieldSchema,
  constructionContract,
  getByPath
} from './compiler-core.js';

export function validateAction(actionId, action = {}, { entities, commands, roles, domain, errors, stateDefinitions = {}, process = {}, lineageBindings = [] }) {
  const kind = action.actionKind || 'createEntity';
  const normalizedAccess = normalizeActionAccess(action.access);
  if (!['createEntity', 'updateEntity', 'archiveEntity', 'deleteEntity', 'runCommand', 'sendToOrganization', 'emitEvent'].includes(kind)) {
    errors.push(`Action ${actionId} uses unknown action kind ${kind}`);
    return;
  }
  if (kind === 'runCommand') {
    if (!action.commandId) errors.push(`Action ${actionId} must select a command`);
    if (action.commandId && !commands.has(action.commandId)) errors.push(`Action ${actionId} uses unknown command ${action.commandId}`);
  } else if (!['updateEntity', 'archiveEntity', 'deleteEntity', 'emitEvent'].includes(kind)) {
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
  if (!['manual', 'event', 'schedule', 'date', 'entityChanged', 'domainEvent'].includes(triggerMode)) {
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
        || (EFFECT_SPECIES_KINDS.has(String(processNode?.kind || '')) && String(processNode.entryTriggerId || processNode.id || refId) === String(actionId));
    })
    .map(node => String(node.id)));
  for (const edge of process.graph?.edges || []) {
    if (!actionNodeIds.has(String(edge.target)) || !isEntityTargetHandle(edge.targetHandle)) continue;
    const sourceNode = (process.graph?.nodes || []).find(node => String(node.id) === String(edge.source));
    const sourceRefId = String(sourceNode?.data?.refId || sourceNode?.id || '');
    const sourceRecord = sourceNode?.type === 'processNode' ? process.processNodes?.[sourceRefId] : null;
    const sourceActionId = sourceNode?.type === 'action'
      ? sourceRefId
      : EFFECT_SPECIES_KINDS.has(String(sourceRecord?.kind || '')) ? String(sourceRecord.id || sourceRefId) : '';
    const sourceAction = process.actions?.[sourceActionId];
    const sourceType = sourceAction && actionTypeId(sourceAction);
    if (sourceType) return sourceType;
  }
  return '';
}

// SPEC §7: machines are graph-derived — the draft's state nodes seed the
// vocabulary for every producer of their type (the same source
// compileWorkflows reads). The domain channel alone never carries an
// org-type machine (the projection emits none), so the capability gate
// reads both: a domain machine or a draft-seeded vocabulary satisfies it.
function processDeclaresStateVocabulary(process = {}, typeId = '') {
  if (!typeId) return false;
  const records = Object.values(process.ctsTypes || {});
  if (records.some(record => record?.kind === 'state' && record.value && record.typeId === typeId)) return true;
  // Unscoped tokens bind through their entry wires into this type's nodes
  // (the designer's connection rule compileWorkflows applies).
  const ctsByNode = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.ctsTypes || {})[String(node.data?.refId || node.id)]
  ]));
  const procByNode = new Map((process.graph?.nodes || []).map(node => [
    String(node.id),
    (process.processNodes || {})[String(node.data?.refId || node.id)]
  ]));
  return (process.graph?.edges || []).some(edge => {
    const state = ctsByNode.get(String(edge.source));
    if (!state || state.kind !== 'state' || !state.value || state.typeId) return false;
    const target = procByNode.get(String(edge.target));
    return (target?.typeId || target?.targetTypeId || '') === typeId;
  });
}

export function validateEffectCapabilities(process = {}, domain = {}, capabilities = {}, errors = []) {
  for (const [nodeId, node] of Object.entries(process.processNodes || {})) {
    if (!node.typeId) continue;
    const capability = requiredEffectCapability(node.kind, node);
    if (!capability) continue;
    if (capability === 'statusMutation') {
      if (!domain.workflows?.[node.typeId] && !processDeclaresStateVocabulary(process, node.typeId)) {
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

export function validateProcessNode(nodeId, node = {}, { entities, domain, errors, partyTypes }) {
  const kind = node.kind || '';
  if (kind.includes('.')) {
    validateDataflowProcessNode(nodeId, node, { entities, domain, errors, partyTypes });
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

function validateDataflowProcessNode(nodeId, node, { entities, domain, errors, partyTypes }) {
  const definition = getProcessNodeDefinition(node.kind);
  if (!definition) {
    errors.push(`Process node ${nodeId} uses unknown node kind ${node.kind}`);
    return;
  }
  const classification = effectKindOf(node);
  if (node.typeId && !entities.has(node.typeId)) {
    errors.push(`Process node ${nodeId} uses unknown typeId ${node.typeId}`);
  }
  // Party types are readable principals (SPEC §13): no effect species may
  // construct, mutate, transition, or remove them — the party services own
  // every mutation path.
  if (['cts.construct', 'cts.mutate', 'cts.transition', 'cts.remove'].includes(node.kind)
    && partyTypes?.has(node.typeId)) {
    errors.push(`Process node ${nodeId} cannot target party type ${node.typeId} — parties are read-only in processes`);
  }
  if (processNodeRequiresTypeId(node.kind) && !node.typeId) {
    errors.push(`Process node ${nodeId} must select an entity type`);
  }
  if (node.kind === 'cts.field') {
    const fieldPath = String(node.path || '');
    if (!fieldPath) errors.push(`Process node ${nodeId} must select a field`);
    if (fieldPath && node.typeId && !entityFieldSchema(domain, node.typeId, fieldPath)) {
      errors.push(`Process node ${nodeId} uses undeclared field ${fieldPath}`);
    }
  }
  if (['cts.construct', 'cts.mutate'].includes(classification)) {
    // A species mutate carries no blocks envelope: its leaves are wired or
    // defaulted field sockets, and required-input availability owns the
    // "at least one input" rule at activation.
    if (classification === 'cts.construct') {
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
      .filter(field => classification === 'cts.construct'
        ? field.constructible !== false
        : field.writable !== false)
      .map(field => field.block));
    if (classification === 'cts.construct') {
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
  if (isEffectRecord(node) && !['manual', 'event', 'schedule'].includes(node.trigger?.mode || 'manual')) {
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
  if (node.kind === 'cts.read' && node.select === 'find') {
    const filters = node.filters && typeof node.filters === 'object' && !Array.isArray(node.filters) ? node.filters : {};
    const declared = new Set(entityFieldSchemas(domain, node.typeId).filter(field => field.readable !== false).map(field => field.path));
    for (const [path, value] of Object.entries(filters)) {
      if (!declared.has(path) && !declared.has(`fields.${path}`)) errors.push(`Process node ${nodeId} filters undeclared field ${path}`);
      if (value != null && typeof value === 'object') errors.push(`Process node ${nodeId} filter ${path} must be a scalar`);
    }
  }
  if (classification === 'cts.command' && (!node.commandId || !domain.commands?.[node.commandId])) {
    errors.push(`Process node ${nodeId} must select a registered command`);
  }
  try {
    resolveCatalogNodePorts(node, {
      fieldSchema: entityFieldSchema(domain, node.typeId, node.path),
      fieldSchemas: entityFieldSchemas(domain, node.typeId),
      blockComposition: domain.blockComposition?.[node.block] || null,
      command: domain.commands?.[node.commandId] || null
    });
  } catch (error) {
    errors.push(`Process node ${nodeId} has invalid sockets: ${error.message}`);
  }
}

// Edge diagnostics are structured records so the designer can focus the exact
// graph element; `errors` strings are derived from `message` at the assembly
// boundary.
export function validateDataflowEdges(process, domain) {
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
      && sourceRecord.kind === 'cts.compose'
      && ['cts.construct', 'cts.mutate'].includes(targetRecord.kind)) {
      const requiredAccess = targetRecord.kind === 'cts.construct' ? 'constructible' : 'writable';
      const targetBlocks = new Set(entityBlocks(domain, targetRecord.typeId));
      const sourcePaths = sourceRecord.compositionMode
        ? (sourceRecord.entries || []).map(entry => `${sourceRecord.block}.${entry.key}`).filter(path => !path.endsWith('.undefined'))
        : (sourceRecord.fields || []);
      for (const path of sourcePaths) {
        const targetSchemas = entityFieldSchemas(domain, targetRecord.typeId)
          .filter(field => field.block === sourceRecord.block);
        const targetSchema = entityFieldSchema(domain, targetRecord.typeId, path);
        const openBlockAccepted = targetRecord.kind === 'cts.construct'
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
      const portEntityStream = ['entity', 'entityRef'].includes(sourcePort.type?.base)
        || (sourcePort.type?.base === 'array' && ['entity', 'entityRef'].includes(sourcePort.type?.itemType?.base));
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
  for (const record of Object.values(process.processNodes || {})) {
    if (!isEffectRecord(record) || !record.trigger?.schedule) continue;
    const { at, interval } = record.trigger.schedule;
    if (at && Number.isNaN(new Date(at).getTime())) {
      push(`Action ${record.id || 'effect'} schedule.at is not a valid date-time`);
    }
    if (interval && !(durationMs(interval) > 0)) {
      push(`Action ${record.id || 'effect'} schedule.interval is not a valid duration`);
    }
    if (!at && !interval) {
      push(`Action ${record.id || 'effect'} schedule declares neither at nor interval`);
    }
  }
  const triggers = (process.graph?.nodes || []).filter(node => {
    const record = process.processNodes?.[String(node.data?.refId || node.id)];
    // Entry points: manual, scheduled, and event-subscribed species
    // effects are reachability roots.
    const mode = record?.trigger?.mode || 'manual';
    return record?.kind?.endsWith('Trigger')
      || (isEffectRecord(record || {}) && (mode === 'manual' || mode === 'schedule' || (mode === 'event' && record.eventId)));
  });
  const reachable = reachableControlNodes(process, triggers.map(node => String(node.id)));
  for (const node of process.graph?.nodes || []) {
    const record = process.processNodes?.[String(node.data?.refId || node.id)];
    if ((isEffectRecord(record || {}) || record?.kind?.startsWith('control.'))
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

export function validateProcessNodeConnections(process = {}, errors = [], domain = {}) {
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

function processNodeRequiresTypeId(kind = '') {
  if (kind === 'record.construct') return false;
  return ['cts.construct', 'cts.read', 'cts.payload'].includes(kind);
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

export function validateFieldList(fields = [], domain = {}, typeId, label, errors, access = 'read') {
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

