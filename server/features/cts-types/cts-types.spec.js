import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../instances/indexes.js', () => ({ ensureInstanceIndexes: vi.fn(async () => []) }));
vi.mock('../instances/count.js', () => ({ countInstancesOfType: vi.fn(async () => 5) }));
vi.mock('../instances/migrations.js', () => ({
  applyTypeMigrationSteps: vi.fn(async () => ({ appliedAt: '2026-09-22T00:00:00.000Z', actor: 'SYSTEM', counts: {}, failures: [] }))
}));

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
    expect(bundle.bundle.types.filter(type => type.id === 'cassette')).toHaveLength(1);
    expect(bundle.bundle.types.filter(type => type.id === 'queue')).toHaveLength(0);
    expect(bundle.bundle.types.filter(type => type.id === 'organization').length).toBeGreaterThan(0);
    expect(bundle.attachmentKinds.OCCS_SOURCE).toMatchObject({ mimeType: 'application/perigram+occs' });
  });

  it('serves the composed pack editor bindings with the type view', async () => {
    const described = await describeOrganizationTypes(ORG);
    const byType = new Map((described.editors || []).map(editor => [editor.type, editor]));
    expect(byType.get('cassette')).toMatchObject({ surface: 'cassette-designer', modes: ['create', 'edit'] });
    expect(byType.get('sheet-design')).toMatchObject({ surface: 'sheet-design-editor', modes: ['edit'] });
    expect(byType.get('facade-design')).toMatchObject({ surface: 'facade-designer', modes: ['create', 'edit'] });
  });

  it('stores valid org declarations after full-view compile', async () => {
    const stored = await defineType({ id: 'gadget', class: 'file', fields: { code: { base: 'string' } } }, { organizationId: ORG });
    expect(stored.id).toBe('gadget');
    expect(stored.scope).toBe('org');
    expect(stored.version).toBe(1);
    expect(repository.upsertByTypeId).toHaveBeenCalled();
  });

  it('allows breaking redefinition of a type with zero instances', async () => {
    const { countInstancesOfType } = await import('../instances/count.js');
    countInstancesOfType.mockResolvedValueOnce(0);
    const storedGadget = { id: 'gadget', class: 'file', scope: 'org', organizationId: ORG, version: 3,
      fields: { code: { base: 'string' }, gone: { base: 'string' } } };
    repository.findByTypeId.mockResolvedValue(storedGadget);
    repository.listByOrganization.mockResolvedValue([storedGadget]);
    const stored = await defineType(
      { id: 'gadget', class: 'file', fields: { code: { base: 'string' } } },
      { organizationId: ORG }
    );
    expect(stored.id).toBe('gadget');
    expect(stored.version).toBe(4);
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

  it('executes covered migrate steps after persisting and records the summary', async () => {
    const { applyTypeMigrationSteps } = await import('../instances/migrations.js');
    applyTypeMigrationSteps.mockResolvedValueOnce({
      appliedAt: '2026-09-22T00:00:00.000Z',
      actor: 'admin',
      counts: { 'rename-enum-value': 5 },
      failures: []
    });
    const existing = {
      id: 'widget', class: 'item', scope: 'org', organizationId: ORG, version: 3,
      fields: { code: { base: 'string' } },
      states: { main: { values: ['scrap', 'ready'], initial: 'scrap' } }
    };
    repository.findByTypeId.mockResolvedValue(existing);
    repository.listByOrganization.mockResolvedValue([existing]);
    const stored = await defineType(
      {
        id: 'widget', class: 'item',
        fields: { code: { base: 'string' } },
        states: { main: { values: ['recycled', 'ready'], initial: 'ready' } },
        migrate: [{ kind: 'rename-enum-value', from: 'scrap', to: 'recycled' }]
      },
      { organizationId: ORG, actor: 'admin' }
    );
    expect(stored.version).toBe(4);
    expect(stored.migrated).toMatchObject({ actor: 'admin', counts: { 'rename-enum-value': 5 } });
    expect(applyTypeMigrationSteps).toHaveBeenCalledWith(expect.objectContaining({
      toVersion: 4,
      actor: 'admin',
      steps: [{ kind: 'rename-enum-value', axis: 'main', from: 'scrap', to: 'recycled' }]
    }));
  });

  it('refuses a breaking redefinition whose steps do not cover the diff', async () => {
    const existing = {
      id: 'widget', class: 'item', scope: 'org', organizationId: ORG, version: 3,
      fields: { code: { base: 'string' } },
      states: { main: { values: ['scrap', 'ready'], initial: 'scrap' } }
    };
    repository.findByTypeId.mockResolvedValue(existing);
    repository.listByOrganization.mockResolvedValue([existing]);
    await expect(defineType(
      {
        id: 'widget', class: 'item',
        fields: { code: { base: 'string' } },
        states: { main: { values: ['ready'], initial: 'ready' } }
      },
      { organizationId: ORG }
    )).rejects.toThrow(/without a covering declared migration/);
    const { applyTypeMigrationSteps } = await import('../instances/migrations.js');
    expect(applyTypeMigrationSteps).not.toHaveBeenCalled();
  });

  it('refuses invalid declarations as 400s', async () => {
    await expect(defineType({ id: 'bad', class: 'nope', fields: {} }, { organizationId: ORG }))
      .rejects.toThrow(/unknown class/);
    await expect(defineType({ id: 'x', class: 'file', fields: {} }, {}))
      .rejects.toThrow(/Organization context required/);
  });

  it('never persists a declaration whose full-view compile fails', async () => {
    // Regression: the write used to upsert before compiling, so a failing
    // redefinition replaced the valid stored declaration and wedged every
    // later write in the org (each compiles the same broken view).
    const { countInstancesOfType } = await import('../instances/count.js');
    countInstancesOfType.mockResolvedValueOnce(0);
    const storedGadget = { id: 'gadget', class: 'file', scope: 'org', organizationId: ORG, version: 2,
      fields: { code: { base: 'string' } } };
    repository.findByTypeId.mockResolvedValue(storedGadget);
    repository.listByOrganization.mockResolvedValue([storedGadget]);
    await expect(defineType(
      { id: 'gadget', class: 'file', fields: {} },
      { organizationId: ORG }
    )).rejects.toThrow(/file requires payload or fields/);
    expect(repository.upsertByTypeId).not.toHaveBeenCalled();

    countInstancesOfType.mockResolvedValueOnce(0);
    await expect(defineType(
      { id: 'gadget', class: 'file', fields: { code: { base: 'string' } }, edges: { children: { parts: { types: ['missing-child'] } } } },
      { organizationId: ORG }
    )).rejects.toThrow(/may not declare lineage children/);
    expect(repository.upsertByTypeId).not.toHaveBeenCalled();
  });

  it('repairs a historically stored invalid declaration without a migration', async () => {
    // The org view holds a file class with children edges (stored by the
    // old persist-before-compile order) WITH live instances: the corrected
    // redefinition must land freely — the diff never protected a
    // declaration that could not compile.
    const { countInstancesOfType } = await import('../instances/count.js');
    countInstancesOfType.mockResolvedValue(4);
    const broken = { id: 'yu', class: 'file', scope: 'org', organizationId: ORG, version: 1,
      fields: { note: { base: 'string' } },
      edges: { children: { parts: { types: ['t-missing-child'] } } } };
    repository.findByTypeId.mockResolvedValue(broken);
    repository.listByOrganization.mockResolvedValue([broken]);
    const stored = await defineType(
      { id: 'yu', class: 'file', fields: { note: { base: 'string' } } },
      { organizationId: ORG }
    );
    expect(stored.version).toBe(2);
    expect(stored.edges).toEqual({});
    expect(repository.upsertByTypeId).toHaveBeenCalled();
  });

  it('stores valid writes beside a broken stored declaration; refuses only errors the write introduces', async () => {
    // The repair sequence an org in the wild hits: a broken stored type
    // (obligation-invalid) poisons the whole-view compile, but that must
    // not block OTHER valid writes — the write gate refuses only the
    // errors the candidate itself introduces.
    const broken = { id: 'yu', class: 'file', scope: 'org', organizationId: ORG, version: 1,
      fields: { note: { base: 'string' } },
      edges: { children: { parts: { types: ['t-child-1'] } } } };
    repository.listByOrganization.mockResolvedValue([broken]);
    repository.findByTypeId.mockImplementation(async (orgId, typeId) => (
      typeId === 'yu' ? broken : null
    ));

    // A valid new type lands even though the stored view carries YU's
    // obligation error.
    const child = await defineType(
      { id: 't-child-1', class: 'file', fields: { note: { base: 'string' } } },
      { organizationId: ORG }
    );
    expect(child.id).toBe('t-child-1');
    expect(repository.upsertByTypeId).toHaveBeenCalled();

    // A candidate that introduces its OWN error is still refused.
    repository.upsertByTypeId.mockClear();
    await expect(defineType(
      { id: 't-empty-1', class: 'file', fields: {} },
      { organizationId: ORG }
    )).rejects.toThrow(/file requires payload or fields/);
    expect(repository.upsertByTypeId).not.toHaveBeenCalled();
  });

  it('refuses shadowing a system type', async () => {
    await expect(defineType(
      { id: 'cassette', class: 'file', fields: { rogue: { base: 'string' } } },
      { organizationId: ORG }
    )).rejects.toThrow(/shadows a system type/);
  });

  it('deletes org types, refuses system types', async () => {
    await expect(removeType('cassette', { organizationId: ORG })).rejects.toThrow(/System types/);
    repository.listByOrganization.mockResolvedValue([
      { id: 'widget', class: 'file', scope: 'org', organizationId: ORG, version: 1, fields: {} }
    ]);
    await expect(removeType('widget', { organizationId: ORG })).resolves.toBe(true);
    expect(repository.deleteByTypeId).toHaveBeenCalledWith(ORG, 'widget');
  });

  it('exposes a registry for downstream runtimes', async () => {
    const registry = await compileRegistryForOrganization(ORG);
    expect(registry.getType('cassette')).toBeTruthy();
    expect(registry.getType('cassette', 'other-org')?.scope).toBe('system');
  });
});
