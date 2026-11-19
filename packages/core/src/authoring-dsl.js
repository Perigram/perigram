import { isRecord, cloneJson, deepFreeze } from './json.js';
import { readRestrictedEdn } from './authoring-reader.js';
import {
  AUTHORING_DOCUMENT_FORMAT,
  AUTHORING_DOCUMENT_VERSION,
  normalizeAuthoringDocument,
  validateAuthoringDocument
} from './authoring-schema.js';
import {
  GRAPH_DOCUMENT_FORMAT,
  GRAPH_DOCUMENT_VERSION,
  CORE_GRAPH_PROVIDER,
  CORE_GRAPH_OPERATION_VERSION,
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION,
  GRAPH_INVOKE_OPERATION,
  GRAPH_TRANSPORT_SHAPES,
  assertValidGraphDocument
} from './graph.js';

// Form vocabulary, lowering, and round-trip law live in
// packages/core/README.md §Authoring DSL.
export const AUTHORING_SOURCE_MAP_FORMAT = 'perigram.authoring-sourcemap';
export const AUTHORING_SOURCE_MAP_VERSION = 1;

const SINGLE_BODY_FORMS = new Set(['name', 'description', 'interface', 'presentation']);
const PORT_OPTIONS = { label: 'string', required: 'boolean', default: 'json' };
const NODE_OPTIONS = { capabilities: 'strings', effects: 'strings' };
const CONNECT_OPTIONS = { kind: 'keyword' };
const KEYWORD_KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?$/;

export function parseAuthoringDsl(source) {
  if (typeof source !== 'string') throw new Error('DSL source must be a string');
  const { forms, diagnostics } = readRestrictedEdn(source);
  if (diagnostics.length) return failure(diagnostics);
  const parsed = convertDocument(forms);
  if (parsed.diagnostics.length) return failure(parsed.diagnostics);
  const problems = validateAuthoringDocument(parsed.document);
  if (problems.length) return failure(problems);
  const document = normalizeAuthoringDocument(parsed.document);
  return {
    document,
    sourceMap: buildSourceMap(document, parsed.sources),
    diagnostics: []
  };
}

export function serializeAuthoringDsl(document) {
  const normalized = normalizeAuthoringDocument(document);
  const lines = [`(:graph ${printString(normalized.id)} ${printString(normalized.revision)}`];
  if (normalized.name) lines.push(`  (:name ${printString(normalized.name)})`);
  if (normalized.description != null) lines.push(`  (:description ${printString(normalized.description)})`);
  const ports = [
    ...normalized.interface.inputs.map(port => `    ${printPort('input', port)}`),
    ...normalized.interface.outputs.map(port => `    ${printPort('output', port)}`)
  ];
  if (ports.length) {
    ports[ports.length - 1] += ')';
    lines.push('  (:interface', ...ports);
  }
  for (const node of normalized.nodes) {
    lines.push(node.invoke ? `  ${printInvoke(node)}` : `  ${printNode(node)}`);
  }
  for (const edge of normalized.edges) {
    lines.push(`  ${printConnect(edge)}`);
  }
  if (normalized.presentation != null) {
    lines.push(`  (:presentation ${printJson(normalized.presentation)})`);
  }
  lines.push(')');
  return `${lines.join('\n')}\n`;
}

