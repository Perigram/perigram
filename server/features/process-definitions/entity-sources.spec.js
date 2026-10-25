import { describe, expect, it, vi } from 'vitest';
import {
  processChildEntities,
  processParentEntity,
  processRelatedEntities
} from './entity-sources.js';

const containment = [
  { parentType: 'project', childType: 'facade', lineageKey: 'projectId' },
  { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
  { parentType: 'queue', childType: 'nesting_run', lineageKey: 'queueId' }
];

const relations = [
  { ownerType: 'facade', key: 'sourceModel', targetType: 'artifact', cardinality: 'one' },
  { ownerType: 'facade', key: 'patterns', targetType: 'facade_pattern', cardinality: 'many' }
];

describe('process entity sources', () => {
  it('resolves the parent of a lineage child through the registered read boundary', async () => {
    const resolveEntity = vi.fn().mockResolvedValue({ _id: 'project-1', lineage: { organizationId: 'org-1' } });
    const entity = { _id: 'facade-1', lineage: { projectId: 'project-1' } };

    const parent = await processParentEntity(containment, resolveEntity, entity, 'facade');

    expect(parent).toMatchObject({ _id: 'project-1' });
    expect(resolveEntity).toHaveBeenCalledWith('project', 'project-1');
  });

  it('returns null for a root entity with no declared containment parent', async () => {
    const resolveEntity = vi.fn();

    await expect(processParentEntity(containment, resolveEntity, { _id: 'project-1' }, 'project'))
      .resolves.toBeNull();
    expect(resolveEntity).not.toHaveBeenCalled();
  });

  it('returns null when a lineage child has no stored parent id', async () => {
    const resolveEntity = vi.fn();

    await expect(processParentEntity(containment, resolveEntity, { _id: 'facade-1', lineage: {} }, 'facade'))
      .resolves.toBeNull();
    expect(resolveEntity).not.toHaveBeenCalled();
  });

  it('lists lineage children through the access-filtered query boundary', async () => {
    const queryEntities = vi.fn()
      .mockResolvedValueOnce([{ _id: 'facade-1' }])
      .mockResolvedValueOnce([{ _id: 'queue-1' }, { _id: 'queue-2' }]);

    const children = await processChildEntities(containment, queryEntities, { _id: 'project-1' }, 'project');

    expect(children).toEqual([{ _id: 'facade-1' }, { _id: 'queue-1' }, { _id: 'queue-2' }]);
    expect(queryEntities).toHaveBeenNthCalledWith(1, 'facade', { 'lineage.projectId': 'project-1' });
    expect(queryEntities).toHaveBeenNthCalledWith(2, 'queue', { 'lineage.projectId': 'project-1' });
  });

  it('returns an empty list for an entity type with no declared children', async () => {
    const queryEntities = vi.fn();

    await expect(processChildEntities(containment, queryEntities, { _id: 'facade-1' }, 'facade'))
      .resolves.toEqual([]);
    expect(queryEntities).not.toHaveBeenCalled();
  });

  it('resolves relation targets to typed DTOs through the read boundary', async () => {
    const resolveEntity = vi.fn().mockImplementation((type, ref) => ({ _id: ref.id, type }));
    const entity = {
      _id: 'facade-1',
      relations: {
        patterns: [{ type: 'facade_pattern', id: 'p-1' }, { type: 'facade_pattern', id: 'p-2' }]
      }
    };

    const targets = await processRelatedEntities(relations, resolveEntity, entity, 'patterns', 'facade');

    expect(targets).toEqual([
      { _id: 'p-1', type: 'facade_pattern' },
      { _id: 'p-2', type: 'facade_pattern' }
    ]);
    expect(resolveEntity).toHaveBeenCalledWith('facade_pattern', { type: 'facade_pattern', id: 'p-1' });
    expect(resolveEntity).toHaveBeenCalledWith('facade_pattern', { type: 'facade_pattern', id: 'p-2' });
  });

  it('returns an empty list when an entity has no stored references for the relation', async () => {
    const resolveEntity = vi.fn();

    await expect(processRelatedEntities(relations, resolveEntity, { _id: 'facade-1', relations: {} }, 'patterns', 'facade'))
      .resolves.toEqual([]);
    expect(resolveEntity).not.toHaveBeenCalled();
  });

  it('rejects an undeclared relation instead of silently reading nothing', async () => {
    const resolveEntity = vi.fn();

    await expect(processRelatedEntities(relations, resolveEntity, { _id: 'facade-1' }, 'unknown', 'facade'))
      .rejects.toThrow('facade.unknown is not a declared relation');
    expect(resolveEntity).not.toHaveBeenCalled();
  });

  it('propagates a missing-reference failure from the read boundary', async () => {
    const resolveEntity = vi.fn().mockRejectedValue(new Error('artifact p-404 was not found'));

    await expect(processRelatedEntities(relations, resolveEntity, {
      _id: 'facade-1',
      relations: { sourceModel: { type: 'artifact', id: 'p-404' } }
    }, 'sourceModel', 'facade')).rejects.toThrow('p-404 was not found');
  });

  it('propagates a cross-organization read denial from the read boundary', async () => {
    const resolveEntity = vi.fn().mockRejectedValue(new Error('access denied for artifact p-other'));

    await expect(processParentEntity(containment, resolveEntity, {
      _id: 'facade-1',
      lineage: { projectId: 'project-other' }
    }, 'facade')).rejects.toThrow('access denied for artifact p-other');
  });

  it('propagates a per-entity read denial when resolving a relation target', async () => {
    const resolveEntity = vi.fn().mockRejectedValue(new Error('forbidden'));

    await expect(processRelatedEntities(relations, resolveEntity, {
      _id: 'facade-1',
      relations: { sourceModel: { type: 'artifact', id: 'a-1' } }
    }, 'sourceModel', 'facade')).rejects.toThrow('forbidden');
  });

  it('never reads an unfiltered repository, re-entering only the injected boundaries', async () => {
    const resolveEntity = vi.fn().mockResolvedValue({ _id: 'a-1' });
    const queryEntities = vi.fn().mockResolvedValue([]);

    await processRelatedEntities(relations, resolveEntity, {
      _id: 'facade-1',
      relations: { sourceModel: { type: 'artifact', id: 'a-1' } }
    }, 'sourceModel', 'facade');
    await processChildEntities(containment, queryEntities, { _id: 'project-1' }, 'project');

    expect(resolveEntity).toHaveBeenCalledTimes(1);
    expect(queryEntities).toHaveBeenCalledTimes(2);
    for (const call of queryEntities.mock.calls) {
      expect(call[1]).not.toEqual({});
    }
  });
});
