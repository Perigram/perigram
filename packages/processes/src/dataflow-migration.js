import { PROCESS_DATAFLOW_VERSION } from './ports.js';
import { getProcessNodeDefinition, resolveCatalogNodePorts } from './node-catalog.js';
import { legacyProcessType, processSocketsCompatible } from './types.js';

const KIND_MAP = Object.freeze({
  fieldRead: 'record.getField',
  entityQuery: 'read.queryEntities',
  entityRef: 'read.currentEntity',
  entityDecompose: 'record.deconstruct',
  entityField: 'record.getField',
  entityFilter: 'read.filterRecords',
  entitySelect: 'collection.itemAt',
  entityCompose: 'record.entityDraft',
  entityModify: 'record.fieldChange',
  blockRead: 'record.getField',
  blockCompose: 'record.fieldChange',
  blockModify: 'record.fieldChange',
  cast: 'value.cast',
  fallback: 'value.coalesce',
  stringOp: 'value.string',
  compare: 'value.compare',
  logic: 'value.logic',
  entityCondition: 'predicate.field',
  predicateLogic: 'predicate.logic',
  listLength: 'collection.count'
});

export function migrateProcessDataflowDefinition(definition = {}, domain = {}) {
  const wrapped = Boolean(definition?.data?.graph);
  const process = wrapped ? definition.data : definition;
  if (Number(process.dataflowVersion) === PROCESS_DATAFLOW_VERSION && isV3Graph(process)) {
    const composed = replaceComposedEntityEffects(process, domain);
    const ambient = replaceAmbientEntityEffectInputs(composed.process);
    if (!composed.changed && !ambient.changed) return { changed: false, value: definition };
    const migrated = { ...process, ...ambient.process, compiled: null };
    return {
      changed: true,
      value: wrapped ? { ...definition, data: migrated } : migrated
    };
  }
  const records = {};
  const nodeMappings = new Map();
  const nodes = [];
  const entryEdges = [];

  for (const node of process.graph?.nodes || []) {
    const sourceRef = String(node.data?.refId || node.id);
    const migrated = migrateGraphNode(node, sourceRef, process);
    if (!migrated) continue;
    if (records[migrated.refId]) throw new Error(`Cannot migrate duplicate process operation ${migrated.refId}`);
    records[migrated.refId] = migrated.record;
    nodeMappings.set(String(node.id), migrated);
    nodes.push({
      ...node,
      type: 'processNode',
      data: { ...(node.data || {}), refId: migrated.refId }
    });
    if (node.type === 'action' || node.type === 'service') {
      const triggerId = `trigger:${sourceRef}`;
      records[triggerId] = normalizeRecord({
        kind: 'control.manualTrigger',
        ...(node.type === 'action' ? { legacyActionId: sourceRef } : { legacyServiceId: sourceRef })
      }, triggerId);
      migrated.record.entryTriggerId = triggerId;
      nodes.push({
        id: triggerId,
        type: 'processNode',
        position: {
          x: Number(node.position?.x || 0) - 300,
          y: Number(node.position?.y || 0)
        },
        data: { refId: triggerId }
      });
      entryEdges.push({
        id: `${triggerId}-${node.id}`,
        source: triggerId,
        sourceHandle: 'control:start',
        target: node.id,
        targetHandle: 'control:in',
        role: 'control'
      });
    }
  }

  let edges = (process.graph?.edges || []).flatMap(edge => {
    const source = nodeMappings.get(String(edge.source));
    const target = nodeMappings.get(String(edge.target));
    if (!source || !target) return [];
    const migrated = migrateEdge(edge, source, target);
    return migrated ? [migrated] : [];
  });
  const expanded = expandLegacyActionInputs(process, nodes, records, edges);
  const replaced = replaceComposedEntityEffects({
    graph: { nodes: expanded.nodes, edges: expanded.edges },
    processNodes: records
  }, domain);
  const ambient = replaceAmbientEntityEffectInputs(replaced.process);
  for (const key of Object.keys(records)) {
    if (!ambient.process.processNodes[key]) delete records[key];
  }
  Object.assign(records, ambient.process.processNodes);
  const pruned = pruneDeadDataNodes(ambient.process.graph.nodes, records, ambient.process.graph.edges);
  edges = pruned.edges;
  inferMigratedEntityTypes(records, pruned.nodes, [...edges, ...entryEdges]);
  const converted = insertVisibleConversions(pruned.nodes, records, edges, domain);
  const actions = migrateLegacyActionMetadata(process.actions, records, domain);
  const migrated = {
    ...process,
    actions,
    dataflowVersion: PROCESS_DATAFLOW_VERSION,
    graph: { ...(process.graph || {}), nodes: converted.nodes, edges: [...converted.edges, ...entryEdges] },
    processNodes: records,
    valueInputs: {},
    compiled: null
  };
  const value = wrapped ? { ...definition, data: migrated } : migrated;
  return { changed: JSON.stringify(value) !== JSON.stringify(definition), value };
}

