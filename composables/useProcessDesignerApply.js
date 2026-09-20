import { ref } from 'vue';

// The apply orchestration: Save persists the authored graph as a draft (or
// the explicit copy-to-draft on an active process); Apply = save, compile
// tree declarations into the registry, validate, activate — one operation,
// with the first structured diagnostic focused on the canvas. Validation
// state lands in the shared `validation` ref the page renders. When the
// next contract removes workflow states still held by live instances,
// validation returns a migration plan: Apply pauses with `pendingMigration`
// and only the confirmed target mappings (collected by the designer's
// migration dialog) resume activation.
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
  syncNow
}) {
  const savingDraft = ref(false);
  const applyingProcess = ref(false);
  const pendingMigration = ref(null);

  async function saveDraft() {
    savingDraft.value = true;
    try {
      syncNow();
      if (!draft.value?._id || isActiveProcess.value) return await createDraft({ copyActive: isActiveProcess.value });
      try {
        const updated = await persistence.saveDraft(draft.value._id, serializeProcess());
        upsertProcessDefinition(updated);
        setDraft(updated);
        return updated;
      } catch (error) {
        // Stale workspace: the server knows this definition went ACTIVE
        // while the client still treats it as a draft. Fork a draft copy
        // instead of dying on the 409 — the canvas state carries over, so
        // no edit is lost.
        if (Number(error?.statusCode) !== 409 || !/cannot be edited directly/.test(error?.data?.message || error?.message || '')) throw error;
        const forked = await createDraft({ copyActive: true });
        toast.add({ severity: 'info', summary: t('processDesigner.forkedActiveDraft'), life: 5000 });
        return forked;
      }
    } finally {
      savingDraft.value = false;
    }
  }

  async function saveDraftFromDock() {
    if (savingDraft.value) return;
    const createsDraft = !draft.value?._id || isActiveProcess.value;
    try {
      await saveDraft();
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
    await saveDraft();
    // Apply compiles the app: tree declarations land in the registry first,
    // so validation and activation see the types the graph references. A
    // failed declaration post aborts the apply with its real cause.
    const posted = await persistTreeDeclarations();
    if (posted.failures.length) return null;
    const result = await persistence.validateDraft(draft.value._id);
    validation.value = result;
    if (!result.ok) {
      focusFirstValidationDiagnostic(result);
      const failure = new Error(result.errors?.[0] || t('processDesigner.validationFailed'));
      failure.data = result;
      throw failure;
    }
    if (result.migrationPlan?.statuses?.length) {
      // Pause: the migration dialog collects one target per removed state;
      // confirming resumes through confirmApplyMigration.
      pendingMigration.value = result.migrationPlan;
      return null;
    }
    return completeActivation(await persistence.activateDraft(draft.value._id));
  }

  async function confirmApplyMigration(mappings) {
    if (!draft.value?._id || applyingProcess.value) return;
    applyingProcess.value = true;
    try {
      const activated = await persistence.activateDraft(draft.value._id, { statuses: mappings });
      pendingMigration.value = null;
      return completeActivation(activated);
    } catch (error) {
      if (error?.data?.migrationIncomplete) {
        // Activation succeeded; some re-targets failed. The plan stays open
        // with the same mappings — re-confirming resumes idempotently.
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
        pendingMigration.value = error.data.migrationPlan || pendingMigration.value;
        toast.add({
          severity: 'warn',
          summary: t('processDesigner.applyMigrationTitle'),
          detail: error?.data?.message,
          life: 6000
        });
        return;
      }
      reportApplyError(error);
    } finally {
      applyingProcess.value = false;
    }
  }

  function cancelApplyMigration() {
    pendingMigration.value = null;
  }

  async function applyProcess() {
    if (!draft.value?._id || isActiveProcess.value || applyingProcess.value) return;
    applyingProcess.value = true;
    try {
      const activated = await activateDraft();
      if (!activated) return;
    } catch (error) {
      reportApplyError(error);
    } finally {
      applyingProcess.value = false;
    }
  }

  return {
    savingDraft,
    applyingProcess,
    pendingMigration,
    saveDraft,
    saveDraftFromDock,
    activateDraft,
    applyProcess,
    confirmApplyMigration,
    cancelApplyMigration
  };
}