export function lowerAuthoringDocument(document, sourceMap = null) {
  const problems = validateAuthoringDocument(document);
  if (problems.length) return { graph: null, sourceMap: null, diagnostics: problems };
  const normalized = normalizeAuthoringDocument(document);

  const nodes = [];
  for (const port of normalized.interface.inputs) nodes.push(boundaryNode(port, GRAPH_INPUT_OPERATION));
  for (const port of normalized.interface.outputs) nodes.push(boundaryNode(port, GRAPH_OUTPUT_OPERATION));
  const declarations = {};
  for (const node of normalized.nodes) {
    if (node.operation) {
      nodes.push({
        id: node.id,
        operation: { ...node.operation },
        ...(node.config != null ? { config: cloneJson(node.config) } : {})
      });
    } else {
      nodes.push({
        id: node.id,
        operation: { provider: CORE_GRAPH_PROVIDER, id: GRAPH_INVOKE_OPERATION, version: CORE_GRAPH_OPERATION_VERSION },
        config: { graphId: node.invoke.graphId, revision: node.invoke.revision }
      });
    }
    if (node.capabilities.length || node.effects.length) {
      declarations[node.id] = {
        ...(node.capabilities.length ? { capabilities: [...node.capabilities] } : {}),
        ...(node.effects.length ? { effects: [...node.effects] } : {})
      };
    }
  }

  const graph = {
    format: GRAPH_DOCUMENT_FORMAT,
    version: GRAPH_DOCUMENT_VERSION,
    id: normalized.id,
    revision: normalized.revision,
    name: normalized.name ?? '',
    interface: {
      inputs: normalized.interface.inputs.map(canonicalPort),
      outputs: normalized.interface.outputs.map(canonicalPort)
    },
    nodes,
    edges: normalized.edges.map(edge => ({
      id: edge.id,
      source: { ...edge.source },
      target: { ...edge.target },
      ...(edge.kind != null ? { kind: edge.kind } : {})
    }))
  };
  if (normalized.description != null) graph.description = normalized.description;
  const metadata = {};
  if (normalized.presentation != null) metadata.presentation = cloneJson(normalized.presentation);
  if (Object.keys(declarations).length) metadata.authoring = { declarations };
  if (Object.keys(metadata).length) graph.metadata = metadata;

  let canonical;
  try {
    canonical = assertValidGraphDocument(graph);
  } catch (error) {
    return {
      graph: null,
      sourceMap: null,
      diagnostics: (error.problems || []).map(item => ({ code: item.code, path: item.path, message: item.message }))
    };
  }
  return {
    graph: deepFreeze(canonical),
    sourceMap: loweredSourceMap(canonical, sourceMap),
    diagnostics: []
  };
}

function failure(diagnostics) {
  return { document: null, sourceMap: null, diagnostics: deepFreeze(diagnostics) };
}

