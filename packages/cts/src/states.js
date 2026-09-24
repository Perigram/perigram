// Recursive state machines (SPEC §7). Each independent axis owns a
// single-parent state tree; canonical paths are exact dot-joined paths and
// runtime instances persist only the active leaf path for every axis.

export function collectStateEntries(axis = {}) {
  const entries = [];
  const walk = (states = {}, prefix = []) => {
    for (const [name, node = {}] of Object.entries(states)) {
      const path = [...prefix, name].join('.');
      entries.push({ path, node });
      if (node.states) walk(node.states, [...prefix, name]);
    }
  };
  walk(axis.states || {});
  return entries;
}

export function findState(axis = {}, canonicalPath) {
  if (typeof canonicalPath !== 'string' || !canonicalPath) return null;
  let states = axis?.states;
  let node = null;
  for (const segment of canonicalPath.split('.')) {
    if (!segment || !states || !Object.hasOwn(states, segment)) return null;
    node = states[segment];
    states = node?.states;
  }
  return node && typeof node === 'object' ? node : null;
}

export function isLeafState(node = {}) {
  return !node?.states || !Object.keys(node.states).length;
}

export function initialStatePath(axis = {}, targetPath = axis.initial) {
  let path = targetPath;
  let node = findState(axis, path);
  while (node && !isLeafState(node)) {
    const child = node.initial;
    if (typeof child !== 'string' || !Object.hasOwn(node.states || {}, child)) return null;
    path = `${path}.${child}`;
    node = node.states[child];
  }
  return node ? path : null;
}

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

function assertLocalName(name, path, axisName) {
  if (typeof name !== 'string' || !name) {
    throw new Error(`states.${axisName}: state ${path || '(root)'} requires a local name`);
  }
  if (name.includes('.')) {
    throw new Error(`states.${axisName}: local state name ${name} cannot contain the canonical path separator .`);
  }
}

function normalizeStateTree({ states, initial, render, axisName, path = [], ancestors = new Set() }) {
  if (!states || typeof states !== 'object' || Array.isArray(states) || !Object.keys(states).length) {
    throw new Error(`states.${axisName}${path.length ? `.${path.join('.')}` : ''} requires a non-empty states tree`);
  }
  if (path.length === 0) {
    assertLocalName(initial, '', axisName);
    if (!Object.hasOwn(states, initial)) {
      throw new Error(`states.${axisName}.initial ${initial} is not declared`);
    }
  }

  const normalizedStates = {};
  const derivedRender = {};
  for (const [localName, declaration = {}] of Object.entries(states)) {
    const statePath = [...path, localName];
    const canonicalPath = statePath.join('.');
    assertLocalName(localName, canonicalPath, axisName);
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      throw new Error(`states.${axisName}: state ${canonicalPath} must be an object`);
    }
    if (declaration.terminal !== undefined && declaration.terminal !== true) {
      throw new Error(`states.${axisName}: terminal on state ${canonicalPath} must be true when present`);
    }
    if (declaration.terminal === true && declaration.states != null) {
      throw new Error(`states.${axisName}: terminal state ${canonicalPath} cannot declare children`);
    }
    if (ancestors.has(declaration)) {
      throw new Error(`states.${axisName}: state cycle at ${canonicalPath}`);
    }
    if (declaration.states != null && declaration.initial == null) {
      throw new Error(`states.${axisName}: state ${canonicalPath} requires exactly one initial child`);
    }
    if (declaration.states == null && declaration.initial != null) {
      throw new Error(`states.${axisName}: leaf state ${canonicalPath} cannot declare initial without children`);
    }

    const policy = normalizePolicy(declaration.policy);
    const authoredPolicy = normalizePolicy(render?.[canonicalPath]);
    const effectivePolicy = policy || authoredPolicy;
    if (effectivePolicy) derivedRender[canonicalPath] = effectivePolicy;

    const childTree = declaration.states == null
      ? null
      : normalizeStateTree({
        states: declaration.states,
        initial: declaration.initial,
        render,
        axisName,
        path: statePath,
        ancestors: new Set(ancestors).add(declaration)
      });
    const children = childTree?.states || null;
    if (childTree?.render) Object.assign(derivedRender, childTree.render);

    normalizedStates[localName] = Object.freeze({
      ...(declaration.terminal === true ? { terminal: true } : {}),
      ...(children ? { initial: declaration.initial, states: children } : {}),
      ...(policy ? { policy } : {})
    });
  }

  return {
    states: Object.freeze(normalizedStates),
    ...(Object.keys(derivedRender).length ? { render: Object.freeze(derivedRender) } : {})
  };
}

