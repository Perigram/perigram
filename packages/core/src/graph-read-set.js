// A single execution-scoped recorder shared by parent and pinned child
// graphs. Data adapters call these methods after their authorized read;
// the core never infers a database snapshot that the adapter did not obtain.
export function createGraphReadSetRecorder(initial = {}) {
  const snapshot = normalizeBoundary(initial);
  let consistencyObserved = hasBoundaryDeclaration(initial);
  const instances = new Map();
  const relations = new Map();
  const queries = new Map();
  const files = new Map();

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
    instances.set(stableJson(entry), entry);
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
    relations.set(stableJson(entry), entry);
    return entry;
  }

  function recordQuery(read = {}) {
    const typeId = requiredString(read.typeId, 'query typeId');
    const query = cloneJson(read.query || {});
    const resultIds = [];
    const seenResultIds = new Set();
    for (const value of Array.isArray(read.resultIds) ? read.resultIds : []) {
      const id = requiredString(value, 'query result id');
      if (seenResultIds.has(id)) continue;
      seenResultIds.add(id);
      resultIds.push(id);
    }
    const entry = {
      typeId,
      organizationId: optionalString(read.organizationId),
      query,
      resultIds,
      observedTotal: Number.isInteger(read.observedTotal) && read.observedTotal >= 0 ? read.observedTotal : null,
      sequence: finiteSequence(read.sequence)
    };
    const observationKey = stableJson({
      typeId,
      organizationId: entry.organizationId,
      query,
      sequence: entry.sequence
    });
    for (const previous of queries.values()) {
      const previousKey = stableJson({
        typeId: previous.typeId,
        organizationId: previous.organizationId,
        query: previous.query,
        sequence: previous.sequence
      });
      if (previousKey === observationKey
        && (stableJson(previous.resultIds) !== stableJson(entry.resultIds)
          || previous.observedTotal !== entry.observedTotal)) {
        downgradeConsistency();
      }
    }
    queries.set(stableJson(entry), entry);
    return entry;
  }

  function recordFile(read = {}) {
    const entry = {
      fileId: requiredString(read.fileId, 'file id'),
      contentHash: requiredString(read.contentHash, 'file content hash'),
      organizationId: optionalString(read.organizationId)
    };
    files.set(stableJson(entry), entry);
    return entry;
  }

  function setConsistency(next = {}) {
    if (!hasBoundaryDeclaration(next)) return toJSON();
    const candidate = normalizeBoundary(next);
    if (!consistencyObserved) {
      Object.assign(snapshot, candidate);
      consistencyObserved = true;
      return toJSON();
    }
    if (stableJson(snapshot) !== stableJson(candidate)) {
      if (sameOrganizationSequence(snapshot, candidate)) {
        Object.assign(snapshot, {
          consistency: 'sequence-bracketed',
          snapshotId: null,
          organizationSequenceStart: candidate.organizationSequenceStart,
          organizationSequenceEnd: candidate.organizationSequenceEnd
        });
      } else {
        downgradeConsistency();
      }
    }
    return toJSON();
  }

  function downgradeConsistency() {
    snapshot.consistency = 'unverified';
    snapshot.snapshotId = null;
    snapshot.organizationSequenceStart = null;
    snapshot.organizationSequenceEnd = null;
    consistencyObserved = true;
  }

  function toJSON() {
    return {
      ...snapshot,
      instances: [...instances.values()].sort(compareEntry),
      relations: [...relations.values()].sort(compareEntry),
      queries: [...queries.values()].sort(compareEntry),
      files: [...files.values()].sort(compareEntry)
    };
  }

  return Object.freeze({ recordInstance, recordRelation, recordQuery, recordFile, setConsistency, toJSON });
}

function sameOrganizationSequence(left = {}, right = {}) {
  const start = left.organizationSequenceStart;
  const end = left.organizationSequenceEnd;
  return ['snapshot', 'sequence-bracketed'].includes(left.consistency)
    && ['snapshot', 'sequence-bracketed'].includes(right.consistency)
    && Number.isSafeInteger(start)
    && start >= 0
    && start === end
    && start === right.organizationSequenceStart
    && start === right.organizationSequenceEnd;
}

function hasBoundaryDeclaration(value = {}) {
  return ['consistency', 'snapshotId', 'organizationSequenceStart', 'organizationSequenceEnd']
    .some(key => Object.hasOwn(value, key));
}

function normalizeBoundary(value = {}) {
  let consistency = ['snapshot', 'sequence-bracketed', 'unverified'].includes(value.consistency)
    ? value.consistency
    : 'unverified';
  let snapshotId = optionalString(value.snapshotId);
  let organizationSequenceStart = finiteSequence(value.organizationSequenceStart);
  let organizationSequenceEnd = finiteSequence(value.organizationSequenceEnd);
  if (consistency === 'snapshot' && !snapshotId) consistency = 'unverified';
  if (consistency === 'sequence-bracketed'
    && (organizationSequenceStart === null
      || organizationSequenceEnd === null
      || organizationSequenceStart !== organizationSequenceEnd)) {
    consistency = 'unverified';
  }
  if (consistency === 'unverified') {
    snapshotId = null;
    organizationSequenceStart = null;
    organizationSequenceEnd = null;
  }
  return { consistency, snapshotId, organizationSequenceStart, organizationSequenceEnd };
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