function convertDocument(forms) {
  const diagnostics = [];
  const sources = { nodes: {}, edges: {} };
  if (!forms.length) {
    diagnostics.push({ code: 'missing-graph-form', message: 'A document requires one (:graph id revision …) form' });
    return { document: null, sources, diagnostics };
  }
  const [root, ...rest] = forms;
  if (rest.length) at(diagnostics, 'multiple-toplevel-forms', 'Only one top-level form is allowed', rest[0].pos);
  if (root.type !== 'list') {
    at(diagnostics, 'graph-form', 'The document form must be a list starting with :graph', root.pos);
    return { document: null, sources, diagnostics };
  }
  const [head, ...args] = root.items;
  if (!isKeyword(head, 'graph')) {
    at(diagnostics, 'unknown-form', 'Expected :graph as the document form head', head ? head.pos : root.pos);
    return { document: null, sources, diagnostics };
  }
  const document = {
    format: AUTHORING_DOCUMENT_FORMAT,
    version: AUTHORING_DOCUMENT_VERSION,
    id: expectString(args[0], diagnostics, 'graph-id', 'Graph id must be a non-empty string'),
    revision: expectString(args[1], diagnostics, 'graph-revision', 'Graph revision must be a non-empty string'),
    nodes: [],
    edges: []
  };
  const seen = new Set();
  let connectCount = 0;
  for (const form of args.slice(2)) {
    if (form.type !== 'list' || !isKeyword(form.items[0])) {
      at(diagnostics, 'form-shape', 'Document body forms must be lists tagged with a keyword', form.pos);
      continue;
    }
    const tag = form.items[0].name;
    if (SINGLE_BODY_FORMS.has(tag) && seen.has(tag)) {
      at(diagnostics, 'duplicate-form', `(:${tag}) appears more than once`, form.pos);
      continue;
    }
    seen.add(tag);
    switch (tag) {
      case 'name':
        document.name = expectString(form.items[1], diagnostics, 'form-arity', '(:name) takes one non-empty string');
        break;
      case 'description':
        document.description = expectString(form.items[1], diagnostics, 'form-arity', '(:description) takes one non-empty string');
        break;
      case 'interface':
        document.interface = convertInterface(form, sources, diagnostics);
        break;
      case 'presentation': {
        const value = form.items[1];
        if (value && value.type !== 'map') {
          at(diagnostics, 'form-shape', '(:presentation) takes one map form', value.pos);
        } else if (value) {
          document.presentation = mapToJson(value, diagnostics);
        }
        break;
      }
      case 'node': {
        const node = convertNode(form, diagnostics);
        if (node) {
          document.nodes.push(node);
          if (node.id) sources.nodes[node.id] = form.pos;
        }
        break;
      }
      case 'invoke': {
        const node = convertInvoke(form, diagnostics);
        if (node) {
          document.nodes.push(node);
          if (node.id) sources.nodes[node.id] = form.pos;
        }
        break;
      }
      case 'connect': {
        const edge = convertConnect(form, connectCount, diagnostics);
        connectCount += 1;
        if (edge) {
          document.edges.push(edge);
          sources.edges[edge.id] = form.pos;
        }
        break;
      }
      default:
        at(diagnostics, 'unknown-form', `Unknown document form (:${tag})`, form.pos);
    }
  }
  return { document, sources, diagnostics };
}

function convertInterface(form, sources, diagnostics) {
  const interface_ = { inputs: [], outputs: [] };
  for (const child of form.items.slice(1)) {
    const head = child.type === 'list' ? child.items[0] : null;
    if (!isKeyword(head, 'input') && !isKeyword(head, 'output')) {
      at(diagnostics, 'unknown-form', '(:interface) accepts only (:input …) and (:output …) forms', child.pos);
      continue;
    }
    const port = convertPort(child, diagnostics);
    if (port) {
      interface_[head.name === 'input' ? 'inputs' : 'outputs'].push(port);
      if (port.id) sources.nodes[port.id] = child.pos;
    }
  }
  return interface_;
}

function convertPort(form, diagnostics) {
  const args = form.items.slice(1);
  const id = expectString(args[0], diagnostics, 'port-id', 'Interface port id must be a non-empty string');
  const shapeForm = args[1];
  let shape = null;
  if (shapeForm && shapeForm.type === 'keyword' && !shapeForm.name.includes('/')) {
    shape = shapeForm.name;
    if (!GRAPH_TRANSPORT_SHAPES.includes(shape)) {
      at(diagnostics, 'invalid-shape', `Unsupported transport shape :${shape}; supported shapes are ${GRAPH_TRANSPORT_SHAPES.join(', ')}`, shapeForm.pos);
      shape = null;
    }
  } else {
    at(diagnostics, 'invalid-shape', 'Interface port shape must be a plain keyword like :item', shapeForm ? shapeForm.pos : undefined);
  }
  const semanticForm = args[2];
  let semantic = null;
  if (semanticForm && semanticForm.type === 'map') {
    semantic = mapToJson(semanticForm, diagnostics);
    if (semantic && !Object.keys(semantic).length) {
      at(diagnostics, 'invalid-semantic', 'Semantic descriptor must not be empty', semanticForm.pos);
      semantic = null;
    }
  } else {
    at(diagnostics, 'invalid-semantic', 'Interface port requires a semantic descriptor map', semanticForm ? semanticForm.pos : undefined);
  }
  const options = convertOptions(args[3], PORT_OPTIONS, diagnostics);
  const port = {
    id,
    contract: { shape, semantic }
  };
  if (options.required === false) port.required = false;
  if (options.label != null) port.label = options.label;
  if ('default' in options) port.default = options.default;
  return port;
}

