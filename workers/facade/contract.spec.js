// Facade plugin contract: the fabrication workflow chain at the level the
// listing declares it — discovery through the canonical SDK parser, the
// palette's wireable gate, the graph node's socket surface, execution of
// the pure operations in the shared runtime, the nesting adapter through
// the host capability seam, and the preview data shapes.
import { describe, expect, it } from 'vitest';
import { parseListing } from '@perigram/plugin-sdk/listing';
import { resolveCatalogNodePorts } from '#packages/processes';
import listing from './listing.json';
import { endpointServices, extractGeometry, nestingParts } from './services.js';
import { createRuntime } from './runtime/server.mjs';
import { generateLayeredDxf } from './vendor/dxf-writer.js';

const SQUARE = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

const wireable = service => {
  const input = service.signature?.input;
  return !input || input.base === 'record';
};

describe('Facade listing contract', () => {
  it('validates through the canonical SDK parser the install gate runs', () => {
    expect(() => parseListing(listing, 'workers/facade')).not.toThrow();
  });

  it('declares the six-type fabrication family beside the library types', () => {
    const types = Object.fromEntries(listing.declarations.types.map(type => [type.id, type]));
    for (const id of [
      'cassette-template', 'cassette-design', 'cassette-instance',
      'sheet-design', 'sheet-cut-plan', 'sheet-instance', 'profile', 'hardware'
    ]) {
      expect(types[id], id).toBeTruthy();
    }
    expect(types['cassette-template'].renameFrom).toBe('cassette');
    expect(types.profile.access).toEqual({ inherits: 'cassette-template' });
    expect(types.hardware.access).toEqual({ inherits: 'cassette-template' });
  });

  it('pins a revision scope on every payload-bearing file type', () => {
    const payloadTypes = listing.declarations.types.filter(type => type.class === 'file' && type.payload);
    expect(payloadTypes.map(type => type.id).sort()).toEqual(
      ['cassette-design', 'cassette-template', 'sheet-dxf'].sort()
    );
    for (const type of payloadTypes) {
      expect(['content', 'geometry']).toContain(type.revisions);
    }
  });

  it('binds every construction, projection, and export to a declared service of its own', () => {
    const serviceIds = new Set(listing.declarations.services.map(service => service.id));
    const own = id => serviceIds.has(String(id).replace('plugin.facade.', ''));
    for (const type of listing.declarations.types) {
      for (const projection of type.projections || []) {
        expect(own(projection.resolve?.service), `${type.id}/${projection.id}`).toBe(true);
      }
    }
    for (const [typeId, modes] of Object.entries(listing.declarations.constructions)) {
      expect(listing.declarations.types.some(type => type.id === typeId)).toBe(true);
      for (const serviceId of Object.values(modes)) expect(own(serviceId)).toBe(true);
    }
    for (const binding of listing.declarations.exports) {
      expect(listing.declarations.types.some(type => type.id === binding.typeId)).toBe(true);
      expect(own(binding.service)).toBe(true);
    }
  });

  it('binds editors and previews to its own declared surfaces and file types', () => {
    const fileTypes = new Set(listing.declarations.types.filter(type => type.class === 'file').map(type => type.id));
    const surfaceIds = new Set(listing.declarations.surfaces.map(surface => surface.id));
    for (const editor of listing.declarations.editors) {
      expect(fileTypes.has(editor.type)).toBe(true);
      expect(surfaceIds.has(editor.surface)).toBe(true);
    }
    const previewSurfaces = new Set(listing.declarations.surfaces
      .filter(surface => surface.kind === 'preview').map(surface => surface.id));
    for (const preview of listing.declarations.previews) {
      expect(previewSurfaces.has(preview.surface)).toBe(true);
    }
  });

  it('declares the cross-plugin runtime seam over its required plugins', () => {
    expect(listing.requires).toEqual(['tech-drawing', 'nesting']);
    const cadcraft = listing.declarations.dependencies.find(dependency => dependency.name === 'cadcraft');
    expect(cadcraft.module.startsWith('plugin:tech-drawing/')).toBe(true);
  });
});

describe('Facade graph node surface', () => {
  it('keeps every bare-value service out of the graph socket projection', () => {
    for (const service of listing.declarations.services.filter(item => !wireable(item))) {
      const ports = resolveCatalogNodePorts({ kind: 'cts.service', operator: `plugin.facade.${service.id}` }, {
        domain: { serviceContracts: {} }
      });
      expect(ports.inputs.filter(socket => socket.role !== 'control')).toEqual([]);
    }
  });
});

