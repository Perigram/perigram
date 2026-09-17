// States (SPEC §7): single axis `main` (multi-axis deferred, SPEC §19),
// guarded transitions; one intent has one target state.
export function normalizeStates(states = {}) {
  const axisNames = Object.keys(states);
  if (axisNames.length > 1) throw new Error('axes beyond main are deferred (SPEC §19)');
  if (!axisNames.length) return Object.freeze({});
  const axis = states.main;
  const values = [...(axis.values || [])];
  if (!values.length) throw new Error('states.main requires values');
  if (new Set(values).size !== values.length) throw new Error('states.main values must be unique');
  if (!values.includes(axis.initial)) throw new Error(`states.main.initial ${axis.initial} not in values`);
  return Object.freeze({
    main: Object.freeze({
      initial: axis.initial,
      values: Object.freeze(values),
      terminal: Object.freeze([...(axis.terminal || [])])
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