function convertNode(form, diagnostics) {
  const args = form.items.slice(1);
  const id = expectString(args[0], diagnostics, 'node-id', 'Node id must be a non-empty string');
  const operationForm = args[1];
  let operation = null;
  if (operationForm && operationForm.type === 'keyword' && operationForm.name.includes('/')) {
    const [provider, operationId] = splitQualified(operationForm.name);
    operation = { provider, id: operationId, version: null };
  } else {
    at(diagnostics, 'invalid-operation', 'Node operation must be a provider-qualified keyword like :plugin.documents/document.compose', operationForm ? operationForm.pos : undefined);
  }
  const version = expectString(args[2], diagnostics, 'invalid-operation', 'Node operation version must be a non-empty string');
  if (operation) operation.version = version;
  let config;
  if (args[3]) {
    if (args[3].type === 'map') config = mapToJson(args[3], diagnostics);
    else at(diagnostics, 'form-shape', 'Node config must be a map form', args[3].pos);
  }
  const options = convertOptions(args[4], NODE_OPTIONS, diagnostics);
  const node = { id, operation };
  if (config != null) node.config = config;
  if (options.capabilities && options.capabilities.length) node.capabilities = options.capabilities;
  if (options.effects && options.effects.length) node.effects = options.effects;
  return node;
}

function convertInvoke(form, diagnostics) {
  const args = form.items.slice(1);
  const id = expectString(args[0], diagnostics, 'node-id', 'Invocation id must be a non-empty string');
  const graphId = expectString(args[1], diagnostics, 'unpinned-invocation', '(:invoke) must name the subgraph id as a string');
  const revision = expectString(args[2], diagnostics, 'unpinned-invocation', '(:invoke) must pin an immutable subgraph revision as a string');
  const options = convertOptions(args[3], NODE_OPTIONS, diagnostics);
  const node = { id, invoke: { graphId, revision } };
  if (options.capabilities && options.capabilities.length) node.capabilities = options.capabilities;
  if (options.effects && options.effects.length) node.effects = options.effects;
  return node;
}

function convertConnect(form, index, diagnostics) {
  let args = form.items.slice(1);
  let options = {};
  if (args.length && args[args.length - 1].type === 'map') {
    options = convertOptions(args[args.length - 1], CONNECT_OPTIONS, diagnostics);
    args = args.slice(0, -1);
  }
  let id = null;
  if (args.length === 3 && args[0].type === 'string') {
    id = args[0].value;
    args = args.slice(1);
  }
  if (args.length !== 2) {
    at(diagnostics, 'form-arity', '(:connect) takes two endpoints, with an optional edge id and options map', form.pos);
    return null;
  }
  const source = convertEndpoint(args[0], diagnostics);
  const target = convertEndpoint(args[1], diagnostics);
  if (!source || !target) return null;
  const edge = { id: id ?? `edge-${index + 1}`, source, target };
  if (options.kind) edge.kind = options.kind;
  return edge;
}

function convertEndpoint(form, diagnostics) {
  if (form && form.type === 'keyword' && form.name.includes('/')) {
    const [node, port] = splitQualified(form.name);
    return { node, port };
  }
  at(diagnostics, 'invalid-endpoint', 'Connection endpoints must be qualified keywords like :node-id/port', form ? form.pos : undefined);
  return null;
}

