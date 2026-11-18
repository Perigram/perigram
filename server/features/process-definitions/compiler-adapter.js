import { createError } from 'h3';
import {
  authoredProcessDataFromGraphDocument,
  normalizeProcessDefinition,
  migrateProducerOutputIdentities,
  PROCESS_DATAFLOW_VERSION,
  validateProcessDefinition,
  validateRequiredInputAvailability,
  validateLineageBindingResolution
} from '#packages/processes';
import { getAppRegistry } from '~/server/runtime/app-registry.js';
import { prepareAuthoredDefinition } from '#packages/processes';
import { CLASS_COLLECTIONS, createTypeRegistry, declarationsFromCtsRecords, orientChildrenEdgesChildFirst, projectDomainFromView } from '#packages/cts';

// A draft carries its own declarations: `ctsTypes` records author types
// in-tree and only land in the registry at APPLY (SAVE persists the tree
// as authored). Acceptance must therefore validate bindings against the
// draft's declaration overlay on top of the projected domain — otherwise
// every node bound to an in-tree class fails with `unknown type` at save.
// Invalid overlay declarations stay authored (the designer's diagnostics
// own the report); they are skipped, not fatal.
const DRAFT_OVERLAY_ORG = 'draft-overlay';

export function declarationOverlayDomain(data = {}, domain = {}, { report = null } = {}) {
  data = authoredProcessData(data);
  // Transition-node-declared target statuses ride the process records:
  // the overlay must know them or a draft binding check would refuse the
  // very target the transition node authors.
  const healed = orientChildrenEdgesChildFirst(data);
  const declarations = declarationsFromCtsRecords(
    healed?.ctsTypes || {},
    healed?.processNodes || {},
    healed?.graph || {}
  );
  if (!declarations.length) return domain;
  // The overlay projects the draft's declarations TOGETHER with the
  // system view: cross-type derivations (a draft parent's children edges
  // materializing lineage inputs on system types, ref fields declaring
  // relations) need both sides in one registry, and the merged contract
  // must carry them — a system type's construction changes when a draft
  // parent adopts it.
  const registry = createTypeRegistry({ id: 'cts:draft-overlay' });
  const invalid = [];
  const declared = new Set();
  for (const declaration of declarations) {
    declared.add(declaration.id);
    try {
      registry.defineType({ ...declaration, scope: 'org', organizationId: DRAFT_OVERLAY_ORG });
      report?.push({ typeId: declaration.id, fields: Object.keys(declaration.fields || {}).length });
    } catch (error) {
      // An unfinished declaration is authored state, not a save error.
      // Its id still stubs into the entity list so bindings to it save
      // (APPLY posts the declarations and reports the real error there);
      // only its rows/workflows stay absent — but the skip is never
      // silent: the report carries the reason so port-resolution
      // failures can name their cause instead of a bare `Unknown port`.
      invalid.push(declaration);
      report?.push({ typeId: declaration.id, skipped: error?.message || String(error) });
    }
  }
  if (report) {
    const fieldRecords = Object.values(healed?.ctsTypes || {}).filter(record => record?.kind === 'field' && record?.name);
    const matchedFields = declarations.reduce((sum, declaration) => sum + Object.keys(declaration.fields || {}).length, 0);
    if (fieldRecords.length > matchedFields) {
      report.push({ note: `${fieldRecords.length - matchedFields} field record(s) matched no class typeId — their names never became declaration fields` });
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
  const overlayOwn = entries => (entries || []).filter(entry => declared.has(entry.ownerType ?? entry.type));
  return {
    ...domain,
    entities: [
      ...(domain.entities || []),
      ...(overlay.entities || []).filter(entity => !known.has(entity.type)),
      ...stubs
    ],
    fieldSchemas: { ...(domain.fieldSchemas || {}), ...(overlay.fieldSchemas || {}) },
    workflows: { ...(domain.workflows || {}), ...(overlay.workflows || {}) },
    construction: { ...(domain.construction || {}), ...(overlay.construction || {}) },
    relations: [
      ...(domain.relations || []),
      ...overlayOwn(overlay.relations).filter(relation => !(domain.relations || [])
        .some(existing => existing.ownerType === relation.ownerType && existing.key === relation.key && existing.targetType === relation.targetType))
    ],
    containment: [
      ...(domain.containment || []),
      ...overlayOwn(overlay.containment).filter(edge => !(domain.containment || [])
        .some(existing => existing.parentType === edge.parentType && existing.childType === edge.childType && existing.lineageKey === edge.lineageKey))
    ]
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

// Save-time acceptance is binding-tolerant: an in-progress draft stays
// savable while its bindings are still authored — unknown types, undeclared
// states, and fields outside the row belong to validate/apply, which keep
// the strict seam above. Only the protocol-version gate (asserted by the
// caller) and the structural producer-identity rewrite stay fatal at save.
export function tryAcceptGraphProtocol(data = {}, domain = {}) {
  try {
    return { definition: acceptGraphProtocol(data, domain), errors: [] };
  } catch (error) {
    const errors = Array.isArray(error?.data?.errors) && error.data.errors.length
      ? error.data.errors
      : [error?.message || String(error)];
    return { definition: data, errors };
  }
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
    const record = registry?.getInstanceService?.(entity.type)?.processCapabilities;
    if (!record) continue;
    // The projected construction contract governs executable modes for
    // org-authored types: their declarations live in the async type
    // store, so the service's static capability mirror only knows the
    // payload-less literal (genericCreate). Union keeps any
    // handler-filtered pack modes intact.
    const contractModes = domain.construction?.[entity.type]?.modes || [];
    capabilities[entity.type] = contractModes.length
      ? {
          ...record,
          createModes: [...new Set([...(record.createModes || []), ...contractModes])],
          create: true
        }
      : record;
  }
  return capabilities;
}

export function validateActivatableProcess(data = {}, domain = {}, roles = {}) {
  data = authoredProcessData(data);
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
  data = authoredProcessData(data);
  if (Number(data.dataflowVersion) !== PROCESS_DATAFLOW_VERSION) {
    throw createError({
      statusCode: 409,
      message: `Process dataflow version ${PROCESS_DATAFLOW_VERSION} is required`
    });
  }
}

export function currentProcessDefinition(data = {}, domain = {}) {
  data = authoredProcessData(data);
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

export function authoredProcessData(data = {}) {
  return data?.format === 'perigram.graph'
    ? (authoredProcessDataFromGraphDocument(data) || data)
    : data;
}

// Additive activation (feature README "Activation"): merge the active
// set's authored data into ONE working definition — as if all active
// graphs were authored on a single canvas. Arrays concatenate with id
// dedupe, keyed records union (later entries win), per-role grants
// union. Activation-order is the caller's: sorted by activation
// timestamp, the activating definition last. `compiled` and
// `migrations` never merge (activation-time, definition-local).
const MERGE_KEYED = [
  'processNodes', 'producerOutputs', 'screens', 'services', 'sockets',
  'stateDefinitions', 'valueInputs', 'ctsTypes', 'servicePrincipals'
];

export function mergeActiveDefinitions(datas = []) {
  const list = datas.filter(Boolean).map(authoredProcessData);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const merged = { ...list[0] };
  for (const data of list.slice(1)) {
    for (const key of MERGE_KEYED) {
      if (!data[key]) continue;
      merged[key] = { ...(merged[key] || {}), ...data[key] };
    }
    const grants = data.roleGrants || {};
    const target = merged.roleGrants = { ...(merged.roleGrants || {}) };
    for (const [roleId, grantList] of Object.entries(grants)) {
      const incoming = Array.isArray(grantList) ? grantList : [grantList];
      const held = new Set(Array.isArray(target[roleId]) ? target[roleId] : []);
      target[roleId] = [...held, ...incoming.filter(grant => !held.has(grant))];
    }
    for (const side of ['nodes', 'edges']) {
      const graph = data.graph?.[side] || [];
      if (!graph.length) continue;
      const seen = new Set((merged.graph?.[side] || []).map(item => String(item.id)));
      merged.graph = {
        ...(merged.graph || {}),
        [side]: [...(merged.graph?.[side] || []), ...graph.filter(item => !seen.has(String(item.id)))]
      };
    }
  }
  delete merged.compiled;
  delete merged.migrations;
  return merged;
}