export function normalizeStates(states = {}) {
  if (!states || typeof states !== 'object' || Array.isArray(states)) {
    throw new Error('states must be an object keyed by axis');
  }
  const normalized = {};
  for (const [axisName, machine = {}] of Object.entries(states)) {
    if (!axisName || axisName.includes('.')) {
      throw new Error(`state axis name ${axisName || '(empty)'} must be one path segment`);
    }
    if (!machine || typeof machine !== 'object' || Array.isArray(machine)) {
      throw new Error(`states.${axisName} must be a state machine object`);
    }
    if (machine.values !== undefined || machine.terminal !== undefined) {
      throw new Error(`states.${axisName}: flat state axes are retired; declare initial + recursive states`);
    }
    const tree = normalizeStateTree({
      states: machine.states,
      initial: machine.initial,
      render: machine.render,
      axisName
    });
    normalized[axisName] = Object.freeze({
      initial: machine.initial,
      states: tree.states,
      ...(tree.render ? { render: tree.render } : {})
    });
  }
  return Object.freeze(normalized);
}

export function normalizeTransitions(transitions = [], states = {}) {
  const intents = new Map();
  return Object.freeze((Array.isArray(transitions) ? transitions : []).map((transition = {}, index) => {
    const axis = transition.axis;
    if (typeof axis !== 'string' || !axis) {
      throw new Error(`transition ${index}: axis is required`);
    }
    if (!Object.hasOwn(states, axis)) {
      throw new Error(`transition ${index}: axis ${axis} is not declared`);
    }
    if (!findState(states[axis], transition.from)) {
      throw new Error(`transition ${index}: from ${transition.from} not in states.${axis}`);
    }
    if (!findState(states[axis], transition.to)) {
      throw new Error(`transition ${index}: to ${transition.to} not in states.${axis}`);
    }

    const entry = { axis, from: transition.from, to: transition.to };
    if (transition.intent != null) {
      if (typeof transition.intent !== 'string' || !transition.intent.trim()) {
        throw new Error(`transition ${index}: intent must be a non-empty string`);
      }
      const intent = transition.intent;
      const target = `${axis}:${transition.to}`;
      const existingTarget = intents.get(intent);
      if (existingTarget !== undefined && existingTarget !== target) {
        throw new Error(`intent ${intent} targets both ${existingTarget} and ${target} — one intent has one target`);
      }
      intents.set(intent, target);
      entry.intent = intent;
    }
    if (transition.guard) entry.guard = transition.guard;
    if (transition.effects) entry.effects = Object.freeze([...transition.effects]);
    return Object.freeze(entry);
  }));
}

export function checkStateTotality(type = {}) {
  const errors = [];
  for (const [axisName, axis] of Object.entries(type.states || {})) {
    const entries = collectStateEntries(axis);
    const leaves = entries.filter(entry => isLeafState(entry.node));
    const initial = initialStatePath(axis);
    if (!initial) {
      errors.push(`states.${axisName}: initial ${axis.initial} has no reachable leaf`);
      continue;
    }

    const outgoing = new Map(leaves.map(entry => [entry.path, []]));
    for (const transition of type.transitions || []) {
      if (transition.axis !== axisName) continue;
      const target = initialStatePath(axis, transition.to);
      if (!target) continue;
      for (const leaf of leaves) {
        if (leaf.path === transition.from || leaf.path.startsWith(`${transition.from}.`)) {
          outgoing.get(leaf.path).push(target);
        }
      }
    }

    const reachable = new Set([initial]);
    const queue = [initial];
    while (queue.length) {
      const current = queue.pop();
      for (const target of outgoing.get(current) || []) {
        if (!reachable.has(target)) {
          reachable.add(target);
          queue.push(target);
        }
      }
    }
    for (const entry of entries.filter(candidate => candidate.node.terminal === true)) {
      if (!reachable.has(entry.path)) {
        errors.push(`states.${axisName}: terminal ${entry.path} unreachable from ${initial}`);
      }
    }
  }
  return errors;
}

// Process graphs may reference declaration transitions, never author new
// state nodes. This compatibility seam remains only for the graph-protocol
// migration owned elsewhere; it accepts an already-declared recursive axis
// and refuses target-state synthesis instead of minting flat values/terminals.
export function mergeTransitionNodeStates({ machine, transitions = [] } = {}) {
  if (!machine?.states || typeof machine.states !== 'object') {
    throw new Error('mergeTransitionNodeStates requires a recursive state machine');
  }
  const axis = normalizeStates({ main: machine }).main;
  return Object.freeze({
    ...axis,
    transitions: normalizeTransitions(transitions, { main: axis })
  });
}
