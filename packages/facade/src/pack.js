// The facade pack's declaration content (SPEC §21): browser-safe data only —
// file types with editors, the nesting service registration, attachment
// kinds. `server/packs/cnc` binds these declarations to services; the
// framework registry and the client type system consume the data.
//
// This is the whole of what the facade domain means in the type system:
// cassette (OCCS file edited by the cassette designer), sheet design,
// facade design, and the nesting solver. Everything else that once was
// the legacy tables is either framework machinery or legacy app surface pending
// deletion.

export const facadeFileTypes = [
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
    // The declared lifecycle (SPEC §7): the type declaration owns initial
    // state — construction no longer carries a lifecycle-entry socket. The
    // legacy domain workflow table is not a process-visible contract.
    states: {
      main: {
        initial: 'ACTIVE',
        states: {
          ACTIVE: {},
          ARCHIVED: { terminal: true }
        }
      }
    },
    transitions: [{ axis: 'main', from: 'ACTIVE', to: 'ARCHIVED', intent: 'archiveCassette' }],
    revisions: 'geometry',
    render: {
      label: 'Cassette',
      icon: 'pi pi-box',
      groups: [
        { id: 'geometry', fields: [
          // Cassette renderable geometry exists in several stored shapes:
          // the baked geometry preview, or the raw layer/polygon parts
          // uploaded templates store. The preview channel walks them in
          // order (the DataBlock fallbackPaths vocabulary), so generated
          // card previews never depend on which construction path baked
          // the record.
          { path: 'data.geometry.preview', fallbackPaths: ['data.layerData', 'data.polygonParts', 'data.definition'], label: 'common.details', role: 'previewSource', display: 'geometry', priority: 20 }
        ] },
        { id: 'provenance', fields: [
          { path: 'data.geometryRevisionId', label: 'revision.currentGeometry', display: 'entityRef', typeId: 'entityRevision', priority: 30 }
        ] }
      ]
    },
    // Compact-snapshot preview contract (SPEC §4): the chat/embed preview
    // keeps the thumbnail-critical geometry and template identity, and
    // compacts `data.geometry` when present.
    snapshot: [
      'data.type', 'data.definition', 'data.materialPool', 'data.parameters',
      'data.description', 'data.revisions', 'data.sheetDesignIds', 'data.results',
      'data.geometry', 'data.layerData', 'data.polygonParts'
    ],
    operators: {
      edit: { id: 'edit', species: 'mutate', input: { base: 'ref', accepts: ['cassette'] } }
    }
  },
  {
    // The production drawing (SPEC §21): one concrete piece with extractable
    // geometry, produced three ways — uploaded DXF (payload protocol),
    // baked from a parametric cassette template at fixed parameter values,
    // or converted from a `dxf-source` instance. Pack type, not org
    // vocabulary — all three constructions are evaluation/extraction
    // semantics org-authored types cannot express. Records live in the §13
    // per-class collections; the pack binds the construction handlers (see
    // server/packs/facade/cassettes/cassette-design-construction.js).
    id: 'cassette-design',
    class: 'file',
    scope: 'system',
    version: 1,
    payload: {
      mime: ['application/dxf'],
      accept: ['.dxf', 'application/dxf'],
      maxSize: 25 * 1024 * 1024,
      preview: 'dxf',
      creation: ['upload']
    },
    revisions: 'geometry',
    fields: {
      name: { base: 'string' },
      template: { base: 'ref', accepts: ['cassette'] },
      source: { base: 'ref', accepts: ['dxf-source'] },
      parameters: { base: 'json' },
      // The baked output, never a construction input: every construction
      // mode computes it (upload/convertDxf extract, bake evaluates).
      geometry: { base: 'json', constructible: false }
    },
    states: {
      main: {
        initial: 'ACTIVE',
        states: {
          ACTIVE: {},
          ARCHIVED: { terminal: true }
        }
      }
    },
    transitions: [{ axis: 'main', from: 'ACTIVE', to: 'ARCHIVED', intent: 'archiveCassetteDesign' }],
    name: 'Cassette design',
    glyph: 'pi pi-clone',
    // Compact snapshots keep provenance, not baked geometry (the payload
    // preview covers uploaded sources; baked geometry is heavy).
    snapshot: ['data.template', 'data.parameters'],
    operators: {
      // Construct operator inputs are record-shaped so the domain
      // projection derives exact mode inputs (`operatorModeInputs` reads
      // `input.fields`): a bake construct wires template + parameters and
      // nothing else.
      bake: {
        id: 'bake',
        species: 'construct',
        input: {
          base: 'record',
          fields: {
            name: { base: 'string', nullable: true },
            template: { base: 'ref', accepts: ['cassette'] },
            parameters: { base: 'json', nullable: true }
          }
        }
      },
      convertDxf: {
        id: 'convertDxf',
        species: 'construct',
        input: {
          base: 'record',
          fields: {
            name: { base: 'string', nullable: true },
            source: { base: 'ref', accepts: ['dxf-source'] }
          }
        }
      }
    },
    // Declared extract projection (SPEC §8 p / §16): a design instance →
    // its baked nesting geometry. The stored path lives in the
    // declaration — the graph never authors paths into stored payloads.
    projections: [{
      id: 'nesting-polygons',
      label: 'Nesting polygons',
      output: { base: 'list', itemType: { base: 'record', fields: { coordinates: { base: 'list', itemType: { base: 'record', fields: { x: { base: 'quantity', unit: 'mm' }, y: { base: 'quantity', unit: 'mm' } } } } } } },
      resolve: { field: 'data.geometry.nestingPolygons' }
    }]
  },
  {
    // The declared material (SPEC §16 `Material`): the sheet stock a
    // nesting run cuts from — standard sheet dimensions plus thickness.
    // Class `file` (value identity, referenced); instances are children of
    // the org-authored order container.
    id: 'sheet-material',
    class: 'file',
    scope: 'system',
    version: 1,
    fields: {
      code: { base: 'string', identifier: true },
      width: { base: 'quantity', unit: 'mm' },
      height: { base: 'quantity', unit: 'mm' },
      thickness: { base: 'quantity', unit: 'mm' }
    },
    name: 'Sheet material',
    glyph: 'pi pi-box'
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
  }
];
// Editors bound to file types: which authoring surface opens for a type's
// payload. The surfaces themselves are existing designer components; the
// binding is pack data. This list is the canonical editor contract — it is
// served with the organization type view (server/features/cts-types) and
// drives the app's generated surface registries through
// components/generated/file-surfaces.js.
export const facadeEditors = [
  { type: 'cassette', surface: 'cassette-designer', modes: ['create', 'edit'] },
  { type: 'sheet-design', surface: 'sheet-design-editor', modes: ['edit'] }
];

