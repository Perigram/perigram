import { computed, nextTick, ref, unref } from 'vue';
import {
  CORE_GRAPH_PROVIDER,
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  assertValidGraphDocument,
  createCoreGraphDataProvider,
  CORE_DATA_PROVIDER,
  createGraphExecutionRecord,
  evaluateProceduralGraph,
  normalizeGraphDocument,
  validateGraphDocument
} from '@perigram/core';
import { compareNodePorts, createNodeProviderRegistry, normalizeNodeProvider } from '@perigram/plugin-sdk/nodes';
import {
  PROCESS_PROCEDURAL_PROVIDER,
  PROCESS_PROCEDURAL_VERSION,
  createProcessProceduralExecutor,
  registerProcessGraphNodes,
  createProcessGraphNodeResolver,
  createProcessProceduralNodeResolver
} from '@perigram/processes';
import { useProcessDesignerCanvas } from '~/composables/useProcessDesignerCanvas.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { mintId } from '~/utils/processDesignerIdentity.js';

const operation = (id, version = '1') => ({
  provider: CORE_GRAPH_PROVIDER,
  id,
  version
});

const stableId = prefix => mintId(prefix).replaceAll('_', '-');
const isJsonValue = (value, seen = new Set()) => {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  seen.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
};
const defaultContract = Object.freeze({
  shape: 'item',
  semantic: { base: 'json' }
});

export function createEmptyGraphDocument({ id = stableId('graph'), name = '' } = {}) {
  return {
    format: GRAPH_DOCUMENT_FORMAT,
    version: GRAPH_DOCUMENT_VERSION,
    id,
    revision: stableId('rev'),
    name,
    interface: { inputs: [], outputs: [] },
    nodes: [],
    edges: []
  };
}

