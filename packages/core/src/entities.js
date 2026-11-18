import {
  normalizeStatusLifecycle,
  normalizeStatusState,
  stateAxesFromStorage,
  statusStateFromStorage
} from './status.js';

export const CANONICAL_ENTITY_BLOCKS = Object.freeze([
  'identity',
  'origin',
  'status',
  'lineage',
  'relations',
  'provenance',
  'specs',
  'attachments',
  'data',
  'summary'
]);

export const CANONICAL_BLOCK_SCHEMAS = Object.freeze({
  identity: Object.freeze([
    canonicalBlockField('identity.uid', 'string', { writable: false, constructible: false }),
    canonicalBlockField('identity.name', 'string'),
    canonicalBlockField('identity.slug', 'string'),
    canonicalBlockField('identity.serial', 'string'),
    canonicalBlockField('identity.reference', 'string')
  ]),
  origin: Object.freeze([
    canonicalBlockField('origin.state.primary', 'status'),
    canonicalBlockField('origin.userId', 'string'),
    canonicalBlockField('origin.timestamp', 'dateTime'),
    canonicalBlockField('origin.metadata', 'json'),
    canonicalBlockField('origin.eventId', 'string'),
    canonicalBlockField('origin.lifecycle', 'json')
  ]),
  status: Object.freeze([
    canonicalBlockField('states.main', 'status'),
    canonicalBlockField('status.userId', 'string'),
    canonicalBlockField('status.timestamp', 'dateTime'),
    canonicalBlockField('status.metadata', 'json'),
    canonicalBlockField('status.eventId', 'string'),
    canonicalBlockField('status.lifecycle', 'json')
  ]),
  lineage: Object.freeze([
    canonicalBlockField('lineage', 'map', {
      keyType: canonicalValueType('string', { nullable: false }),
      valueType: canonicalValueType('id', { nullable: false })
    })
  ]),
  relations: Object.freeze([canonicalBlockField('relations', 'json')]),
  provenance: Object.freeze([canonicalBlockField('provenance', 'json')]),
  specs: Object.freeze([canonicalBlockField('specs', 'json')]),
  attachments: Object.freeze([canonicalBlockField('attachments', 'json')]),
  data: Object.freeze([canonicalBlockField('data', 'json')]),
  summary: Object.freeze([canonicalBlockField('summary', 'json')])
});

function canonicalBlockField(path, base, qualifiers = {}) {
  const {
    readable = true,
    writable = true,
    constructible = true,
    ...typeQualifiers
  } = qualifiers;
  return Object.freeze({
    path,
    block: String(path).split('.')[0],
    label: path,
    type: Object.freeze(canonicalValueType(base, typeQualifiers)),
    readable,
    writable,
    constructible
  });
}

function canonicalValueType(base, qualifiers = {}) {
  return Object.freeze({ base, shape: 'item', nullable: true, ...qualifiers });
}

export class Identity {
  constructor(uid = null, name = '', slug = '', serial = '', reference = '') {
    if (!uid) throw new Error('Identity: uid is required');
    this.uid = uid;
    this.name = name;
    this.slug = slug || (typeof uid === 'string' && uid.length !== 24 ? uid : '');
    this.serial = serial;
    this.reference = reference;
  }

  toJSON() {
    return { uid: this.uid, name: this.name, slug: this.slug, serial: this.serial, reference: this.reference };
  }
}

export class Status {
  constructor(state, userId = 'SYSTEM', metadata = {}, eventId = null, timestamp = new Date(), lifecycle = {}) {
    if (!state) throw new Error('Status: state is required');
    this.state = normalizeStatusState(state);
    this.userId = userId || 'SYSTEM';
    this.timestamp = timestamp ? new Date(timestamp) : new Date();
    this.metadata = metadata || {};
    this.eventId = eventId;
    this.lifecycle = normalizeStatusLifecycle(lifecycle);
  }

  toJSON() {
    return {
      state: this.state,
      userId: this.userId,
      timestamp: this.timestamp,
      metadata: this.metadata,
      eventId: this.eventId,
      lifecycle: this.lifecycle
    };
  }
}

export class Lineage {
  constructor(raw = {}) {
    for (const [key, value] of Object.entries(raw)) {
      if (value) this[key] = value;
    }
  }

  add(type, id) {
    if (id) this[`${type}Id`] = id;
    return this;
  }

  toJSON() {
    const json = {};
    for (const [key, value] of Object.entries(this)) {
      if (typeof value !== 'function') json[key] = value;
    }
    return json;
  }
}

export function normalizeInstanceRef(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!value.type || !value.id) return null;
  const ref = {
    type: String(value.type),
    id: value.id.toString()
  };
  if (value.revisionId) ref.revisionId = value.revisionId.toString();
  return ref;
}

