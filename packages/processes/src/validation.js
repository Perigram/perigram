import { normalizeProcessDefinition } from './normalization.js';
import { validateAction, validateEffectCapabilities, validateProcessNode, validateDataflowEdges, validateProcessNodeConnections, validateFieldList } from './validation-rules.js';
import { operationKindOf } from '@perigram/cts';
import { validateScreenContract } from './screen-contract.js';
import {
  PROCESS_SCALAR_KINDS,
  PROCESS_DATAFLOW_VERSION,
  PROCESS_STRUCTURES,
  validateProcessEdges
} from './ports.js';
import {
  CONSUMER_SPECIES_KINDS,
  getProcessNodeDefinition,
  resolveCatalogNodePorts
} from './node-catalog.js';
import { isDataTree } from './data-tree.js';
import { normalizeHandle, lineageKeyForTypeId } from './hierarchy-utils.js';
import { redundantAuthoredScreens } from './screen-analysis.js';
import { compileLifecycle, stateNestingPairs } from './workflow-compilation.js';
import { compileRoles } from './access-compilation.js';

import {
  effectKindOf,
  isEffectRecord,
  requiredEffectCapability,
  compileLineageBindings,
  actionTypeId,
  compileActionAccessWindows,
  outputSocketId,
  normalizeRoleCatalog,
  catalogContext,
  catalogPortForHandle,
  declaredLineageInput,
  declaredAncestorTypeId
} from './compiler-core.js';

export function validateProcessDefinition(definition = {}, domain = {}, { roles = {}, capabilities } = {}) {
  const process = normalizeProcessDefinition(definition, domain);
  const lineageBindings = compileLineageBindings(process, domain);
  const organizationRoles = normalizeRoleCatalog(roles);
  const errors = [];
  const diagnostics = [];
  const warnings = [];
  const nodeIds = new Set(process.graph.nodes.map(node => node.id));
  const entities = new Set((domain.entities || []).map(entity => entity.type));
  const partyTypes = new Set((domain.entities || []).filter(entity => entity.party).map(entity => entity.type));
  const commands = new Set(Object.keys(domain.commands || {}));

  for (const edge of process.graph.edges) {
    if (!nodeIds.has(edge.source)) errors.push(`Edge ${edge.id} references missing source node ${edge.source}`);
    if (!nodeIds.has(edge.target)) errors.push(`Edge ${edge.id} references missing target node ${edge.target}`);
  }
  const edgeDiagnostics = validateProcessEdges(process);
  errors.push(...edgeDiagnostics.map(diagnostic => diagnostic.message));
  diagnostics.push(...edgeDiagnostics);
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
    if (node.type === 'processNode' && !process.processNodes[refId]) errors.push(`Process node ${node.id} references missing process node record ${refId}`);
  }

  for (const [id, record] of Object.entries(process.processNodes)) {
    // A construct's type binding is its binds declaration wire: the
    // record's typeId derives from the wire, so an unbound construct is
    // an unfinished node, reported where the author meets it.
    if (record.kind === 'cts.construct' && !record.typeId) {
      errors.push(`Process node ${id} (Create) has no type binding — wire a class or type reference onto it (binds)`);
    }
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
    validateProcessNode(nodeId, node, { entities, domain, errors, partyTypes });
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
  warnings.push(...unexposedManualActionDiagnostics(process, compiledRoles));

  return { ok: errors.length === 0, errors, warnings, diagnostics, definition: process };
}

// A manual action no compiled role carries runs for nobody — the run
// gate refuses every assignment. Surfaced as a warning over the
// compiled roles (the resolved truth: authored grants, lane wiring, and
// the current role catalog together); event/schedule triggers execute
// through the orchestration and expose no surface.
function unexposedManualActionDiagnostics(process = {}, compiledRoles = {}) {
  const exposed = new Set(Object.values(compiledRoles)
    .flatMap(role => (role.actions || []).map(action => action.actionId || action.id)));
  const warnings = [];
  for (const [actionId, action] of Object.entries(process.actions || {})) {
    if ((action.trigger?.mode || 'manual') !== 'manual') continue;
    if (exposed.has(actionId)) continue;
    warnings.push(`Action ${actionId} is exposed to no role — author its grant (lane) or retire the node`);
  }
  return warnings;
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
    // The loop closer is control-plane machinery — the bracket of its
    // forEach region, never a value source — dead-end semantics do not
    // apply to it.
    if (String(record?.kind) === 'control.forEachEnd') continue;
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

// One emptiness rule for authored fallbacks and domain defaults (law:
// README Required inputs).
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
  // Species records classify through the operation-kind seam: a manual
  // `cts.construct` prompts exactly like the create effect it is.
  const kind = operationKindOf(record || {});
  const construction = record.construction || {};
  const contract = domain.construction?.[record.typeId] || {};
  const modeInputs = contract.modeInputs?.[construction.mode] || [];
  const declaredInputs = Array.isArray(construction.inputs) ? construction.inputs : [];
  const contractInputs = Array.isArray(contract.inputs) ? contract.inputs : [];
  if (kind === 'cts.construct') {
    for (const input of [...modeInputs, ...declaredInputs, ...contractInputs]) {
      if (!input) continue;
      if (input.prompt !== false && input.id) ids.add(input.id);
      if (input.path) ids.add(input.path);
    }
  }
  if (kind === 'cts.command' || kind === 'cts.service') {
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

// The one activation-time availability contract for required inputs (law:
// README Required inputs).
// Control nodes whose required data inputs share the availability
// contract: they evaluate automatically, so only a wire, an authored
// fallback, or a domain default serves them.
const CONTROL_REQUIRED_INPUT_KINDS = new Set(['control.if', 'control.switch', 'control.forEach', 'control.waitUntil']);

export function validateRequiredInputAvailability(process = {}, domain = {}) {
  const errors = [];
  const nodes = process.graph?.nodes || [];
  const edges = process.graph?.edges || [];
  for (const [recordId, record] of Object.entries(process.processNodes || {})) {
    // Species records classify through the operation-kind seam (SPEC §20):
    // `cts.construct`/`cts.service` carry the same required-input contract
    // their legacy effect twins do.
    if (!isEffectRecord(record) && !CONTROL_REQUIRED_INPUT_KINDS.has(String(record.kind || ''))
      && record.kind !== 'cts.valueService') continue;
    const manual = isEffectRecord(record) && (record.trigger?.mode || 'manual') === 'manual';
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
    if (source.producerOutputId && process.producerOutputs?.[source.producerOutputId]) {
      return source.producerOutputId;
    }
    if (CONSUMER_SPECIES_KINDS.has(source.kind)) {
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
  }
  // Native parity: a typed `lineage.<lineageKey>` socket on a
  // lineage-persisting construct resolves by the same rules, so a dropped
  // native binding is an activation failure too.
  for (const edge of process.graph?.edges || []) {
    const handle = normalizeHandle(edge.targetHandle);
    if (!handle.startsWith('lineage.') || handle === 'lineage.') continue;
    const target = recordsByGraphId.get(String(edge.target));
    if (!target || effectKindOf(target) !== 'cts.construct') continue;
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
  }
  return errors;
}