describe('Facade fabrication workflow chain', () => {
  it('bakes, projects, solves through the host capability, constructs, and exports', async () => {
    const { createDefaultOccsCassetteTemplateDefinition } = await import('./occs/templates.js');
    const facade = createRuntime();

    // render: a template payload bakes into a named, nestable design.
    const template = createDefaultOccsCassetteTemplateDefinition();
    const baked = await facade.execute('bake', {
      refs: {
        template: {
          id: 'template-1',
          name: 'Tray 600',
          payloadBase64: btoa(unescape(encodeURIComponent(JSON.stringify(template))))
        }
      },
      draft: { data: { parameters: { A: '600', B: '450' } } }
    });
    expect(baked.data.name).toBe('Tray 600 · A 600 · B 450');
    expect(baked.data.geometry.nestingPolygons.length).toBeGreaterThan(0);

    // nesting-polygons projection: one design → one generic source item.
    const sourceItem = await nestingParts({
      instanceId: 'design-1',
      fields: { geometry: baked.data.geometry }
    });
    expect(sourceItem).toMatchObject({ sourceId: 'design-1', sourceKey: 'design-1', count: 1 });
    expect(sourceItem.parts.length).toBe(baked.data.geometry.nestingPolygons.length);
    for (const part of sourceItem.parts) {
      expect(Array.isArray(part.coordinates)).toBe(true);
      expect(Array.isArray(part.sourceLayers)).toBe(true);
    }

    // nesting-solve rides the Nesting plugin's runtime over the host
    // nesting.solve capability — the platform owns that transport.
    const { createRuntime: createNestingRuntime } = await import('../nesting/runtime/server.mjs');
    const solvedLayouts = [];
    const nesting = createNestingRuntime();
    const solved = await nesting.execute('nesting-solve', {
      items: [sourceItem],
      sheetWidth: 1220,
      sheetHeight: 2440,
      space: 3
    }, {
      capabilities: {
        call: async (name, input) => {
          expect(name).toBe('nesting.solve');
          expect(input.items).toHaveLength(sourceItem.parts.length);
          // One sheet per physical part is the declared worst-case stock.
          const stock = input.items.reduce((sum, item) => sum + item.count, 0);
          const placements = input.items.flatMap((item, index) => [{
            item_id: item.id, x: 10 + index * 150, y: 20, rotation: 0
          }]);
          solvedLayouts.push(placements);
          return {
            bins: [{ id: 0, shape: { type: 'polygon', data: input.params.sheet_polygon }, stock }],
            solution: { layouts: [{ placed_items: placements, density: 0.5 }] }
          };
        }
      }
    });
    expect(solved.summary.sheetCount).toBe(1);
    const layout = solved.layouts[0];
    expect(layout.sourceItems[0]).toMatchObject({ sourceId: 'design-1', sourceKey: 'design-1' });

    // fromLayout: the solved layout constructs a revision-pinned sheet design.
    const constructed = await facade.execute('construct-sheet', {
      refs: { designs: [{ id: 'design-1', revision: '7' }] },
      draft: { data: { layout } }
    });
    expect(constructed.data.compositionKey).toBe(layout.compositionKey);
    expect(constructed.relations.parts).toEqual([{ type: 'cassette-design', id: 'design-1', revision: '7' }]);
    expect(constructed.data.geometry.preview.layers.length).toBeGreaterThan(0);

    // the export binding's service: stored sheet values → layered DXF payload.
    const exported = await facade.execute('generate-sheet-dxf', { fields: constructed.data });
    expect(exported.payload.mime).toBe('application/dxf');
    const dxf = atob(exported.payload.base64);
    expect(dxf).toContain('SECTION');
  });

  it('imports a mapped DXF upload into baked, nestable geometry', async () => {
    const dxf = generateLayeredDxf({
      polygonParts: [
        { layer: 'OUTER_A', coordinates: SQUARE },
        { layer: 'MARK', coordinates: SQUARE.map(([x, y]) => [x + 10, y + 10]) }
      ]
    });
    const imported = await extractGeometry({
      mode: 'upload',
      payloadBase64: Buffer.from(dxf).toString('base64'),
      payloadMeta: { name: 'tray.dxf' },
      mapping: { OUTER_A: 'cut.outer', MARK: 'code.cassette_mark' }
    });
    expect(imported.data.name).toBe('tray');
    expect(imported.data.geometry.nestingPolygons).toHaveLength(1);
    const projected = await nestingParts({
      instanceId: 'design-2',
      fields: { geometry: imported.data.geometry }
    });
    expect(projected.parts).toHaveLength(1);
    expect(projected.parts[0].sourceLayers.map(layer => layer.layer)).toContain('cut.outer');
  });

  it('refuses sheet construction and export with named offender guidance', async () => {
    const facade = createRuntime();
    const layout = {
      sourceItems: [{ id: 'item-1', design_id: 'design-1' }],
      placed_items: [{ item_id: 'item-1', x: 0, y: 0 }]
    };
    await expect(facade.execute('construct-sheet', {
      refs: { designs: [{ id: 'design-1' }] },
      draft: { data: { layout } }
    })).rejects.toThrow(/revision-pinned cassette-design references/);
    await expect(facade.execute('construct-sheet', {
      refs: { designs: [{ id: 'design-2', revision: '7' }] },
      draft: { data: { layout } }
    })).rejects.toThrow(/which the declared designs do not include/);
    await expect(facade.execute('generate-sheet-dxf', { fields: {} }))
      .rejects.toThrow(/no exportable geometry/);
  });
});

