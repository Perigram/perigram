import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from './auth';
import { useInstancesStore } from './instances';
import { usePenTemplatesStore } from './penTemplates';
import { useLayerStandardsStore } from './layerStandards';

// The tech-drawing catalog accessors (SPEC §21 pack + §3 system
// instances): instance-transport reads, tenancy grouping, and
// shadow-by-code override resolution.
function seedType(typeId, typeRecord) {
  const authStore = useAuthStore();
  const bundle = (authStore.user?.process?.bundle?.types || []).filter(t => t.id !== typeId);
  authStore.user = {
    userId: 'u-1',
    organizationId: 'org-1',
    process: { active: true, bundle: { types: [...bundle, typeRecord] } }
  };
}

const penType = { id: 'pen-template', class: 'file', fields: { name: { base: 'string' }, stroke: { base: 'record', fields: {} } } };
const standardType = { id: 'layer-standard', class: 'file', fields: { code: { base: 'string' } } };

describe('pen templates catalog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedType('pen-template', penType);
  });

  it('lists pens from the instance transport with system/org grouping', async () => {
    const instances = useInstancesStore();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([
      { _id: 'pen-sys', name: 'System red', fields: { stroke: { color: '#f00', weight: 0.6, pattern: 'SOLID' } }, lineage: {} },
      { _id: 'pen-org', name: 'Org blue', fields: { stroke: { color: '#00f', weight: 0.35, pattern: 'DASHED' } }, lineage: { organizationId: 'org-1' } }
    ]));
    const store = usePenTemplatesStore();
    await store.fetchPens();

    expect(store.pens).toHaveLength(2);
    expect(store.systemPens.map(pen => pen._id)).toEqual(['pen-sys']);
    expect(store.userPens.map(pen => pen._id)).toEqual(['pen-org']);
    expect(store.pens[0].fields.stroke.color).toBe('#00f');
  });

  it('maps editor form payloads onto the wire row for create', async () => {
    const instances = useInstancesStore();
    const createInstance = vi.spyOn(instances, 'createInstance').mockResolvedValue({ _id: 'new-pen' });
    const store = usePenTemplatesStore();
    await store.createPen({ name: 'New', stroke: { color: '#111', weight: 0.4, pattern: 'DOTTED' } });
    expect(createInstance).toHaveBeenCalledWith('pen-template', {
      name: 'New',
      fields: { stroke: { color: '#111', weight: 0.4, pattern: 'DOTTED' } }
    }, { typeId: 'pen-template' });
  });
});

describe('layer standards catalog', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    seedType('layer-standard', standardType);
  });

  it('shadows system rows by code with org rows and projects the effective pen', async () => {
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([
      { _id: 'std-sys', name: 'Cut outer', fields: { code: 'cut.outer', category: 'CUT' }, relations: { defaultPen: { type: 'pen-template', id: 'pen-sys' } }, lineage: {} },
      { _id: 'std-org', name: 'Cut outer (org)', fields: { code: 'cut.outer', category: 'CUT' }, relations: { defaultPen: { type: 'pen-template', id: 'pen-org' } }, lineage: { organizationId: 'org-1' } },
      { _id: 'std-only-sys', name: 'Fold', fields: { code: 'fold.route', category: 'FOLD' }, lineage: {} }
    ]));
    const store = useLayerStandardsStore();
    await store.fetchStandards();

    expect(store.standards).toHaveLength(2);
    const shadowed = store.getByCode('cut.outer');
    expect(shadowed._id).toBe('std-org');
    expect(shadowed.fields.orgPenId).toBe('pen-org');
    expect(store.getByCode('fold.route')._id).toBe('std-only-sys');
    expect(store.getByCategory('CUT')).toHaveLength(1);
  });

  it('creates an org shadow for overrides instead of mutating the system row', async () => {
    const instances = useInstancesStore();
    vi.stubGlobal('$fetch', vi.fn().mockResolvedValue([
      { _id: 'std-sys', name: 'Cut outer', fields: { code: 'cut.outer', category: 'CUT' }, lineage: {} }
    ]));
    const createInstance = vi.spyOn(instances, 'createInstance').mockResolvedValue({});
    const updateInstance = vi.spyOn(instances, 'updateInstance').mockResolvedValue({});
    const store = useLayerStandardsStore();
    await store.fetchStandards();
    expect(store.standards).toHaveLength(1);

    await store.setOrgPenOverride('std-sys', 'pen-org');
    expect(createInstance).toHaveBeenCalledWith('layer-standard', expect.objectContaining({
      relations: { defaultPen: { type: 'pen-template', id: 'pen-org' } }
    }), { typeId: 'layer-standard' });
    expect(updateInstance).not.toHaveBeenCalled();

    // A second override updates the existing shadow.
    createInstance.mockClear();
    const records = instances.records;
    records['layer-standard'] = {
      ...records['layer-standard'],
      'std-shadow': { dto: { _id: 'std-shadow', name: 'x', fields: { code: 'cut.outer' }, lineage: { organizationId: 'org-1' } } }
    };
    await store.setOrgPenOverride('std-sys', 'pen-other');
    expect(updateInstance).toHaveBeenCalledWith('layer-standard', 'std-shadow', {
      relations: { defaultPen: { type: 'pen-template', id: 'pen-other' } }
    }, { typeId: 'layer-standard' });
    expect(createInstance).not.toHaveBeenCalled();
  });
});
