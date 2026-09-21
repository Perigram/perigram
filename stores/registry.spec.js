import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';
import { useRegistryStore } from './registry';

// The registry store contract: the auth bundle as state, derived
// containment, and the compiler-domain projection (server parity for
// client access previews).
const bundleTypes = [
  { id: 'queue', class: 'process', fields: {}, render: { icon: 'pi pi-list' }, operators: { genericCreate: { species: 'construct' } } },
  { id: 'project', class: 'group', fields: {}, edges: { children: { members: { types: ['queue'], onRemove: 'restrict' } } } }
];

describe('registry store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().user = { userId: 'u-1', organizationId: 'org-1', process: { active: true, bundle: { types: bundleTypes } } };
  });

  it('derives containment triples from declared children edges', () => {
    const registry = useRegistryStore();
    expect(registry.containment).toEqual([
      { childType: 'queue', parentType: 'project', lineageKey: 'members' }
    ]);
  });

  it('keys containment by the edge\'s declared lineageKey, not its map key', () => {
    // Registry-normalized bundles stamp lineageKey (SPEC §6); the map key
    // is authoring identity. Explorer nesting reads the declared key —
    // the same value instances store under lineage.<lineageKey>.
    useAuthStore().user = {
      userId: 'u-1', organizationId: 'org-1',
      process: { active: true, bundle: { types: [
        { id: 'queue', class: 'process', fields: {} },
        { id: 'project', class: 'group', fields: {}, edges: { children: { members: { types: ['queue'], onRemove: 'restrict', lineageKey: 'projectId' } } } }
      ] } }
    };
    const registry = useRegistryStore();
    expect(registry.containment).toEqual([
      { childType: 'queue', parentType: 'project', lineageKey: 'projectId' }
    ]);
  });

  it('projects the compiler domain exactly like the server seam', () => {
    const registry = useRegistryStore();
    const domain = registry.projectedDomain;
    expect(domain.entities.map(entity => entity.type).sort()).toEqual(['project', 'queue']);
    expect(domain.entities.find(entity => entity.type === 'queue').collection).toBe('processes');
    expect(domain.fieldAccess.queue.feature).toBe('cts-types');
    // The projection compiles edge keys to storage lineage keys (camel + Id).
    expect(domain.containment).toEqual([
      expect.objectContaining({ childType: 'queue', parentType: 'project' })
    ]);
  });

  it('skips malformed declarations instead of throwing', () => {
    const authStore = useAuthStore();
    authStore.user = { userId: 'u-1', organizationId: 'org-1', process: { active: true, bundle: { types: [...bundleTypes, { id: 'Broken', class: 'nope' }] } } };
    const registry = useRegistryStore();
    expect(registry.projectedDomain.entities.map(entity => entity.type)).not.toContain('Broken');
  });
});
