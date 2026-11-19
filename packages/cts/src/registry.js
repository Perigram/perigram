// Type records + registry (SPEC §4, §13): declarations as data, tenancy
// (system first, org overlay, no shadowing), compile = R1-R6.
import { normalizeRow, rowToSchema } from './rows.js';
import { normalizeEdges, checkLineageAcyclic, UNLINK_POLICIES } from './edges.js';
import { checkClassObligations } from './classes.js';
import { normalizeOperator } from './operators.js';
import { describeType } from './values.js';
import { requireCompatible, normalizeMigrateSteps } from './diff.js';
import { checkTypedBooleanExpression, evaluateAsync, MAX_STEPS } from './expressions.js';
import { normalizeStateVocabulary } from './states.js';

// Payload traits (SPEC §4): the payload declaration carries the accepted
// MIME list, byte limit, preview mode, and creation protocols. Canonical
// shape is { mime: string[], accept?, maxSize?, preview?, creation? };
// a bare MIME string and a `byteLimit` key (legacy persisted org docs
// and pack fixtures) normalize at this boundary. This is the whole of
// today's attachment-kind authoring, as data on the type.
export const CREATION_PROTOCOLS = Object.freeze(['upload', 'capture', 'editor', 'content']);

// Compact-snapshot preview paths (SPEC §4): dot paths into the wire DTO
// a compact snapshot keeps. Bounded by design — a snapshot is a preview,
// never a copy. Authored paths adopt the flat row home: a leading
// `data.`/`specs.` slot prefix (the retired wire split) rewrites to
// `fields.` once, at this boundary.
function wireRowPath(path = '') {
  const clean = String(path).trim();
  return /^(data|specs)\.[a-z]/.test(clean) ? `fields.${clean.slice(clean.indexOf('.') + 1)}` : clean;
}

function normalizeSnapshot(paths = []) {
  if (!Array.isArray(paths)) throw new Error('snapshot must be an array of data paths');
  const cleaned = [...new Set(paths.map(path => wireRowPath(path)))].filter(Boolean);
  if (!cleaned.length) throw new Error('snapshot requires at least one data path');
  if (cleaned.length > 12) throw new Error('snapshot accepts at most 12 data paths');
  for (const path of cleaned) {
    if (!/^fields(\.[a-z][a-zA-Z0-9]*)+$/.test(path)) {
      throw new Error(`snapshot path ${path} must be a fields.* dot path`);
    }
  }
  return Object.freeze(cleaned);
}

function normalizePayload(payload) {  if (!payload) return null;
  if (typeof payload === 'string') return Object.freeze({ mime: Object.freeze([payload]), creation: Object.freeze(['upload']) });
  const mime = typeof payload.mime === 'string' ? [payload.mime] : [...(payload.mime || [])];
  if (!mime.length) throw new Error('payload requires at least one accepted MIME type');
  const maxSize = Number.isFinite(payload.maxSize) ? payload.maxSize : payload.byteLimit;
  const creationRaw = payload.creation == null ? ['upload'] : [].concat(payload.creation);
  const creation = [...new Set(creationRaw.map(String))];
  if (!creation.length) throw new Error('payload requires at least one creation protocol');
  for (const protocol of creation) {
    if (!CREATION_PROTOCOLS.includes(protocol)) {
      throw new Error(`payload creation protocol ${protocol} is not one of ${CREATION_PROTOCOLS.join(' | ')}`);
    }
  }
  const inputs = payload.inputs && typeof payload.inputs === 'object' && !Array.isArray(payload.inputs)
    ? Object.fromEntries(Object.entries(payload.inputs).map(([id, descriptor]) => [id, describeType(descriptor || {})]))
    : null;
  return Object.freeze({
    mime: Object.freeze(mime),
    ...(payload.accept?.length ? { accept: Object.freeze([...payload.accept]) } : {}),
    ...(Number.isFinite(maxSize) ? { maxSize } : {}),
    ...(payload.preview ? { preview: String(payload.preview) } : {}),
    ...(inputs && Object.keys(inputs).length ? { inputs: Object.freeze(inputs) } : {}),
    creation: Object.freeze(creation)
  });
}

