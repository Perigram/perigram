import { describe, expect, it } from 'vitest';
import { containmentAncestors, projectHierarchyRoute, rootContainmentFilter, siblingContainmentScope } from './entity-hierarchy.js';

describe('entity containment hierarchy', () => {
  it('resolves cumulative ancestry from explicit containment declarations', () => {
    const entity = {
      _id: 'sheet-1',
      lineage: {
        organizationId: 'org-1',
        projectId: 'project-1',
        queueId: 'queue-1',
        runId: 'run-1',
        sheetDesignId: 'design-1'
      }
    };
    expect(containmentAncestors(entity, 'sheet')).toEqual([
      { type: 'organization', id: 'org-1', lineageKey: 'organizationId' },
      { type: 'project', id: 'project-1', lineageKey: 'projectId' },
      { type: 'queue', id: 'queue-1', lineageKey: 'queueId' },
      { type: 'nesting_run', id: 'run-1', lineageKey: 'runId' },
      { type: 'sheet_design', id: 'design-1', lineageKey: 'sheetDesignId' }
    ]);
  });

  it('keeps unrelated entity relations out of ancestry and root filtering', () => {
    const project = {
      lineage: { organizationId: 'org-1' },
      relations: { cassetteLibraries: [{ type: 'library', id: 'library-1' }] }
    };
    expect(containmentAncestors(project, 'project')).toEqual([
      { type: 'organization', id: 'org-1', lineageKey: 'organizationId' }
    ]);
    expect(rootContainmentFilter('queue')).toEqual({ 'lineage.projectId': { $exists: false } });
  });

  it('scopes siblings to the same declared parent', () => {
    expect(siblingContainmentScope({ lineage: { queueId: 'queue-1' } }, 'nesting_run')).toEqual({ queueId: 'queue-1' });
  });

  it('builds project-scoped routes from the resolved project identity', () => {
    const project = { identity: { uid: 'facade-a' } };
    expect(projectHierarchyRoute({ type: 'project', id: 'project-id', entity: project }))
      .toBe('/project/facade-a/queues');
    expect(projectHierarchyRoute({ type: 'queue', id: 'queue-id', project }))
      .toBe('/project/facade-a/queue/queue-id');
    expect(projectHierarchyRoute({ type: 'sheet_design', id: 'design-id', project }))
      .toBe('/project/facade-a/sheet-design/design-id');
  });
});
