const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROVIDER_IDENTIFIER = /^[a-z0-9][a-z0-9._-]{0,127}$/;
export const TRANSPORT_SHAPES = Object.freeze(['item', 'list', 'tree', 'map', 'tuple', 'stream']);
const SHAPES = new Set(TRANSPORT_SHAPES);
export const NODE_EXECUTION_KINDS = Object.freeze(['pure', 'read', 'stateful', 'proposal', 'commit', 'effect', 'control']);
const EXECUTION_KINDS = new Set(NODE_EXECUTION_KINDS);
export const PORT_COMPATIBILITY_OUTCOMES = Object.freeze(['exact', 'safe-coercion', 'conditional', 'conversion-required', 'incompatible']);
const OUTCOMES = new Set(PORT_COMPATIBILITY_OUTCOMES);
export const CONVERSION_FIDELITIES = Object.freeze(['lossless', 'semantically-lossy', 'visual-only']);
const FIDELITIES = new Set(CONVERSION_FIDELITIES);


// Provider-owned compatibility profiles extend the shared port contract without
// teaching the graph engine domain-specific socket vocabularies.
export function createPortCompatibilityRegistry() {
  const profiles = new Map();
  const conversions = [];
  return Object.freeze({
    register(id, compare) {
      const key = String(id || '').trim();
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(key)) throw new Error('Port compatibility profile requires a stable id');
      if (typeof compare !== 'function') throw new TypeError('Port compatibility profile requires a comparator');
      if (profiles.has(key)) throw new Error(`Port compatibility profile already registered: ${key}`);
      profiles.set(key, compare);
      return () => profiles.delete(key);
    },
    registerConversions(list) {
      conversions.push(...normalizeConversions(list, 'Port compatibility registry'));
    },
    compare(source, target) {
      const sourceProfile = source?.compatibility?.profile || '';
      const targetProfile = target?.compatibility?.profile || '';
      if (sourceProfile && targetProfile && sourceProfile !== targetProfile) {
        return { status: 'incompatible', compatible: false, reason: 'Port compatibility profiles do not match', conversions: [] };
      }
      const profile = sourceProfile || targetProfile;
      const comparator = profile ? profiles.get(profile) : null;
      if (profile && !comparator) {
        return { status: 'incompatible', compatible: false, reason: `Unknown port compatibility profile: ${profile}`, conversions: [] };
      }
      const result = comparator
        ? requireProfileResult(comparator(source, target), profile)
        : compareNodePorts(source, target);
      if (result.status !== 'conversion-required' || result.conversions.length) return result;
      // Enrichment compares only the keys a conversion declares, by exact
      // value equality against the port's semantic values.
      const matches = conversions.filter(conversion => (
        descriptorEquals(conversion.from, source?.semantic) && descriptorEquals(conversion.to, target?.semantic)
      ));
      return matches.length ? { ...result, conversions: matches } : result;
    }
  });
}

export function normalizeNodeDefinition(source = {}) {
  validateNodeDefinition(source);
  const normalizePort = port => ({
    id: port.id,
    label: String(port.label || port.id),
    shape: port.shape || 'item',
    semantic: cloneJson(port.semantic),
    required: port.required !== false,
    ...(Object.hasOwn(port, 'default') ? { default: cloneJson(port.default) } : {}),
    ...(port.description ? { description: String(port.description) } : {}),
    ...(port.compatibility ? { compatibility: { profile: port.compatibility.profile } } : {})
  });
  return deepFreeze({
    provider: source.provider,
    id: source.id,
    version: String(source.version),
    label: String(source.label || source.id),
    ...(source.description ? { description: String(source.description) } : {}),
    palette: {
      group: String(source.palette?.group || ''),
      ...(source.palette?.label ? { label: String(source.palette.label) } : {}),
      keywords: [...new Set((source.palette?.keywords || []).map(value => String(value).trim().toLowerCase()).filter(Boolean))]
    },
    inputs: (source.inputs || []).map(normalizePort),
    outputs: (source.outputs || []).map(normalizePort),
    execution: {
      kind: source.execution.kind,
      ...(source.execution.runtime ? { runtime: source.execution.runtime } : {}),
      ...(source.execution.targets ? { targets: [...source.execution.targets] } : {}),
      capabilities: [...new Set(source.execution.capabilities || [])].sort(),
      deterministic: source.execution.deterministic === true,
      idempotent: source.execution.idempotent === true
    },
    ...(source.preview ? { preview: cloneJson(source.preview) } : {}),
    ...(source.configuration ? { configuration: cloneJson(source.configuration) } : {})
  });
}

