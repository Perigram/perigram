// Flat state vocabularies (SPEC §7). A state is a string value authored
// in the process graph as a state node and supplied through sockets; a
// type declares nothing about states. There are no axes, no nesting, and
// no parents. This module owns the one vocabulary shape shared by draft
// state-node projection and the compiled contract: a frozen map of
// value -> { terminal?, policy? }.

function normalizePolicy(policy = {}) {
  if (policy == null) return null;
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    throw new Error('state policy must be an object');
  }
  const normalized = {
    ...(policy.label != null ? { label: String(policy.label) } : {}),
    ...(policy.icon != null ? { icon: String(policy.icon) } : {}),
    ...(policy.severity != null ? { severity: String(policy.severity) } : {})
  };
  return Object.keys(normalized).length ? Object.freeze(normalized) : null;
}

export function normalizeStatePolicy(policy) {
  return normalizePolicy(policy);
}

// One flat segment: a state value never carries a path separator, because
// there are no paths — no parents, no axes, no derived configuration.
export function normalizeStateVocabulary(vocabulary = {}) {
  if (!vocabulary || typeof vocabulary !== 'object' || Array.isArray(vocabulary)) {
    throw new Error('state vocabulary must be an object keyed by value');
  }
  const normalized = {};
  for (const [value, declaration = {}] of Object.entries(vocabulary)) {
    if (!value || value.includes('.')) {
      throw new Error(`state ${value || '(empty)'} must be one flat segment`);
    }
    if (declaration === true) {
      normalized[value] = Object.freeze({});
      continue;
    }
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      throw new Error(`state ${value} must be an object or true`);
    }
    if (declaration.terminal !== undefined && declaration.terminal !== true) {
      throw new Error(`state ${value}: terminal must be true when present`);
    }
    if (declaration.states != null || declaration.initial != null || declaration.parent != null) {
      throw new Error(`state ${value}: nesting is retired; states are flat values`);
    }
    const policy = normalizePolicy(declaration.policy);
    normalized[value] = Object.freeze({
      ...(declaration.terminal === true ? { terminal: true } : {}),
      ...(policy ? { policy } : {})
    });
  }
  return Object.freeze(normalized);
}

export function stateValues(vocabulary = {}) {
  return Object.keys(vocabulary || {});
}

export function statePolicy(vocabulary = {}, value) {
  const declaration = (vocabulary || {})[String(value ?? '')] || null;
  return declaration?.policy || null;
}

export function isTerminalState(vocabulary = {}, value) {
  const declaration = (vocabulary || {})[String(value ?? '')] || null;
  return declaration?.terminal === true;
}