function replaceAmbientEntityEffectInputs(process = {}) {
  const records = structuredClone(process.processNodes || {});
  const nodes = [...(process.graph?.nodes || [])];
  let edges = [...(process.graph?.edges || [])];
  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  const nodeForRecord = recordId => nodes.find(node => String(node.data?.refId || node.id) === String(recordId));
  const recordForNode = nodeId => {
    const node = nodeById.get(String(nodeId));
    return records[String(node?.data?.refId || node?.id || '')];
  };
  const removable = new Set();
  let changed = false;

  for (const effectNode of nodes) {
    const effect = recordForNode(effectNode.id);
    if (!effect?.kind?.startsWith('effect.') || !effect.entryTriggerId || !effect.entityType) continue;
    const entityEdge = edges.find(edge => (
      String(edge.target) === String(effectNode.id)
      && cleanHandle(edge.targetHandle) === 'entity'
    ));
    if (!entityEdge) continue;
    const sourceRecord = recordForNode(entityEdge.source);
    const referenceEdge = sourceRecord?.kind === 'value.toEntityRef'
      ? edges.find(edge => String(edge.target) === String(entityEdge.source) && cleanHandle(edge.targetHandle) === 'value')
      : null;
    const ambientNodeId = referenceEdge?.source || entityEdge.source;
    if (recordForNode(ambientNodeId)?.kind !== 'read.currentEntity') continue;
    const triggerNode = nodeForRecord(effect.entryTriggerId);
    const trigger = triggerNode ? recordForNode(triggerNode.id) : null;
    if (!triggerNode || trigger?.kind !== 'control.manualTrigger') continue;

    trigger.entityType = effect.entityType;
    edges = edges.filter(edge => edge.id !== entityEdge.id && edge.id !== referenceEdge?.id);
    edges.push({
      id: `${triggerNode.id}-payload-${effectNode.id}-entity`,
      source: triggerNode.id,
      sourceHandle: 'data:payload',
      target: effectNode.id,
      targetHandle: 'data:entity',
      role: 'data'
    });
    removable.add(String(ambientNodeId));
    if (referenceEdge) removable.add(String(entityEdge.source));
    changed = true;
  }

  if (!changed) return { changed: false, process };
  for (const nodeId of [...removable]) {
    if (edges.some(edge => String(edge.source) === nodeId || String(edge.target) === nodeId)) removable.delete(nodeId);
  }
  const retainedNodes = nodes.filter(node => !removable.has(String(node.id)));
  const retainedIds = new Set(retainedNodes.map(node => String(node.id)));
  edges = edges.filter(edge => retainedIds.has(String(edge.source)) && retainedIds.has(String(edge.target)));
  for (const nodeId of removable) {
    const node = nodeById.get(nodeId);
    delete records[String(node?.data?.refId || node?.id || '')];
  }
  return {
    changed: true,
    process: {
      ...process,
      processNodes: records,
      graph: { ...(process.graph || {}), nodes: retainedNodes, edges }
    }
  };
}

function replaceComposedEntityEffects(process = {}, domain = {}) {
  const records = structuredClone(process.processNodes || {});
  const nodes = [...(process.graph?.nodes || [])];
  let edges = [...(process.graph?.edges || [])];
  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  const recordForNode = nodeId => {
    const node = nodeById.get(String(nodeId));
    return records[String(node?.data?.refId || node?.id || '')];
  };
  const removedNodeIds = new Set();
  let changed = false;

  for (const effectNode of nodes) {
    const effect = recordForNode(effectNode.id);
    if (!['effect.createEntity', 'effect.updateEntity'].includes(effect?.kind)) continue;
    const targetHandle = effect.kind === 'effect.createEntity' ? 'draft' : 'changes';
    const compositionEdge = edges.find(edge => (
      String(edge.target) === String(effectNode.id)
      && cleanHandle(edge.targetHandle) === targetHandle
    ));
    if (!compositionEdge) continue;
    const collected = collectComposedFields(compositionEdge.source, {
      edges,
      recordForNode,
      visited: new Set()
    });
    if (!collected.fields.length) continue;
    const duplicate = collected.fields.find(field => edges.some(edge => (
      String(edge.target) === String(effectNode.id)
      && cleanHandle(edge.targetHandle) === field.path
    )));
    if (duplicate) {
      throw new Error(`Cannot migrate ${effect.id}: field ${duplicate.path} is wired both directly and through legacy composition`);
    }

    effect.fields = [...new Set([
      ...(effect.fields || []),
      ...collected.fields.map(field => field.path)
    ])];
    effect.fieldSchemas = effect.fields
      .map(path => (
        (effect.fieldSchemas || []).find(field => field.path === path)
        || collected.fields.find(field => field.path === path)?.schema
        || migrationFieldSchema(domain, effect.entityType, path)
      ))
      .filter(Boolean);
    effect.inputDefaults = {
      ...(effect.inputDefaults || {}),
      ...Object.fromEntries(collected.fields
        .filter(field => field.hasDefault)
        .map(field => [field.path, field.defaultValue]))
    };
    edges = edges
      .filter(edge => edge.id !== compositionEdge.id)
      .concat(collected.fields
        .filter(field => field.edge)
        .map(field => ({
          ...field.edge,
          id: `${field.edge.id}:to:${effectNode.id}:${field.path}`,
          target: effectNode.id,
          targetHandle: `data:${field.path}`,
          role: 'data'
        })));
    collected.nodeIds.forEach(id => {
      const outgoing = edges.filter(edge => String(edge.source) === String(id));
      const internalTargets = new Set([...collected.nodeIds].map(String).concat(String(effectNode.id)));
      if (outgoing.every(edge => internalTargets.has(String(edge.target)))) removedNodeIds.add(String(id));
    });
    changed = true;
  }

  if (!changed) return { changed: false, process };
  const retainedNodes = nodes.filter(node => !removedNodeIds.has(String(node.id)));
  const retainedIds = new Set(retainedNodes.map(node => String(node.id)));
  edges = edges.filter(edge => retainedIds.has(String(edge.source)) && retainedIds.has(String(edge.target)));
  for (const nodeId of removedNodeIds) {
    const node = nodeById.get(nodeId);
    delete records[String(node?.data?.refId || node?.id || '')];
  }
  return {
    changed: true,
    process: {
      ...process,
      processNodes: records,
      graph: { ...(process.graph || {}), nodes: retainedNodes, edges }
    }
  };
}