// Registered services (SPEC §8 s species) are executable registrations,
// not aspirations. Signatures are the V grammar and pure: inputs carry no
// `ref` fields — a graph reaches stored data through declared projections
// (the documents pack's `rows`, this pack's `nesting-polygons`), never
// through a service dereferencing an instance. Each registration names
// its command; the pack mount binds the handler beside it.
const point = { base: 'record', fields: { x: { base: 'quantity', unit: 'mm' }, y: { base: 'quantity', unit: 'mm' } } };
const ring = { base: 'list', itemType: point };
const polygonPart = { base: 'record', fields: { coordinates: ring } };
const nestingItem = {
  base: 'record',
  fields: {
    cassetteId: { base: 'id', nullable: true },
    polygonParts: { base: 'list', itemType: polygonPart },
    count: { base: 'quantity', unit: 'count' }
  }
};
export const facadeServices = [
  {
    // The nesting solver's V -> V boundary: job items in, layouts and a
    // summary out (the solver's raw layout payload is the one
    // true-external Json escape). The sheet arrives as VALUES — the
    // graph reads width/height/thickness off the material through the
    // field projection; the handler resolves nothing. `space` and
    // `sheetCount` are solver knobs with authored fallbacks (3 mm / 1
    // sheet).
    id: 'nesting.solve',
    species: 'service',
    command: 'solveNestingValue',
    signature: {
      input: { base: 'record', fields: {
        items: { base: 'list', itemType: nestingItem },
        sheetWidth: { base: 'quantity', unit: 'mm' },
        sheetHeight: { base: 'quantity', unit: 'mm' },
        space: { base: 'quantity', unit: 'mm', nullable: true },
        sheetCount: { base: 'quantity', unit: 'count', nullable: true }
      } },
      output: { base: 'json' }
    },
    render: { label: 'Nesting solver', icon: 'pi pi-compass' }
  }
];

// Payload upload kinds for the pack's file types.
export const facadeAttachmentKinds = {
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

export const facadePackContent = {
  id: 'facade',
  label: 'Facade fabrication',
  types: facadeFileTypes,
  editors: facadeEditors,
  services: facadeServices,
  attachmentKinds: facadeAttachmentKinds
};
