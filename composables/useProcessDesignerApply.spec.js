import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useProcessDesignerApply } from './useProcessDesignerApply.js';

// The apply orchestration contract: validation carrying a migration plan
// pauses activation until the designer's migration dialog confirms target
// mappings; confirming re-posts activate with the payload, and drifted
// plans (409) refresh the dialog instead of failing the apply.
function mountApply(overrides = {}) {
  const persistence = {
    saveDraft: vi.fn(async () => ({ _id: 'draft-1' })),
    validateDraft: vi.fn(),
    activateDraft: vi.fn()
  };
  const apply = useProcessDesignerApply({
    persistence,
    t: key => key,
    toast: { add: vi.fn() },
    draft: { value: { _id: 'draft-1' } },
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
  return { apply, persistence };
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

  it('resumes activation with the confirmed mappings', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 2 }], targets: ['draft', 'done'] }] }
    });
    await apply.applyProcess();

    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1', {
      statuses: [{ typeId: 'project', from: 'OLD', to: 'draft' }]
    });
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

  it('forks a draft copy when the server reports the definition went active', async () => {
    const toast = { add: vi.fn() };
    const createDraft = vi.fn(async () => ({ _id: 'draft-2' }));
    const { apply, persistence } = mountApply({ toast, createDraft });
    const stale = new Error('Active process definitions cannot be edited directly');
    stale.statusCode = 409;
    stale.data = { message: 'Active process definitions cannot be edited directly' };
    persistence.saveDraft.mockRejectedValue(stale);

    const result = await apply.saveDraft();

    expect(createDraft).toHaveBeenCalledWith({ copyActive: true });
    expect(result).toEqual({ _id: 'draft-2' });
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'info' }));
  });

  it('rethrows non-active save failures without forking', async () => {
    const createDraft = vi.fn();
    const { apply, persistence } = mountApply({ createDraft });
    persistence.saveDraft.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    await expect(apply.saveDraft()).rejects.toThrow('boom');
    expect(createDraft).not.toHaveBeenCalled();
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
});