function collectComposedFields(nodeId, { edges, recordForNode, visited }) {
  const id = String(nodeId);
  if (visited.has(id)) return { fields: [], nodeIds: new Set() };
  visited.add(id);
  const record = recordForNode(id);
  if (!record) return { fields: [], nodeIds: new Set() };

  if (['record.entityDraft', 'record.construct'].includes(record.kind)) {
    const fields = (record.fields || []).map(path => {
      const edge = edges.find(item => String(item.target) === id && cleanHandle(item.targetHandle) === path);
      return {
        path,
        edge,
        schema: (record.fieldSchemas || []).find(field => field.path === path),
        hasDefault: Object.hasOwn(record.inputDefaults || {}, path),
        defaultValue: record.inputDefaults?.[path]
      };
    });
    return { fields, nodeIds: new Set([id]) };
  }
  if (record.kind === 'record.fieldChange') {
    const edge = edges.find(item => String(item.target) === id && cleanHandle(item.targetHandle) === 'value');
    const sourceRecord = edge ? recordForNode(edge.source) : null;
    if (['record.fieldChange', 'record.mergeChanges'].includes(sourceRecord?.kind)) {
      const child = collectComposedFields(edge.source, { edges, recordForNode, visited });
      child.nodeIds.add(id);
      return child;
    }
    return {
      fields: [{
        path: record.path,
        edge,
        schema: record.fieldSchema,
        hasDefault: Object.hasOwn(record.inputDefaults || {}, 'value'),
        defaultValue: record.inputDefaults?.value
      }],
      nodeIds: new Set([id])
    };
  }
  if (record.kind === 'record.mergeChanges') {
    const result = { fields: [], nodeIds: new Set([id]) };
    for (const edge of edges.filter(item => String(item.target) === id)) {
      const child = collectComposedFields(edge.source, { edges, recordForNode, visited });
      result.fields.push(...child.fields);
      child.nodeIds.forEach(childId => result.nodeIds.add(childId));
    }
    return result;
  }
  return { fields: [], nodeIds: new Set() };
}

function insertVisibleConversions(initialNodes, records, initialEdges, domain) {
  const nodes = [...initialNodes];
  const edges = [];
  const graphNodeById = new Map(nodes.map(node => [String(node.id), node]));
  for (const edge of initialEdges) {
    if (edge.role !== 'data') {
      edges.push(edge);
      continue;
    }
    let sourceNode = graphNodeById.get(String(edge.source));
    const targetNode = graphNodeById.get(String(edge.target));
    let sourceRecord = records[String(sourceNode?.data?.refId || sourceNode?.id || '')];
    const targetRecord = records[String(targetNode?.data?.refId || targetNode?.id || '')];
    if (!sourceRecord || !targetRecord
      || !hasResolvableMigrationType(sourceRecord)
      || !hasResolvableMigrationType(targetRecord)) {
      edges.push(edge);
      continue;
    }
    let sourceHandle = edge.sourceHandle;
    const targetPorts = migrationPorts(targetRecord, domain).inputs;
    const targetPort = portForMigrationHandle(targetPorts, edge.targetHandle);
    let conversionIndex = 0;
    let completed = false;
    while (conversionIndex < 4) {
      const sourcePort = portForMigrationHandle(migrationPorts(sourceRecord, domain).outputs, sourceHandle);
      if (!sourcePort || !targetPort) break;
      const compatibility = processSocketsCompatible(sourcePort, targetPort);
      if (compatibility.ok) {
        edges.push({
          ...edge,
          id: conversionIndex ? `${edge.id}:final` : edge.id,
          source: sourceNode.id,
          sourceHandle
        });
        completed = true;
        break;
      }
      if (!compatibility.convertible || !compatibility.conversion?.nodeKind) break;
      conversionIndex += 1;
      const conversionId = `conversion:${edge.id}:${conversionIndex}`;
      const conversionRecord = normalizeRecord({
        kind: compatibility.conversion.nodeKind,
        sourceType: compatibility.conversion.sourceType,
        outputType: compatibility.conversion.targetType,
        type: compatibility.conversion.targetType,
        entityType: compatibility.conversion.targetType.entityType
          || compatibility.conversion.sourceType.entityType
          || ''
      }, conversionId);
      const conversionNode = {
        id: conversionId,
        type: 'processNode',
        position: conversionPosition(sourceNode, targetNode, conversionIndex),
        data: { refId: conversionId }
      };
      records[conversionId] = conversionRecord;
      nodes.push(conversionNode);
      graphNodeById.set(conversionId, conversionNode);
      const conversionPorts = migrationPorts(conversionRecord, domain);
      const input = conversionPorts.inputs[0];
      const output = conversionPorts.outputs[0];
      if (!input || !output) break;
      edges.push({
        ...edge,
        id: `${edge.id}:conversion:${conversionIndex}`,
        source: sourceNode.id,
        sourceHandle,
        target: conversionId,
        targetHandle: `${input.role}:${input.id}`
      });
      sourceNode = conversionNode;
      sourceRecord = conversionRecord;
      sourceHandle = `${output.role}:${output.id}`;
    }
    if (!completed) {
      edges.push({
        ...edge,
        source: sourceNode.id,
        sourceHandle,
        id: conversionIndex ? `${edge.id}:unresolved` : edge.id
      });
    }
  }
  return { nodes, edges };
}