export function validateNodeDefinition(source) {
  const problems = [];
  if (!isRecord(source)) return [{ code: 'invalid-definition', path: '$', message: 'Node definition must be an object' }];
  if (!PROVIDER_IDENTIFIER.test(String(source.provider || ''))) problems.push(issue('invalid-provider', 'provider', 'Provider must be a stable lowercase identifier'));
  if (!IDENTIFIER.test(String(source.id || ''))) problems.push(issue('invalid-operation-id', 'id', 'Operation id must be a stable lowercase identifier'));
  if (source.version == null || !String(source.version).trim()) problems.push(issue('missing-version', 'version', 'Node definition version is required'));
  if (!source.execution || !EXECUTION_KINDS.has(source.execution.kind)) {
    problems.push(issue('invalid-execution-kind', 'execution.kind', 'Execution kind must be pure, read, stateful, proposal, commit, effect, or control'));
  }
  for (const key of ['inputs', 'outputs']) {
    if (source[key] != null && !Array.isArray(source[key])) {
      problems.push(issue('invalid-ports', key, `${key} must be an array`));
      continue;
    }
    const seen = new Set();
    for (const [index, port] of (source[key] || []).entries()) {
      const path = `${key}[${index}]`;
      if (!isRecord(port)) {
        problems.push(issue('invalid-port', path, 'Port must be an object'));
        continue;
      }
      if (!IDENTIFIER.test(String(port.id || ''))) problems.push(issue('invalid-port-id', `${path}.id`, 'Port id must be a stable lowercase identifier'));
      if (seen.has(port.id)) problems.push(issue('duplicate-port-id', `${path}.id`, `Duplicate port id ${port.id}`));
      seen.add(port.id);
      if (port.shape != null && !SHAPES.has(port.shape)) problems.push(issue('invalid-port-shape', `${path}.shape`, `Unsupported transport shape ${port.shape}`));
      if (port.compatibility != null && (!isRecord(port.compatibility)
        || !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(String(port.compatibility.profile || '')))) {
        problems.push(issue('invalid-port-compatibility', `${path}.compatibility`, 'Compatibility profile must be a stable provider-qualified id'));
      }
      if (!isRecord(port.semantic) || !Object.keys(port.semantic).length) problems.push(issue('missing-semantic', `${path}.semantic`, 'Port requires a non-empty semantic descriptor object'));
      else if (!isJsonValue(port.semantic)) problems.push(issue('invalid-semantic', `${path}.semantic`, 'Semantic descriptor must be JSON-compatible'));
      if (Object.hasOwn(port, 'default') && !isJsonValue(port.default)) problems.push(issue('invalid-default', `${path}.default`, 'Port default must be JSON-compatible'));
    }
  }
  if (!isRecord(source.palette)) {
    problems.push(issue('missing-palette', 'palette', 'Node definitions require explicit semantic palette metadata'));
  } else {
      if (typeof source.palette.group !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(source.palette.group)) {
        problems.push(issue('invalid-palette-group', 'palette.group', 'Palette group is required and must be a stable lowercase slug'));
      }
      if (source.palette.label != null && (typeof source.palette.label !== 'string' || !source.palette.label.trim())) {
        problems.push(issue('invalid-palette-label', 'palette.label', 'Palette group label must be a non-empty string'));
      }
      if (source.palette.keywords != null && (!Array.isArray(source.palette.keywords)
        || source.palette.keywords.some(value => typeof value !== 'string' || !value.trim()))) {
        problems.push(issue('invalid-palette-keywords', 'palette.keywords', 'Palette keywords must be non-empty strings'));
      }
  }
  if (source.execution?.runtime != null && !/^[a-z0-9-]+$/.test(String(source.execution.runtime))) {
    problems.push(issue('invalid-runtime', 'execution.runtime', 'Runtime id must be a stable lowercase slug'));
  }
  if (source.execution?.targets != null) {
    if (!Array.isArray(source.execution.targets) || !source.execution.targets.length
      || source.execution.targets.some(target => !['browser', 'server'].includes(target))
      || new Set(source.execution.targets).size !== source.execution.targets.length) {
      problems.push(issue('invalid-targets', 'execution.targets', 'Execution targets must be a non-empty unique subset of browser and server'));
    }
  }
  if (['commit', 'effect'].includes(source.execution?.kind) && source.execution?.targets?.length
    && (!source.execution.targets.includes('server') || source.execution.targets.includes('browser'))) {
    problems.push(issue('server-target-required', 'execution.targets', `${source.execution.kind} nodes require server execution support`));
  }
  if (source.execution?.runtime != null && source.execution?.targets == null) {
    problems.push(issue('missing-targets', 'execution.targets', 'A runtime-bound node must declare its execution targets'));
  }
  if (source.execution?.runtime == null && source.execution?.targets != null) {
    problems.push(issue('missing-runtime', 'execution.runtime', 'Execution targets require a declared runtime id'));
  }
  if (source.execution && !Array.isArray(source.execution.capabilities || [])) {
    problems.push(issue('invalid-capabilities', 'execution.capabilities', 'Execution capabilities must be an array'));
  }
  const seenCapabilities = new Set();
  for (const [index, capability] of (source.execution?.capabilities || []).entries()) {
    if (typeof capability !== 'string' || !/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/.test(capability)) {
      problems.push(issue('invalid-capability', `execution.capabilities[${index}]`, 'Capability must be a qualified capability id such as organization.instances.read'));
    } else if (seenCapabilities.has(capability)) {
      problems.push(issue('duplicate-capability', `execution.capabilities[${index}]`, `Duplicate capability ${capability}`));
    }
    seenCapabilities.add(capability);
  }
  if (source.execution?.kind === 'pure' && (source.execution.capabilities || []).length) {
    problems.push(issue('pure-capabilities', 'execution.capabilities', 'Pure nodes cannot request host capabilities'));
  }
  if (['commit', 'effect'].includes(source.execution?.kind) && !(source.execution?.capabilities || []).length) {
    problems.push(issue('missing-effect-capability', 'execution.capabilities', `${source.execution.kind} nodes require a host capability`));
  }
  if (source.preview != null && !isJsonValue(source.preview)) {
    problems.push(issue('invalid-preview', 'preview', 'Preview declarations must be JSON-compatible'));
  }
  if (source.configuration != null && !isJsonValue(source.configuration)) {
    problems.push(issue('invalid-configuration', 'configuration', 'Configuration schema must be JSON-compatible'));
  }
  return problems;
}

