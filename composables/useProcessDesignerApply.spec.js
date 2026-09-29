import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useProcessDesignerApply } from './useProcessDesignerApply.js';

// The apply orchestration contract: validation carrying a migration plan
// pauses activation until the draft's declared migrations cover it; the
// designer's migration dialog confirms target mappings, confirming
// persists them as a declaration (save) and re-activates with no payload,
// and drifted plans (409) refresh the dialog instead of failing the apply.
function mountApply(overrides = {}) {
  const persistence = {
    saveDraft: vi.fn(async () => ({ _id: 'draft-1' })),
    validateDraft: vi.fn(),
    activateDraft: vi.fn()
  };
  const draft = { value: { _id: 'draft-1', data: {} } };
  const apply = useProcessDesignerApply({
    persistence,
    t: key => key,
    toast: { add: vi.fn() },
    draft,
    validation: { value: null },
    isActiveProcess: () => false,
    serializeProcess: () => ({}),
    createDraft: vi.fn(async () => ({ _id: 'draft-1' })),
    persistTreeDeclarations: vi.fn(async () => ({ failures: [] })),
    focusFirstValidationDiagnostic: vi.fn(),
    upsertProcessDefinition: vi.fn(),
    setDraft: vi.fn(),
    syncNow: vi.fn(),
    ...overrides
  });
  return { apply, persistence, draft };
}

const validResult = { ok: true, errors: [], warnings: [], diff: null };

