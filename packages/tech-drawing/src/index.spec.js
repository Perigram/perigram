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
});
