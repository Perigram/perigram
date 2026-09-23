import { ref } from 'vue';
import { writeTypeMigrationSteps } from '~/utils/processDesignerTypeMigrations.js';

// The apply orchestration: Save persists the authored graph as a draft (or
// the explicit copy-to-draft on an active process); Apply = save, compile
// tree declarations into the registry, validate, activate — one operation,
// with the first structured diagnostic focused on the canvas. Validation
// state lands in the shared `validation` ref the page renders. When the
// next contract removes workflow states still held by live instances,
// validation returns a migration plan: Apply pauses with `pendingMigration`
// unless the draft's declared migrations (`data.migrations.statuses`)
// already cover it — the migration decision is a declaration on the
// definition, so confirming persists the mappings through save and
// activation itself carries no payload. A declaration post refused by the
// type-migration gate pauses the same way with `pendingTypeMigration`:
// the structured plan failures open the declarative-step dialog
// (`TypeMigrationStepsDialog`), confirming writes the steps onto the class
// nodes' `data.migrate` and retries the apply — the dialog is the author's
// consent; nothing auto-declares.
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
  const savingDraft = ref(false);
  const applyingProcess = ref(false);
  const pendingMigration = ref(null);
  const pendingTypeMigration = ref(null);

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
    if (posted.failures.length) {
      // Toasts alone expire and leave the canvas silent: land the refusal in
      // the same persistent validation feedback every other Apply abort
      // carries, so the cause stays visible after the toasts are gone. A
      // structured plan failure additionally pauses with the declarative-
      // step dialog (the type-migration authoring moment).
      const typeMigration = posted.failures.filter(failure => failure && typeof failure === 'object' && failure.plan);
      validation.value = {
        ok: false,
        errors: posted.failures.map(failure => (typeof failure === 'string'
          ? failure
          : `${failure.typeName}: ${failure.plan.requiredSteps.join('; ')}`)),
        warnings: []
      };
      focusFirstValidationDiagnostic(validation.value);
      if (typeMigration.length) pendingTypeMigration.value = typeMigration;
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
      // Pause: the migration dialog collects one target per removed state
      // (pre-filled from the declarations); confirming persists them as a
      // declaration and resumes through confirmApplyMigration.
      pendingMigration.value = result.migrationPlan;
      return null;
    }
    return completeActivation(await persistence.activateDraft(draft.value._id));
  }

  async function confirmApplyMigration(mappings) {
    if (!draft.value?._id || applyingProcess.value) return;
    applyingProcess.value = true;
    try {
      // The decision is a declaration, not a payload: persist the mappings
      // on the draft first, then activate — the declaration is also what an
      // idempotent resume re-runs after an interrupted migration.
      draft.value.data = {
        ...draft.value.data,
        migrations: { ...(draft.value.data?.migrations || {}), statuses: mappings }
      };
      await saveDraft();
      const activated = await persistence.activateDraft(draft.value._id);
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

  async function confirmTypeMigration(stepsByType) {
    if (!draft.value?._id || applyingProcess.value) return;
    applyingProcess.value = true;
    try {
      // The dialog IS the author's consent: the confirmed steps land on the
      // class nodes as one-time declaration state (`data.migrate`, read by
      // `compileTreeDeclarations`), and the retried apply posts them. A
      // re-refusal re-opens the dialog with the fresh plan; consumed steps
      // clear at the successful post.
      writeTypeMigrationSteps(nodes.value, stepsByType);
      pendingTypeMigration.value = null;
      syncNow();
      await activateDraft();
    } catch (error) {
      reportApplyError(error);
    } finally {
      applyingProcess.value = false;
    }
  }

  function cancelTypeMigration() {
    pendingTypeMigration.value = null;
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
    pendingTypeMigration,
    saveDraft,
    saveDraftFromDock,
    activateDraft,
    applyProcess,
    confirmApplyMigration,
    cancelApplyMigration,
    confirmTypeMigration,
    cancelTypeMigration
  };
}
