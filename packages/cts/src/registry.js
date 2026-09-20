// Type records + registry (SPEC §4, §13): declarations as data, tenancy
// (system first, org overlay, no shadowing), compile = R1-R6.
import { normalizeRow, checkFields, rowToSchema } from './rows.js';
import { normalizeEdges, checkLineageAcyclic } from './edges.js';
import { normalizeStates, normalizeTransitions, checkStateTotality } from './states.js';
import { checkClassObligations } from './classes.js';
import { normalizeOperator, OPERATOR_SPECIES_BY_LETTER } from './operators.js';
import { requireCompatible } from './diff.js';

// Payload traits (SPEC §4): the payload declaration carries the accepted
// MIME list, byte limit, and preview mode. Canonical shape is
// { mime: string[], accept?, maxSize?, preview? }; a bare MIME string and
// a `byteLimit` key (legacy persisted org docs and pack fixtures)
// normalize at this boundary. This is
// the whole of today's attachment-kind authoring, as data on the type.
function normalizePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return Object.freeze({ mime: Object.freeze([payload]) });
  const mime = typeof payload.mime === 'string' ? [payload.mime] : [...(payload.mime || [])];
  if (!mime.length) throw new Error('payload requires at least one accepted MIME type');
  const maxSize = Number.isFinite(payload.maxSize) ? payload.maxSize : payload.byteLimit;
  return Object.freeze({
    mime: Object.freeze(mime),
    ...(payload.accept?.length ? { accept: Object.freeze([...payload.accept]) } : {}),
    ...(Number.isFinite(maxSize) ? { maxSize } : {}),
    ...(payload.preview ? { preview: String(payload.preview) } : {})
  });
}

export function normalizeType(declaration = {}) {
  if (!declaration.id || !/^[a-z][a-z0-9-]*$/.test(declaration.id)) {
    throw new Error('type id must be kebab-case');
  }
  if (!declaration.class) throw new Error(`type ${declaration.id}: class is required`);

  const type = {
    id: declaration.id,
    class: declaration.class,
    scope: declaration.scope === 'org' ? 'org' : 'system',
    organizationId: declaration.scope === 'org' ? declaration.organizationId || null : null,
    version: declaration.version || 1,
    fields: normalizeRow(declaration.fields || {}),
    payload: normalizePayload(declaration.payload),
    edges: normalizeEdges(declaration.edges || {}),
    states: normalizeStates(declaration.states || {}),
    revisions: declaration.revisions || null,
    render: declaration.render || {},
    ...(declaration.framework ? { framework: true } : {})
  };
  type.transitions = normalizeTransitions(declaration.transitions || [], type.states);
  type.operators = Object.fromEntries(Object.entries(declaration.operators || {}).map(([id, operator]) => [
    id, normalizeOperator({ ...operator, id, declaringType: type.id })
  ]));
  if (declaration.intents) {
    throw new Error(`type ${declaration.id}: intents live on transition operators, never on the type (SPEC §7)`);
  }
  return Object.freeze(type);
}

export function createTypeRegistry({ id = 'cts', hasInstances = null } = {}) {
  const types = new Map();

  function keyOf(type) {
    return type.scope === 'org' ? `${type.id}@${type.organizationId}` : type.id;
  }

  function defineType(declaration) {
    const type = normalizeType(declaration);
    const existing = types.get(keyOf(type));
    if (existing) {
      // Breaking diffs are refused only for types with live data: an
      // empty type has nothing to migrate, so the redefinition lands
      // with a plain version bump. The probe returns a synchronous
      // instance count; registries without one refuse as before.
      const diff = hasInstances && hasInstances(existing) === 0
        ? { changes: [{ severity: 'minor', kind: 'empty-redefinition' }], breaking: false }
        : requireCompatible(existing, type);
      types.set(keyOf(type), Object.freeze({ ...type, version: existing.version + (diff.changes.length ? 1 : 0) }));
    } else {
      types.set(keyOf(type), type);
    }
    return getType(type.id, type.organizationId);
  }

  function getType(typeId, organizationId = null) {
    if (organizationId) {
      const orgType = types.get(`${typeId}@${organizationId}`);
      if (orgType) return orgType;
    }
    const systemType = types.get(typeId);
    if (!systemType || systemType.scope !== 'system') return null;
    return systemType;
  }

  // Tenancy resolution: system types first, the org's types overlay; never
  // the union of all orgs.
  function resolveView(organizationId = null) {
    const view = new Map();
    for (const type of types.values()) {
      if (type.scope === 'system') view.set(type.id, type);
    }
    if (organizationId) {
      for (const type of types.values()) {
        if (type.scope === 'org' && type.organizationId === organizationId) {
          if (view.has(type.id)) {
            throw new Error(`org type ${type.id} shadows a system type — forbidden (SPEC §4)`);
          }
          view.set(type.id, type);
        }
      }
    }
    return view;
  }

  function listTypes(organizationId = null) {
    return [...resolveView(organizationId).values()];
  }

  const registry = { id, defineType, getType, listTypes, resolveView, compile };

  // Compile (R1-R6): the whole view must hold, not each type in isolation.
  function compile(organizationId = null) {
    const view = resolveView(organizationId);
    const errors = [];
    const childTypes = new Set();
    for (const type of view.values()) {
      for (const declaration of Object.values(type.edges?.children || {})) {
        for (const childType of declaration.types || []) childTypes.add(childType);
      }
    }
    for (const type of view.values()) {
      errors.push(...checkClassObligations(type, { childTypes }));
      errors.push(...checkStateTotality(type));
      errors.push(...checkRefTargets(type, view));
      errors.push(...checkChildrenDeclared(type, view));
    }
    errors.push(...checkLineageAcyclic(view));
    return Object.freeze({
      ok: errors.length === 0,
      errors: Object.freeze(errors),
      types: view,
      operatorSpecies: OPERATOR_SPECIES_BY_LETTER
    });
  }

  function checkRefTargets(type, view) {
    const errors = [];
    for (const [name, descriptor] of Object.entries(type.fields)) {
      if (descriptor.base === 'ref') {
        for (const target of descriptor.accepts) {
          // '*' is the strangler wildcard for untyped legacy entity refs;
          // it names no target and is therefore not checkable here.
          if (target !== '*' && !view.has(target)) {
            errors.push(`type ${type.id}: fields.${name} references unknown type ${target}`);
          }
        }
      }
    }
    return errors;
  }

  function checkChildrenDeclared(type, view) {
    const errors = [];
    for (const [key, declaration] of Object.entries(type.edges.children || {})) {
      for (const childType of declaration.types) {
        if (!view.has(childType)) errors.push(`type ${type.id}: children.${key} references unknown type ${childType}`);
      }
    }
    return errors;
  }

  return registry;
}

export function validateInstance(type, instance = {}) {
  if (instance.type !== type.id) return [`instance type ${instance.type} does not match ${type.id}`];
  if (instance.typeVersion !== type.version) {
    return [`instance typeVersion ${instance.typeVersion} behind ${type.version} — ill-typed by definition (SPEC §11)`];
  }
  const errors = [...checkFields(type.fields, instance.fields)];
  if (type.states.main) {
    const state = instance.states?.main;
    if (!type.states.main.values.includes(state)) {
      errors.push(`states.main: expected one of [${type.states.main.values.join(', ')}], got ${JSON.stringify(state)}`);
    }
  }
  return errors;
}

export function schemaFor(type) {
  return rowToSchema(type.id, type.fields);
}

export { OPERATOR_SPECIES_BY_LETTER };
