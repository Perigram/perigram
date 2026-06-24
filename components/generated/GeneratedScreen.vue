<template>
  <StandardPage :title="screen.labelKey ? $t(screen.labelKey) : screen.label">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="error" state="error" :message="errorMessage" />
    <StateBlock v-else-if="actionError" state="error" :message="actionError" />
    <WorkspaceLanes v-else-if="screen.template === 'workspaceLanes'" class="min-h-[32rem]">
      <template v-if="regionBySlot.left" #left>
        <GeneratedRegion
          :region="regionBySlot.left"
          :screen-key="screen.screenKey || screen.id"
          :source-state="sourceState(regionBySlot.left.sourceId)"
          :template="screen.template"
          :screen-actions="screen.actions || []"
          @refresh="load"
          @execute-action="executeAction"
        />
      </template>
      <GeneratedRegion
        v-if="regionBySlot.center || regionBySlot.main"
        :region="regionBySlot.center || regionBySlot.main"
        :screen-key="screen.screenKey || screen.id"
        :source-state="sourceState((regionBySlot.center || regionBySlot.main).sourceId)"
        :template="screen.template"
        :screen-actions="screen.actions || []"
        @refresh="load"
        @execute-action="executeAction"
      />
      <template v-if="regionBySlot.right" #right>
        <GeneratedRegion
          :region="regionBySlot.right"
          :screen-key="screen.screenKey || screen.id"
          :source-state="sourceState(regionBySlot.right.sourceId)"
          :template="screen.template"
          :screen-actions="screen.actions || []"
          @refresh="load"
          @execute-action="executeAction"
        />
      </template>
    </WorkspaceLanes>
    <div v-else class="flex flex-col gap-4">
      <GeneratedRegion
        v-for="region in screen.regions"
        :key="region.id"
        :region="region"
        :screen-key="screen.screenKey || screen.id"
        :source-state="sourceState(region.sourceId)"
        :template="screen.template"
        :screen-actions="screen.actions || []"
        @refresh="load"
        @execute-action="executeAction"
      />
    </div>
    <StandardDialog
      v-model:visible="inputDialogVisible"
      size="sm"
      :show-default-footer="true"
      :save-label="dialogSaveLabel"
      :cancel-label="$t('common.cancel')"
      :loading="submittingAction"
      @save="submitPromptedAction"
      @cancel="closeInputDialog"
    >
      <template #header>
        <span>{{ pendingActionLabel }}</span>
      </template>
      <div class="flex flex-col gap-3">
        <label v-for="field in promptFields" :key="field.id" class="flex flex-col gap-1">
          <span class="text-xs text-muted-color">{{ field.label || field.id }}</span>
          <Textarea
            v-if="field.type === 'object'"
            v-model="promptValues[field.id]"
            rows="3"
            auto-resize
          />
          <Select
            v-else-if="field.type === 'entity'"
            v-model="promptValues[field.id]"
            :options="promptOptions[field.id] || []"
            option-label="label"
            option-value="value"
          />
          <InputText
            v-else
            v-model="promptValues[field.id]"
            :type="field.type === 'number' ? 'number' : 'text'"
          />
        </label>
      </div>
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, reactive, ref, toRef } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const toast = useToast();
const { t } = useI18n();
const screenRef = toRef(props, 'screen');
const { screen, loading, error, load, sourceState } = useGeneratedScreen(screenRef);
const inputDialogVisible = ref(false);
const submittingAction = ref(false);
const pendingAction = ref(null);
const pendingEntity = ref(null);
const actionError = ref('');
const promptValues = reactive({});
const promptOptions = reactive({});

const regionBySlot = computed(() => Object.fromEntries(
  screen.value.regions.map(region => [region.slot || 'main', region])
));
const actionInputFields = computed(() => collectActionInputFields(pendingAction.value));
const promptFields = computed(() => promptedFields(pendingAction.value));
const pendingActionLabel = computed(() => pendingAction.value?.label || t('common.create'));
const dialogSaveLabel = computed(() => pendingAction.value?.actionKind === 'createEntity' ? t('common.create') : t('common.save'));
const errorMessage = computed(() => error.value?.data?.message || error.value?.message || t('generatedScreen.loadFailed'));