function hasResolvableMigrationType(record = {}) {
  if (!['record.getField', 'record.fieldChange', 'predicate.field'].includes(record.kind)) return true;
  return Boolean(record.fieldSchema?.type);
}

function migrationPorts(record, domain = {}) {
  return resolveCatalogNodePorts(record, {
    fieldSchema: record.fieldSchema || migrationFieldSchema(domain, record.entityType, record.path),
    fieldSchemas: record.fieldSchemas || migrationFieldSchemas(domain, record.entityType)
  });
}

function migrationFieldSchemas(domain, entityType) {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.fieldSchemas?.[key] || domain.fieldSchemas?.[camel] || [];
}

function migrationFieldPolicy(domain, entityType) {
  const key = String(entityType || '');
  const camel = key.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domain.fieldAccess?.[key] || domain.fieldAccess?.[camel] || {};
}

function migrationFieldSchema(domain, entityType, path) {
  return migrationFieldSchemas(domain, entityType).find(field => field.path === path) || null;
}

function portForMigrationHandle(ports = [], handle = '') {
  const clean = cleanHandle(handle);
  if ((!clean || clean === 'input' || clean === 'output') && ports.length === 1) return ports[0];
  return ports.find(port => port.id === clean) || null;
}

function conversionPosition(source, target, index) {
  const ratio = index / 5;
  return {
    x: Math.round(Number(source.position?.x || 0) + (Number(target.position?.x || 0) - Number(source.position?.x || 0)) * ratio),
    y: Math.round(Number(source.position?.y || 0) + (Number(target.position?.y || 0) - Number(source.position?.y || 0)) * ratio)
  };
}

function pruneDeadDataNodes(initialNodes, records, initialEdges) {
  let nodes = [...initialNodes];
  let edges = [...initialEdges];
  let changed = true;
  while (changed) {
    changed = false;
    const removable = new Set(nodes.flatMap(node => {
      const id = String(node.id);
      const record = records[String(node.data?.refId || id)];
      if (!record || record.kind.startsWith('effect.') || record.kind.startsWith('control.')) return [];
      return edges.some(edge => String(edge.source) === id) ? [] : [id];
    }));
    if (!removable.size) break;
    for (const node of nodes) {
      if (removable.has(String(node.id))) delete records[String(node.data?.refId || node.id)];
    }
    nodes = nodes.filter(node => !removable.has(String(node.id)));
    edges = edges.filter(edge => !removable.has(String(edge.source)) && !removable.has(String(edge.target)));
    changed = true;
  }
  return { nodes, edges };
}

