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
    <GeneratedRegion
      v-else-if="screen.template === 'entityDetail' && detailMainRegion"
      :region="detailMainRegion"
      :screen-key="screen.screenKey || screen.id"
      :source-state="sourceState(detailMainRegion.sourceId)"
      :template="screen.template"
      :screen-actions="screen.actions || []"
      @refresh="load"
      @execute-action="executeAction"
    >
      <GeneratedRegion
        v-for="region in detailChildRegions"
        :key="region.id"
        :region="region"
        :screen-key="screen.screenKey || screen.id"
        :source-state="sourceState(region.sourceId)"
        :template="screen.template"
        :screen-actions="[]"
        :action-context="detailActionContext"
        @refresh="load"
        @execute-action="executeAction"
      />
    </GeneratedRegion>
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
          <MultiSelect
            v-else-if="field.type === 'entityList'"
            v-model="promptValues[field.id]"
            :options="promptOptions[field.id] || []"
            option-label="label"
            option-value="value"
            display="chip"
            class="w-full"
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
import MultiSelect from 'primevue/multiselect';
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
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const toast = useToast();
const { t } = useI18n();
const domainUi = useCutkitDomainUi();
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
const detailMainRegion = computed(() => screen.value.regions.find(region => sourceState(region.sourceId).source?.mode === 'single') || screen.value.regions[0] || null);
const detailChildRegions = computed(() => screen.value.regions.filter(region => region !== detailMainRegion.value));
const detailActionContext = computed(() => {
  const state = detailMainRegion.value ? sourceState(detailMainRegion.value.sourceId) : null;
  return {
    parentEntity: state?.entity || null,
    parentEntityType: state?.source?.entityType || ''
  };
});
const actionInputFields = computed(() => collectActionInputFields(pendingAction.value));
const promptFields = computed(() => promptedFields(pendingAction.value));
const pendingActionLabel = computed(() => pendingAction.value?.label || t('common.create'));
const dialogSaveLabel = computed(() => pendingAction.value?.actionKind === 'createEntity' ? t('common.create') : t('common.save'));
const errorMessage = computed(() => error.value?.data?.message || error.value?.message || t('generatedScreen.loadFailed'));

async function executeAction(action, entity = null, context = {}) {
  actionError.value = '';
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    if (['createEntity', 'updateEntity'].includes(action.actionKind) && promptedFields(action).length) {
      await openInputDialog(action, entity, context);
      return;
    }
    await postAction(action, entity, promptData(collectActionInputFields(action), {}), context);
  } catch (err) {
    showActionError(err);
  }
}

async function openInputDialog(action, entity = null, context = {}) {
  pendingAction.value = action;
  pendingEntity.value = { entity, context };
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
    await postAction(
      pendingAction.value,
      pendingEntity.value?.entity || null,
      promptData(actionInputFields.value, promptValues),
      pendingEntity.value?.context || {}
    );
    closeInputDialog();
  } finally {
    submittingAction.value = false;
  }
}

async function postAction(action, entity = null, data = {}, context = {}) {
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/execute`, {
      method: 'POST',
      body: {
        entityId: entity?._id || entity?.identity?.uid || null,
        entities: actionEntities(action, entity, context),
        data
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await load();
  } catch (err) {
    showActionError(err);
  }
}

function actionEntities(action = {}, entity = null, context = {}) {
  const resolvedContext = context?.value || context || {};
  const entities = {};
  const entityId = entity?._id || entity?.identity?.uid || '';
  const entityType = entity?.origin?.type || entity?.type || resolvedContext?.entityType || '';
  if (entityId && entityType) entities[entityType] = entityId;
  const parentType = action.parentEntityType || action.inputs?.find(input => input.id === 'parent')?.entityType || '';
  const contextParentId = parentType && resolvedContext.parentEntityType === parentType
    ? entityIdentifier(resolvedContext.parentEntity)
    : '';
  const parentId = parentType
    ? contextParentId || screen.value.scope?.[`${parentType}Id`] || screen.value.scope?.entityId || resolveParentIdFromFilters(parentType, resolvedContext?.source?.filters)
    : '';
  if (parentType && parentId) entities[parentType] = parentId;
  return entities;
}

function entityIdentifier(entity = null) {
  return entity?._id || entity?.identity?.uid || entity?.id || '';
}

function resolveParentIdFromFilters(parentType = '', filters = {}) {
  const value = filters?.[`${parentType}Id`];
  if (typeof value === 'string' && value.startsWith('$screen.')) {
    return String(value).slice('$screen.'.length).split('.').filter(Boolean).reduce((item, key) => item?.[key], screen.value);
  }
  return value || '';
}

function initialPromptValue(field = {}) {
  if (field.type === 'entityList') return Array.isArray(field.default) ? field.default : [];
  const value = field.default ?? '';
  if (field.type === 'object' && value && typeof value !== 'string') return JSON.stringify(value, null, 2);
  return value;
}

async function loadPromptOptions(fields = []) {
  await Promise.all(fields
    .filter(field => ['entity', 'entityList'].includes(field.type))
    .map(async (field) => {
      const options = await entityOptions(field.entityType || field.accepts?.[0]);
      promptOptions[field.id] = options;
      if (field.required && !options.length) {
        throw new Error(t('generatedScreen.noOptions', { field: field.label || field.id }));
      }
      if (field.type !== 'entityList' && field.required && !promptValues[field.id] && options[0]?.value) {
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
  if (!entityType) return [];
  const items = await $fetch(domainUi.getListEndpoint(uiEntityType(entityType)));
  return (Array.isArray(items) ? items : items.items || items.data || [])
    .map(entity => entityOption(entity, entityType));
}

function uiEntityType(entityType = '') {
  if (domainUi.endpointMap?.[entityType]) return entityType;
  const camel = String(entityType).replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return domainUi.endpointMap?.[camel] ? camel : entityType;
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

function entityOption(entity = {}, entityType = '') {
  return {
    label: entity.identity?.name || entity.identity?.uid || entity._id,
    value: entity._id || entity.identity?.uid,
    entityType
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
  if (field.type === 'entityList') return normalizeEntityListValue(field, value);
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

function normalizeEntityListValue(field = {}, value = []) {
  const ids = Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  if (field.path === 'job.items' || field.accepts?.includes('cassette_design')) {
    return ids.map((id, index) => ({
      entryId: `${field.id || 'entry'}_${index + 1}`,
      cassetteDesignId: id,
      quantity: 1
    }));
  }
  return ids.map(id => ({ id }));
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
