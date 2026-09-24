// Display-policy derivation (SPEC §4/§7): naming is authored vocabulary
// (name/glyph/field labels on declarations), grouping and state display
// derive at compile time, and machine ids never reach the user plane
// (this is where hand-mirrored status tables die).
import { schemaFor } from './registry.js';

const ICON_BY_CLASS = Object.freeze({
  party: 'pi pi-users', file: 'pi pi-file', item: 'pi pi-box',
  group: 'pi pi-folder', process: 'pi pi-cog'
});

function startCase(value = '') {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

// Derived sections (SPEC §4): total field assignment by base. There is no
// authored override channel — deviations are not render concerns.
const SECTION_ORDER = Object.freeze(['summary', 'dimensions', 'media', 'relations', 'notes']);
const LONG_STRING_AT = 120;

function isLongString(descriptor = {}) {
  return descriptor.base === 'string'
    && (descriptor.multiline === true
      || (Number.isFinite(descriptor.max) && descriptor.max >= LONG_STRING_AT));
}

function sectionForDescriptor(descriptor = {}) {
  const base = descriptor.base;
  if (base === 'quantity') return 'dimensions';
  if (base === 'ref') return 'relations';
  if (base === 'blob' || descriptor.depiction === true) return 'media';
  if (isLongString(descriptor)) return 'notes';
  if (base === 'list' || base === 'map') return sectionForDescriptor(descriptor.itemType || {});
  return 'summary';
}

export function deriveSections(fields = {}) {
  const bySection = new Map(SECTION_ORDER.map(id => [id, []]));
  for (const [fieldId, descriptor] of Object.entries(fields)) {
    bySection.get(sectionForDescriptor(descriptor)).push(fieldId);
  }
  return Object.freeze(
    SECTION_ORDER
      .filter(id => bySection.get(id).length)
      .map(id => Object.freeze({ id, label: null, fields: Object.freeze(bySection.get(id)) }))
  );
}

// Per-state display policy resolved onto the axes (SPEC §7): label
// defaults to the start-cased value — state VALUES are authored
// vocabulary, so this default is allowed — severity defaults secondary on
// terminal values else info, icons default to none.
function resolvedStateDisplay(states = {}) {
  return Object.freeze(Object.fromEntries(Object.entries(states).map(([axisName, axis]) => {
    const terminal = new Set(axis.terminal || []);
    return [axisName, Object.freeze(Object.fromEntries((axis.values || []).map(value => {
      const policy = axis.render?.[value] || {};
      return [value, Object.freeze({
        label: policy.label || startCase(value),
        icon: policy.icon || null,
        severity: policy.severity || (terminal.has(value) ? 'secondary' : 'info')
      })];
    })))];
  })));
}

// Derivation-only display policy: the pieces the client bundle attaches
// beyond the declaration's own record. `name` passes through verbatim
// (null → consumers render "Unnamed").
export function renderPolicyFor(type = {}) {
  const glyph = type.glyph || ICON_BY_CLASS[type.class] || 'pi pi-circle';
  const flagged = flag => Object.keys(type.fields || {}).find(name => type.fields[name][flag] === true) || null;
  return Object.freeze({
    name: type.name ?? null,
    glyph,
    identifier: flagged('identifier'),
    depiction: Object.freeze({ glyph, thumb: flagged('depiction') }),
    sections: deriveSections(type.fields || {}),
    states: resolvedStateDisplay(type.states || {})
  });
}

// Client bundle (SPEC §13 designer/frontend consumption): one compiled org
// view with schemas and derived display policy attached. The frontend
// never reads domain package code — it reads this. There is no `render`
// key: `name`/`glyph`/`identifier`/`depiction`/`sections` are the display
// vocabulary, per-state display rides the state axes.
export function compileClientBundle(registry, organizationId = null) {
  const compiled = registry.compile(organizationId);
  return Object.freeze({
    ok: compiled.ok,
    errors: compiled.errors,
    organizationId,
    types: Object.freeze([...compiled.types.values()].map(type => {
      const policy = renderPolicyFor(type);
      return Object.freeze({
        id: type.id,
        class: type.class,
        scope: type.scope,
        version: type.version,
        name: policy.name,
        glyph: policy.glyph,
        identifier: policy.identifier,
        depiction: policy.depiction,
        fields: type.fields,
        sections: policy.sections,
        states: Object.freeze(Object.fromEntries(Object.entries(type.states || {}).map(([axisName, axis]) => [
          axisName, Object.freeze({ ...axis, render: policy.states[axisName] })
        ]))),
        payload: type.payload,
        previewSource: type.previewSource || null,
        edges: type.edges,
        transitions: type.transitions,
        operators: type.operators,
        revisions: type.revisions,
        schema: schemaFor(type)
      });
    }))
  });
}
