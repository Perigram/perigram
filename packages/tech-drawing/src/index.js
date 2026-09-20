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
  render: { label: 'Pen template', icon: 'pi pi-pencil' }
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
// through DrawingCanvas; the editor binding is deferred until instance
// payload revisioning exists (payloads are immutable after construct).
const sketch = Object.freeze({
  id: 'sketch',
  class: 'file',
  scope: 'system',
  payload: {
    mime: ['application/json'],
    accept: ['.json', 'application/json'],
    maxSize: 25 * 1024 * 1024,
    preview: 'sketch'
  },
  fields: {
    name: { base: 'string' }
  },
  render: { label: 'Sketch', icon: 'pi pi-pencil' }
});

export const techDrawingTypes = Object.freeze([penTemplate, layerStandard, sketch]);

export const techDrawingPack = Object.freeze({
  id: 'tech-drawing',
  label: 'Technical drawing',
  requires: [],
  types: techDrawingTypes
});
