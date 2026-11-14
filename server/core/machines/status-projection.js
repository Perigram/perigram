// Pure projections between persisted entity status and workflow engine views.

function persistableStatusMetadata(metadata = {}) {
  const { producerOutputId: _producerOutputId, source: _source, ...persisted } = metadata && typeof metadata === 'object' ? metadata : {};
  return persisted;
}

const STATE_EVIDENCE_KEYS = new Set(['userId', 'timestamp', 'metadata', 'eventId', 'lifecycle']);

function storedStateAxes(states = {}) {
  return Object.fromEntries(Object.entries(states || {})
    .filter(([axis, value]) => axis && !STATE_EVIDENCE_KEYS.has(axis) && typeof value === 'string' && value));
}

// Instance docs persist one flat state string (SPEC §3/§7); the legacy
// status block belongs to static-registry collections only.
function instanceStateSetFromStatus(status = {}) {
  const primary = status?.state?.primary;
  if (typeof primary !== 'string' || !primary) return {};
  // The flat write carries the deadline clock (SPEC §3/§7): when the
  // current state was entered.
  return { state: primary, stateChangedAt: new Date().toISOString() };
}

function statusPrimaryForRegion(workflow = {}, regionId = '', state = '') {
  return workflow.primaryRegion === regionId ? state : workflow.initial || state;
}

function mergeStatusDisplayMetadata(metadata = {}, stateDefinition = {}) {
  const display = statusDisplayMetadata(stateDefinition);
  if (!display) return metadata || {};
  return {
    ...(metadata || {}),
    display: {
      ...display,
      ...((metadata || {}).display || {})
    }
  };
}

function statusDisplayMetadata(stateDefinition = {}) {
  const display = {
    ...(stateDefinition.label ? { label: stateDefinition.label } : {}),
    ...(stateDefinition.color || stateDefinition.severity ? { color: stateDefinition.color || stateDefinition.severity } : {}),
    ...(stateDefinition.severity || stateDefinition.color ? { severity: stateDefinition.severity || stateDefinition.color } : {}),
    ...(stateDefinition.icon ? { icon: stateDefinition.icon } : {})
  };
  return Object.keys(display).length ? display : null;
}

// The §3 stored shape keeps one flat state string. Project it into the
// engine's snapshot shape so region reads resolve the primary; persisted
// legacy `states` axes (pre-flat documents) keep their map until the
// stored-shape migration re-homes them.
function instanceStateView(doc = {}) {
  if (doc && typeof doc === 'object' && !doc.status && typeof doc.state === 'string' && doc.state) {
    return { ...doc, states: { main: doc.state } };
  }
  if (doc && typeof doc === 'object' && !doc.status && doc.states) {
    const axes = storedStateAxes(doc.states);
    if (Object.keys(axes).length) {
      return { ...doc, states: axes };
    }
  }
  return doc;
}