function expandLegacyActionInputs(process, initialNodes, records, initialEdges) {
  const nodes = [...initialNodes];
  let edges = [...initialEdges];
  for (const graphNode of process.graph?.nodes || []) {
    if (graphNode.type !== 'action') continue;
    const actionId = String(graphNode.data?.refId || graphNode.id);
    const action = process.actions?.[actionId];
    const effect = records[`effect:${actionId}`];
    if (!action || !effect) continue;
    const incoming = () => edges.filter(edge => String(edge.target) === String(graphNode.id) && edge.role === 'data');
    if (action.actionKind === 'createEntity') {
      const fields = actionDataFields(action);
      ensurePromptSources(nodes, records, edges, graphNode, fields, 'data');
      edges = removeInvalidOptionalParentEdges(
        graphNode,
        nodes,
        records,
        edges,
        action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || ''
      );
      const draftId = `draft:${actionId}`;
      addOperationNode(nodes, records, draftId, {
        kind: 'record.entityDraft',
        entityType: effect.entityType,
        fields: fields.map(field => field.path),
        fieldSchemas: fields.map(field => ({
          path: field.path,
          type: legacyProcessType(field.input?.type || field.input?.kind || 'json', {
            entityType: field.input?.entityType,
            multiple: field.input?.multiple,
            optional: !field.input?.required
          }),
          required: Boolean(field.input?.required)
        }))
      }, graphNode, -180);
      edges = edges.map(edge => {
        if (!incoming().includes(edge)) return edge;
        const field = fields.find(item => item.id === cleanHandle(edge.targetHandle));
        return field ? { ...edge, target: draftId, targetHandle: `data:${field.path}` } : edge;
      }).filter(edge => (
        String(edge.target) !== String(graphNode.id)
        || edge.role === 'control'
        || cleanHandle(edge.targetHandle) === 'parent'
      ));
      edges.push(dataEdge(draftId, 'record', graphNode.id, 'draft'));
    }
    if (action.actionKind === 'runCommand') {
      const fields = actionDataFields(action).map(field => ({ ...field, path: field.name || field.id }));
      ensurePromptSources(nodes, records, edges, graphNode, fields, 'parameters');
      const parametersId = `parameters:${actionId}`;
      addOperationNode(nodes, records, parametersId, {
        kind: 'record.construct',
        schema: `command:${action.commandId}`,
        fields: fields.map(field => field.path),
        fieldSchemas: fields.map(field => ({
          path: field.path,
          type: legacyProcessType(field.input?.type || field.input?.kind || 'json', {
            entityType: field.input?.entityType,
            multiple: field.input?.multiple,
            optional: !field.input?.required
          }),
          required: Boolean(field.input?.required)
        }))
      }, graphNode, -180);
      edges = edges.map(edge => {
        if (String(edge.target) !== String(graphNode.id) || edge.role !== 'data') return edge;
        const field = fields.find(item => item.id === cleanHandle(edge.targetHandle));
        return field ? { ...edge, target: parametersId, targetHandle: `data:${field.path}` } : edge;
      }).filter(edge => String(edge.target) !== String(graphNode.id) || edge.role === 'control');
      edges.push(dataEdge(parametersId, 'record', graphNode.id, 'parameters'));
    }
    if (action.actionKind === 'changeStatus') {
      effect.entityType ||= inferIncomingEntityType(graphNode, nodes, records, edges);
      edges = replaceWithCurrentEntityRef(
        nodes,
        records,
        edges,
        graphNode,
        effect.entityType,
        'entity',
        actionId
      );
      const statusId = `status:${actionId}`;
      addOperationNode(nodes, records, statusId, {
        kind: 'source.literalItem',
        value: action.status?.to || action.access?.statusTo || '',
        type: { base: 'status', shape: 'item', nullable: false, entityType: effect.entityType || '' }
      }, graphNode, -180);
      edges = edges.filter(edge => (
        String(edge.target) !== String(graphNode.id)
        || edge.role === 'control'
        || cleanHandle(edge.targetHandle) === 'entity'
      ));
      edges.push(dataEdge(statusId, 'value', graphNode.id, 'status'));
    }
    if (action.actionKind === 'updateEntity') {
      const status = action.status?.to || action.access?.statusTo;
      const fields = status ? [] : actionDataFields(action);
      ensurePromptSources(nodes, records, edges, graphNode, fields, 'data');
      edges = replaceWithCurrentEntityRef(
        nodes,
        records,
        edges,
        graphNode,
        effect.entityType,
        'entity',
        actionId
      );
      if (status) {
        effect.kind = 'effect.changeStatus';
        const statusId = `status:${actionId}`;
        addOperationNode(nodes, records, statusId, {
          kind: 'source.literalItem',
          value: status,
          type: { base: 'status', shape: 'item', nullable: false, entityType: effect.entityType || '' }
        }, graphNode, -180);
        edges = edges.filter(edge => (
          String(edge.target) !== String(graphNode.id)
          || edge.role === 'control'
          || cleanHandle(edge.targetHandle) === 'entity'
        ));
        edges.push(dataEdge(statusId, 'value', graphNode.id, 'status'));
        continue;
      }
      const changeIds = [];
      for (const [index, field] of fields.entries()) {
        const changeId = `change:${actionId}:${index + 1}`;
        changeIds.push(changeId);
        addOperationNode(nodes, records, changeId, {
          kind: 'record.fieldChange',
          entityType: effect.entityType || '',
          path: field.path,
          operation: 'set'
        }, graphNode, -360, index * 90);
        edges = edges.map(edge => (
          String(edge.target) === String(graphNode.id)
          && edge.role === 'data'
          && cleanHandle(edge.targetHandle) === field.id
            ? { ...edge, target: changeId, targetHandle: 'data:value' }
            : edge
        ));
      }
      edges = edges.filter(edge => (
        String(edge.target) !== String(graphNode.id)
        || edge.role === 'control'
        || cleanHandle(edge.targetHandle) === 'entity'
      ));
      if (changeIds.length) {
        let patchSource = changeIds[0];
        for (let index = 1; index < changeIds.length; index += 1) {
          const mergeId = `merge:${actionId}:${index}`;
          addOperationNode(nodes, records, mergeId, {
            kind: 'record.mergeChanges',
            entityType: effect.entityType || ''
          }, graphNode, -180, index * 90);
          edges.push(dataEdge(patchSource, 'change', mergeId, 'left'));
          edges.push(dataEdge(changeIds[index], 'change', mergeId, 'right'));
          patchSource = mergeId;
        }
        edges.push(dataEdge(patchSource, changeIds.length > 1 ? 'value' : 'change', graphNode.id, 'changes'));
      }
    }
  }
  return { nodes, edges };
}

