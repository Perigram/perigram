import { describe, expect, it } from 'vitest';
import { resolveVisibleScreens } from './process-navigation.js';

describe('process navigation', () => {
  it('keeps assignment-scoped screens visible when the matching scoped grant exists', () => {
    const screens = [{
      id: 'assigned_project',
      required: {
        feature: 'projects',
        level: 'read',
        scope: { entityId: 'project-123' }
      }
    }];
    const permissions = {
      projects: [{ level: 'read', scope: { entityId: 'project-123' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toHaveLength(1);
  });

  it('hides assignment-scoped screens when the scoped grant points elsewhere', () => {
    const screens = [{
      id: 'assigned_project',
      required: {
        feature: 'projects',
        level: 'read',
        scope: { entityId: 'project-123' }
      }
    }];
    const permissions = {
      projects: [{ level: 'read', scope: { entityId: 'project-456' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toEqual([]);
  });

  it('keeps status-conditioned screens visible before an entity context exists', () => {
    const screens = [{
      id: 'new_projects',
      required: {
        feature: 'projects',
        level: 'admin',
        rule: { fact: 'primaryStatus', equals: 'NEW' }
      }
    }];
    const permissions = {
      projects: [{ level: 'admin', rule: { fact: 'primaryStatus', equals: 'NEW' } }]
    };

    expect(resolveVisibleScreens(screens, permissions)).toHaveLength(1);
  });
});
