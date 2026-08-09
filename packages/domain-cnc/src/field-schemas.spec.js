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
    expect(getEntityFieldSchema('project', 'summary.queuePreview')?.type).toMatchObject({
      base: 'array',
      shape: 'item',
      itemType: { base: 'entityRef', entityType: 'queue', shape: 'item' }
    });
    expect(getEntityFieldSchema('project', 'summary.totalArea')?.type).toMatchObject({
      base: 'number',
      shape: 'item',
      unit: 'm2'
    });
  });

  it('defines structural block fields once, independently from entity policy', () => {
    expect(cncBlockFieldSchemas.identity).toBeTruthy();
    expect(getBlockFieldSchema('data')?.type).toMatchObject({ base: 'json', shape: 'item' });
    expect(getBlockFieldSchema('data.description')).toBeNull();
    expect(getEntityFieldSchema('library', 'data.description')?.type).toMatchObject({ base: 'string', shape: 'item' });
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
    expect(getEntityFieldSchema('queue', 'data.job.*')).toBeNull();
  });

  it('declares cumulative lineage slots from containment relationships', () => {
    expect(getEntityFieldSchema('nesting_run', 'lineage.queueId')).toMatchObject({
      type: { base: 'entityRef', entityType: 'queue' },
      constructible: true,
      writable: false
    });
    expect(getEntityFieldSchema('nesting_run', 'lineage.projectId')?.type).toMatchObject({
      base: 'entityRef',
      entityType: 'project'
    });
    expect(getEntityFieldSchema('artifact', 'lineage.nestingRunId')).toBeNull();
    expect(cncEntityFieldSchemas.artifact.filter(field => field.block === 'lineage')).toEqual([
      expect.objectContaining({ path: 'lineage.organizationId', constructible: false })
    ]);
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
    expect(getEntityFieldSchema('cassette_design', 'identity.name')).toMatchObject({
      constructible: false
    });
  });
});
