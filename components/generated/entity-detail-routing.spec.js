import { describe, expect, it } from 'vitest';
import { detailRouteForEntity } from './entity-detail-routing.js';

describe('generated entity detail routing', () => {
  it('opens child collection items with their own entity detail screen', () => {
    const route = detailRouteForEntity({
      entity: { _id: 'queue-1' },
      entityType: 'queue',
      screenKey: 'auto_installer_project_detail',
      manifest: [
        {
          screenKey: 'auto_installer_project_detail',
          template: 'entityDetail',
          route: '/screens/auto_installer_project_detail',
          sources: [
            { entityType: 'project', mode: 'single' },
            { entityType: 'queue', mode: 'list' }
          ]
        },
        {
          screenKey: 'auto_installer_queue_detail',
          template: 'entityDetail',
          route: '/screens/auto_installer_queue_detail',
          sources: [{ entityType: 'queue', mode: 'single' }]
        }
      ]
    });

    expect(route).toEqual({
      path: '/screens/auto_installer_queue_detail',
      query: {
        entityId: 'queue-1',
        queueId: 'queue-1'
      }
    });
  });

  it('uses a paired detail screen only when that screen exists for the same entity', () => {
    const route = detailRouteForEntity({
      entity: { _id: 'project-1' },
      entityType: 'project',
      screenKey: 'auto_installer_project',
      manifest: [
        {
          screenKey: 'auto_installer_project_detail',
          template: 'entityDetail',
          route: '/screens/auto_installer_project_detail',
          sources: [{ entityType: 'project', mode: 'single' }]
        }
      ]
    });

    expect(route.path).toBe('/screens/auto_installer_project_detail');
  });

  it('does not create a detail route without an accessible entity screen', () => {
    const route = detailRouteForEntity({
      entity: { _id: 'library-1' },
      entityType: 'library',
      manifest: [
        {
          screenKey: 'auto_installer_cassette',
          template: 'collection',
          route: '/screens/auto_installer_cassette',
          sources: [{ entityType: 'cassette', mode: 'list' }]
        }
      ]
    });

    expect(route).toBeNull();
  });
});
