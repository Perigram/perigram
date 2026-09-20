import { createError } from 'h3';
import {
  normalizeProcessDefinition,
  migrateProducerOutputIdentities,
  PROCESS_DATAFLOW_VERSION,
  validateProcessDefinition,
  validateRequiredInputAvailability,
  validateLineageBindingResolution
} from '~/packages/processes/src/index.js';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { prepareAuthoredDefinition } from '~/packages/processes/src/index.js';
import { CLASS_COLLECTIONS, createTypeRegistry, declarationsFromCtsRecords, projectDomainFromView } from '~/packages/cts/src/index.js';

// A draft carries its own declarations: `ctsTypes` records author types
// in-tree and only land in the registry at APPLY (SAVE persists the tree
// as authored). Acceptance must therefore validate bindings against the
// draft's declaration overlay on top of the projected domain — otherwise
// every node bound to an in-tree class fails with `unknown type` at save.
// Invalid overlay declarations stay authored (the designer's diagnostics
// own the report); they are skipped, not fatal.
const DRAFT_OVERLAY_ORG = 'draft-overlay';

function declarationOverlayDomain(data = {}, domain = {}) {
  const declarations = declarationsFromCtsRecords(data?.ctsTypes || {});
  if (!declarations.length) return domain;
  const registry = createTypeRegistry({ id: 'cts:draft-overlay' });
  const invalid = [];
  for (const declaration of declarations) {
    try {
      registry.defineType({ ...declaration, scope: 'org', organizationId: DRAFT_OVERLAY_ORG });
    } catch {
      // An unfinished declaration is authored state, not a save error.
      // Its id still stubs into the entity list so bindings to it save
      // (APPLY posts the declarations and reports the real error there);
      // only its rows/workflows stay absent.
      invalid.push(declaration);
    }
  }
  const overlay = projectDomainFromView(registry, DRAFT_OVERLAY_ORG, {});
  const known = new Set((domain.entities || []).map(entity => entity.type));
  const stubs = invalid
    .filter(declaration => !known.has(declaration.id))
    .map(declaration => ({
      type: declaration.id,
      collection: CLASS_COLLECTIONS[declaration.class] || CLASS_COLLECTIONS.file,
      blocks: ['identity', 'origin', 'status', 'lineage', 'relations', 'provenance', 'attachments', 'data'],
      meta: false
    }));
  return {
    ...domain,
    entities: [
      ...(domain.entities || []),
      ...(overlay.entities || []).filter(entity => !known.has(entity.type)),
      ...stubs
    ],
    fieldSchemas: { ...(domain.fieldSchemas || {}), ...(overlay.fieldSchemas || {}) },
    workflows: { ...(domain.workflows || {}), ...(overlay.workflows || {}) },
    construction: { ...(domain.construction || {}), ...(overlay.construction || {}) }
  };
}

// Graph protocol v5 dual acceptance: definitions authored in the CTS
// vocabulary (species kinds, type ids, row paths) lower to the executable
// working shapes here — the single seam every validate/compile/activate
// path flows through. The lowered form is internal; v4 definitions pass
// through untouched. Protocol binding errors (unknown type, undeclared
// state, field outside the row) fail like any other definition error —
// resolved against the projected domain overlaid with the draft's own
// `ctsTypes` declarations.
function acceptGraphProtocol(data = {}, domain = {}) {
  const { definition, errors } = prepareAuthoredDefinition(data, declarationOverlayDomain(data, domain));
  if (errors.length) {
    throw createError({
      statusCode: 400,
      message: errors.join('; '),
      data: { errors }
    });
  }
  return definition;
}

// The overlaid domain is the acceptance vocabulary: lowering AND the
// downstream validation/availability/lineage passes must resolve entity
// types against the draft's own declarations. Validating against the raw
// domain made every producer output bound to an in-tree class fail with
// `unknown entity type` at validate/activate.
function overlaidDomainFor(data = {}, domain = {}) {
  return declarationOverlayDomain(data, domain);
}

function capabilityBindings(domain = {}) {
  const registry = getAppRegistry();
  const capabilities = {};
  for (const entity of domain.entities || []) {
    const record = registry?.getEntityService?.(entity.type)?.processCapabilities;
    if (record) capabilities[entity.type] = record;
  }
  return capabilities;
}

export function validateActivatableProcess(data = {}, domain = {}, roles = {}) {
  const accepted = acceptGraphProtocol(data, domain);
  const overlaid = overlaidDomainFor(data, domain);
  const capabilities = capabilityBindings(overlaid);
  const validation = validateProcessDefinition(accepted, overlaid, {
    roles,
    ...(Object.keys(capabilities).length ? { capabilities } : {})
  });
  const process = validation.definition || normalizeProcessDefinition(data);
  const availability = validateRequiredInputAvailability(process, overlaid);
  const lineageResolution = validateLineageBindingResolution(process, overlaid);
  const errors = [
    ...(validation.errors || []),
    ...availability.map(diagnostic => diagnostic.message),
    ...lineageResolution.map(diagnostic => diagnostic.message)
  ];
  if (!errors.length) return validation;
  return {
    ...validation,
    ok: false,
    errors,
    diagnostics: [
      ...(validation.diagnostics || []),
      ...availability,
      ...lineageResolution
    ]
  };
}

export function assertCurrentProcessDefinition(data = {}) {
  if (Number(data.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({
      statusCode: 409,
      message: `Process dataflow version ${PROCESS_DATAFLOW_VERSION} is required`
    });
  }
}

export function currentProcessDefinition(data = {}, domain = {}) {
  assertCurrentProcessDefinition(data);
  const accepted = acceptGraphProtocol(data, domain);
  const migration = migrateProducerOutputIdentities(accepted, overlaidDomainFor(data, domain));
  if (migration.errors.length) {
    throw createError({
      statusCode: 400,
      message: migration.errors.join('; '),
      data: { errors: migration.errors }
    });
  }
  return migration.data;
}
