import { describe, expect, it } from 'vitest';
import {
  actionFieldPaths,
  isProjectWorkspaceOperation,
  relationKeysForAction,
  relationValues,
  uniqueActionIds
} from './generated-project-workspace.js';

describe('project workspace contracts', () => {
  it('deduplicates action ids while preserving manifest order', () => {
    expect(uniqueActionIds(['screen-edit', 'create-queue'], ['create-queue', 'run']))
      .toEqual(['screen-edit', 'create-queue', 'run']);
  });

  it('recognizes relation mutations from compiled update fields', () => {
    const action = {
      actionKind: 'updateEntity',
      entityType: 'project',
      mutation: { fields: ['identity.name', 'relations.cassetteLibraries'] },
      inputPolicy: {
        fields: [{ path: 'relations.cassetteLibraries', dataPath: 'data.relations.cassetteLibraries' }]
      }
    };

    expect(actionFieldPaths(action)).toEqual([
      'identity.name',
      'relations.cassetteLibraries'
    ]);
    expect(relationKeysForAction(action, 'project')).toEqual(['cassetteLibraries']);
    expect(relationKeysForAction(action, 'queue')).toEqual([]);
  });

  it('keeps lifecycle transitions out of workspace operation rails', () => {
    expect(isProjectWorkspaceOperation({ actionKind: 'runCommand' })).toBe(true);
    expect(isProjectWorkspaceOperation({ actionKind: 'updateEntity', mutation: { fields: ['relations.links'] } })).toBe(true);
    expect(isProjectWorkspaceOperation({ actionKind: 'updateEntity', status: { to: 'DONE' } })).toBe(false);
  });

  it('normalizes canonical relation refs without inventing target data', () => {
    const relation = { key: 'cassetteLibraries', targetType: 'library', cardinality: 'many' };
    const entity = {
      relations: {
        cassetteLibraries: [
          { type: 'library', id: 'library-1', label: 'Library one' },
          { _id: 'library-2', identity: { name: 'Library two' } },
          'library-3'
        ]
      }
    };

    expect(relationValues(entity, relation)).toEqual([
      { type: 'library', id: 'library-1', entity: null },
      { type: 'library', id: 'library-2', entity: entity.relations.cassetteLibraries[1] },
      { type: 'library', id: 'library-3', entity: null }
    ]);
  });
});
