import { describe, expect, it } from 'vitest';
import {
  containmentAncestors,
  rootContainmentFilter,
  routeContextTraceExclusions,
  siblingContainmentScope,
  traceContextExclusions,
  visibleTraceAncestors
} from './entity-hierarchy.js';

describe('entity containment hierarchy', () => {
  const lineageBindings = [
    { parentType: 'project', childType: 'queue', lineageKey: 'projectId' },
    { parentType: 'queue', childType: 'nesting_run', lineageKey: 'queueId' },
    { parentType: 'nesting_run', childType: 'sheet_design', lineageKey: 'runId' },
    { parentType: 'sheet_design', childType: 'sheet', lineageKey: 'sheetDesignId' }
  ];

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
    expect(containmentAncestors(entity, 'sheet', lineageBindings)).toEqual([
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
      relations: { source: { type: 'artifact', id: 'artifact-1' } }
    };
    expect(containmentAncestors(project, 'project')).toEqual([
      { type: 'organization', id: 'org-1', lineageKey: 'organizationId' }
    ]);
    expect(rootContainmentFilter('queue', lineageBindings)).toEqual({ 'lineage.projectId': { $exists: false } });
  });

  it('scopes siblings to the same declared parent', () => {
    expect(siblingContainmentScope({ lineage: { queueId: 'queue-1' } }, 'nesting_run', lineageBindings)).toEqual({ queueId: 'queue-1' });
  });

  it('omits only compiled ancestors already represented by the route context', () => {
    const queue = { lineage: { organizationId: 'org-1', projectId: 'project-1' } };
    expect(routeContextTraceExclusions(queue, 'queue', lineageBindings, {
      projectId: 'project-1',
      queueId: 'queue-1'
    })).toEqual([{ type: 'project', id: 'project-1', lineageKey: 'projectId' }]);
    expect(routeContextTraceExclusions(queue, 'queue', lineageBindings, {
      projectId: 'another-project'
    })).toEqual([]);
  });

  it('omits the active organization and displayed entities from trace ancestry', () => {
    const ancestors = [
      { type: 'organization', id: 'org-1', lineageKey: 'organizationId' },
      { type: 'project', id: 'project-1', lineageKey: 'projectId' },
      { type: 'queue', id: 'queue-1', lineageKey: 'queueId' }
    ];
    const exclusions = traceContextExclusions({
      displayedContexts: [{ type: 'project', entity: { _id: 'project-1' } }],
      activeOrganizationId: 'org-1'
    });

    expect(visibleTraceAncestors(ancestors, exclusions)).toEqual([
      { type: 'queue', id: 'queue-1', lineageKey: 'queueId' }
    ]);
  });
});