describe('Facade preview data shapes', () => {
  it('renders the cassette preview from the OCCS tree and gates its layer set', async () => {
    const { createDefaultOccsCassetteTemplateDefinition } = await import('./occs/templates.js');
    const { renderCassetteV2TreeToDrawing } = await import('./surfaces/lib/cassetteV2Renderer.js');
    const { cassettePreviewLayerSelection } = await import('./surfaces/lib/drawingPreview.js');
    const definition = createDefaultOccsCassetteTemplateDefinition();
    const drawing = await renderCassetteV2TreeToDrawing(definition.extensions.perigram.graphTree);
    expect(drawing.viewBox).toBeTruthy();
    const standardCodes = drawing.layers.map(layer => layer.standardCode);
    expect(standardCodes).toContain('cut.outer');
    const visible = cassettePreviewLayerSelection(drawing);
    expect(visible).toEqual(['cut.outer']);
  });

  it('resolves a profile sketch through the boolean fold into preview layerData', async () => {
    const { createDefaultOccsProfileSketch } = await import('./occs/profiles.js');
    const { resolveOccsProfileSketchLayerData } = await import('./occs/profiles.js');
    const { normalizeGeometryDrawing } = await import('./surfaces/lib/drawingPreview.js');
    const layerData = await resolveOccsProfileSketchLayerData(createDefaultOccsProfileSketch());
    expect(layerData.map(layer => layer.layer).sort()).toEqual(['cut.inner', 'cut.outer']);
    const drawing = normalizeGeometryDrawing({ data: { layerData } });
    expect(drawing.viewBox).toBeTruthy();
    expect(drawing.layers.flatMap(layer => layer.paths).length).toBeGreaterThan(0);
  });

  it('degrades malformed preview inputs to the quiet empty state', async () => {
    const { resolveOccsProfileSketchLayerData } = await import('./occs/profiles.js');
    const { normalizeGeometryDrawing } = await import('./surfaces/lib/drawingPreview.js');
    // No stored sketch and an unreadable one draw nothing — the
    // default-hanger fallback belongs to the designer alone.
    await expect(resolveOccsProfileSketchLayerData(null)).resolves.toBeNull();
    await expect(resolveOccsProfileSketchLayerData({ shapes: 'not-a-list' })).resolves.toBeNull();
    // An authored sketch whose expressions do not resolve stays blank.
    await expect(resolveOccsProfileSketchLayerData({
      parameters: { W: 'NOPE' },
      shapes: [{ id: 's0', type: 'rect', op: 'add', center: [0, 0], width: 'W', height: 10 }]
    })).resolves.toBeNull();
    expect(normalizeGeometryDrawing({ data: { layerData: 'nope' } })).toBeNull();
  });
});

describe('Facade endpoint inventory', () => {
  it('keeps the endpoint surface at the two synchronous projections', () => {
    expect(Object.keys(endpointServices).sort()).toEqual(['extract-geometry', 'nesting-parts']);
  });
});