function inferIncomingEntityType(graphNode, nodes, records, edges) {
  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  const types = edges
    .filter(edge => (
      String(edge.target) === String(graphNode.id)
      && edge.role === 'data'
      && ['entity', 'input'].includes(cleanHandle(edge.targetHandle))
    ))
    .map(edge => nodeById.get(String(edge.source)))
    .map(node => records[String(node?.data?.refId || node?.id || '')]?.entityType)
    .filter(Boolean);
  const unique = [...new Set(types)];
  return unique.length === 1 ? unique[0] : '';
}

function migrateLegacyActionMetadata(initialActions = {}, records = {}, domain = {}) {
  const actions = Object.fromEntries(Object.entries(initialActions || {}).map(([id, action]) => [id, {
    ...action,
    inputs: (action.inputs || []).map(input => ({ ...input })),
    outputs: (action.outputs || []).map(output => ({ ...output }))
  }]));
  for (const record of Object.values(records)) {
    if (!record.legacyActionId || !record.entityType || !actions[record.legacyActionId]) continue;
    const action = actions[record.legacyActionId];
    action.entityType ||= record.entityType;
    action.inputs = action.inputs.map(input => (
      input.id === 'entity' && !input.entityType ? { ...input, entityType: record.entityType } : input
    ));
    action.outputs = action.outputs.map(output => (
      ['entity', 'created'].includes(output.id) && !output.entityType
        ? { ...output, entityType: record.entityType }
        : output
    ));
    const schemas = migrationFieldSchemas(domain, action.entityType);
    const fieldPolicy = migrationFieldPolicy(domain, action.entityType);
    if (action.projection?.fields) {
      action.projection = {
        ...action.projection,
        fields: expandLegacyFieldSelectors(action.projection.fields, schemas, 'readable', fieldPolicy.read)
      };
    }
    if (action.mutation?.fields) {
      action.mutation = {
        ...action.mutation,
        fields: expandLegacyFieldSelectors(action.mutation.fields, schemas, 'writable', fieldPolicy.write)
      };
    }
  }
  return actions;
}

function expandLegacyFieldSelectors(fields, schemas, access, allowedSelectors = []) {
  return [...new Set((fields || []).flatMap(path => {
    const value = String(path || '');
    if (!value.endsWith('.*')) return value ? [value] : [];
    const prefix = value.slice(0, -1);
    return schemas
      .filter(schema => (
        schema[access] !== false
        && schema.path.startsWith(prefix)
        && allowedSelectors.some(selector => fieldSelectorMatches(selector, schema.path))
      ))
      .map(schema => schema.path);
  }))];
}

function fieldSelectorMatches(selector, path) {
  const value = String(selector || '');
  return value === path || (value.endsWith('.*') && path.startsWith(value.slice(0, -1)));
}

function removeInvalidOptionalParentEdges(graphNode, nodes, records, edges, parentEntityType) {
  if (!parentEntityType) return edges;
  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  return edges.filter(edge => {
    if (String(edge.target) !== String(graphNode.id)
      || edge.role !== 'data'
      || cleanHandle(edge.targetHandle) !== 'parent') return true;
    const sourceNode = nodeById.get(String(edge.source));
    const sourceRecord = records[String(sourceNode?.data?.refId || sourceNode?.id || '')];
    return !sourceRecord?.entityType || sourceRecord.entityType === parentEntityType;
  });
}

function actionDataFields(action = {}) {
  return (action.inputs || []).flatMap(input => {
    if (['trigger', 'status', 'entity', 'parent'].includes(input.id) || input.kind === 'event' || input.kind === 'status') return [];
    const cleanId = cleanHandle(input.id);
    const constructionInput = (action.construction?.inputs || []).find(item => (
      cleanHandle(item.id) === cleanId
    ));
    const mergedInput = { ...input, ...(constructionInput || {}) };
    const rawPath = constructionInput?.path || input.dataPath || input.path || input.name || input.id?.replace(/^field:/, '');
    const path = String(rawPath || '').replace(/^data\./, '');
    return path ? [{ id: cleanId, path, name: mergedInput.name, input: mergedInput }] : [];
  });
}

function ensurePromptSources(nodes, records, edges, graphNode, fields, root) {
  for (const [index, field] of fields.entries()) {
    const connected = edges.some(edge => (
      String(edge.target) === String(graphNode.id)
      && edge.role === 'data'
      && cleanHandle(edge.targetHandle) === field.id
    ));
    if (connected) continue;
    const id = `input:${graphNode.id}:${index + 1}`;
    addOperationNode(nodes, records, id, {
      kind: 'source.processInput',
      path: `${root}.${field.path}`,
      type: legacyProcessType(field.input?.kind || 'json', {
        entityType: field.input?.entityType,
        multiple: field.input?.multiple
      })
    }, graphNode, -540, index * 90);
    edges.push(dataEdge(id, 'value', graphNode.id, field.id));
  }
}

function replaceWithCurrentEntityRef(nodes, records, edges, graphNode, entityType, targetHandle, actionId) {
  const readId = `current:${targetHandle}:${actionId}`;
  const refId = `ref:${targetHandle}:${actionId}`;
  addOperationNode(nodes, records, readId, {
    kind: 'read.currentEntity',
    entityType
  }, graphNode, -540);
  addOperationNode(nodes, records, refId, {
    kind: 'value.toEntityRef',
    entityType
  }, graphNode, -360);
  const filtered = edges.filter(edge => (
    String(edge.target) !== String(graphNode.id)
    || edge.role !== 'data'
    || cleanHandle(edge.targetHandle) !== targetHandle
  ));
  filtered.push(dataEdge(readId, 'entity', refId, 'value'));
  filtered.push(dataEdge(refId, 'value', graphNode.id, targetHandle));
  return filtered;
}