describe('useProcessDesignerApply migration pause', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pauses apply when validation carries a migration plan', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 1 }], targets: ['draft'] }] }
    });

    await apply.applyProcess();

    expect(persistence.activateDraft).not.toHaveBeenCalled();
    expect(apply.pendingMigration.value.statuses).toHaveLength(1);
    expect(apply.applyingProcess.value).toBe(false);
  });

  it('activates without a payload when no plan is present', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue(validResult);
    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });

    await apply.applyProcess();

    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.pendingMigration.value).toBeNull();
  });

  it('activates without pausing when declared migrations already cover the plan', async () => {
    const { apply, persistence, draft } = mountApply();
    draft.value.data.migrations = {
      statuses: [{ typeId: 'project', from: 'OLD', to: 'draft' }]
    };
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 2 }], targets: ['draft', 'done'] }] }
    });
    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });

    await apply.applyProcess();

    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.pendingMigration.value).toBeNull();
  });

  it('persists confirmed mappings as a declaration, then activates with no payload', async () => {
    const { apply, persistence, draft } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 2 }], targets: ['draft', 'done'] }] }
    });
    await apply.applyProcess();

    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    expect(draft.value.data.migrations.statuses).toEqual([
      { typeId: 'project', from: 'OLD', to: 'draft' }
    ]);
    expect(persistence.saveDraft).toHaveBeenCalled();
    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.pendingMigration.value).toBeNull();
  });

  it('keeps the dialog open with the fresh plan when instances drifted', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 1 }], targets: ['draft'] }] }
    });
    await apply.applyProcess();

    const driftedPlan = { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 5 }], targets: ['draft'] }] };
    const drifted = new Error('Removed workflow states still used by active entities require a migration decision');
    drifted.data = { migrationRequired: true, migrationPlan: driftedPlan };
    persistence.activateDraft.mockRejectedValue(drifted);
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    // The reactive ref wraps the plan, so assert the drifted content.
    expect(apply.pendingMigration.value.statuses[0].removed[0].count).toBe(5);
  });

  it('keeps the plan on incomplete migrations so re-confirming resumes', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 3 }], targets: ['draft'] }] }
    });
    await apply.applyProcess();

    const incomplete = new Error('Migration incomplete');
    incomplete.data = { migrationIncomplete: true, migration: { failures: [{ id: 'p-2' }] } };
    persistence.activateDraft.mockRejectedValue(incomplete);
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    expect(apply.pendingMigration.value).not.toBeNull();
  });

  it('clears the plan on cancel without activating', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 1 }], targets: ['draft'] }] }
    });
    await apply.applyProcess();

    apply.cancelApplyMigration();

    expect(apply.pendingMigration.value).toBeNull();
    expect(persistence.activateDraft).not.toHaveBeenCalled();
  });

  it('rethrows save failures without creating anything', async () => {
    const createDraft = vi.fn();
    const { apply, persistence } = mountApply({ createDraft });
    persistence.saveDraft.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    await expect(apply.saveDraft()).rejects.toThrow('boom');
    expect(createDraft).not.toHaveBeenCalled();
  });

  it('saves an active definition in place (one document, no fork)', async () => {
    const createDraft = vi.fn();
    const { apply, persistence, draft } = mountApply({ createDraft });
    draft.value = { _id: 'process-1', states: { main: 'ACTIVE' }, data: {} };
    persistence.saveDraft.mockResolvedValue({ _id: 'process-1', states: { main: 'ACTIVE' } });

    const result = await apply.saveDraft();

    expect(persistence.saveDraft).toHaveBeenCalledWith('process-1', expect.anything());
    expect(createDraft).not.toHaveBeenCalled();
    expect(result).toEqual({ _id: 'process-1', states: { main: 'ACTIVE' } });
  });

  it('lands declaration-post failures in the persistent validation feedback and stops before validation', async () => {
    const validation = { value: null };
    const { apply, persistence } = mountApply({
      validation,
      persistTreeDeclarations: vi.fn(async () => ({ failures: ['Plate: bad descriptor'] }))
    });

    await apply.applyProcess();

    expect(persistence.validateDraft).not.toHaveBeenCalled();
    expect(validation.value).toMatchObject({ ok: false, errors: ['Plate: bad descriptor'] });
  });

  it('pauses apply with the step dialog when a declaration post carries a migration plan', async () => {
    const validation = { value: null };
    const planFailure = {
      typeId: 'child',
      typeName: 'Child',
      plan: {
        changes: [{ severity: 'breaking', kind: 'remove-field', field: 'anythin' }],
        requiredSteps: ['remove-field anythin requires a remove-field or rename-field step']
      }
    };
    const { apply, persistence } = mountApply({
      validation,
      persistTreeDeclarations: vi.fn(async () => ({ failures: [planFailure] }))
    });

    await apply.applyProcess();

    expect(persistence.validateDraft).not.toHaveBeenCalled();
    expect(persistence.activateDraft).not.toHaveBeenCalled();
    expect(apply.pendingTypeMigration.value).toEqual([planFailure]);
    // The refusal also lands in the persistent feedback, named by the type.
    expect(validation.value).toMatchObject({
      ok: false,
      errors: ['Child: remove-field anythin requires a remove-field or rename-field step']
    });
  });

  it('confirming writes the steps onto the class nodes and retries the apply', async () => {
    const planFailure = {
      typeId: 'child',
      typeName: 'Child',
      plan: {
        changes: [
          { severity: 'breaking', kind: 'remove-field', field: 'anythin' },
          { severity: 'breaking', kind: 'add-required-field', field: 'anything' }
        ],
        requiredSteps: []
      }
    };
    const classNode = { id: 'class:child', type: 'ctsClass', data: { typeId: 'child', class: 'item' } };
    const nodes = { value: [classNode] };
    const persistTreeDeclarations = vi.fn()
      .mockResolvedValueOnce({ failures: [planFailure] })
      .mockResolvedValue({ failures: [] });
    const { apply, persistence } = mountApply({ nodes, persistTreeDeclarations });
    persistence.validateDraft.mockResolvedValue(validResult);
    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });

    await apply.applyProcess();
    expect(apply.pendingTypeMigration.value).toHaveLength(1);

    await apply.confirmTypeMigration({
      child: [{ kind: 'rename-field', from: 'anythin', to: 'anything' }]
    });

    // The confirmed steps are the author's consent: they land on the class
    // node as declaration state before the retry posts them.
    expect(classNode.data.migrate).toEqual([{ kind: 'rename-field', from: 'anythin', to: 'anything' }]);
    expect(persistTreeDeclarations).toHaveBeenCalledTimes(2);
    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.pendingTypeMigration.value).toBeNull();
  });

  it('cancel clears the type-migration pause without writing steps', async () => {
    const planFailure = {
      typeId: 'child',
      typeName: 'Child',
      plan: { changes: [], requiredSteps: ['declared migration step … matches no breaking change'] }
    };
    const nodes = { value: [] };
    const { apply, persistence } = mountApply({
      nodes,
      persistTreeDeclarations: vi.fn(async () => ({ failures: [planFailure] }))
    });

    await apply.applyProcess();
    apply.cancelTypeMigration();

    expect(apply.pendingTypeMigration.value).toBeNull();
    expect(persistence.activateDraft).not.toHaveBeenCalled();
  });
});
