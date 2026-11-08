import { describe, expect, it } from 'vitest';
import {
  containmentAncestors,
  rootContainmentFilter,
  routeContextTraceExclusions,
  siblingContainmentScope,
  traceContextExclusions,
  visibleTraceAncestors
} from './instance-hierarchy.js';

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

  // The instance store normalizes lineage refs to `{ id }` objects; the
  // ancestor walk must unwrap them or every hop beyond the first turns
  // into "[object Object]" and the trace chain dies.
  it('resolves ancestry when lineage refs ride the { id } object shape', () => {
    const entity = {
      _id: 'queue-9',
      lineage: {
        organizationId: { id: 'org-9' },
        projectId: { type: 'project', id: 'project-9' }
      }
    };
    expect(containmentAncestors(entity, 'queue', lineageBindings)).toEqual([
      { type: 'organization', id: 'org-9', lineageKey: 'organizationId' },
      { type: 'project', id: 'project-9', lineageKey: 'projectId' }
    ]);
  });

  it('keeps the declaration canonical type id on ancestor refs', () => {
    const entity = { _id: 'cassette-1', lineage: { designId: 'design-1' } };
    expect(containmentAncestors(entity, 'cassette', [
      { parentType: 'cassette-design', childType: 'cassette', lineageKey: 'designId' }
    ])).toEqual([
      { type: 'cassette-design', id: 'design-1', lineageKey: 'designId' }
    ]);
  });

  it('keeps unrelated entity relations out of ancestry and root filtering', () => {
    const project = {
      lineage: { organizationId: 'org-1' },
      relations: { source: { type: 'drawing', id: 'drawing-1' } }
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

  it('omits the active organization and explicit exclusions from trace ancestry', () => {
    const ancestors = [
      { type: 'organization', id: 'org-1', lineageKey: 'organizationId' },
      { type: 'project', id: 'project-1', lineageKey: 'projectId' },
      { type: 'queue', id: 'queue-1', lineageKey: 'queueId' }
    ];
    const exclusions = traceContextExclusions({
      exclusions: [{ type: 'project', id: 'project-1' }],
      activeOrganizationId: 'org-1'
    });

    expect(visibleTraceAncestors(ancestors, exclusions)).toEqual([
      { type: 'queue', id: 'queue-1', lineageKey: 'queueId' }
    ]);
  });
});