function addOperationNode(nodes, records, id, record, anchor = {}, xOffset = 0, yOffset = 0) {
  if (records[id]) throw new Error(`Cannot migrate duplicate generated process operation ${id}`);
  records[id] = normalizeRecord(record, id);
  nodes.push({
    id,
    type: 'processNode',
    position: {
      x: Number(anchor.position?.x || 0) + xOffset,
      y: Number(anchor.position?.y || 0) + yOffset
    },
    data: { refId: id }
  });
}

function dataEdge(source, sourceHandle, target, targetHandle) {
  return {
    id: `${source}-${sourceHandle}-${target}-${targetHandle}`,
    source,
    sourceHandle: `data:${sourceHandle}`,
    target,
    targetHandle: `data:${targetHandle}`,
    role: 'data'
  };
}

function migrateGraphNode(node, sourceRef, process) {
  if (node.type === 'role' || node.type === 'user' || node.type === 'statusDefinition') return null;
  if (node.type === 'processNode') {
    const record = process.processNodes?.[sourceRef];
    if (!record) throw new Error(`Cannot migrate process node ${sourceRef}: record is missing`);
    const kind = KIND_MAP[record.kind] || record.kind;
    if (!getProcessNodeDefinition(kind)) throw new Error(`Cannot migrate process node ${sourceRef}: unknown kind ${record.kind || '(empty)'}`);
    return {
      refId: sourceRef,
      record: normalizeRecord({ ...record, kind }, sourceRef)
    };
  }
  if (node.type === 'valueInput') {
    const input = process.valueInputs?.[sourceRef];
    if (!input) throw new Error(`Cannot migrate value input ${sourceRef}: record is missing`);
    const shape = input.structure === 'list' ? 'list' : input.structure === 'tree' ? 'tree' : 'item';
    return {
      refId: `source:${sourceRef}`,
      record: normalizeRecord({
        ...input,
        kind: shape === 'tree' ? 'source.literalTree' : shape === 'list' ? 'source.literalList' : 'source.literalItem',
        type: legacyProcessType(input.valueType || 'string', { multiple: shape === 'list' }),
        shape
      }, `source:${sourceRef}`)
    };
  }
  if (node.type === 'action') {
    const action = process.actions?.[sourceRef];
    if (!action) throw new Error(`Cannot migrate action ${sourceRef}: record is missing`);
    return {
      refId: `effect:${sourceRef}`,
      record: normalizeRecord({
        ...action,
        entityType: action.entityType
          || action.inputs?.find(input => input.entityType)?.entityType
          || action.outputs?.find(output => output.entityType)?.entityType
          || '',
        kind: effectKind(action.actionKind),
        legacyInputs: action.inputs || [],
        legacyActionId: sourceRef
      }, `effect:${sourceRef}`)
    };
  }
  if (node.type === 'service') {
    const service = process.services?.[sourceRef];
    if (!service) throw new Error(`Cannot migrate service ${sourceRef}: record is missing`);
    return {
      refId: `effect:${sourceRef}`,
      record: normalizeRecord({ ...service, kind: 'effect.runCommand', legacyServiceId: sourceRef }, `effect:${sourceRef}`)
    };
  }
  if (node.type === 'entity') {
    const profile = process.entityProfiles?.[sourceRef];
    if (!profile) throw new Error(`Cannot migrate entity profile ${sourceRef}: record is missing`);
    return {
      refId: `read:${sourceRef}`,
      record: normalizeRecord({ kind: 'read.currentEntity', entityType: profile.entityType }, `read:${sourceRef}`)
    };
  }
  if (node.type === 'socket') {
    const socket = process.sockets?.[sourceRef];
    if (!socket) throw new Error(`Cannot migrate socket ${sourceRef}: record is missing`);
    return {
      refId: `socket:${sourceRef}`,
      record: normalizeRecord({
        ...socket,
        kind: socket.direction === 'inbound' ? 'source.processInput' : 'effect.sendEntity',
        socketId: sourceRef,
        type: legacyProcessType('entity', { entityType: socket.entityType })
      }, `socket:${sourceRef}`)
    };
  }
  throw new Error(`Cannot migrate graph node ${node.id}: unsupported type ${node.type || '(empty)'}`);
}

function normalizeRecord(record, id) {
  const kind = record.kind;
  const shape = record.shape || record.structure || 'item';
  const path = record.block
    ? canonicalBlockPath(record.block, record.path)
    : record.path;
  const normalized = {
    ...record,
    id,
    kind,
    shape,
    ...(path ? { path } : {}),
    type: record.type?.base ? record.type : legacyProcessType(record.valueType || 'json', {
      multiple: shape === 'list',
      entityType: record.entityType,
      block: record.block,
      optional: record.optional
    })
  };
  delete normalized.inputs;
  delete normalized.outputs;
  delete normalized.structure;
  delete normalized.valueType;
  return normalized;
}