export function assertValidNodeDefinition(source) {
  const problems = validateNodeDefinition(source);
  if (problems.length) {
    const error = new Error(`Invalid node definition: ${problems.map(item => item.message).join('; ')}`);
    error.problems = problems;
    throw error;
  }
  return normalizeNodeDefinition(source);
}

export function compareNodePorts(source, target) {
  if (!source || !target) {
    return { status: 'incompatible', compatible: false, reason: 'Both source and target ports are required', conversions: [] };
  }
  const sourceShape = source.shape || 'item';
  const targetShape = target.shape || 'item';
  const collectionShapes = new Set(['list', 'tuple', 'tree', 'map']);
  const transportWidening = sourceShape === 'item' && collectionShapes.has(targetShape);
  if (sourceShape === 'stream' || targetShape === 'stream') {
    if (sourceShape !== targetShape) {
      return { status: 'incompatible', compatible: false, reason: 'Stream ports connect only to stream ports', conversions: [] };
    }
  } else if (sourceShape !== targetShape && !transportWidening) {
    return {
      status: 'conversion-required',
      compatible: false,
      reason: `Transport shape ${sourceShape} requires an explicit conversion to ${targetShape}`,
      conversions: []
    };
  }

  const optionalSource = source.required === false && target.required !== false;
  const from = source.semantic || {};
  const to = target.semantic || {};
  if (typeof from.base !== 'string' || typeof to.base !== 'string') {
    return { status: 'incompatible', compatible: false, reason: 'Both ports require a semantic base', conversions: [] };
  }
  const nullableCheck = from.nullable === true && to.nullable !== true;
  const nullableWidening = from.nullable !== true && to.nullable === true;
  if (to.base === 'json' && !to.kind && !to.schema && !to.nominal && !to.provider && !to.entityType && !to.identity && !to.constraints) {
    return {
      status: optionalSource || nullableCheck ? 'conditional' : 'safe-coercion',
      compatible: true,
      reason: optionalSource
        ? 'The target checks that the optional source produced a value at runtime'
        : nullableCheck
          ? 'The target checks that the nullable source produced a non-null value at runtime'
          : 'The target accepts any JSON value',
      conversions: []
    };
  }
  if (from.base === 'json' && !from.kind && !from.schema && !from.nominal && !from.provider && !from.entityType && !from.identity && !from.constraints
    && (to.base !== 'json' || to.kind || to.schema || to.nominal || to.provider || to.entityType || to.identity || to.constraints)) {
    return {
      status: 'conditional',
      compatible: false,
      reason: 'The source has no declared semantic identity; runtime validation is required',
      conversions: []
    };
  }
  if (from.base !== to.base) {
    return {
      status: 'incompatible',
      compatible: false,
      reason: `Semantic base ${from.base} does not match ${to.base}`,
      conversions: []
    };
  }
  if (from.unit !== to.unit) {
    return {
      status: 'conversion-required',
      compatible: false,
      reason: `Unit ${from.unit || 'unspecified'} requires conversion to ${to.unit || 'unspecified'}`,
      conversions: []
    };
  }
  for (const key of ['kind', 'nominal', 'provider', 'schema', 'entityType', 'identity']) {
    if (stableJson(from[key] ?? null) !== stableJson(to[key] ?? null)) {
      return {
        status: from[key] == null ? 'conditional' : 'incompatible',
        compatible: false,
        reason: from[key] == null
          ? `The source does not declare target semantic identity ${key}`
          : key === 'kind'
            ? 'Representation kind does not match'
            : `Semantic identity ${key} does not match`,
        conversions: []
      };
    }
  }
  if (stableJson(from.constraints ?? null) !== stableJson(to.constraints ?? null)) {
    return {
      status: 'conditional',
      compatible: false,
      reason: 'Semantic constraints differ and require runtime validation',
      conversions: []
    };
  }
  return {
    status: optionalSource || nullableCheck
      ? 'conditional'
      : transportWidening || nullableWidening
        ? 'safe-coercion'
        : 'exact',
    compatible: true,
    reason: optionalSource
      ? 'The required input checks that the optional source produced a value at runtime'
      : nullableCheck
        ? 'The required input checks that the nullable source produced a non-null value at runtime'
        : transportWidening
          ? 'An item value is accepted by the collection input'
          : nullableWidening
            ? 'A non-null value is accepted by the nullable input'
            : 'Transport and semantic contracts match',
    conversions: []
  };
}