export function useGraphDocumentSession({ t, providers = [], graphDocuments = [], queryOrganizationData = null, finalizeExecution = null }) {
  const graphDocument = ref(createEmptyGraphDocument());
  const nodes = ref([]);
  const edges = ref([]);
  const validation = ref(null);
  const previewResult = ref(null);
  const executionRecord = ref(null);
  const inputBindings = ref({});
  const previewError = ref('');
  const previewRunning = ref(false);
  const contextPaletteSearch = ref(null);
  const contextPalette = ref({
    open: false,
    x: 0,
    y: 0,
    graphPosition: { x: 0, y: 0 },
    socket: null
  });

  const registry = createNodeProviderRegistry();
  registerProcessGraphNodes(registry);
  const processGraphResolver = createProcessGraphNodeResolver();
  const processProceduralResolver = createProcessProceduralNodeResolver();
  const processExecutor = createProcessProceduralExecutor();
  const providerExecutors = new Map([[PROCESS_PROCEDURAL_PROVIDER, processExecutor]]);
  const providerPreviewRenderers = new Map();
  const providerGeneration = ref(0);
  const coreDataProvider = createCoreGraphDataProvider();

  const groupLabels = {
    sources: t('processDesigner.graphSources'),
    values: t('processDesigner.graphValues'),
    collections: t('processDesigner.graphCollections'),
    records: t('processDesigner.graphRecords'),
    query: t('processDesigner.graphQueries')
  };
  const groupSignals = {
    sources: 'identity',
    values: 'quantity',
    collections: 'data',
    records: 'structure',
    source: 'identity',
    value: 'quantity',
    collection: 'data',
    tree: 'structure',
    record: 'structure',
    query: 'data'
  };

  const paletteGroups = computed(() => {
    providerGeneration.value;
    const groups = [{
      source: 'framework',
      id: 'graph-boundaries',
      label: t('processDesigner.graphBoundaries'),
      signal: 'structure',
      items: [
        {
          id: 'graph-input',
          label: t('processDesigner.graphInput'),
          description: t('processDesigner.graphInputDescription'),
          signal: 'structure',
          operation: operation(GRAPH_INPUT_OPERATION)
        },
        {
          id: 'graph-output',
          label: t('processDesigner.graphOutput'),
          description: t('processDesigner.graphOutputDescription'),
          signal: 'structure',
          operation: operation(GRAPH_OUTPUT_OPERATION)
        }
      ]
    }];
    const savedGraphs = (unref(graphDocuments) || [])
      .map(item => item?.graph)
      .filter(graph => graph?.id && graph?.revision && graph.id !== graphDocument.value.id);
    groups.push({
      source: 'graphs',
      id: 'graph-invocation',
      label: t('processDesigner.graphComposition'),
      signal: 'structure',
      items: savedGraphs.length
        ? savedGraphs.map(graph => ({
            id: `use-graph:${graph.id}@${graph.revision}`,
            label: graph.name || graph.id,
            description: t('processDesigner.useGraphDescription'),
            signal: 'structure',
            operation: operation(GRAPH_INVOKE_OPERATION),
            config: {
              graphId: graph.id,
              revision: graph.revision,
              interface: {
                inputs: graph.interface.inputs.map(port => structuredClone(port)),
                outputs: graph.interface.outputs.map(port => structuredClone(port))
              }
            }
          }))
        : [{
            id: 'use-graph',
            label: t('processDesigner.useGraph'),
            description: t('processDesigner.useGraphDescription'),
            signal: 'structure',
            operation: operation(GRAPH_INVOKE_OPERATION),
            config: { graphId: '', revision: '', interface: { inputs: [], outputs: [] } }
          }]
    });
    const grouped = new Map();
    for (const definition of registry.list()) {
      const family = definition.palette.group;
      const groupKey = `${definition.provider}:${family}`;
      if (!grouped.has(groupKey)) grouped.set(groupKey, {
        provider: definition.provider,
        family,
        label: definition.palette?.label || '',
        items: []
      });
      grouped.get(groupKey).items.push({
        id: `${definition.provider}:${definition.id}@${definition.version}`,
        label: definition.label,
        description: definition.description || '',
        keywords: definition.palette?.keywords || [],
        searchTerms: [definition.provider, definition.id, family],
        signal: groupSignals[family] || 'data',
        operation: {
          provider: definition.provider,
          id: definition.id,
          version: definition.version
        },
        config: definition.provider === PROCESS_PROCEDURAL_PROVIDER
          ? { kind: definition.id }
          : {}
      });
    }
    for (const { provider, family, label, items } of grouped.values()) {
      const processProvider = provider === PROCESS_PROCEDURAL_PROVIDER;
      const coreData = provider === CORE_DATA_PROVIDER;
      groups.push({
        source: processProvider || coreData ? 'framework' : 'plugin',
        id: `graph-${provider}-${family}`,
        label: label || groupLabels[family] || humanizePaletteGroup(family),
        signal: groupSignals[family] || 'data',
        items
      });
    }
    return groups;
  });

  function definitionFor(node) {
    const op = node?.data?.operation || node?.operation;
    const config = node?.data?.config || node?.config || {};
    if (!op) return null;
    if (op.provider === CORE_GRAPH_PROVIDER && op.id === GRAPH_INPUT_OPERATION) {
      const port = graphDocument.value.interface.inputs.find(item => item.id === config.interfaceId);
      return port ? {
        provider: op.provider, id: op.id, version: op.version,
        label: t('processDesigner.graphInput'),
        palette: { group: 'graph-boundaries', label: t('processDesigner.graphBoundaries') },
        inputs: [],
        outputs: [{ id: 'value', label: port.label, ...port.contract, required: false }],
        execution: { kind: 'pure' }
      } : null;
    }
    if (op.provider === CORE_GRAPH_PROVIDER && op.id === GRAPH_OUTPUT_OPERATION) {
      const port = graphDocument.value.interface.outputs.find(item => item.id === config.interfaceId);
      return port ? {
        provider: op.provider, id: op.id, version: op.version,
        label: t('processDesigner.graphOutput'),
        palette: { group: 'graph-boundaries', label: t('processDesigner.graphBoundaries') },
        inputs: [{ id: 'value', label: port.label, ...port.contract, required: true }],
        outputs: [],
        execution: { kind: 'pure' }
      } : null;
    }
    if (op.provider === CORE_GRAPH_PROVIDER && op.id === GRAPH_INVOKE_OPERATION) {
      const ports = config.interface || {};
      return {
        provider: op.provider, id: op.id, version: op.version,
        label: t('processDesigner.useGraph'),
        palette: { group: 'graphs', label: t('processDesigner.graphComposition') },
        inputs: (ports.inputs || []).map(port => ({
          id: port.id, label: port.label || port.id,
          ...(port.contract || defaultContract), required: port.required !== false
        })),
        outputs: (ports.outputs || []).map(port => ({
          id: port.id, label: port.label || port.id,
          ...(port.contract || defaultContract), required: false
        })),
        execution: { kind: 'pure' }
      };
    }
    const invocation = { node: { id: node.id }, config, context: {} };
    return processGraphResolver(op, invocation) || registry.resolve(op.provider, op.id, op.version);
  }

  function enrichNode(node) {
    const definition = definitionFor(node);
    const group = definition?.palette?.group || '';
    return {
      ...node,
      type: 'graphNode',
      data: {
        ...node.data,
        definition,
        label: definition?.label || node.data.label || node.data.operation?.id || t('processDesigner.unknownNode'),
        groupLabel: definition?.palette?.label || groupLabels[group] || (group ? humanizePaletteGroup(group) : t('processDesigner.graphBoundaries')),
        error: node.data.error || ''
      }
    };
  }

  function serializeGraph() {
    return normalizeGraphDocument({
      ...graphDocument.value,
      nodes: nodes.value.map(node => ({
        id: node.id,
        operation: node.data.operation,
        config: node.data.config || {},
        position: {
          x: Number(node.position?.x || 0),
          y: Number(node.position?.y || 0)
        }
      })),
      edges: edges.value.map(edge => ({
        id: edge.id,
        source: { node: edge.source, port: edge.sourceHandle },
        target: { node: edge.target, port: edge.targetHandle },
        ...(edge.kind ? { kind: edge.kind } : {}),
        ...(edge.metadata ? { metadata: edge.metadata } : {})
      }))
    });
  }

  const draft = ref({ data: { graph: { viewport: { x: 0, y: 0, zoom: 1 } } } });
  function closeContextPalette() {
    contextPalette.value = { open: false, x: 0, y: 0, graphPosition: { x: 0, y: 0 }, socket: null };
  }
  let selection;
  function syncEdges() {
    edges.value = edges.value.map(edge => ({
      ...edge,
      selected: edge.id === selection?.selectedEdgeId.value
    }));
  }
  selection = useProcessDesignerSelection({
    nodes,
    edges,
    decorateEdge: edge => edge,
    closePalette: closeContextPalette,
    syncEdges
  });

  const selectedBoundaryDeclaration = computed(() => {
    const node = selection.selectedNode.value;
    const operationId = node?.data?.operation?.id;
    const collection = operationId === GRAPH_INPUT_OPERATION
      ? graphDocument.value.interface.inputs
      : operationId === GRAPH_OUTPUT_OPERATION
        ? graphDocument.value.interface.outputs
        : null;
    const interfaceId = node?.data?.config?.interfaceId;
    return collection?.find(port => port.id === interfaceId) || null;
  });

  const selectedGraphNodes = () => nodes.value.filter(node => node.selected);
  const selectedGraphEdges = () => edges.value.filter(edge => edge.selected);
  function deleteGraphSelection() {
    const removed = new Set(selectedGraphNodes().map(node => node.id));
    for (const node of nodes.value) {
      if (!removed.has(node.id)) continue;
      const operationId = node.data.operation?.id;
      const interfaceId = node.data.config?.interfaceId;
      if (operationId === GRAPH_INPUT_OPERATION) {
        graphDocument.value.interface.inputs = graphDocument.value.interface.inputs.filter(port => port.id !== interfaceId);
      } else if (operationId === GRAPH_OUTPUT_OPERATION) {
        graphDocument.value.interface.outputs = graphDocument.value.interface.outputs.filter(port => port.id !== interfaceId);
      }
    }
    const removedEdges = new Set(selectedGraphEdges().map(edge => edge.id));
    nodes.value = nodes.value.filter(node => !removed.has(node.id));
    edges.value = edges.value.filter(edge => !removedEdges.has(edge.id) && !removed.has(edge.source) && !removed.has(edge.target));
    selection.reset();
  }

  const canvas = useProcessDesignerCanvas({
    nodes,
    edges,
    draft,
    selectedNodeId: selection.selectedNodeId,
    selectedEdgeId: selection.selectedEdgeId,
    selectedGraphNodes,
    selectedGraphEdges,
    deleteGraphSelection,
    clearGraphSelection: selection.clearGraphSelection,
    decorateEdge: edge => edge
  });

  function addNode(item, position = null) {
    const nodeId = stableId('node');
    let config = { ...(item.config || {}) };
    let operationValue = item.operation;
    if (operationValue.id === GRAPH_INPUT_OPERATION) {
      const portId = stableId('input');
      graphDocument.value.interface.inputs.push({
        id: portId,
        label: item.label,
        contract: { ...defaultContract },
        required: false,
        default: null
      });
      config = { interfaceId: portId };
    } else if (operationValue.id === GRAPH_OUTPUT_OPERATION) {
      const portId = stableId('output');
      graphDocument.value.interface.outputs.push({
        id: portId,
        label: item.label,
        contract: { ...defaultContract },
        required: true
      });
      config = { interfaceId: portId };
    }
    const raw = {
      id: nodeId,
      type: 'graphNode',
      position: position || canvas.nextNodePosition(),
      data: { operation: operationValue, config, label: item.label }
    };
    const node = enrichNode(raw);
    nodes.value = [...nodes.value, node];
    closeContextPalette();
    return node;
  }

  function onConnect(connection) {
    const source = nodes.value.find(node => node.id === connection.source);
    const target = nodes.value.find(node => node.id === connection.target);
    const sourcePort = definitionFor(source)?.outputs?.find(port => port.id === connection.sourceHandle);
    const targetPort = definitionFor(target)?.inputs?.find(port => port.id === connection.targetHandle);
    if (!sourcePort || !targetPort || !compatible(sourcePort, targetPort)) return;
    if (edges.value.some(edge => edge.target === target.id && edge.targetHandle === targetPort.id)) {
      edges.value = edges.value.filter(edge => !(edge.target === target.id && edge.targetHandle === targetPort.id));
    }
    edges.value = [...edges.value, {
      id: stableId('edge'),
      source: source.id,
      sourceHandle: sourcePort.id,
      target: target.id,
      targetHandle: targetPort.id,
      type: 'default'
    }];
  }

  function updateNodeConfig(nodeId, config) {
    if (nodeId && typeof nodeId === 'object') ({ nodeId, config } = nodeId);
    nodes.value = nodes.value.map(node => node.id === nodeId
      ? enrichNode({ ...node, data: { ...node.data, config, error: '' } })
      : node);
  }

  function hydrateGraphInvocation(nodeId, source) {
    const graph = assertValidGraphDocument(source);
    const node = nodes.value.find(item => item.id === nodeId);
    if (node?.data?.operation?.id !== GRAPH_INVOKE_OPERATION) {
      throw new Error('Selected node is not a Use Graph node');
    }
    node.data.config = {
      ...node.data.config,
      graphId: graph.id,
      revision: graph.revision,
      interface: {
        inputs: graph.interface.inputs.map(port => ({
          id: port.id,
          label: port.label,
          contract: structuredClone(port.contract),
          required: port.required,
          ...(Object.hasOwn(port, 'default') ? { default: structuredClone(port.default) } : {})
        })),
        outputs: graph.interface.outputs.map(port => ({
          id: port.id,
          label: port.label,
          contract: structuredClone(port.contract),
          required: port.required
        }))
      }
    };
    nodes.value = nodes.value.map(item => item.id === nodeId ? enrichNode(item) : item);
    return node.data.config;
  }

  function updateBoundaryDeclaration(nodeId, declaration) {
    if (nodeId && typeof nodeId === 'object') ({ nodeId, declaration } = nodeId);
    const node = nodes.value.find(item => item.id === nodeId);
    const operationId = node?.data?.operation?.id;
    const collection = operationId === GRAPH_INPUT_OPERATION
      ? graphDocument.value.interface.inputs
      : operationId === GRAPH_OUTPUT_OPERATION
        ? graphDocument.value.interface.outputs
        : null;
    const port = collection?.find(item => item.id === node?.data?.config?.interfaceId);
    if (!port || !declaration || typeof declaration !== 'object' || Array.isArray(declaration)) return;
    const contract = declaration.contract;
    if (!contract || typeof contract !== 'object' || Array.isArray(contract)
      || !['item', 'list', 'tree', 'map', 'tuple', 'stream'].includes(contract.shape)
      || !contract.semantic || typeof contract.semantic !== 'object' || Array.isArray(contract.semantic)
      || !Object.keys(contract.semantic).length) {
      throw new Error('A declaration requires a supported shape and a non-empty semantic descriptor');
    }
    if (Object.hasOwn(declaration, 'default') && !isJsonValue(declaration.default)) {
      throw new Error('The default value must be JSON-compatible');
    }
    port.contract = structuredClone(contract);
    port.required = declaration.required !== false;
    if (Object.hasOwn(declaration, 'default')) port.default = structuredClone(declaration.default);
    else delete port.default;
    nodes.value = nodes.value.map(item => item.id === nodeId ? enrichNode(item) : item);
  }

  function updateBoundaryLabel(nodeId, label) {
    if (nodeId && typeof nodeId === 'object') ({ nodeId, label } = nodeId);
    const node = nodes.value.find(item => item.id === nodeId);
    const interfaceId = node?.data?.config?.interfaceId;
    if (!node || !interfaceId) return;
    const collection = node.data.operation.id === GRAPH_INPUT_OPERATION
      ? graphDocument.value.interface.inputs
      : graphDocument.value.interface.outputs;
    const port = collection.find(item => item.id === interfaceId);
    if (port) port.label = String(label || '').trim();
    node.data.label = String(label || '').trim();
    nodes.value = nodes.value.map(item => item.id === nodeId ? enrichNode(item) : item);
  }

  function loadDocument(source) {
    const graph = assertValidGraphDocument(source);
    inputBindings.value = {};
    graphDocument.value = graph;
    nodes.value = graph.nodes.map(node => enrichNode({
      id: node.id,
      type: 'graphNode',
      position: node.position || { x: 0, y: 0 },
      data: { operation: node.operation, config: node.config }
    }));
    edges.value = graph.edges.map(edge => ({
      id: edge.id,
      source: edge.source.node,
      sourceHandle: edge.source.port,
      target: edge.target.node,
      targetHandle: edge.target.port,
      ...(edge.kind ? { kind: edge.kind } : {}),
      ...(edge.metadata ? { metadata: structuredClone(edge.metadata) } : {}),
      type: 'default'
    }));
    selection.reset();
    validation.value = null;
    previewResult.value = null;
    nextTick(canvas.fitInitialCanvas);
    return graph;
  }

  function loadEmpty({ id, name } = {}) {
    return loadDocument(createEmptyGraphDocument({ id: id || stableId('graph'), name: name || '' }));
  }

  function semanticEdgeProblems(graph = serializeGraph()) {
    const byId = new Map(nodes.value.map(node => [node.id, node]));
    const problems = [];
    for (const edge of graph.edges) {
      const source = byId.get(edge.source.node);
      const target = byId.get(edge.target.node);
      const sourcePort = definitionFor(source)?.outputs?.find(port => port.id === edge.source.port);
      const targetPort = definitionFor(target)?.inputs?.find(port => port.id === edge.target.port);
      if (!sourcePort || !targetPort) continue;
      const result = compareNodePorts(sourcePort, targetPort);
      if (!result.compatible) {
        problems.push({
          code: `edge-${result.status}`,
          path: `edges.${edge.id}`,
          message: `Cannot connect ${sourcePort.label || sourcePort.id} to ${targetPort.label || targetPort.id}: ${result.reason}`
        });
      }
    }
    return problems;
  }

  function semanticEdgeWarnings(graph = serializeGraph()) {
    const byId = new Map(nodes.value.map(node => [node.id, node]));
    const warnings = [];
    for (const edge of graph.edges) {
      const source = byId.get(edge.source.node);
      const target = byId.get(edge.target.node);
      const sourcePort = definitionFor(source)?.outputs?.find(port => port.id === edge.source.port);
      const targetPort = definitionFor(target)?.inputs?.find(port => port.id === edge.target.port);
      if (!sourcePort || !targetPort) continue;
      const result = compareNodePorts(sourcePort, targetPort);
      if (result.compatible && result.status === 'conditional') {
        warnings.push({
          code: 'edge-conditional',
          path: `edges.${edge.id}`,
          message: `Connection ${sourcePort.label || sourcePort.id} → ${targetPort.label || targetPort.id} requires runtime value validation: ${result.reason}`
        });
      }
    }
    return warnings;
  }

  function validateCurrentGraph() {
    const graph = serializeGraph();
    const problems = [...validateGraphDocument(graph), ...semanticEdgeProblems(graph)];
    return {
      ok: problems.length === 0,
      errors: problems.map(problem => problem.message),
      warnings: semanticEdgeWarnings(graph).map(warning => warning.message)
    };
  }

  function designerSignature() {
    return JSON.stringify(serializeGraph());
  }

  async function refreshPreview() {
    previewRunning.value = true;
    previewError.value = '';
    executionRecord.value = null;
    const startedAt = new Date().toISOString();
    let graph = null;
    const executionId = stableId('execution');
    try {
      graph = serializeGraph();
      const semanticProblems = semanticEdgeProblems(graph);
      if (semanticProblems.length) {
        throw new Error(semanticProblems.map(problem => problem.message).join('; '));
      }
      const result = await evaluateProceduralGraph({
        graph,
        inputBindings: inputBindings.value,
        resolveNodeDefinition: (op, invocation) => processProceduralResolver(op, invocation)
          || registry.resolve(op.provider, op.id, op.version),
        executeNode: async (definition, invocation) => {
          const executor = providerExecutors.get(definition.provider);
          if (!executor) throw new Error(`No runtime is registered for provider ${definition.provider}`);
          return executor(definition, invocation);
        },
        context: {
          executionId,
          finalizeExecution,
          data: { queryInstances: queryOrganizationData }
        }
      });
      const completedAt = new Date().toISOString();
      executionRecord.value = createGraphExecutionRecord({
        id: executionId,
        graph: { id: graph.id, revision: graph.revision },
        profile: 'procedural-preview',
        status: 'succeeded',
        startedAt,
        completedAt,
        inputs: inputBindings.value,
        outputs: result.outputs,
        nodeOutputs: result.nodeOutputs,
        diagnostics: [],
        provenance: {
          nodes: graph.nodes.map(node => ({
            nodeId: node.id,
            operation: node.operation,
            outputs: result.nodeOutputs[node.id] || {}
          })),
          invocations: graph.nodes
            .filter(node => node.operation?.id === GRAPH_INVOKE_OPERATION)
            .map(node => ({
              nodeId: node.id,
              graphId: node.config?.graphId,
              revision: node.config?.revision || node.config?.graphRevision
            }))
        },
        readSet: result.readSet,
        artifacts: []
      });
      previewResult.value = result;
      return result;
    } catch (error) {
      previewError.value = error?.message || String(error);
      previewResult.value = null;
      if (graph) {
        try {
          executionRecord.value = createGraphExecutionRecord({
            id: executionId,
            graph: { id: graph.id, revision: graph.revision },
            profile: 'procedural-preview',
            status: 'failed',
            startedAt,
            completedAt: new Date().toISOString(),
            inputs: inputBindings.value,
            outputs: {},
            nodeOutputs: {},
            diagnostics: [{ message: previewError.value }],
            provenance: {
              nodes: graph.nodes.map(node => ({ nodeId: node.id, operation: node.operation, outputs: {} })),
              invocations: graph.nodes.filter(node => node.operation?.id === GRAPH_INVOKE_OPERATION).map(node => ({
                nodeId: node.id, graphId: node.config?.graphId,
                revision: node.config?.revision || node.config?.graphRevision
              }))
            },
            readSet: error.readSet || { instances: [], relations: [], queries: [] },
            artifacts: []
          });
        } catch {
          executionRecord.value = null;
        }
      }
      return null;
    } finally {
      previewRunning.value = false;
    }
  }

  function setGraphInputBinding(portId, value) {
    if (portId && typeof portId === 'object') ({ portId, value } = portId);
    inputBindings.value = { ...inputBindings.value, [portId]: value };
    previewResult.value = null;
    previewError.value = '';
  }

  function registerProvider(definition, executor) {
    if (typeof executor !== 'function') throw new TypeError('Provider executor must be a function');
    const normalized = registry.register(definition);
    providerExecutors.set(normalized.provider, executor);
    return normalized;
  }

  function registerNodeProvider(contribution, pluginId = null) {
    const provider = normalizeNodeProvider(contribution);
    if (pluginId) {
      const owner = `plugin.${String(pluginId)}`;
      if (provider.provider !== owner && !provider.provider.startsWith(`${owner}.`)) {
        throw new Error(`Node provider ${provider.provider} is not owned by installed plugin ${pluginId}`);
      }
    }
    for (const definition of provider.definitions) registerProvider(definition, provider.execute);
    for (const [rendererId, renderer] of Object.entries(provider.previewRenderers)) {
      providerPreviewRenderers.set(`${provider.provider}:${rendererId}`, renderer);
    }
    providerGeneration.value += 1;
    return provider;
  }

  registerNodeProvider(coreDataProvider);
  for (const contribution of providers) registerNodeProvider(contribution);

  function openPanePalette(event) {
    event?.preventDefault?.();
    const point = canvas.clientPoint(event);
    const rect = canvas.canvasFrame.value?.getBoundingClientRect?.();
    contextPalette.value = {
      open: true,
      x: Math.max(8, Math.min((rect?.width || 1200) - 304, point.x - (rect?.left || 0))),
      y: Math.max(8, Math.min((rect?.height || 720) - 336, point.y - (rect?.top || 0))),
      graphPosition: canvas.clientToGraphPosition(point),
      socket: contextPalette.value.socket
    };
  }

  function beginSocketConnection(connection = {}) {
    contextPalette.value.socket = {
      nodeId: connection.nodeId,
      handleId: connection.handleId,
      handleType: connection.handleType
    };
  }

  function endSocketConnection(event) {
    const socket = contextPalette.value.socket;
    if (!socket) return;
    const target = event?.target;
    const endedOnPane = target?.classList?.contains('vue-flow__pane')
      || target?.classList?.contains('vue-flow__transformationpane');
    if (endedOnPane) openPanePalette(event);
    else contextPalette.value.socket = null;
  }

  function addContextNode(item) {
    const socket = contextPalette.value.socket;
    const node = addNode(item, contextPalette.value.graphPosition);
    if (socket && node) {
      const existing = nodes.value.find(candidate => candidate.id === socket.nodeId);
      const existingDefinition = definitionFor(existing);
      const candidateDefinition = definitionFor(node);
      if (socket.handleType === 'source') {
        const output = existingDefinition?.outputs?.find(port => port.id === socket.handleId);
        const input = candidateDefinition?.inputs?.find(port => compatible(output, port));
        if (input) onConnect({ source: existing.id, sourceHandle: output.id, target: node.id, targetHandle: input.id });
      } else {
        const input = existingDefinition?.inputs?.find(port => port.id === socket.handleId);
        const output = candidateDefinition?.outputs?.find(port => compatible(port, input));
        if (output) onConnect({ source: node.id, sourceHandle: output.id, target: existing.id, targetHandle: input.id });
      }
    }
    closeContextPalette();
  }

  function compatible(source, target) {
    return compareNodePorts(source, target).compatible;
  }

  const contextPaletteGroups = computed(() => paletteGroups.value);
  const contextPaletteChipGroups = contextPaletteGroups;

  return {
    nodes,
    edges,
    graphDocument,
    validation: computed(() => validateCurrentGraph()),
    previewResult,
    executionRecord,
    inputBindings,
    previewError,
    previewRunning,
    paletteGroups,
    previewRenderers: computed(() => {
      providerGeneration.value;
      return Object.fromEntries(providerPreviewRenderers);
    }),
    nodeDefinitions: computed(() => Object.fromEntries(nodes.value.map(node => [node.id, definitionFor(node)]))),
    contextPaletteGroups,
    contextPaletteChipGroups,
    contextPalette,
    contextPaletteSearch,
    selectedNode: selection.selectedNode,
    selectedBoundaryDeclaration,
    selectedNodeId: selection.selectedNodeId,
    selectedGraphNodes,
    selectedGraphEdges,
    canvasFrame: canvas.canvasFrame,
    touchPanDrag: canvas.touchPanDrag,
    designerViewport: canvas.designerViewport,
    bindFrame: instance => { canvas.canvasFrame.value = instance; },
    bindContextPaletteSearch: instance => { contextPaletteSearch.value = instance; },
    handleDesignerPointerDown: canvas.handleDesignerPointerDown,
    handleDesignerFocus: canvas.handleDesignerFocus,
    handleDesignerWheel: canvas.handleDesignerWheel,
    beginSocketConnection,
    endSocketConnection,
    frameSelectedNodes: canvas.frameSelectedNodes,
    frameAllNodes: canvas.frameAllNodes,
    zoomCanvasIn: canvas.zoomCanvasIn,
    zoomCanvasOut: canvas.zoomCanvasOut,
    resetCanvasZoom: canvas.resetCanvasZoom,
    deleteGraphSelection,
    addNode,
    addContextNode,
    closeContextPalette,
    openPanePalette,
    onConnect,
    selectNode: selection.selectNode,
    selectEdge: selection.selectEdge,
    clearGraphSelection: selection.clearGraphSelection,
    updateNodeConfig,
    updateBoundaryLabel,
    updateBoundaryDeclaration,
    hydrateGraphInvocation,
    renameDeclarationNode: () => {},
    loadDocument,
    loadEmpty,
    serializeGraph,
    designerSignature,
    refreshPreview,
    setGraphInputBinding,
    registerProvider,
    registerNodeProvider
  };
}

function humanizePaletteGroup(value = '') {
  return String(value).split(/[-_.]+/).filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
