import { describe, expect, it } from 'vitest';
import { projectExplorerHierarchy } from './project-explorer-hierarchy.js';

const item = (type, id, lineage = {}) => ({ key: `${type}:${id}`, type, entity: { _id: id, lineage } });

describe('project Explorer hierarchy', () => {
  it('uses compiled Lineage bindings while keeping linked roots separate', () => {
    const project = item('project', 'project-1');
    const queue = item('queue', 'queue-1', { projectId: 'project-1' });
    const run = item('nesting_run', 'run-1', { projectId: 'project-1', queueId: 'queue-1' });
    const library = item('library', 'library-1');
    const cassette = item('cassette', 'cassette-1', { libraryId: 'library-1' });
    const hierarchy = projectExplorerHierarchy({
      projectItem: project,
      items: [project, queue, run, library, cassette],
      linkedItemKeys: [library.key],
      containment: [
        { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
        { parentType: 'queue', childType: 'nesting_run', lineageKey: 'queueId' },
        { parentType: 'library', childType: 'cassette', lineageKey: 'libraryId' }
      ]
    });

    expect(hierarchy.rootItems.map(entry => entry.key)).toEqual([queue.key]);
    expect(hierarchy.linkedRootItems.map(entry => entry.key)).toEqual([library.key]);
    expect(hierarchy.childrenByKey.get(queue.key).map(entry => entry.key)).toEqual([run.key]);
    expect(hierarchy.childrenByKey.get(library.key).map(entry => entry.key)).toEqual([cassette.key]);
    expect(hierarchy.orphanItems).toEqual([]);
  });
});
