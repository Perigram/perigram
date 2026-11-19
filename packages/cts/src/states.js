// Flat state value vocabulary (SPEC §7): a state value is one flat string.
// Nesting is structural — authored by wiring a state node into another state
// node and compiled by the process compiler — and is never encoded in this
// value map (CTS SPEC §7).

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

// One flat segment: a value never carries a path separator; structure is
// authored wiring, not a separator in the value.
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