export function normalizeNodeProvider(source = {}) {
  const provider = String(source.provider || '');
  if (!PROVIDER_IDENTIFIER.test(provider)) throw new Error('Node provider requires a stable lowercase provider id');
  if (typeof source.execute !== 'function') throw new Error(`Node provider ${provider} requires an execute function`);
  if (!Array.isArray(source.definitions) || !source.definitions.length) {
    throw new Error(`Node provider ${provider} requires at least one node definition`);
  }
  const definitions = source.definitions.map(definition => {
    const normalized = assertValidNodeDefinition(definition);
    if (normalized.provider !== provider) {
      throw new Error(`Node definition ${normalized.id} belongs to ${normalized.provider}, not ${provider}`);
    }
    return normalized;
  });
  const previewRenderers = source.previewRenderers || {};
  const isPreviewSurfaceId = value => typeof value === 'string'
    && /^[a-z0-9-]+$/.test(value);
  const isPreviewSurface = value => isRecord(value)
    && isPreviewSurfaceId(value.id)
    && Number.isInteger(Number(value.surfaceContract))
    && (value.url == null || typeof value.url === 'string');
  if (!isRecord(previewRenderers) || Object.values(previewRenderers).some(renderer => (
    typeof renderer !== 'function' && !isPreviewSurfaceId(renderer) && !isPreviewSurface(renderer)
  ))) {
    throw new Error(`Node provider ${provider} previewRenderers must map renderer ids to preview surface ids`);
  }
  for (const definition of definitions) {
    const rendererId = definition.preview?.renderer;
    const renderer = previewRenderers[rendererId];
    if (rendererId && typeof renderer !== 'function'
      && !isPreviewSurfaceId(renderer) && !isPreviewSurface(renderer)) {
      throw new Error(`Node definition ${definition.id} declares missing preview renderer ${rendererId}`);
    }
  }
  return Object.freeze({
    provider,
    definitions: Object.freeze(definitions),
    execute: source.execute,
    previewRenderers: Object.freeze({ ...previewRenderers }),
    conversions: normalizeConversions(source.conversions || [], `Node provider ${provider}`)
  });
}

