import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { canDeleteGeneratedEntity, featureKey } from './delete-visibility.js';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';

// The client state model contract: feature keys mirror the endpoint
// resolver (feature route collection, else the shared cts-types access
// feature of the generic instance service), and delete capability comes
// from the registry view plus the endpoint resolver.
function seedBundle(types = []) {
  const authStore = useAuthStore();
  authStore.user = { userId: 'user-1', process: { active: true, bundle: { types } } };
}

const queueType = { id: 'queue', class: 'process', fields: {}, render: { icon: 'pi pi-list' } };

describe('generated delete visibility', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedBundle([queueType]);
  });

  it('normalizes access feature keys from the endpoint resolver', () => {
    expect(featureKey('queue')).toBe('cts-types');
    expect(featureKey('cassette_design')).toBe('cassette_designs');
    expect(useInstancesStore().canonicalTypeKey('cassetteDesign')).toBe('cassette_design');
    expect(useInstancesStore().canonicalTypeKey('cut-plan')).toBe('cut_plan');
  });

  it('requires admin delete access for the exact generated entity', () => {
    const entity = { _id: 'queue-1', lineage: { organizationId: 'org-1' } };
    const authStore = {
      activePermissions: {
        'cts-types': [{ level: 'admin', scope: { typeId: 'queue', entityId: 'queue-1' } }]
      }
    };

    expect(canDeleteGeneratedEntity({ authStore, entity, typeId: 'queue' })).toBe(true);
    expect(canDeleteGeneratedEntity({
      authStore: { activePermissions: { 'cts-types': [{ level: 'write', scope: { typeId: 'queue', entityId: 'queue-1' } }] } },
      entity,
      typeId: 'queue'
    })).toBe(false);
    expect(canDeleteGeneratedEntity({
      authStore,
      entity: { _id: 'queue-2', lineage: { organizationId: 'org-1' } },
      typeId: 'queue'
    })).toBe(false);
  });

  it('requires a registry-known type or a mounted feature route to delete', () => {
    const authStore = {
      activePermissions: {
        'cts-types': [{ level: 'admin', scope: { typeId: 'queue', entityId: 'queue-1' } }]
      }
    };
    const instances = useInstancesStore();

    // Registry-known type resolves through the generic instance service.
    expect(canDeleteGeneratedEntity({ authStore, entity: { _id: 'queue-1' }, typeId: 'queue' })).toBe(true);

    // Feature-routed legacy type keeps its delete surface.
    expect(featureKey('artifact')).toBe('artifacts');

    // Unknown type on the instance transport has no executable service.
    expect(instances.endpointsFor('mystery_thing').list()).toBe('/api/instances/mystery-thing');
    expect(canDeleteGeneratedEntity({ authStore, entity: { _id: 'm-1' }, typeId: 'mystery_thing' })).toBe(false);
  });
});
