// Type records + registry (SPEC §4, §13): declarations as data, tenancy
// (system first, org overlay, no shadowing), compile = R1-R6.
import { normalizeRow, checkFields, rowToSchema } from './rows.js';
import { normalizeEdges, checkLineageAcyclic } from './edges.js';
import { checkClassObligations } from './classes.js';
import { normalizeOperator, OPERATOR_SPECIES_BY_LETTER } from './operators.js';
import { requireCompatible, normalizeMigrateSteps } from './diff.js';
import { checkBooleanExpression } from './expressions.js';

// Payload traits (SPEC §4): the payload declaration carries the accepted
// MIME list, byte limit, preview mode, and creation protocols. Canonical
// shape is { mime: string[], accept?, maxSize?, preview?, creation? };
// a bare MIME string and a `byteLimit` key (legacy persisted org docs
// and pack fixtures) normalize at this boundary. This is the whole of
// today's attachment-kind authoring, as data on the type.
const CREATION_PROTOCOLS = Object.freeze(['upload', 'capture', 'editor', 'content']);

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
  return Object.freeze({
    mime: Object.freeze(mime),
    ...(payload.accept?.length ? { accept: Object.freeze([...payload.accept]) } : {}),
    ...(Number.isFinite(maxSize) ? { maxSize } : {}),
    ...(payload.preview ? { preview: String(payload.preview) } : {}),
    creation: Object.freeze(creation)
  });
}

function startCase(value = '') {
  return String(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, character => character.toUpperCase());
}

// Write-gate delegation facet: `{ inherits: <typeId> }`, validated at
// the authoring boundary like every other facet.
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
  // Identifier totality (contract home: SPEC §4, cts README). The
  // minted row is identity vocabulary only — it renders the unnamed
  // placeholder and authors nothing, hence writable/constructible false.
  if (!Object.values(fields).some(descriptor => descriptor?.identifier === true)) {
    const firstString = Object.entries(fields)
      .find(([, descriptor]) => descriptor?.base === 'string');
    if (firstString) {
      fields = { ...fields, [firstString[0]]: { ...firstString[1], identifier: true } };
    } else {
      let minted = ['name', 'title', 'label'].find(candidate => !Object.hasOwn(fields, candidate));
      if (!minted) {
        let index = 1;
        while (Object.hasOwn(fields, `name${index}`)) index += 1;
        minted = `name${index}`;
      }
      fields = { ...fields, [minted]: { base: 'string', nullable: true, identifier: true, writable: false, constructible: false } };
    }
  }
  // Authored preview declaration: the first `render.groups` row flagged
  // `previewSource` (the pack authoring vocabulary for "this data field is
  // the card/detail preview") adopts into the normalized record as
  // `{ path, display }`, so generators can render declared previews even
  // before a payload exists. Adopt-and-delete: the raw groups never ride
  // the compiled record.
  const previewSourceRow = (legacyRender.groups || [])
    .flatMap(group => group.fields || [])
    .find(field => field?.role === 'previewSource' && field?.path);

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
    ...(previewSourceRow ? { previewSource: Object.freeze({
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
    // Declared migration steps (SPEC §11) ride the declaration through to
    // the R7 gate and the stored record; normalization validates the step
    // language at the authoring boundary.
    ...(declaration.migrate ? { migrate: normalizeMigrateSteps(declaration.migrate) } : {}),
    revisions: declaration.revisions || null,
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

// A stored declaration is broken when it could never have compiled as a
// contract on its own: it violates its class obligations (SPEC §5) or
// declares lineage children the view cannot resolve. Only the historical
// persist-before-compile write order could store such declarations; they
// are repair targets, not contracts to diff-protect.
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
      // Breaking diffs are refused only for types with live data: an
      // empty type has nothing to migrate, so the redefinition lands
      // with a plain version bump. The probe returns a synchronous
      // instance count; registries without one refuse as before.
      // Repair is the other free path: a stored declaration that itself
      // violates class obligations or declares unresolvable children
      // never compiled as a contract (only the historical
      // persist-before-compile write order could store one), so moving
      // away from it has nothing to migrate — the diff must not protect
      // an invalid declaration.
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
    }
    errors.push(...checkLineageAcyclic(view));
    return Object.freeze({
      ok: errors.length === 0,
      errors: Object.freeze(errors),
      types: view,
      operatorSpecies: OPERATOR_SPECIES_BY_LETTER
    });
  }

  // Display-facet laws (SPEC §4): exactly one `identifier` field (the
  // field whose value names each record — its null value is the only
  // thing that renders the unnamed placeholder; total by boundary mint,
  // so the zero case is unreachable), at most one `depiction` field,
  // and a name on every type. The name law holds at every write through
  // the introduced-errors gate (reads never refuse — views stay served).
  function checkDisplayFacet(type) {
    const errors = [];
    const flagged = flag => Object.entries(type.fields)
      .filter(([, descriptor]) => descriptor[flag] === true).map(([name]) => name);
    const identifiers = flagged('identifier');
    if (identifiers.length > 1) {
      errors.push(`type ${type.id}: identifier flag on multiple fields (${identifiers.join(', ')}) — exactly one required`);
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

  // Relation target domains (SPEC §6): a relation entry (explicit edge or
  // ref field) may constrain its targets with a boolean expression over
  // the target instance. The expression must row-check against EVERY
  // declared target — a multi-target edge exposes one domain.
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
        const rowNames = new Set(Object.keys(targetType.fields || {}));
        errors.push(...checkBooleanExpression(
          declaration.where, rowNames, `type ${type.id}: ${label} where (target ${target})`));
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
  return errors;
}

export function schemaFor(type) {
  return rowToSchema(type.id, type.fields);
}

export { OPERATOR_SPECIES_BY_LETTER };
