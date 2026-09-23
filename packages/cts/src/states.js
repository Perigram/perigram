// States (SPEC §7): single axis `main` (multi-axis deferred, SPEC §19),
// guarded transitions; one intent has one target state. Per-state display
// policy is authored on the axis (`render: { <value>: { label?, icon?,
// severity? } }`) and normalized here — unknown values drop silently,
// the same tolerance the old type-level `render.states` overrides had.
export function normalizeStates(states = {}) {
  const axisNames = Object.keys(states);
  if (axisNames.length > 1) throw new Error('axes beyond main are deferred (SPEC §19)');
  if (!axisNames.length) return Object.freeze({});
  const axis = states.main;
  const values = [...(axis.values || [])];
  if (!values.length) throw new Error('states.main requires values');
  if (new Set(values).size !== values.length) throw new Error('states.main values must be unique');
  if (!values.includes(axis.initial)) throw new Error(`states.main.initial ${axis.initial} not in values`);
  const render = {};
  for (const [value, policy = {}] of Object.entries(axis.render || {})) {
    if (!values.includes(value)) continue;
    render[value] = Object.freeze({
      ...(policy.label ? { label: String(policy.label) } : {}),
      ...(policy.icon ? { icon: String(policy.icon) } : {}),
      ...(policy.severity ? { severity: String(policy.severity) } : {})
    });
  }
  return Object.freeze({
    main: Object.freeze({
      initial: axis.initial,
      values: Object.freeze(values),
      terminal: Object.freeze([...(axis.terminal || [])]),
      ...(Object.keys(render).length ? { render: Object.freeze(render) } : {})
    })
  });
}

export function normalizeTransitions(transitions = [], states) {
  const values = states.main?.values || [];
  const intents = new Map();
  const normalized = transitions.map((transition = {}, index) => {
    if (!values.includes(transition.from)) {
      throw new Error(`transition ${index}: from ${transition.from} not in axis values`);
    }
    if (!values.includes(transition.to)) {
      throw new Error(`transition ${index}: to ${transition.to} not in axis values`);
    }
    const entry = { axis: 'main', from: transition.from, to: transition.to };
    if (transition.intent) {
      const existingTarget = intents.get(transition.intent);
      if (existingTarget !== undefined && existingTarget !== transition.to) {
        throw new Error(`intent ${transition.intent} targets both ${existingTarget} and ${transition.to} — one intent has one target (recovery transitions may share an intent)`);
      }
      intents.set(transition.intent, transition.to);
      entry.intent = transition.intent;
    }
    if (transition.guard) entry.guard = transition.guard;
    if (transition.effects) entry.effects = Object.freeze([...transition.effects]);
    return Object.freeze(entry);
  });
  return Object.freeze(normalized);
}

// R4: one initial (enforced in normalizeStates), every declared terminal
// reachable from initial (intent targeting enforced above).
export function checkStateTotality(type = {}) {
  const axis = type.states?.main;
  if (!axis) return [];
  const errors = [];
  const edgesFrom = new Map(axis.values.map(state => [state, []]));
  for (const transition of type.transitions || []) {
    edgesFrom.get(transition.from)?.push(transition.to);
  }
  const reachable = new Set([axis.initial]);
  const queue = [axis.initial];
  while (queue.length) {
    const state = queue.pop();
    for (const next of edgesFrom.get(state) || []) {
      if (!reachable.has(next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  for (const terminal of axis.terminal || []) {
    if (!reachable.has(terminal)) errors.push(`terminal ${terminal} unreachable from ${axis.initial}`);
  }
  return errors;
}

// Transition-node-declared statuses (SPEC §7/§20): a bound cts.transition
// record authors its target status inline, and the declaration compile
// merges it with the tree-declared axis. This is the shared core of every
// compile — canvas trees (compileTreeDeclarations in @perigram/processes)
// and persisted drafts (declarationsFromCtsRecords) produce the same axis
// from the same authoring. Edges fan out from every other declared value:
// the runtime resolves from-state dynamically (SPEC §20, target-only is
// lossless), so the declared machine must permit the target from any
// state an instance may hold. Terminal states stay derived — sinks of the
// merged edge set — plus explicitly terminal transition targets.
export function mergeTransitionNodeStates({ values = [], transitions = [], targets = [] } = {}) {
  const valueOrder = [...values];
  for (const target of targets) {
    if (target?.value && !valueOrder.includes(target.value)) valueOrder.push(target.value);
  }
  const merged = [];
  const seen = new Set();
  const push = transition => {
    if (!valueOrder.includes(transition.from) || !valueOrder.includes(transition.to)) return;
    const key = `${transition.from}->${transition.to}|${transition.intent || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(transition);
  };
  for (const transition of transitions) push({ ...transition });
  for (const target of targets) {
    if (!target?.value) continue;
    for (const from of valueOrder) {
      if (from === target.value) continue;
      push({ from, to: target.value, ...(target.intent ? { intent: target.intent } : {}) });
    }
  }
  const explicitTerminal = new Set(targets
    .filter(target => target?.value && target.terminal === true)
    .map(target => target.value));
  const hasOutgoing = new Set(merged.map(transition => transition.from));
  const terminal = [...new Set([
    ...valueOrder.filter(value => !hasOutgoing.has(value)),
    ...explicitTerminal
  ])];
  return { values: valueOrder, transitions: merged, terminal };
}
