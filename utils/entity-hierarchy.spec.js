import { describe, expect, it } from 'vitest';
import { containmentBreadcrumbChain } from './entity-hierarchy.js';

describe('entity hierarchy breadcrumbs', () => {
  it('follows declared containment and preserves the parent revision', () => {
    const chain = containmentBreadcrumbChain('sheet_instance', {
      organization: { entityType: 'organization', entityId: 'org-1' },
      project: { entityType: 'project', entityId: 'project-1' },
      queue: { entityType: 'queue', entityId: 'queue-1', revisionId: 'revision-1' },
      sheetDesign: { entityType: 'sheet_design', entityId: 'sheet-design-1' }
    });

    expect(chain).toEqual([
      { entityType: 'organization', entityId: 'org-1' },
      { entityType: 'project', entityId: 'project-1' },
      { entityType: 'queue', entityId: 'queue-1', revisionId: 'revision-1' },
      { entityType: 'sheet_design', entityId: 'sheet-design-1' }
    ]);
  });

  it('uses the deepest declared direct parent when an entity inherits several ancestors', () => {
    const chain = containmentBreadcrumbChain('cassette_instance', {
      organization: { entityType: 'organization', entityId: 'org-1' },
      queue: { entityType: 'queue', entityId: 'queue-1' },
      sheet: { entityType: 'sheet', entityId: 'sheet-1' }
    });

    expect(chain.at(-1)).toEqual({ entityType: 'sheet', entityId: 'sheet-1' });
  });
});
