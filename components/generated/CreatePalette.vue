<template>
  <span class="inline-flex">
    <Button
      v-if="hasEntries"
      icon="pi pi-plus"
      text
      rounded
      size="small"
      severity="secondary"
      :aria-label="t('common.create')"
      :title="t('common.create')"
      :loading="creating"
      @click="event => palette?.toggle(event)"
    />
    <Popover ref="palette" @show="focusSearch">
      <div class="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText
            ref="search"
            v-model="query"
            size="small"
            class="w-full"
            :placeholder="t('common.search')"
            :aria-label="t('common.search')"
          />
        </IconField>
        <Listbox
          :options="groups"
          option-label="label"
          option-group-label="label"
          option-group-children="items"
          scroll-height="18rem"
          :aria-label="t('common.create')"
          @change="event => runPaletteEntry(event.value?.action)"
        />
      </div>
    </Popover>
    <input ref="file" type="file" class="hidden" :accept="uploadAccept" @change="onFilePicked" />
    <ActionFormDialog
      :action="dialogAction"
      :bundle="bundle"
      :pool="pool"
      :create-actions="createActions"
      :submitting="creating"
      :failures="dialogFailures"
      @run="payload => runCreate(dialogAction, payload)"
      @close="closeDialog"
    />
  </span>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';
import InputText from 'primevue/inputtext';
import Listbox from 'primevue/listbox';
import { planActionLaunch } from '#shared/ui-mapping/index.js';
import { refusalFailuresOf } from '~/utils/action-failures.js';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import { createActionsByType, isCreateAction } from '~/utils/action-visibility.js';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { isEditorProtocolCreate, resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { openBlankFileEditor } from '~/components/generated/file-surfaces.js';
import { uploadCreateAccept, uploadCreatePayloadReference } from '~/components/ui-mapping/upload-create.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { createPaletteGroups } from '~/components/generated/create-palette.js';
import { generatedCreateLabel } from '~/utils/generated-labels.js';
import ActionFormDialog from '~/components/ui-mapping/ActionFormDialog.vue';

// The home shell's one create control (SPEC §4): a searchable palette of
// the manifest's compiled create actions, dispatching by the target
// type's declared creation protocol — the editor protocol opens the
// blank editor surface, an upload create runs inline over the files
// channel, every other create opens the construct dialog (the shared
// ActionFormDialog) or runs directly when it prompts nothing. The pinned
// New page entry (SPEC §26) rides above the type groups; the host owns
// the create and the tab.
const { t, te } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const instances = useInstancesStore();
const view = useFileTypeView();

const emit = defineEmits(['create-page']);

const palette = ref(null);
const search = ref(null);
const query = ref('');
const creating = ref(false);
const pendingUpload = ref(null);
const file = ref(null);
const dialogAction = ref(null);
const dialogFailures = ref(null);
const NEW_PAGE_ACTION = Object.freeze({ kind: 'newPage' });
const pagesAvailable = computed(() => Boolean(authStore.organizationData?._id || authStore.userData?.organizationId));
const hasEntries = computed(() => pagesAvailable.value
  || (authStore.actionManifest || []).some(action => isCreateAction(action) && action.typeId));

const bundle = computed(() => authStore.processPayload?.bundle || { types: [] });
const pool = computed(() => instances.instancePool || {});
const createActions = computed(() => createActionsByType(authStore.processPayload?.actions || {}));
const groups = computed(() => createPaletteGroups(authStore.actionManifest || [], {
  query: query.value,
  typeLabelOf: typeId => view.typeById(typeId)?.name
    || (bundle.value.types || []).find(candidate => candidate.id === typeId)?.name
    || typeId,
  actionLabelOf: action => generatedCreateLabel(action, { t, te }) || action.label || action.id,
  ...(pagesAvailable.value
    ? { pinnedGroup: { label: t('pages.title'), items: [{ label: t('pages.newPage'), action: NEW_PAGE_ACTION }] } }
    : {})
}));

function focusSearch() {
  query.value = '';
  search.value?.$el?.focus?.();
}

function runPaletteEntry(action) {
  palette.value?.hide();
  if (!action) return;
  if (action === NEW_PAGE_ACTION) {
    emit('create-page');
    return;
  }
  if (isEditorProtocolCreate(action)) {
    openBlankFileEditor(action.typeId);
    return;
  }
  if (action.construction?.mode === 'upload') {
    pendingUpload.value = action;
    file.value?.click();
    return;
  }
  if (planActionLaunch(action) === 'dialog') {
    dialogAction.value = action;
    dialogFailures.value = null;
    return;
  }
  runCreate(action, {});
}

async function runCreate(action, data = {}) {
  if (!action) return;
  creating.value = true;
  try {
    const result = await instances.runAction({ action, actionId: action.id, entities: {}, data, parameters: {} });
    landCreated(action, result);
  } catch (error) {
    if (isOfflineQueuedError(error)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    const failures = refusalFailuresOf(error);
    if (failures && dialogAction.value === action) {
      dialogFailures.value = failures;
      return;
    }
    toast.add({
      severity: 'error',
      summary: action.label || action.id,
      detail: failures
        ? failures.map(failure => [failure.name, failure.message].filter(Boolean).join(' — ')).join('\n')
        : (error?.data?.message || error?.message || ''),
      life: 6000
    });
  } finally {
    creating.value = false;
  }
}

// A run lands through the created-open contract (the workspace tab, the
// compiled detail route, or a success toast — a create is never silent).
function landCreated(action, result) {
  const target = resolveCreatedInstanceOpen({ action, result, manifest: authStore.screenManifest });
  if (target?.kind === 'workspace') {
    toast.add({ severity: 'success', summary: t('common.created'), detail: target.name || target.typeId, life: 4000 });
    openInstanceInWorkspace({ typeId: target.typeId, instanceId: target.instanceId });
    return;
  }
  if (target?.kind === 'route') {
    navigateTo(target.route);
    return;
  }
  toast.add({ severity: 'success', summary: action.label || action.id, detail: t('generatedScreen.actionCompleted'), life: 2000 });
}

const uploadAccept = computed(() => uploadCreateAccept(view.typeById(pendingUpload.value?.typeId)));

async function onFilePicked(event = {}) {
  const picked = event.target?.files?.[0];
  const action = pendingUpload.value;
  event.target.value = '';
  if (!picked || !action) return;
  creating.value = true;
  try {
    const payload = await uploadCreatePayloadReference(picked);
    await runCreate(action, { payload });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    creating.value = false;
    pendingUpload.value = null;
  }
}

function closeDialog() {
  dialogAction.value = null;
  dialogFailures.value = null;
}
</script>
