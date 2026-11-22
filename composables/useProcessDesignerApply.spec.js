import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useProcessDesignerApply } from './useProcessDesignerApply.js';

// The Apply machine: one authoritative `applyState` value over the closed
// states idle, saving, applying, migration-required, type-migration-required,
// type-migration-required, error; every gate confirm/cancel consumes its state.
function mountApply(overrides = {}) {
  const persistence = {
    saveDraft: vi.fn(async () => ({ _id: 'draft-1' })),
    validateDraft: vi.fn(),
    activateDraft: vi.fn()
  };
  const draft = { value: { _id: 'draft-1', data: {} } };
  const setDraft = vi.fn();
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
    setDraft,
    syncNow: vi.fn(),
    ...overrides
  });
  return { apply, persistence, draft, setDraft };
}

const validResult = { ok: true, errors: [], warnings: [], diff: null };
const plan = {
  statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 1 }], targets: ['draft'] }]
};

describe('useProcessDesignerApply machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs a save-only pass through saving and back to idle', async () => {
    const { apply, persistence } = mountApply();
    let release;
    persistence.saveDraft.mockImplementation(() => new Promise(resolve => {
      release = () => resolve({ _id: 'draft-1' });
    }));

    const saving = apply.saveDraft();
    expect(apply.applyState.value).toBe('saving');
    release();
    await saving;
    expect(apply.applyState.value).toBe('idle');
    expect(apply.applyDetail.value).toBeNull();
  });

  it('keeps the mounted canvas and marks the saved baseline after a settled save', async () => {
    const markSaved = vi.fn();
    const { apply, persistence, setDraft } = mountApply({
      serializeProcess: () => ({ value: 'graph' }),
      authoringSignature: () => 'sig-1',
      markSaved
    });

    await apply.saveDraft();

    expect(persistence.saveDraft).toHaveBeenCalledWith('draft-1', { value: 'graph' });
    expect(setDraft).not.toHaveBeenCalled();
    expect(markSaved).toHaveBeenCalledWith('sig-1', { _id: 'draft-1' });
  });

  it('does not replace process edits made while persistence is in flight', async () => {
    let release;
    const submitted = { value: 'before' };
    const markSaved = vi.fn();
    const { apply, persistence, setDraft } = mountApply({
      serializeProcess: () => ({ value: submitted.value }),
      authoringSignature: () => submitted.value,
      markSaved
    });
    persistence.saveDraft.mockImplementation(() => new Promise(resolve => {
      release = () => resolve({ _id: 'draft-1', data: { value: 'before' } });
    }));

    const saving = apply.saveDraft();
    submitted.value = 'edited-during-save';
    release();
    await saving;

    expect(persistence.saveDraft).toHaveBeenCalledWith('draft-1', { value: 'before' });
    expect(setDraft).not.toHaveBeenCalled();
    expect(markSaved).not.toHaveBeenCalled();
  });

  it('settles a save failure in error', async () => {
    const { apply, persistence } = mountApply();
    persistence.saveDraft.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));

    await expect(apply.saveDraft()).rejects.toThrow('boom');
    expect(apply.applyState.value).toBe('error');
    expect(apply.applyDetail.value).toBe('boom');
  });

  it('settles a validation failure in error with the first diagnostic', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({ ok: false, errors: ['Missing socket'], warnings: [] });

    await apply.applyProcess();

    expect(persistence.activateDraft).not.toHaveBeenCalled();
    expect(apply.applyState.value).toBe('error');
    expect(apply.applyDetail.value).toBe('Missing socket');
  });

  it('activates through applying back to idle', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue(validResult);
    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });

    await apply.applyProcess();

    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.applyState.value).toBe('idle');
  });

  it('pauses in migration-required when validation carries a plan', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({ ...validResult, migrationPlan: plan });

    await apply.applyProcess();

    expect(persistence.activateDraft).not.toHaveBeenCalled();
    expect(apply.applyState.value).toBe('migration-required');
    expect(apply.applyDetail.value.statuses).toHaveLength(1);
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
    expect(apply.applyState.value).toBe('idle');
  });

  it('confirming the migration persists the mappings, activates, and returns to idle', async () => {
    const { apply, persistence, draft } = mountApply();
    persistence.validateDraft.mockResolvedValue({
      ...validResult,
      migrationPlan: { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 2 }], targets: ['draft', 'done'] }] }
    });
    await apply.applyProcess();
    expect(apply.applyState.value).toBe('migration-required');

    persistence.activateDraft.mockResolvedValue({ _id: 'draft-1', data: { compiled: { warnings: [] } } });
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    expect(draft.value.data.migrations.statuses).toEqual([
      { typeId: 'project', from: 'OLD', to: 'draft' }
    ]);
    expect(persistence.saveDraft).toHaveBeenCalled();
    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.applyState.value).toBe('idle');
  });

  it('cancel returns migration-required to idle without activating', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({ ...validResult, migrationPlan: plan });
    await apply.applyProcess();

    apply.cancelApplyMigration();

    expect(apply.applyState.value).toBe('idle');
    expect(apply.applyDetail.value).toBeNull();
    expect(persistence.activateDraft).not.toHaveBeenCalled();
  });

  it('keeps migration-required with the fresh plan when instances drifted', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({ ...validResult, migrationPlan: plan });
    await apply.applyProcess();

    const driftedPlan = { statuses: [{ typeId: 'project', removed: [{ state: 'OLD', count: 5 }], targets: ['draft'] }] };
    const drifted = new Error('Removed workflow states still used by active entities require a migration decision');
    drifted.data = { migrationRequired: true, migrationPlan: driftedPlan };
    persistence.activateDraft.mockRejectedValue(drifted);
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    expect(apply.applyState.value).toBe('migration-required');
    expect(apply.applyDetail.value.statuses[0].removed[0].count).toBe(5);
  });

  it('keeps migration-required on incomplete migrations so re-confirming resumes', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({ ...validResult, migrationPlan: plan });
    await apply.applyProcess();

    const incomplete = new Error('Migration incomplete');
    incomplete.data = { migrationIncomplete: true, migration: { failures: [{ id: 'p-2' }] } };
    persistence.activateDraft.mockRejectedValue(incomplete);
    await apply.confirmApplyMigration([{ typeId: 'project', from: 'OLD', to: 'draft' }]);

    expect(apply.applyState.value).toBe('migration-required');
  });

  it('pauses in type-migration-required when a declaration post carries a plan', async () => {
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
    expect(apply.applyState.value).toBe('type-migration-required');
    expect(apply.applyDetail.value).toEqual([planFailure]);
    expect(validation.value).toMatchObject({
      ok: false,
      errors: ['Child: remove-field anythin requires a remove-field or rename-field step']
    });
  });

  it('confirming type migration writes the steps and retries the apply', async () => {
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
    expect(apply.applyState.value).toBe('type-migration-required');

    await apply.confirmTypeMigration({
      child: [{ kind: 'rename-field', from: 'anythin', to: 'anything' }]
    });

    expect(classNode.data.migrate).toEqual([{ kind: 'rename-field', from: 'anythin', to: 'anything' }]);
    expect(persistTreeDeclarations).toHaveBeenCalledTimes(2);
    expect(persistence.activateDraft).toHaveBeenCalledWith('draft-1');
    expect(apply.applyState.value).toBe('idle');
  });

  it('cancel returns type-migration-required to idle without writing steps', async () => {
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

    expect(apply.applyState.value).toBe('idle');
    expect(persistence.activateDraft).not.toHaveBeenCalled();
  });

  it('ignores overlapping gate arrivals: a second apply cannot replace an open gate', async () => {
    const { apply, persistence } = mountApply();
    persistence.validateDraft.mockResolvedValue({ ...validResult, migrationPlan: plan });
    await apply.applyProcess();

    await apply.applyProcess();
    apply.cancelTypeMigration();

    expect(persistence.validateDraft).toHaveBeenCalledTimes(1);
    expect(apply.applyState.value).toBe('migration-required');
    expect(apply.applyDetail.value.statuses).toHaveLength(1);
  });

  it('ignores confirmations that do not belong to the open gate', async () => {
    const { apply, persistence } = mountApply({
      persistTreeDeclarations: vi.fn(async () => ({
        failures: [{ typeId: 'child', typeName: 'Child', plan: { changes: [], requiredSteps: ['x'] } }]
      }))
    });
    await apply.applyProcess();
    expect(apply.applyState.value).toBe('type-migration-required');

    await apply.confirmApplyMigration([]);

    expect(apply.applyState.value).toBe('type-migration-required');
    expect(persistence.activateDraft).not.toHaveBeenCalled();
  });
});
