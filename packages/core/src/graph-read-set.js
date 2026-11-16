const EMPTY_READ_SET = Object.freeze({
  consistency: 'unverified',
  snapshotId: null,
  organizationSequenceStart: null,
  organizationSequenceEnd: null,
  instances: [],
  relations: [],
  queries: []
});

// A single execution-scoped recorder shared by parent and pinned child
// graphs. Data adapters call these methods after their authorized read;
// the core never infers a database snapshot that the adapter did not obtain.
export function createGraphReadSetRecorder(initial = {}) {
  const snapshot = {
    consistency: ['snapshot', 'sequence-bracketed', 'unverified'].includes(initial.consistency)
      ? initial.consistency
      : 'unverified',
    snapshotId: initial.snapshotId == null ? null : String(initial.snapshotId),
    organizationSequenceStart: finiteSequence(initial.organizationSequenceStart),
    organizationSequenceEnd: finiteSequence(initial.organizationSequenceEnd)
  };
  const instances = new Map();
  const relations = new Map();
  const queries = new Map();

  function recordInstance(read = {}) {
    const typeId = requiredString(read.typeId, 'instance typeId');
    const instanceId = requiredString(read.instanceId, 'instance id');
    const entry = {
      typeId,
      instanceId,
      revision: optionalString(read.revision),
      updatedAt: optionalString(read.updatedAt),
      typeVersion: Number.isInteger(read.typeVersion) ? read.typeVersion : null,
      organizationId: optionalString(read.organizationId)
    };
    instances.set(`${typeId}:${instanceId}`, entry);
    return entry;
  }

  function recordRelation(read = {}) {
    const entry = {
      sourceTypeId: requiredString(read.sourceTypeId, 'relation sourceTypeId'),
      sourceId: requiredString(read.sourceId, 'relation sourceId'),
      key: requiredString(read.key, 'relation key'),
      targetTypeId: requiredString(read.targetTypeId, 'relation targetTypeId'),
      targetId: requiredString(read.targetId, 'relation targetId'),
      revision: optionalString(read.revision)
    };
    relations.set([
      entry.sourceTypeId, entry.sourceId, entry.key, entry.targetTypeId, entry.targetId
    ].join(':'), entry);
    return entry;
  }

  function recordQuery(read = {}) {
    const typeId = requiredString(read.typeId, 'query typeId');
    const query = cloneJson(read.query || {});
    const resultIds = Array.isArray(read.resultIds)
      ? [...new Set(read.resultIds.map(value => requiredString(value, 'query result id')))].sort()
      : [];
    const entry = {
      typeId,
      organizationId: optionalString(read.organizationId),
      query,
      resultIds,
      observedTotal: Number.isInteger(read.observedTotal) && read.observedTotal >= 0 ? read.observedTotal : null,
      sequence: finiteSequence(read.sequence)
    };
    const key = stableJson({ typeId, organizationId: entry.organizationId, query });
    queries.set(key, entry);
    return entry;
  }

  function setConsistency(next = {}) {
    if (next.consistency && ['snapshot', 'sequence-bracketed', 'unverified'].includes(next.consistency)) {
      snapshot.consistency = next.consistency;
    }
    if (Object.hasOwn(next, 'snapshotId')) snapshot.snapshotId = optionalString(next.snapshotId);
    if (Object.hasOwn(next, 'organizationSequenceStart')) {
      snapshot.organizationSequenceStart = finiteSequence(next.organizationSequenceStart);
    }
    if (Object.hasOwn(next, 'organizationSequenceEnd')) {
      snapshot.organizationSequenceEnd = finiteSequence(next.organizationSequenceEnd);
    }
    return toJSON();
  }

  function toJSON() {
    return {
      ...snapshot,
      instances: [...instances.values()].sort(compareEntry),
      relations: [...relations.values()].sort(compareEntry),
      queries: [...queries.values()].sort(compareEntry)
    };
  }

  return Object.freeze({ recordInstance, recordRelation, recordQuery, setConsistency, toJSON });
}

export function emptyGraphReadSet() {
  return cloneJson(EMPTY_READ_SET);
}

function requiredString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} is required`);
  return normalized;
}
function optionalString(value) {
  return value == null || value === '' ? null : String(value);
}
function finiteSequence(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
function compareEntry(a, b) {
  return stableJson(a).localeCompare(stableJson(b));
}