export function createNodeProviderRegistry() {
  const definitions = new Map();
  return Object.freeze({
    register(source) {
      const definition = assertValidNodeDefinition(source);
      const key = operationKey(definition.provider, definition.id, definition.version);
      if (definitions.has(key)) throw new Error(`Node definition already registered: ${key}`);
      definitions.set(key, definition);
      return definition;
    },
    resolve(provider, id, version) {
      return definitions.get(operationKey(provider, id, version)) || null;
    },
    list({ provider } = {}) {
      return [...definitions.values()]
        .filter(definition => !provider || definition.provider === provider)
        .sort((a, b) => operationKey(a.provider, a.id, a.version).localeCompare(operationKey(b.provider, b.id, b.version)));
    },
    providers() {
      return [...new Set([...definitions.values()].map(definition => definition.provider))].sort();
    }
  });
}

function operationKey(provider, id, version) {
  return `${provider}/${id}@${version}`;
}

function requireProfileResult(result, profile) {
  if (!isRecord(result)) throw new TypeError(`Port compatibility profile ${profile} comparator must return a result object`);
  if (!OUTCOMES.has(result.status)) throw new Error(`Port compatibility profile ${profile} returned unknown compatibility status ${String(result.status)}`);
  if (typeof result.compatible !== 'boolean') throw new TypeError(`Port compatibility profile ${profile} result requires a boolean compatible`);
  if (typeof result.reason !== 'string') throw new TypeError(`Port compatibility profile ${profile} result requires a string reason`);
  if (!Array.isArray(result.conversions)) throw new TypeError(`Port compatibility profile ${profile} result requires a conversions array`);
  return result;
}

function normalizeConversions(list, owner) {
  if (!Array.isArray(list)) throw new TypeError(`${owner} conversions must be an array`);
  const seen = new Set();
  return Object.freeze(list.map(conversion => {
    if (!isRecord(conversion)) throw new TypeError(`${owner} conversions must be conversion declarations`);
    if (!IDENTIFIER.test(String(conversion.id || ''))) throw new Error(`${owner} conversions require stable conversion ids`);
    if (seen.has(conversion.id)) throw new Error(`${owner} declares duplicate conversion ${conversion.id}`);
    seen.add(conversion.id);
    for (const side of ['from', 'to']) {
      const descriptor = conversion[side];
      if (!isRecord(descriptor) || typeof descriptor.base !== 'string' || !descriptor.base) {
        throw new Error(`${owner} conversion ${conversion.id} requires a ${side} descriptor with a string base`);
      }
      if (!isJsonValue(descriptor)) throw new Error(`${owner} conversion ${conversion.id} ${side} descriptor must be JSON-compatible`);
    }
    if (conversion.provider != null && (typeof conversion.provider !== 'string' || !PROVIDER_IDENTIFIER.test(conversion.provider))) {
      throw new Error(`${owner} conversion ${conversion.id} provider must be a stable lowercase identifier`);
    }
    if (conversion.runtime != null && (typeof conversion.runtime !== 'string' || !/^[a-z0-9-]+$/.test(conversion.runtime))) {
      throw new Error(`${owner} conversion ${conversion.id} runtime must be a stable lowercase slug`);
    }
    if (!FIDELITIES.has(conversion.fidelity)) {
      throw new Error(`${owner} conversion ${conversion.id} fidelity must be lossless, semantically-lossy, or visual-only`);
    }
    return deepFreeze({
      id: conversion.id,
      from: cloneJson(conversion.from),
      to: cloneJson(conversion.to),
      ...(conversion.provider ? { provider: conversion.provider } : {}),
      ...(conversion.runtime ? { runtime: conversion.runtime } : {}),
      deterministic: conversion.deterministic === true,
      fidelity: conversion.fidelity
    });
  }));
}

function descriptorEquals(descriptor, semantic = {}) {
  return Object.entries(descriptor).every(([key, value]) => stableJson(semantic[key] ?? null) === stableJson(value ?? null));
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function issue(code, path, message) {
  return { code, path, message };
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null));
}

function isJsonValue(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  if (!Array.isArray(value) && !isRecord(value)) return false;
  seen.add(value);
  const valid = (Array.isArray(value) ? value : Object.values(value)).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
