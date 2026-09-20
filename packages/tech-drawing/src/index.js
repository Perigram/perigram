// The tech-drawing pack's declaration data (SPEC §21): browser-safe,
// no server imports. The mount binding lives in
// server/packs/tech-drawing/index.js; the registry composes this pack
// before every pack that requires it.

const PEN_PATTERNS = Object.freeze(['SOLID', 'DASHED', 'DOTTED']);

const penTemplate = Object.freeze({
  id: 'pen-template',
  class: 'file',
  scope: 'system',
  fields: {
    name: { base: 'string' },
    stroke: {
      base: 'record',
      fields: {
        color: { base: 'string', render: { control: 'ColorPicker' } },
        weight: { base: 'quantity', unit: 'mm' },
        pattern: { base: 'enum', values: PEN_PATTERNS }
      }
    }
  },
  edges: {
    relations: {
      // Catalog inks: the R2-legal home for color-catalog references
      // (arbitrary ink stays the stroke.color hex literal).
      palette: { types: ['color'], onRemove: 'detach' }
    }
  },
  render: { label: 'Pen template', icon: 'pi pi-pencil' }
});

// The drawing palette catalog (SPEC §3 system-instance pattern):
// `code` is the org-shadow key. The legacy material-`color` entity
// (catalog children with textures) is a different domain concern and
// re-declares under the materials domain later, under its own id.
const color = Object.freeze({
  id: 'color',
  class: 'file',
  scope: 'system',
  fields: {
    code: { base: 'string' },
    name: { base: 'string' },
    hex: { base: 'string', render: { control: 'ColorPicker' } }
  },
  render: { label: 'Color', icon: 'pi pi-palette' }
});

// The CAD drawing exchange document — drawing vocabulary, home is here
// (the nesting/cassette pipelines consume it as their drawing input).
const dxfSource = Object.freeze({
  id: 'dxf-source',
  class: 'file',
  scope: 'system',
  payload: {
    mime: ['application/dxf'],
    accept: ['.dxf', 'application/dxf'],
    maxSize: 50 * 1024 * 1024,
    preview: 'dxf'
  },
  fields: { name: { base: 'string' } },
  render: { label: 'DXF source', icon: 'pi pi-objects-column' }
});

// The vector drawing document, kept with the vector-drawing family for
// drawing-canvas coherence.
const svgFile = Object.freeze({
  id: 'svg-file',
  class: 'file',
  scope: 'system',
  payload: {
    mime: ['image/svg+xml'],
    accept: ['.svg', 'image/svg+xml'],
    maxSize: 10 * 1024 * 1024,
    preview: 'svg'
  },
  fields: { name: { base: 'string' } },
  render: { label: 'SVG file', icon: 'pi pi-code' }
});

const layerStandard = Object.freeze({
  id: 'layer-standard',
  class: 'file',
  scope: 'system',
  fields: {
    code: { base: 'string' },
    name: { base: 'string' },
    category: { base: 'string' },
    group: { base: 'string', nullable: true },
    kind: { base: 'string', nullable: true },
    purpose: { base: 'string', nullable: true },
    description: { base: 'string' },
    production: { base: 'boolean' },
    allowedGeometry: { base: 'list', itemType: { base: 'string' } },
    aliases: { base: 'list', itemType: { base: 'string' } },
    parameters: { base: 'list', itemType: { base: 'string' } },
    parameterSchema: { base: 'json' },
    defaultExport: { base: 'json' },
    i18n: { base: 'json' },
    source: { base: 'json' }
  },
  edges: {
    relations: {
      defaultPen: { types: ['pen-template'], cardinality: 'one', onRemove: 'restrict' }
    }
  },
  render: { label: 'Layer standard', icon: 'pi pi-list' }
});

// The freehand annotation scene (draw-over-image document): the JSON
// scene contract owned by utils/sketch.js. Preview mode `sketch` renders
// through DrawingCanvas; `revisions: 'scene'` makes the payload
// replaceable through the instance editor concern (each save records an
// immutable scene revision).
const sketch = Object.freeze({
  id: 'sketch',
  class: 'file',
  scope: 'system',
  payload: {
    mime: ['application/json'],
    accept: ['.json', 'application/json'],
    maxSize: 25 * 1024 * 1024,
    preview: 'sketch',
    creation: ['editor']
  },
  revisions: 'scene',
  fields: {
    name: { base: 'string' }
  },
  render: { label: 'Sketch', icon: 'pi pi-pencil' }
});

export const techDrawingTypes = Object.freeze([penTemplate, layerStandard, color, dxfSource, svgFile, sketch]);

// Editor bindings (SPEC §21): the sketch surface edits existing scenes —
// creation is first-save on a payload-less instance, so no create mode
// until the payload upload creator exists.
export const techDrawingEditors = Object.freeze([
  { type: 'sketch', surface: 'sketch-editor', modes: ['edit'] }
]);

export const techDrawingPack = Object.freeze({
  id: 'tech-drawing',
  label: 'Technical drawing',
  requires: [],
  types: techDrawingTypes,
  editors: techDrawingEditors
});