export class Relations {
  constructor(raw = {}) {
    for (const [key, value] of Object.entries(raw || {})) {
      if (Array.isArray(value)) {
        const refs = value.map(normalizeInstanceRef).filter(Boolean);
        if (refs.length) this[key] = refs;
        continue;
      }
      const ref = normalizeInstanceRef(value);
      if (ref) this[key] = ref;
    }
  }

  toJSON() {
    return Object.fromEntries(Object.entries(this));
  }
}

export class Provenance {
  constructor(raw = {}) {
    for (const [key, value] of Object.entries(raw || {})) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const source = normalizeInstanceRef(value.source);
      if (!source) continue;
      this[key] = { ...value, source };
    }
  }

  toJSON() {
    return Object.fromEntries(Object.entries(this));
  }
}

export class BaseEntity {
  constructor(raw = {}) {
    this._id = raw.identity?.uid || raw._id || null;
    this.identity = new Identity(
      this._id,
      raw.identity?.name || '',
      raw.identity?.slug || '',
      raw.identity?.serial || '',
      raw.identity?.reference || ''
    );
    this.lineage = new Lineage(raw.lineage || {});
    this.relations = new Relations(raw.relations || {});
    this.provenance = new Provenance(raw.provenance || {});
    this.origin = raw.origin?.state ? new Status(raw.origin.state, raw.origin.userId, raw.origin.metadata, raw.origin.eventId, raw.origin.timestamp, raw.origin.lifecycle) : null;
    // Storage round-trip:
    // toJSON() is the persisted document shape, so the current status block
    // rehydrates from flat persisted `states` when the document carries no
    // `status` block; pre-migration block documents keep parsing unchanged.
    this.status = raw.status?.state
      ? new Status(raw.status.state, raw.status.userId, raw.status.metadata, raw.status.eventId, raw.status.timestamp, raw.status.lifecycle)
      : (raw.states
          ? (() => {
              const state = statusStateFromStorage(raw.states);
              return state
                ? new Status(state, raw.states.userId, raw.states.metadata, raw.states.eventId, raw.states.timestamp, raw.states.lifecycle)
                : null;
            })()
          : null);
    this.specs = raw.specs && typeof raw.specs === 'object' ? raw.specs : null;
    this.attachments = raw.attachments || {};
    this.data = raw.data || {};
    this.summary = raw.summary || {};
  }

  get id() {
    return this._id?.toString();
  }

  get name() {
    return this.identity?.name || '';
  }

  applyStatus(state, userId, metadata = {}, eventId = null, lifecycle = {}) {
    const next = new Status(state, userId, metadata, eventId, null, lifecycle);
    if (!this.origin) this.origin = next;
    this.status = next;
    return this;
  }

  toJSON() {
    return {
      _id: this._id,
      identity: this.identity.toJSON(),
      lineage: this.lineage.toJSON(),
      relations: this.relations.toJSON(),
      provenance: this.provenance.toJSON(),
      origin: this.origin?.toJSON() || null,
      // Wire vocabulary: every active workflow axis is stored as its
      // canonical leaf path; evidence remains one status envelope. The
      // `states` object is not a single primary-state alias.
      states: this.status
        ? {
            ...stateAxesFromStorage(this.status.state?.active || {}),
            userId: this.status.userId,
            timestamp: this.status.timestamp,
            metadata: this.status.metadata,
            eventId: this.status.eventId,
            lifecycle: this.status.lifecycle
          }
        : null,
      specs: this.specs || null,
      attachments: this.attachments,
      data: this.data,
      summary: this.summary
    };
  }
}

export function createInstanceRef(type, id, revisionId = null) {
  if (!type || !id) throw new Error('InstanceRef requires type and id');
  return normalizeInstanceRef({ type, id, revisionId });
}

export function createProvenance(source, facts = {}) {
  const normalizedSource = normalizeInstanceRef(source);
  if (!normalizedSource) throw new Error('Provenance requires a canonical source EntityRef');
  return { ...facts, source: normalizedSource };
}

export function createAttachmentRef({ instanceId, kind, name = '', metadata = {} } = {}) {
  if (!instanceId) throw new Error('AttachmentRef requires instanceId');
  if (!kind) throw new Error('AttachmentRef requires kind');
  return { instanceId: instanceId.toString(), kind, name, metadata };
}

export const createIdentity = (name, slug = '', serial = '', reference = '', uid = slug || name) => new Identity(uid, name, slug, serial, reference);
export const createStatus = (state, userId = 'SYSTEM', metadata = {}, eventId = null, lifecycle = {}) => new Status(state, userId, metadata, eventId, null, lifecycle);
export const createData = (data = {}) => ({ ...data });
export const inheritLineage = (parent, type, mapId = value => value) => new Lineage(parent?.lineage || {}).add(type, mapId(parent?.identity?.uid || parent?._id));
export const createAttachment = (kind, fileId, name = '', metadata = {}) => ({ kind, fileId, name, metadata, timestamp: new Date() });