function migrateEdge(edge, source, target) {
  const rawSourceHandle = cleanHandle(edge.sourceHandle);
  let sourceHandle = migrateHandle(cleanHandle(edge.sourceHandle), source.record, 'output');
  const targetHandle = migrateHandle(cleanHandle(edge.targetHandle), target.record, 'input');
  if (source.record.kind.startsWith('effect.')
    && !['event', 'trigger', 'success', 'failure'].includes(rawSourceHandle)) {
    sourceHandle = 'result';
  }
  if (!sourceHandle || !targetHandle) return null;
  const control = isControlConnection(source.record, sourceHandle, target.record, targetHandle);
  return {
    ...edge,
    sourceHandle: `${control ? 'control' : 'data'}:${sourceHandle}`,
    targetHandle: `${control ? 'control' : 'data'}:${targetHandle}`,
    role: control ? 'control' : 'data'
  };
}

function migrateHandle(handle, record, direction) {
  if (record.kind.startsWith('source.')) return direction === 'output' ? 'value' : handle;
  if (record.kind.startsWith('effect.')) {
    if (direction === 'output') return handle === 'failure' ? 'failure' : 'success';
    if (['trigger', 'event', 'in'].includes(handle)) return 'in';
    if (handle === 'input') {
      const businessInputs = (record.legacyInputs || []).filter(input => (
        !['trigger', 'status'].includes(input.id)
        && input.kind !== 'event'
        && input.kind !== 'status'
      ));
      if (businessInputs.length === 1) return businessInputs[0].id;
      const wiredInputs = businessInputs.filter(input => (
        input.prompt === false
        || (input.required && !input.prompt && (input.entityType || input.capability || input.accepts?.length))
      ));
      if (wiredInputs.length === 1) return wiredInputs[0].id;
      if (['effect.updateEntity', 'effect.changeStatus', 'effect.sendEntity', 'effect.generateAttachment'].includes(record.kind)) {
        return 'entity';
      }
      return 'in';
    }
    if (record.kind === 'effect.createEntity' && ['data', 'entity', 'draft'].includes(handle)) return 'draft';
    return handle;
  }
  const mapped = {
    items: record.kind === 'collection.count' ? 'value' : 'items',
    entities: record.kind === 'collection.itemAt' ? 'items' : 'entities',
    entity: record.kind === 'record.getField' ? 'value' : record.kind === 'record.fieldChange' ? null : 'entity',
    block: record.kind === 'record.fieldChange' ? 'value' : 'value',
    fallback: 'fallback',
    predicate: 'predicate',
    mask: 'predicate',
    output: 'value',
    result: 'result'
  };
  return Object.prototype.hasOwnProperty.call(mapped, handle) ? mapped[handle] : (handle || 'value');
}

function isControlConnection(source, sourceHandle, target, targetHandle) {
  return source.kind.startsWith('control.')
    || target.kind.startsWith('control.')
    || source.kind.startsWith('effect.') && ['success', 'failure'].includes(sourceHandle)
    || target.kind.startsWith('effect.') && targetHandle === 'in';
}

function effectKind(actionKind = '') {
  const kind = {
    createEntity: 'effect.createEntity',
    updateEntity: 'effect.updateEntity',
    changeStatus: 'effect.changeStatus',
    runCommand: 'effect.runCommand',
    sendToOrganization: 'effect.sendEntity',
    generateAttachment: 'effect.generateAttachment'
  }[actionKind];
  if (!kind) throw new Error(`Cannot migrate unsupported action kind ${actionKind || '(empty)'}`);
  return kind;
}

function canonicalBlockPath(block, path) {
  const cleanBlock = String(block || '').trim();
  const cleanPath = String(path || '').trim();
  if (!cleanBlock || !cleanPath || cleanPath.startsWith(`${cleanBlock}.`)) return cleanPath;
  return `${cleanBlock}.${cleanPath}`;
}

function cleanHandle(handle = '') {
  return String(handle).replace(/^(?:(?:input|output|data|control|success|failure):)+/, '');
}

function isV3Graph(process) {
  return (process.graph?.nodes || []).every(node => (
    node.type === 'processNode'
    && getProcessNodeDefinition(process.processNodes?.[String(node.data?.refId || node.id)]?.kind)
  ));
}

function inferMigratedEntityTypes(records, nodes, edges) {
  const recordIdByNode = new Map(nodes.map(node => [String(node.id), String(node.data?.refId || node.id)]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const node of nodes) {
      const record = records[recordIdByNode.get(String(node.id))];
      if (!record || record.entityType || !requiresEntityType(record.kind)) continue;
      const neighbors = edges
        .filter(edge => String(edge.source) === String(node.id) || String(edge.target) === String(node.id))
        .map(edge => String(edge.source) === String(node.id) ? edge.target : edge.source)
        .map(id => records[recordIdByNode.get(String(id))]?.entityType)
        .filter(Boolean);
      const types = [...new Set(neighbors)];
      if (types.length === 1) {
        record.entityType = types[0];
        changed = true;
      }
    }
    if (!changed) break;
  }
}

function requiresEntityType(kind = '') {
  return ['record.', 'predicate.', 'read.', 'effect.'].some(prefix => kind.startsWith(prefix))
    && !['record.construct', 'record.deconstruct', 'effect.runCommand'].includes(kind);
}
