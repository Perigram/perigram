import { describe, expect, it } from 'vitest';
import { createTypeRegistry, checkValue } from '~/packages/cts/src/index.js';
import { cncPackContent } from '~/packages/domain-cnc/src/index.js';
import { techDrawingPack, techDrawingTypes } from './index.js';

// The tech-drawing pack contract (SPEC §21): declarations compile against
// the real registry (R1–R6), the relation targets resolve, pack values
// typecheck, and the CNC pack's requirement composition holds.
describe('tech-drawing pack declarations', () => {
  it('compiles the pack types through the real CTS registry', () => {
    const registry = createTypeRegistry({ id: 'spec-tech-drawing' });
    for (const declaration of techDrawingTypes) registry.defineType(declaration);
    const compiled = registry.compile(null);
    expect(compiled.errors).toEqual([]);
    expect(compiled.ok).toBe(true);
  });

  it('declares the default-pen relation with restrict integrity', () => {
    const registry = createTypeRegistry({ id: 'spec-tech-drawing' });
    for (const declaration of techDrawingTypes) registry.defineType(declaration);
    const standard = registry.getType('layer-standard');
    expect(standard.edges.relations.defaultPen).toMatchObject({
      types: ['pen-template'],
      cardinality: 'one',
      onRemove: 'restrict'
    });
  });

  it('declares the color catalog and the pen palette relation', () => {
    const registry = createTypeRegistry({ id: 'spec-tech-drawing-color' });
    for (const declaration of techDrawingTypes) registry.defineType(declaration);
    const pen = registry.getType('pen-template');
    expect(pen.edges.relations.palette).toMatchObject({
      types: ['color'],
      onRemove: 'detach'
    });
    const color = registry.getType('color');
    expect(color).toMatchObject({ class: 'file', scope: 'system' });
    expect(Object.keys(color.fields)).toEqual(['code', 'name', 'hex']);
  });

  it('homes the drawing exchange formats with preview modes', () => {
    const registry = createTypeRegistry({ id: 'spec-tech-drawing-formats' });
    for (const declaration of techDrawingTypes) registry.defineType(declaration);
    expect(registry.getType('dxf-source').payload).toMatchObject({
      mime: ['application/dxf'],
      maxSize: 50 * 1024 * 1024,
      preview: 'dxf'
    });
    expect(registry.getType('svg-file').payload).toMatchObject({
      mime: ['image/svg+xml'],
      preview: 'svg'
    });
    const ids = techDrawingTypes.map(type => type.id);
    expect(ids).toEqual(expect.arrayContaining(['pen-template', 'layer-standard', 'color', 'dxf-source', 'svg-file', 'sketch']));
  });

  it('typechecks pen stroke values against the declared row', () => {
    expect(checkValue({
      base: 'record',
      fields: techDrawingTypes[0].fields.stroke.fields
    }, { color: '#DC2626', weight: { value: 0.6, unit: 'mm' }, pattern: 'SOLID' })).toEqual([]);
  });

  it('composes with the CNC pack without id collisions', () => {
    const registry = createTypeRegistry({ id: 'spec-composed' });
    const ids = new Set();
    for (const declaration of [...techDrawingTypes, ...cncPackContent.types]) {
      expect(ids.has(declaration.id), `duplicate system type id ${declaration.id}`).toBe(false);
      ids.add(declaration.id);
      registry.defineType(declaration);
    }
    expect(registry.compile(null).ok).toBe(true);
  });

  it('carries the pack metadata the composition consumes', () => {
    expect(techDrawingPack.id).toBe('tech-drawing');
    expect(techDrawingPack.requires).toEqual([]);
    expect(techDrawingPack.types).toBe(techDrawingTypes);
  });

  it('declares the sketch scene file type with a sketch preview payload', () => {
    const registry = createTypeRegistry({ id: 'spec-tech-drawing-sketch' });
    for (const declaration of techDrawingTypes) registry.defineType(declaration);
    const sketch = registry.getType('sketch');
    expect(sketch).toMatchObject({
      class: 'file',
      scope: 'system',
      payload: {
        mime: ['application/json'],
        preview: 'sketch'
      },
      revisions: 'scene'
    });
  });

  it('binds the sketch editor surface for scene editing', () => {
    expect(techDrawingPack.editors).toEqual([
      { type: 'sketch', surface: 'sketch-editor', modes: ['edit'] }
    ]);
  });
});
