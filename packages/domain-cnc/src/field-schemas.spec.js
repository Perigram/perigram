import { describe, expect, it } from 'vitest';
import { cncEntities } from './entities.js';
import { cncEntityFieldSchemas, getEntityFieldSchema } from './field-schemas.js';

describe('CNC entity field schemas', () => {
  it('covers every entity with exact selectable field paths', () => {
    for (const entity of cncEntities) {
      expect(cncEntityFieldSchemas[entity.type]?.length, entity.type).toBeGreaterThan(0);
      expect(cncEntityFieldSchemas[entity.type].every(field => !field.path.includes('*'))).toBe(true);
    }
  });

  it('preserves type, shape, domain and unit independently', () => {
    expect(getEntityFieldSchema('project', 'summary.queuePreview')?.type).toMatchObject({
      base: 'entityRef',
      shape: 'list',
      entityType: 'queue'
    });
    expect(getEntityFieldSchema('project', 'summary.totalArea')?.type).toMatchObject({
      base: 'number',
      shape: 'item',
      unit: 'm2'
    });
  });

  it('does not mistake wildcard authorization for a field', () => {
    expect(getEntityFieldSchema('queue', 'data.job.*')).toBeNull();
  });

  it('separates create-time composition from update permission', () => {
    expect(getEntityFieldSchema('queue', 'identity.name')).toMatchObject({
      constructible: true,
      writable: false
    });
    expect(getEntityFieldSchema('queue', 'identity.uid')).toMatchObject({
      constructible: false
    });
    expect(getEntityFieldSchema('queue', 'status.metadata')).toMatchObject({
      constructible: false
    });
  });
});
