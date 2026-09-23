// The CNC pack's declaration content (SPEC §21): browser-safe data only —
// file types with editors, the nesting service registration, attachment
// kinds. `server/packs/cnc` binds these declarations to services; the
// framework registry and the client type system consume the data.
//
// This is the whole of what the CNC domain means in the type system:
// cassette (OCCS file edited by the cassette designer), sheet design,
// facade design, and the nesting solver. Everything else that once was
// `domain-cnc` is either framework machinery or legacy app surface pending
// deletion.

export const cncFileTypes = [
  {
    id: 'cassette',
    class: 'file',
    scope: 'system',
    version: 1,
    payload: {
      mime: 'application/perigram+occs',
      accept: ['.occs'],
      maxSize: 10 * 1024 * 1024,
      // The OCCS document renders through the shared drawing canvas
      // (graph-tree geometry), like every declared preview mode.
      preview: 'occs',
      // The designer is the main entry: blank-create opens the cassette
      // designer (the legacy invariant — created templates open with the
      // default OCCS document).
      creation: ['editor']
    },
    fields: {
      name: { base: 'string' }
    },
    revisions: 'geometry',
    render: {
      label: 'Cassette',
      icon: 'pi pi-box',
      groups: [
        { id: 'geometry', fields: [
          { path: 'data.geometry.preview', label: 'common.details', role: 'previewSource', display: 'geometry', priority: 20 }
        ] },
        { id: 'provenance', fields: [
          { path: 'data.geometryRevisionId', label: 'revision.currentGeometry', display: 'entityRef', typeId: 'entityRevision', priority: 30 }
        ] }
      ]
    },
    operators: {
      edit: { id: 'edit', species: 'mutate', input: { base: 'ref', accepts: ['cassette'] } }
    }
  },
  {
    // Derived: sheet designs are produced by nesting runs (and refined
    // in the editor from cassette refs) — the legacy construction
    // exclusion, now declared. No construct modes; editor edits.
    id: 'sheet-design',
    class: 'file',
    scope: 'system',
    version: 1,
    derived: true,
    fields: {
      // Run-produced records carry no authored name at creation; the
      // nullable identifier is the title contract (null renders the
      // unnamed placeholder until a name lands).
      title: { base: 'string', identifier: true, nullable: true, label: 'Title' },
      geometry: { base: 'json' },
      parts: { base: 'list', itemType: { base: 'ref', accepts: ['cassette'] }, nullable: true }
    },
    revisions: 'geometry',
    render: {
      label: 'Sheet design',
      icon: 'pi pi-th-large',
      groups: [
        { id: 'specs', fields: [
          { path: 'specs', label: 'catalog.dimensions', display: 'dimensions', unit: 'mm', priority: 5 },
          { path: 'specs.area', label: 'common.area', display: 'area', unit: 'm2', priority: 8 },
          { path: 'specs.sheetThickness', label: 'catalog.sheetThickness', display: 'dimension', unit: 'mm', priority: 9 },
          { path: 'specs.foilThickness', label: 'catalog.foilThickness', display: 'dimension', unit: 'mm', priority: 9 },
          { path: 'summary.efficiency', label: 'sheetDesign.utilization', display: 'percent', unit: 'percent', priority: 10 },
          { path: 'summary.placedCount', label: 'sheetDesign.parts', display: 'count', priority: 20 },
          { path: 'specs.cuttingLength', label: 'sheetDesign.cuttingLength', display: 'dimension', unit: 'm', priority: 30 },
          { path: 'specs.estimatedTime', label: 'sheetDesign.estimatedTime', display: 'duration', unit: 'min', priority: 40 }
        ] },
        { id: 'geometry', fields: [
          { path: 'data.geometry.preview', label: 'common.details', role: 'previewSource', display: 'geometry', priority: 10 }
        ] }
      ]
    }
  },
  {
    id: 'facade-design',
    class: 'file',
    scope: 'system',
    version: 1,
    payload: {
      mime: 'model/gltf-binary',
      accept: ['.glb', '.gltf'],
      maxSize: 100 * 1024 * 1024
    },
    fields: {
      name: { base: 'string' }
    },
    render: {
      label: 'Facade design',
      icon: 'pi pi-building',
      groups: [
        { id: 'summary', fields: [
          { path: 'data.parts.length', label: 'facade.parts', display: 'count', priority: 10 },
          { path: 'data.partAssignments.length', label: 'facade.assignments', display: 'count', priority: 20 },
          { path: 'relations.sourceModel', label: 'facade.sourceModel', display: 'entityRef', typeId: 'artifact', priority: 30 },
          { path: 'relations.patterns', label: 'facade.patterns', display: 'entityRefList', typeId: 'facadePattern', priority: 40 }
        ] }
      ]
    }
  },
  {
    // The typed visual pattern graph. Persistence stays on the pattern
    // designer's pack-internal feature route (the cassette pattern); this
    // declaration serves the registry and generated-surface layer.
    id: 'facade-pattern',
    class: 'file',
    scope: 'system',
    version: 1,
    fields: {
      name: { base: 'string' },
      graph: { base: 'json', nullable: true }
    },
    render: {
      label: 'Facade pattern',
      icon: 'pi pi-objects-column',
      groups: [
        { id: 'summary', fields: [
          { path: 'data.graph.nodes.length', label: 'facadePattern.nodes', display: 'count', priority: 10 }
        ] }
      ]
    }
  }
];

// Editors bound to file types: which authoring surface opens for a type's
// payload. The surfaces themselves are existing designer components; the
// binding is pack data. This list is the canonical editor contract — it is
// served with the organization type view (server/features/cts-types) and
// drives the app's generated surface registries through
// components/generated/file-surfaces.js.
export const cncEditors = [
  { type: 'cassette', surface: 'cassette-designer', modes: ['create', 'edit'] },
  { type: 'sheet-design', surface: 'sheet-design-editor', modes: ['edit'] },
  { type: 'facade-design', surface: 'facade-designer', modes: ['create', 'edit'] },
  { type: 'facade-pattern', surface: 'facade-pattern-designer', modes: ['edit'] }
];

// Registered services (SPEC §8 s species): the nesting solver is a pure
// V -> V service executed by the task runtime under 'nesting.solve'.
export const cncServices = [
  {
    id: 'nesting.solve',
    species: 'service',
    command: 'solveNestingValue',
    task: 'nesting.solve',
    signature: {
      input: { base: 'record', fields: {
        polygons: { base: 'list', itemType: { base: 'json' } },
        sheet: { base: 'record', fields: {
          width: { base: 'quantity', unit: 'mm' },
          length: { base: 'quantity', unit: 'mm' }
        } }
      } },
      output: { base: 'json' }
    },
    render: { label: 'Nesting solver', icon: 'pi pi-compass' }
  }
];

// Payload upload kinds for the pack's file types.
export const cncAttachmentKinds = {
  OCCS_SOURCE: {
    kind: 'OCCS_SOURCE',
    bucket: 'cassettes',
    mimeType: 'application/perigram+occs',
    preview: { mode: 'download' },
    creation: { mode: 'upload', accept: '.occs,application/perigram+occs' },
    editor: { mode: 'cassette-designer' },
    file: { extensions: ['.occs'], mimeTypes: ['application/perigram+occs'], maxBytes: 10 * 1024 * 1024 }
  }
};

export const cncPackContent = {
  id: 'cnc',
  label: 'CNC fabrication',
  types: cncFileTypes,
  editors: cncEditors,
  services: cncServices,
  attachmentKinds: cncAttachmentKinds
};
