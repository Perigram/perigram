import { ref } from 'vue';
import { writeTypeMigrationSteps } from '~/utils/processDesignerTypeMigrations.js';

// The machine's transition table and payloads are canonical in
// [composables/README.md](./README.md#process-designer-apply-state-machine).
const APPLY_TRANSITIONS = Object.freeze({
  idle: { save: 'saving', apply: 'applying' },
  saving: { saved: 'idle', failed: 'error' },
  applying: {
    activated: 'idle',
    failed: 'error',
    'migration-required': 'migration-required',
    'type-migration-required': 'type-migration-required'
  },
  'migration-required': { 'confirm-migration': 'applying', 'cancel-migration': 'idle' },
  'type-migration-required': { 'confirm-type-migration': 'applying', 'cancel-type-migration': 'idle' },
  error: { save: 'saving', apply: 'applying' }
});

function declaredMappingsCover(plan, statuses = []) {
  return (plan?.statuses || []).every(row =>
    row.removed.every(({ state }) =>
      statuses.some(mapping =>
        mapping.typeId === row.typeId
        && mapping.from === state
        && (row.targets || []).includes(mapping.to)
      )
    )
  );
}

export function useProcessDesignerApply({
  persistence,
  t,
  toast,
  draft,
  validation,
  isActiveProcess,
  serializeProcess,
  createDraft,
  persistTreeDeclarations,
  focusFirstValidationDiagnostic,
  upsertProcessDefinition,
  setDraft,
  syncNow,
  nodes = { value: [] }
}) {
  const applyState = ref('idle');
  const applyDetail = ref(null);

  function move(event, detail = null) {
    const next = APPLY_TRANSITIONS[applyState.value]?.[event];
    if (!next) return false;
    applyState.value = next;
    applyDetail.value = detail;
    return true;
  }

  async function persistDraft() {
    syncNow();
    if (!draft.value?._id) return await createDraft({ empty: true });
    // One document for its whole life (process-definitions README):
    // saves persist in place, draft or active — no fork.
    const submitted = serializeProcess();
    const submittedSignature = JSON.stringify(submitted);
    const updated = await persistence.saveDraft(draft.value._id, submitted);
    upsertProcessDefinition(updated);
    // The response describes the submitted snapshot. Do not hydrate it over
    // edits authored while the request was in flight.
    if (JSON.stringify(serializeProcess()) === submittedSignature) setDraft(updated);
    return updated;
  }

  async function saveDraft() {
    if (!move('save')) return null;
    try {
      const saved = await persistDraft();
      move('saved');
      return saved;
    } catch (error) {
      move('failed', error?.data?.message || error?.message || String(error));
      throw error;
    }
  }

  async function saveDraftWithToast() {
    const createsDraft = !draft.value?._id;
    try {
      if (!await saveDraft()) return;
      toast.add({
        severity: 'success',
        summary: createsDraft ? t('processDesigner.newDraft') : t('processDesigner.saved'),
        life: 2400
      });
    } catch (error) {
      toast.add({
        severity: 'error',
        summary: t('common.save'),
        detail: error?.data?.message || error?.message,
        life: 5000
      });
    }
  }

  function completeActivation(activated) {
    move('activated');
    upsertProcessDefinition(activated);
    setDraft(activated);
    validation.value = {
      ok: true,
      errors: [],
      warnings: activated?.data?.compiled?.warnings || [],
      message: t('processDesigner.applySuccess')
    };
    toast.add({ severity: 'success', summary: t('processDesigner.applySuccess'), life: 3000 });
    return activated;
  }

  function reportApplyError(error) {
    const message = error?.data?.message || error?.message || t('processDesigner.validationFailed');
    move('failed', message);
    validation.value = {
      ok: false,
      errors: [message],
      warnings: [],
      ...(error?.data?.diagnostics ? { diagnostics: error.data.diagnostics } : {})
    };
    focusFirstValidationDiagnostic(validation.value);
    toast.add({ severity: 'error', summary: t('processDesigner.apply'), detail: message, life: 5000 });
  }

  async function activateDraft() {
    await persistDraft();
    // Apply compiles the app: tree declarations land in the registry first,
    // so validation and activation see the types the graph references. A
    // failed declaration post aborts the apply with its real cause.
    const posted = await persistTreeDeclarations();
    if (posted.failures.length) {
      // Toasts alone expire and leave the canvas silent: land the refusal in
      // the same persistent validation feedback every other Apply abort
      // carries, so the cause stays visible after the toasts are gone.
      const typeMigration = posted.failures.filter(failure => failure && typeof failure === 'object' && failure.plan);
      validation.value = {
        ok: false,
        errors: posted.failures.map(failure => (typeof failure === 'string'
          ? failure
          : `${failure.typeName}: ${failure.plan.requiredSteps.join('; ')}`)),
        warnings: []
      };
      focusFirstValidationDiagnostic(validation.value);
      if (typeMigration.length) {
        move('type-migration-required', typeMigration);
        return null;
      }
      move('failed', validation.value.errors[0]);
      return null;
    }
    const result = await persistence.validateDraft(draft.value._id);
    validation.value = result;
    if (!result.ok) {
      focusFirstValidationDiagnostic(result);
      const failure = new Error(result.errors?.[0] || t('processDesigner.validationFailed'));
      failure.data = result;
      throw failure;
    }
    if (result.migrationPlan?.statuses?.length
      && !declaredMappingsCover(result.migrationPlan, draft.value?.data?.migrations?.statuses)) {
      move('migration-required', result.migrationPlan);
      return null;
    }
    return completeActivation(await persistence.activateDraft(draft.value._id));
  }

  async function confirmApplyMigration(mappings) {
    const plan = applyDetail.value;
    if (!draft.value?._id || !move('confirm-migration')) return;
    try {
      // The decision is a declaration, not a payload: persist the mappings
      // on the draft first, then activate — the declaration is also what an
      // idempotent resume re-runs after an interrupted migration.
      draft.value.data = {
        ...draft.value.data,
        migrations: { ...(draft.value.data?.migrations || {}), statuses: mappings }
      };
      await persistDraft();
      const activated = await persistence.activateDraft(draft.value._id);
      return completeActivation(activated);
    } catch (error) {
      if (error?.data?.migrationIncomplete) {
        // Activation succeeded; some re-targets failed. The plan stays open
        // with the same mappings — re-confirming resumes idempotently.
        move('migration-required', plan);
        toast.add({
          severity: 'warn',
          summary: t('processDesigner.applyMigrationTitle'),
          detail: error.data.message,
          life: 6000
        });
        return;
      }
      if (error?.data?.migrationPlan?.statuses?.length || error?.data?.migrationRequired) {
        // Live instances drifted since validation: refresh the plan and
        // keep the dialog open with the fresh counts.
        move('migration-required', error.data.migrationPlan || plan);
        toast.add({
          severity: 'warn',
          summary: t('processDesigner.applyMigrationTitle'),
          detail: error?.data?.message,
          life: 6000
        });
        return;
      }
      reportApplyError(error);
    }
  }

  function cancelApplyMigration() {
    move('cancel-migration');
  }

  async function confirmTypeMigration(stepsByType) {
    if (!draft.value?._id || !move('confirm-type-migration')) return;
    try {
      // The dialog IS the author's consent: the confirmed steps land on the
      // class nodes as one-time declaration state (`data.migrate`, read by
      // `compileTreeDeclarations`), and the retried apply posts them. A
      // re-refusal re-opens the dialog with the fresh plan; consumed steps
      // clear at the successful post.
      writeTypeMigrationSteps(nodes.value, stepsByType);
      syncNow();
      await activateDraft();
    } catch (error) {
      reportApplyError(error);
    }
  }

  function cancelTypeMigration() {
    move('cancel-type-migration');
  }

  async function applyProcess() {
    if (!draft.value?._id || !move('apply')) return;
    try {
      await activateDraft();
    } catch (error) {
      reportApplyError(error);
    }
  }

  return {
    applyState,
    applyDetail,
    saveDraft,
    saveDraftWithToast,
    activateDraft,
    applyProcess,
    confirmApplyMigration,
    cancelApplyMigration,
    confirmTypeMigration,
    cancelTypeMigration
  };
}