function convertOptions(form, specs, diagnostics) {
  if (form == null) return {};
  if (form.type !== 'map') {
    at(diagnostics, 'form-shape', 'Options must be a map form', form.pos);
    return {};
  }
  const options = {};
  for (const { key, value } of form.entries) {
    if (key.type !== 'keyword') {
      at(diagnostics, 'option-key', 'Option keys must be keywords', key.pos);
      continue;
    }
    const spec = specs[key.name];
    if (!spec) {
      at(diagnostics, 'unknown-option', `Unknown option :${key.name}`, key.pos);
      continue;
    }
    if (spec === 'boolean' && value.type !== 'boolean') {
      at(diagnostics, 'option-value', `Option :${key.name} must be a boolean`, value.pos);
      continue;
    }
    if (spec === 'string' && !(value.type === 'string' && value.value.trim())) {
      at(diagnostics, 'option-value', `Option :${key.name} must be a non-empty string`, value.pos);
      continue;
    }
    if (spec === 'keyword' && !(value.type === 'keyword' && !value.name.includes('/'))) {
      at(diagnostics, 'option-value', `Option :${key.name} must be a plain keyword`, value.pos);
      continue;
    }
    if (spec === 'strings') {
      const items = value.type === 'vector' ? value.items : null;
      if (!items || !items.length || items.some(item => item.type !== 'string' || !item.value.trim())) {
        at(diagnostics, 'option-value', `Option :${key.name} must be a vector of non-empty strings`, value.pos);
        continue;
      }
      options[key.name] = items.map(item => item.value.trim());
      continue;
    }
    options[key.name] = spec === 'json' ? formValueToJson(value, diagnostics)
      : spec === 'keyword' ? value.name
        : value.value;
  }
  return options;
}

function formValueToJson(form, diagnostics) {
  switch (form ? form.type : null) {
    case 'string':
    case 'number':
    case 'boolean':
      return form.value;
    case 'nil':
      return null;
    case 'keyword':
      return form.name;
    case 'vector':
      return form.items.map(item => formValueToJson(item, diagnostics));
    case 'map':
      return mapToJson(form, diagnostics);
    default:
      at(diagnostics, 'invalid-value', 'Values must be keywords, strings, numbers, booleans, nil, vectors, or maps', form ? form.pos : undefined);
      return null;
  }
}

function mapToJson(form, diagnostics) {
  const value = {};
  const seen = new Set();
  for (const { key, value: valueForm } of form.entries) {
    if (key.type !== 'keyword' && key.type !== 'string') {
      at(diagnostics, 'map-key', 'Map keys must be keywords or strings', key.pos);
      continue;
    }
    const name = key.type === 'keyword' ? key.name : key.value;
    if (seen.has(name)) {
      at(diagnostics, 'duplicate-map-key', `Duplicate map key ${name}`, key.pos);
      continue;
    }
    seen.add(name);
    value[name] = formValueToJson(valueForm, diagnostics);
  }
  return value;
}

function buildSourceMap(document, sources) {
  return deepFreeze({
    format: AUTHORING_SOURCE_MAP_FORMAT,
    version: AUTHORING_SOURCE_MAP_VERSION,
    graph: { id: document.id, revision: document.revision },
    nodes: cloneJson(sources.nodes),
    edges: cloneJson(sources.edges)
  });
}

function loweredSourceMap(graph, sourceMap) {
  const nodes = {};
  const edges = {};
  if (sourceMap != null) {
    if (!isRecord(sourceMap)) throw new Error('sourceMap must be an object');
    collectSpans(sourceMap.nodes, graph.nodes.map(node => node.id), nodes);
    collectSpans(sourceMap.edges, graph.edges.map(edge => edge.id), edges);
  }
  return deepFreeze({
    format: AUTHORING_SOURCE_MAP_FORMAT,
    version: AUTHORING_SOURCE_MAP_VERSION,
    graph: { id: graph.id, revision: graph.revision },
    nodes,
    edges
  });
}

