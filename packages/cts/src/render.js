// Render policy projection (SPEC §7): labels/icons/severity derive from the
// type declaration — no hand-mirrored status table anywhere (this is where
// cncStatusUi dies).
import { schemaFor } from './registry.js';

const ICON_BY_CLASS = Object.freeze({
  party: 'pi pi-users', file: 'pi pi-file', item: 'pi pi-box',
  group: 'pi pi-folder', process: 'pi pi-cog'
});

function startCase(value = '') {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

// Authored render keys that pass through to the client bundle verbatim:
// identity/authoring vocabulary the UI mapping layer consumes
// (identityField, field groups, and the authored list-layout / default
// sort overrides). Everything else here is compiled policy.
//
// The fact-display facet (Phase 6, one fact vocabulary): `render.groups`
// entries are display field groups — card/detail fact rows — whose
// `fields` are descriptor records (path, label, display kind, unit,
// priority, fallback paths). Bare field-name strings remain valid (the
// ui-mapping section vocabulary); descriptors add the fact-row policy.
// The identity fallback policy is compiled, not authored: name → slug →
// uid, with the localized unnamed placeholder as terminal fallback.
const IDENTITY_POLICY = Object.freeze({
  fields: Object.freeze(['identity.name', 'identity.slug', 'identity.uid']),
  unnamed: 'common.unnamed'
});

const FIELD_DESCRIPTOR_KEYS = Object.freeze([
  'path', 'label', 'display', 'unit', 'suffix', 'prefix', 'priority',
  'fallbackPaths', 'role', 'typeId', 'replacesCountPath', 'surfaces'
]);

function normalizeGroupField(entry) {
  if (typeof entry === 'string') return Object.freeze({ path: entry });
  if (!entry || typeof entry !== 'object') return Object.freeze({});
  const descriptor = {};
  for (const key of FIELD_DESCRIPTOR_KEYS) {
    if (entry[key] !== undefined && entry[key] !== null) descriptor[key] = entry[key];
  }
  if (!descriptor.path && entry.name) descriptor.path = String(entry.name);
  if (descriptor.fallbackPaths && !Array.isArray(descriptor.fallbackPaths)) {
    descriptor.fallbackPaths = [descriptor.fallbackPaths];
  }
  return Object.freeze(descriptor);
}

function normalizeGroups(render) {
  return Object.freeze((Array.isArray(render.groups) ? render.groups : []).map(group => Object.freeze({
    id: group?.id,
    label: group?.label || null,
    fields: Object.freeze((group?.fields || []).map(normalizeGroupField))
  })));
}

export function renderPolicyFor(type = {}) {
  const render = type.render || {};
  const axis = type.states?.main;
  const terminal = new Set(axis?.terminal || []);
  const stateOverrides = render.states || {};
  return Object.freeze({
    label: render.label || startCase(type.id),
    icon: render.icon || ICON_BY_CLASS[type.class] || 'pi pi-circle',
    preview: render.preview || type.payload?.preview || (type.payload ? 'attachment' : 'none'),
    identityField: render.identityField || null,
    identity: IDENTITY_POLICY,
    listLayout: render.listLayout || null,
    sortKey: render.sortKey || null,
    groups: normalizeGroups(render),
    states: Object.fromEntries((axis?.values || []).map(value => [
      value,
      Object.freeze({
        label: stateOverrides[value]?.label || startCase(value),
        icon: stateOverrides[value]?.icon || null,
        severity: stateOverrides[value]?.severity
          || (terminal.has(value) ? 'secondary' : 'info')
      })
    ]))
  });
}

// Client bundle (SPEC §13 designer/frontend consumption): one compiled org
// view with schemas and render policy attached. The frontend never reads
// domain package code — it reads this.
export function compileClientBundle(registry, organizationId = null) {
  const compiled = registry.compile(organizationId);
  return Object.freeze({
    ok: compiled.ok,
    errors: compiled.errors,
    organizationId,
    types: Object.freeze([...compiled.types.values()].map(type => Object.freeze({
      id: type.id,
      class: type.class,
      scope: type.scope,
      version: type.version,
      fields: type.fields,
      payload: type.payload,
      edges: type.edges,
      states: type.states,
      transitions: type.transitions,
      operators: type.operators,
      revisions: type.revisions,
      schema: schemaFor(type),
      render: renderPolicyFor(type)
    })))
  });
}