function startCase(value = '') {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

// Write-gate delegation facet: `{ inherits: <typeId> }`, validated at
// the authoring boundary like every other facet.
function normalizeMutability(value, typeId) {
  if (!['mutable', 'append-only'].includes(value)) {
    throw new Error(`type ${typeId}: mutability must be mutable or append-only`);
  }
  return value;
}

function normalizeAccess(access = {}) {
  const inherits = String(access?.inherits || '');
  if (!inherits) {
    throw new Error('access.inherits must name a type id');
  }
  return { inherits };
}

// Legacy `render` facet adoption (SPEC §4 boundary migration,
// adopt-and-delete): both pack seeds and stored org docs normalize here,
// so the retired keys convert exactly once and never reach the compiled
// record. System/pack declarations whose only name carrier was the id
// adopt `startCase(id)` (engineer-authored ids, one-time migration — the
// opaque-id law forbids it as a served default); org-stored declarations
// with neither carrier keep `name: null` — served, with the compile
// error the write gate enforces away on the next authored write.
function adoptName(declaration, scope) {
  return declaration.name || declaration.render?.label
    || (scope === 'org' ? null : startCase(declaration.id));
}

function constraintValue(instance = {}) {
  const fields = instance.fields && typeof instance.fields === 'object' ? instance.fields : {};
  return {
    ...fields,
    _id: instance._id ?? instance.id ?? null,
    type: instance.type ?? null,
    organizationId: instance.organizationId ?? null,
    fields,
    relations: instance.relations || {},
    lineage: instance.lineage || {},
    state: instance.state ?? null
  };
}

function normalizeConstraints(constraints = [], typeId = '', typeScope = 'system') {
  if (!Array.isArray(constraints) || constraints.length > 100) throw new Error(`type ${typeId}: constraints must be an array of at most 100 entries`);
  const seen = new Set();
  return Object.freeze(constraints.map((constraint, index) => {
    const id = String(constraint?.id || '').trim();
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error(`type ${typeId}: constraint ${index} requires a kebab-case id`);
    if (seen.has(id)) throw new Error(`type ${typeId}: duplicate constraint id ${id}`);
    seen.add(id);
    if (constraint.kind === 'unique') {
      const expectedScope = typeScope === 'org' ? 'organization' : 'global';
      const scope = String(constraint.scope || '');
      if (scope !== expectedScope) {
        throw new Error(`type ${typeId}: unique constraint ${id} on a ${typeScope} type requires scope ${expectedScope}`);
      }
      const field = String(constraint.field || '').trim();
      if (!/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/.test(field)) {
        throw new Error(`type ${typeId}: unique constraint ${id} requires a lowerCamelCase field path`);
      }
      const equality = constraint.equality == null ? 'exact' : String(constraint.equality);
      if (equality !== 'exact') throw new Error(`type ${typeId}: unique constraint ${id} supports exact equality only`);
      const nulls = constraint.nulls == null ? 'ignore' : String(constraint.nulls);
      if (nulls !== 'ignore') throw new Error(`type ${typeId}: unique constraint ${id} supports nulls: ignore only`);
      return Object.freeze({ id, kind: 'unique', scope, field, equality, nulls });
    }
    if (constraint.kind != null && constraint.kind !== 'expression') {
      throw new Error(`type ${typeId}: constraint ${id} has unsupported kind ${constraint.kind}`);
    }
    if (constraint.scope != null && constraint.scope !== 'instance') throw new Error(`type ${typeId}: constraint ${id} currently supports instance scope only`);
    if (!constraint.expression || typeof constraint.expression !== 'object' || Array.isArray(constraint.expression)) throw new Error(`type ${typeId}: constraint ${id} requires an expression AST`);
    return Object.freeze({
      id,
      scope: 'instance',
      expression: Object.freeze(structuredClone(constraint.expression)),
      ...(constraint.message ? { message: String(constraint.message) } : {})
    });
  }));
}

export async function validateConstraints(type, instance, resolvers = {}) {
  const errors = [];
  for (const constraint of type?.constraints || []) {
    if (constraint.kind === 'unique') continue;
    try {
      const valid = await evaluateAsync(constraint.expression, { value: constraintValue(instance) }, { steps: MAX_STEPS, ...resolvers });
      if (valid !== true) errors.push(`constraint ${constraint.id}: ${constraint.message || 'predicate did not hold'}`);
    } catch (error) {
      errors.push(`constraint ${constraint.id}: ${error?.message || String(error)}`);
    }
  }
  return errors;
}

export function normalizeType(declaration = {}) {
  if (!declaration.id || !/^[a-z][a-z0-9-]*$/.test(declaration.id)) {
    throw new Error('type id must be kebab-case');
  }
  if (!declaration.class) throw new Error(`type ${declaration.id}: class is required`);

  const legacyRender = declaration.render || {};
  const scope = declaration.scope === 'org' ? 'org' : 'system';
  const glyph = declaration.glyph || legacyRender.icon || null;
  // `render.identityField` migrates onto the field's `identifier` flag;
  // per-state display policy migrates to its states-facet home (SPEC §7).
  let fields = declaration.fields || {};
  if (legacyRender.identityField && Object.hasOwn(fields, legacyRender.identityField)) {
    fields = { ...fields, [legacyRender.identityField]: { ...fields[legacyRender.identityField], identifier: true } };
  }
  // Authored preview declaration: the first `render.groups` row flagged
  // `previewSource` (the pack authoring vocabulary for "this data field is
  // the card/detail preview") adopts into the normalized record as
  // `{ path, display }`, so generators can render declared previews even
  // before a payload exists. Adopt-and-delete: the raw groups never ride
  // the compiled record. Stored normalized records carry `previewSource`
  // directly, so a recompile keeps it.
  const previewSourceRow = (legacyRender.groups || [])
    .flatMap(group => group.fields || [])
    .find(field => field?.role === 'previewSource' && field?.path)
    || declaration.previewSource;

  const states = normalizeStateVocabulary(declaration.stateVocabulary || {});

  const type = {
    id: declaration.id,
    class: declaration.class,
    scope,
    organizationId: scope === 'org' ? declaration.organizationId || null : null,
    version: declaration.version || 1,
    name: adoptName(declaration, scope),
    ...(glyph ? { glyph } : {}),
    fields: normalizeRow(fields),
    payload: normalizePayload(declaration.payload),
    // Compact-snapshot preview contract (SPEC §4): the declared data
    // paths a compact snapshot keeps (chat message instance previews and
    // any bounded embed). Absent declaration strips heavy keys — a
    // snapshot is a preview, never a copy.
    ...(declaration.snapshot ? { snapshot: normalizeSnapshot(declaration.snapshot) } : {}),
    ...(previewSourceRow?.path ? { previewSource: Object.freeze({
      path: wireRowPath(previewSourceRow.path),
      display: previewSourceRow.display || 'geometry',
      // Stored-shape fallbacks: the preview channel resolves the first
      // non-empty path, so a type whose renderable geometry lives in
      // more than one stored shape (baked preview vs raw layer/polygon
      // parts) previews them all.
      ...(Array.isArray(previewSourceRow.fallbackPaths) && previewSourceRow.fallbackPaths.length
        ? { fallbackPaths: previewSourceRow.fallbackPaths.map(wireRowPath) }
        : {})
    }) } : {}),
    // Derived types (SPEC §4): operator/service-produced — they enter
    // graphs as outputs, never as constructs.
    ...(declaration.derived === true ? { derived: true } : {}),
    edges: normalizeEdges(declaration.edges || {}, declaration.id),
    ...(Object.keys(states).length ? { stateVocabulary: states } : {}),
    // Declared write-gate delegation (owner decision 2026-10-17): a type
    // may authorize its record writes by another type's grant
    // (`access.inherits`, the listing grammar the instance write
    // transports consume). Validated here so the upgrade path's
    // defineType round-trip cannot strip it.
    ...(declaration.access !== undefined ? { access: normalizeAccess(declaration.access) } : {}),
    // Declared extract projections (SPEC §8 p): the entity→value gates
    // this type owns — output descriptor plus resolve (stored field path
    // or pack handler id). Validated at the authoring boundary like every
    // other facet.
    ...(declaration.projections?.length ? { projections: normalizeProjections(declaration.projections, declaration.id) } : {}),
    ...(declaration.constraints?.length ? { constraints: normalizeConstraints(declaration.constraints, declaration.id, scope) } : {}),
    // Declared migration steps (SPEC §11) ride the declaration through to
    // the R7 gate and the stored record; normalization validates the step
    // language at the authoring boundary.
    ...(declaration.migrate ? { migrate: normalizeMigrateSteps(declaration.migrate) } : {}),
    revisions: declaration.revisions || null,
    ...(declaration.mutability ? { mutability: normalizeMutability(declaration.mutability, declaration.id) } : {}),
    ...(declaration.framework ? { framework: true } : {})
  };
  type.operators = Object.fromEntries(Object.entries(declaration.operators || {}).map(([id, operator]) => [
    id, normalizeOperator({ ...operator, id, declaringType: type.id })
  ]));
  if (declaration.intents) {
    throw new Error(`type ${declaration.id}: intents live on transition operators, never on the type (SPEC §7)`);
  }
  return Object.freeze(type);
}

// Declared extract projections (SPEC §8 p): `{ id, label?, output,
// resolve }` with resolve exactly one of a stored `field` path, a pack
// `handler` id, or a plugin `service` ref (owner decision 2026-10-17:
// service-resolved projections compute on the plugin's endpoint-mode
// executor — the platform reads the instance/payload, the service
// returns the value). Output is a V-grammar descriptor; the declaration
// owns the mapping so graphs never author paths into stored payloads.
function normalizeProjections(projections = [], typeId = '') {
  if (!Array.isArray(projections)) {
    throw new Error(`type ${typeId}: projections must be an array`);
  }
  return Object.freeze(projections.map(projection => {
    const id = String(projection?.id || '').trim();
    if (!id || id.includes('/')) {
      throw new Error(`type ${typeId}: projection id must be a non-empty path-free string`);
    }
    const fieldResolved = typeof projection?.resolve?.field === 'string' && projection.resolve.field.trim();
    const handlerResolved = typeof projection?.resolve?.handler === 'string' && projection.resolve.handler.trim();
    const serviceResolved = typeof projection?.resolve?.service === 'string' && projection.resolve.service.trim();
    const resolvedCount = [fieldResolved, handlerResolved, serviceResolved].filter(Boolean).length;
    if (resolvedCount !== 1) {
      throw new Error(`type ${typeId}: projection ${id} resolves exactly one of field, handler, or service`);
    }
    if (!projection.output || typeof projection.output !== 'object' || !projection.output.base) {
      throw new Error(`type ${typeId}: projection ${id} requires an output descriptor`);
    }
    return Object.freeze({
      id,
      label: projection.label || id,
      output: projection.output,
      ...(projection.group ? { group: String(projection.group) } : {}),
      resolve: fieldResolved
        ? { field: projection.resolve.field.trim() }
        : handlerResolved
          ? { handler: projection.resolve.handler.trim() }
          : { service: projection.resolve.service.trim() }
    });
  }));
}

// A stored declaration that violates its class obligations (SPEC §5) or
// declares children the view cannot resolve is a repair target: free
// redefinition (SPEC §11).
function storedDeclarationIsBroken(existing = {}, view = new Map()) {
  if (checkClassObligations(existing).length) return true;
  for (const declaration of Object.values(existing.edges?.children || {})) {
    for (const childType of declaration.types || []) {
      if (!view.has(childType)) return true;
    }
  }
  return false;
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
      // Free redefinition outside the SPEC §11 gate: zero live instances
      // (synchronous `hasInstances` probe) or a broken stored declaration —
      // law: README registry entry.
      const repair = storedDeclarationIsBroken(existing, resolveView(type.organizationId));
      const diff = repair || (hasInstances && hasInstances(existing) === 0)
        ? { changes: [{ severity: 'minor', kind: repair ? 'repair-redefinition' : 'empty-redefinition' }], breaking: false }
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
      errors.push(...checkDisplayFacet(type));
      errors.push(...checkRefTargets(type, view));
      errors.push(...checkChildrenDeclared(type, view));
      errors.push(...checkRelationDomains(type, view));
      errors.push(...checkUniqueConstraints(type));
      for (const constraint of type.constraints || []) {
        if (constraint.kind === 'unique') continue;
        errors.push(...checkTypedBooleanExpression(constraint.expression, {
          rootType: type,
          types: view,
          path: `type ${type.id}: constraints.${constraint.id}`
        }));
      }
      errors.push(...checkRelationUnlinkPolicy(type));
    }
    errors.push(...checkLineageAcyclic(view));
    return Object.freeze({
      ok: errors.length === 0,
      errors: Object.freeze(errors),
      types: view
    });
  }

  // Display-facet laws (SPEC §4): exactly one authored `identifier`
  // field, at most one `depiction` field, and a name on every type.
  // Both identifier deviations and the name law hold at every write
  // through the introduced-errors gate (reads never refuse — views
  // stay served).
  function checkDisplayFacet(type) {
    const errors = [];
    const flagged = flag => Object.entries(type.fields)
      .filter(([, descriptor]) => descriptor[flag] === true).map(([name]) => name);
    const identifiers = flagged('identifier');
    if (identifiers.length !== 1) {
      errors.push(`type ${type.id}: exactly one field must carry the identifier flag (flagged: ${identifiers.join(', ') || 'none'})`);
    }
    const depictions = flagged('depiction');
    if (depictions.length > 1) {
      errors.push(`type ${type.id}: depiction flag on multiple fields (${depictions.join(', ')}) — at most one`);
    }
    if (!type.name) {
      errors.push(`type ${type.id}: name is required`);
    }
    return errors;
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
        // Party types are auth principals (SPEC §5): membership and
        // assignment live on the party side, so no declared containment
        // may target them.
        else if (view.get(childType)?.class === 'party') {
          errors.push(`type ${type.id}: children.${key} may not target party type ${childType} — parties are never lineage children`);
        }
      }
    }
    return errors;
  }

  // Unlink policy vocabulary (SPEC §6/§22.12): explicit edges validate at
  // edge normalize; ref-field entries validate here — one closed set.
  function checkRelationUnlinkPolicy(type) {
    const errors = [];
    for (const [name, descriptor] of Object.entries(type.fields || {})) {
      if (descriptor?.base !== 'ref' || descriptor.unlink == null) continue;
      if (!UNLINK_POLICIES.includes(descriptor.unlink)) {
        errors.push(`type ${type.id}: fields.${name} unlink must be one of ${UNLINK_POLICIES.join(' | ')}`);
      }
    }
    return errors;
  }

  // Relation target domains (SPEC §6): a relation entry (explicit edge or
  // ref field) may constrain its targets with a boolean expression over
  // the target instance. The expression must row-check against EVERY
  // declared target — a multi-target edge exposes one domain.
  function checkUniqueConstraints(type) {
  const errors = [];
  for (const constraint of type.constraints || []) {
    if (constraint.kind !== 'unique') continue;
    let row = type.fields || {};
    let descriptor = null;
    const segments = constraint.field.split('.');
    for (let index = 0; index < segments.length; index += 1) {
      descriptor = row[segments[index]] || null;
      if (!descriptor) break;
      if (index < segments.length - 1) {
        if (descriptor.base !== 'record') {
          descriptor = null;
          break;
        }
        row = descriptor.fields || {};
      }
    }
    if (!descriptor) {
      errors.push(`type ${type.id}: unique constraint ${constraint.id} references unknown or non-record field path fields.${constraint.field}`);
    } else if (!['string', 'id', 'instant', 'number', 'boolean', 'enum'].includes(descriptor.base)) {
      errors.push(`type ${type.id}: unique constraint ${constraint.id} requires a scalar indexable field, got fields.${constraint.field} (${descriptor.base})`);
    }
  }
  return errors;
}

function checkRelationDomains(type, view) {
    const errors = [];
    const entries = [
      ...Object.entries(type.edges?.relations || {}).map(([key, declaration]) => ({ key, declaration, label: `relations.${key}` })),
      ...Object.entries(type.fields || {})
        .filter(([, descriptor]) => descriptor?.base === 'ref')
        .map(([name, descriptor]) => ({ key: name, declaration: descriptor, label: `fields.${name}` }))
    ];
    for (const { key, declaration, label } of entries) {
      if (!declaration.where) continue;
      for (const target of declaration.accepts || declaration.types || []) {
        const targetType = view.get(target);
        if (!targetType) continue; // unknown targets report at their own check
        errors.push(...checkTypedBooleanExpression(declaration.where, {
          rootType: targetType,
          types: view,
          path: `type ${type.id}: ${label} where (target ${target})`
        }));
      }
    }
    return errors;
  }

  return registry;
}

export function schemaFor(type) {
  return rowToSchema(type.id, type.fields);
}