function collectSpans(table, ids, into) {
  if (table == null) return;
  if (!isRecord(table)) throw new Error('sourceMap span tables must be objects');
  for (const id of ids) {
    const pos = table[id];
    if (pos == null) continue;
    if (!isRecord(pos)
      || !Number.isInteger(pos.line) || !Number.isInteger(pos.column)
      || !isRecord(pos.span)
      || !Number.isInteger(pos.span.start) || !Number.isInteger(pos.span.end)
      || pos.span.end < pos.span.start) {
      throw new Error(`sourceMap span for ${id} must carry integer line, column, and start/end offsets`);
    }
    into[id] = { line: pos.line, column: pos.column, span: { start: pos.span.start, end: pos.span.end } };
  }
}

function boundaryNode(port, operationId) {
  return {
    id: port.id,
    operation: { provider: CORE_GRAPH_PROVIDER, id: operationId, version: CORE_GRAPH_OPERATION_VERSION },
    config: { interfaceId: port.id }
  };
}

function canonicalPort(port) {
  const canonical = {
    id: port.id,
    label: port.label ?? port.id,
    contract: cloneJson(port.contract),
    required: port.required !== false
  };
  if (Object.hasOwn(port, 'default')) canonical.default = cloneJson(port.default);
  return canonical;
}

function isKeyword(form, name) {
  return Boolean(form) && form.type === 'keyword' && (name == null || form.name === name);
}

function splitQualified(name) {
  const slash = name.indexOf('/');
  return [name.slice(0, slash), name.slice(slash + 1)];
}

function expectString(form, diagnostics, code, message) {
  if (form && form.type === 'string' && form.value.trim()) return form.value;
  at(diagnostics, code, message, form ? form.pos : undefined);
  return null;
}

function at(diagnostics, code, message, pos) {
  diagnostics.push(pos ? { code, message, pos } : { code, message });
}

function printPort(direction, port) {
  const options = [];
  if (port.required === false) options.push(':required false');
  if (port.label != null) options.push(`:label ${printString(port.label)}`);
  if (Object.hasOwn(port, 'default')) options.push(`:default ${printJson(port.default)}`);
  return `(:${direction} ${printString(port.id)} :${port.contract.shape} ${printJson(port.contract.semantic)}${options.length ? ` {${options.join(' ')}}` : ''})`;
}

function printNode(node) {
  const parts = [
    `(:node ${printString(node.id)} :${node.operation.provider}/${node.operation.id} ${printString(node.operation.version)}`
  ];
  if (node.config != null) parts.push(printJson(node.config));
  const options = [
    ...(node.capabilities.length ? [`:capabilities [${node.capabilities.map(printString).join(' ')}]`] : []),
    ...(node.effects.length ? [`:effects [${node.effects.map(printString).join(' ')}]`] : [])
  ];
  if (options.length) parts.push(`{${options.join(' ')}}`);
  return `${parts.join(' ')})`;
}

function printInvoke(node) {
  const parts = [
    `(:invoke ${printString(node.id)} ${printString(node.invoke.graphId)} ${printString(node.invoke.revision)}`
  ];
  const options = [
    ...(node.capabilities.length ? [`:capabilities [${node.capabilities.map(printString).join(' ')}]`] : []),
    ...(node.effects.length ? [`:effects [${node.effects.map(printString).join(' ')}]`] : [])
  ];
  if (options.length) parts.push(`{${options.join(' ')}}`);
  return `${parts.join(' ')})`;
}

function printConnect(edge) {
  const kind = edge.kind != null ? ` {:kind :${edge.kind}}` : '';
  return `(:connect ${printString(edge.id)} :${edge.source.node}/${edge.source.port} :${edge.target.node}/${edge.target.port}${kind})`;
}

function printJson(value) {
  if (value === null) return 'nil';
  if (typeof value === 'string') return printString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(printJson).join(' ')}]`;
  return `{${Object.entries(value).map(([key, item]) => `${printKey(key)} ${printJson(item)}`).join(' ')}}`;
}

function printKey(key) {
  return KEYWORD_KEY.test(key) ? `:${key}` : printString(key);
}

function printString(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t').replaceAll('\r', '\\r')}"`;
}