async function executeAction(action, entity = null) {
  actionError.value = '';
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    if (['createEntity', 'updateEntity'].includes(action.actionKind) && promptedFields(action).length) {
      await openInputDialog(action, entity);
      return;
    }
    await postAction(action, entity, promptData(collectActionInputFields(action), {}));
  } catch (err) {
    showActionError(err);
  }
}

async function openInputDialog(action, entity = null) {
  pendingAction.value = action;
  pendingEntity.value = entity;
  for (const key of Object.keys(promptValues)) delete promptValues[key];
  for (const key of Object.keys(promptOptions)) delete promptOptions[key];
  const fields = collectActionInputFields(action);
  for (const field of fields) {
    promptValues[field.id] = initialPromptValue(field);
  }
  await loadPromptOptions(promptedFields(action));
  inputDialogVisible.value = true;
}

function closeInputDialog() {
  inputDialogVisible.value = false;
  pendingAction.value = null;
  pendingEntity.value = null;
}

async function submitPromptedAction() {
  if (!pendingAction.value) return;
  submittingAction.value = true;
  try {
    await postAction(pendingAction.value, pendingEntity.value, promptData(actionInputFields.value, promptValues));
    closeInputDialog();
  } finally {
    submittingAction.value = false;
  }
}

async function postAction(action, entity = null, data = {}) {
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/execute`, {
      method: 'POST',
      body: {
        entityId: entity?._id || entity?.identity?.uid || null,
        entities: entity ? { [entity.origin?.type || entity.type || 'entity']: entity._id || entity.identity?.uid } : {},
        data
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await load();
  } catch (err) {
    showActionError(err);
  }
}

function initialPromptValue(field = {}) {
  const value = field.default ?? '';
  if (field.type === 'object' && value && typeof value !== 'string') return JSON.stringify(value, null, 2);
  return value;
}

async function loadPromptOptions(fields = []) {
  await Promise.all(fields
    .filter(field => field.type === 'entity')
    .map(async (field) => {
      const options = await entityOptions(field.entityType);
      promptOptions[field.id] = options;
      if (field.required && !options.length) {
        throw new Error(t('generatedScreen.noOptions', { field: field.label || field.id }));
      }
      if (field.required && !promptValues[field.id] && options[0]?.value) {
        promptValues[field.id] = options[0].value;
      }
    }));
}

async function entityOptions(entityType) {
  if (entityType === 'cassette') {
    const items = await $fetch('/api/cassettes');
    return items
      .filter(isConstructableCassetteTemplate)
      .map(entityOption);
  }
  return [];
}

function showActionError(err) {
  actionError.value = err?.data?.message || err?.message || t('generatedScreen.actionFailed');
  toast.add({
    severity: 'error',
    summary: t('common.error'),
    detail: actionError.value,
    life: 4000
  });
}

function isConstructableCassetteTemplate(template = {}) {
  if (template.data?.type === 'STANDARD') return true;
  const definition = template.data?.definition || {};
  return Boolean(definition.extensions?.cutkit?.graphTree);
}

function entityOption(entity = {}) {
  return {
    label: entity.identity?.name || entity.identity?.uid || entity._id,
    value: entity._id || entity.identity?.uid
  };
}

function collectActionInputFields(action = {}) {
  const policyFields = action.inputPolicy?.fields || [];
  const constructionFields = action.construction?.inputs || action.inputs || [];
  return [...policyFields, ...constructionFields]
    .filter((field, index, fields) => fields.findIndex(item => item.id === field.id) === index);
}

function promptedFields(action = {}) {
  return collectActionInputFields(action).filter(field => field?.prompt || field?.required);
}

function promptData(fields = [], values = {}) {
  const data = {};
  for (const field of fields) {
    const value = normalizePromptValue(field, values[field.id] ?? field.default);
    if (value === undefined || value === '') continue;
    setByPath(data, field.path || field.id, value);
  }
  return data;
}

function normalizePromptValue(field = {}, value) {
  if (field.type === 'number') return value === '' ? undefined : Number(value);
  if (field.type === 'object') {
    if (!value) return {};
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      return {};
    }
  }
  return value;
}

function setByPath(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}
</script>
