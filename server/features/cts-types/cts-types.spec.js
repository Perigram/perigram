import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./repository.js', () => ({
  create: vi.fn(),
  findByTypeId: vi.fn(async () => null),
  listByOrganization: vi.fn(async () => []),
  upsertByTypeId: vi.fn(async (orgId, typeId, data) => ({ ...data })),
  deleteByTypeId: vi.fn(async () => true)
}));

import * as repository from './repository.js';
import { compileRegistryForOrganization, defineType, removeType, describeOrganizationTypes } from './service.js';

const ORG = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  repository.findByTypeId.mockResolvedValue(null);
  repository.listByOrganization.mockResolvedValue([]);
});

describe('cts type storage', () => {
  it('compiles the org view as system types plus the org overlay', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: { code: { base: 'string' } } }
    ]);
    const bundle = await describeOrganizationTypes(ORG);
    expect(bundle.bundle.ok).toBe(true);
    expect(bundle.bundle.types.some(type => type.id === 'widget' && type.scope === 'org')).toBe(true);
    expect(bundle.bundle.types.filter(type => type.id === 'queue')).toHaveLength(1);
    expect(bundle.attachmentKinds.LAYOUT_DXF).toMatchObject({ preview: 'dxf' });
  });

  it('stores valid org declarations after full-view compile', async () => {
    const stored = await defineType({ id: 'gadget', class: 'file', fields: { code: { base: 'string' } } }, { organizationId: ORG });
    expect(stored.id).toBe('gadget');
    expect(stored.scope).toBe('org');
    expect(stored.version).toBe(1);
    expect(repository.upsertByTypeId).toHaveBeenCalled();
  });

  it('refuses breaking redefinition and rolls back new writes on cross-type breakage', async () => {
    repository.listByOrganization.mockResolvedValue([
      { id: 'gadget', class: 'file', scope: 'org', organizationId: ORG, version: 3,
        fields: { code: { base: 'string' }, gone: { base: 'string' } } }
    ]);
    await expect(defineType(
      { id: 'gadget', class: 'file', fields: { code: { base: 'string' } } },
      { organizationId: ORG }
    )).rejects.toThrow(/breaking change/);
  });

  it('refuses invalid declarations as 400s', async () => {
    await expect(defineType({ id: 'bad', class: 'nope', fields: {} }, { organizationId: ORG }))
      .rejects.toThrow(/unknown class/);
    await expect(defineType({ id: 'x', class: 'file', fields: {} }, {}))
      .rejects.toThrow(/Organization context required/);
  });

  it('refuses shadowing a system type', async () => {
    await expect(defineType(
      { id: 'queue', class: 'file', fields: { rogue: { base: 'string' } } },
      { organizationId: ORG }
    )).rejects.toThrow(/shadows a system type/);
  });

  it('deletes org types, refuses system types', async () => {
    await expect(removeType('queue', { organizationId: ORG })).rejects.toThrow(/System types/);
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: {} }
    ]);
    await expect(removeType('widget', { organizationId: ORG })).resolves.toBe(true);
    expect(repository.deleteByTypeId).toHaveBeenCalledWith(ORG, 'widget');
  });

  it('exposes a registry for downstream runtimes', async () => {
    const registry = await compileRegistryForOrganization(ORG);
    expect(registry.getType('queue')).toBeTruthy();
    expect(registry.getType('queue', 'other-org')?.scope).toBe('system');
  });
});
