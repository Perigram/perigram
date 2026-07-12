import { describe, expect, it } from 'vitest';
import { canDeleteGeneratedEntity, featureKey, uiEntityType } from './delete-visibility.js';

const domainUi = {
  endpointMap: {
    queue: { list: '/api/queue' },
    cassetteDesign: { list: '/api/cassette-designs' }
  }
};

describe('generated delete visibility', () => {
  it('normalizes endpoint collections into access feature keys', () => {
    expect(featureKey(domainUi, 'queue')).toBe('queues');
    expect(featureKey(domainUi, 'cassette_design')).toBe('cassette_designs');
    expect(uiEntityType(domainUi, 'cassette_design')).toBe('cassetteDesign');
  });

  it('requires admin delete access for the exact generated entity', () => {
    const entity = { _id: 'queue-1', lineage: { organizationId: 'org-1' } };
    const authStore = {
      activePermissions: {
        queues: [{ level: 'admin', scope: { entityType: 'queue', entityId: 'queue-1' } }]
      }
    };

    expect(canDeleteGeneratedEntity({ authStore, domainUi, entity, entityType: 'queue' })).toBe(true);
    expect(canDeleteGeneratedEntity({
      authStore: { activePermissions: { queues: [{ level: 'write', scope: { entityType: 'queue', entityId: 'queue-1' } }] } },
      domainUi,
      entity,
      entityType: 'queue'
    })).toBe(false);
    expect(canDeleteGeneratedEntity({
      authStore,
      domainUi,
      entity: { _id: 'queue-2', lineage: { organizationId: 'org-1' } },
      entityType: 'queue'
    })).toBe(false);
  });

  it('requires the domain entity to support delete operations', () => {
    const entity = { _id: 'material-1', lineage: { organizationId: 'org-1' } };
    const authStore = {
      activePermissions: {
        materials: [{ level: 'admin', scope: { entityType: 'material', entityId: 'material-1' } }]
      }
    };

    expect(canDeleteGeneratedEntity({
      authStore,
      domainUi: { endpointMap: { material: { list: '/api/materials' } } },
      entity,
      entityType: 'material'
    })).toBe(false);
  });
});
