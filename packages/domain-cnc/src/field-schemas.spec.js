import { describe, expect, it } from 'vitest';
import { cncEntities } from './entities.js';
import { cncBlockComposition, cncBlockFieldSchemas, cncEntityFieldSchemas, getBlockFieldSchema, getEntityFieldSchema } from './field-schemas.js';

describe('CNC entity field schemas', () => {
  it('covers every entity with exact selectable field paths', () => {
    for (const entity of cncEntities) {
      expect(cncEntityFieldSchemas[entity.type]?.length, entity.type).toBeGreaterThan(0);
      expect(cncEntityFieldSchemas[entity.type].every(field => !field.path.includes('*'))).toBe(true);
    }
  });

  it('preserves type, shape, domain and unit independently', () => {
    expect(getEntityFieldSchema('cassette', 'identity.name')?.type).toMatchObject({
      base: 'string',
      shape: 'item'
    });
    expect(getEntityFieldSchema('cassette_design', 'lineage.templateId')?.type).toMatchObject({
      base: 'entityRef',
      shape: 'item'
    });
  });

  it('defines structural block fields once, independently from entity policy', () => {
    expect(cncBlockFieldSchemas.identity).toBeTruthy();
    expect(getBlockFieldSchema('data')?.type).toMatchObject({ base: 'json', shape: 'item' });
    expect(getBlockFieldSchema('data.description')).toBeNull();
    expect(getEntityFieldSchema('cassette', 'identity.name')?.type).toMatchObject({ base: 'string', shape: 'item' });
    expect(cncBlockFieldSchemas.lineage.map(field => field.path)).toEqual(['lineage']);
    expect(getBlockFieldSchema('identity.uid')).toMatchObject({
      readable: true,
      writable: false,
      constructible: false,
      type: { base: 'string' }
    });
    expect(cncBlockComposition).toMatchObject({
      lineage: { mode: 'ancestors', valueBase: 'entityRef' },
      relations: { mode: 'relations', valueBase: 'entityRef' },
      attachments: { mode: 'attachments', valueBase: 'attachmentRef' },
      data: { mode: 'entries', valueBase: 'json' }
    });
  });

  it('does not mistake wildcard authorization for a field', () => {
    expect(getEntityFieldSchema('cassette', 'data.definition.*')).toBeNull();
  });

  it('declares lineage slots from containment relationships', () => {
    expect(getEntityFieldSchema('cassette_design', 'lineage.templateId')).toMatchObject({
      type: { base: 'entityRef', typeId: 'cassette' },
      constructible: true,
      writable: false
    });
  });

  it('separates create-time composition from update permission', () => {
    expect(getEntityFieldSchema('cassette', 'identity.name')).toMatchObject({
      constructible: true,
      writable: false
    });
    expect(getEntityFieldSchema('cassette', 'identity.uid')).toMatchObject({
      constructible: false
    });
    expect(getEntityFieldSchema('cassette', 'states.main')).toMatchObject({
      constructible: false
    });
    expect(getEntityFieldSchema('cassette_design', 'identity.name')).toMatchObject({
      constructible: false
    });
  });
});
