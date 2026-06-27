<template>
  <StandardPage :title="pageTitle">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="error" state="error" :message="errorMessage" />
    <StateBlock v-else-if="actionError" state="error" :message="actionError" />
    <GeneratedHomeScreen
      v-else-if="screen.template === 'home'"
      :screen="screen"
      :source-state="sourceState"
      @refresh="load"
      @execute-action="executeAction"
    />
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
      :excluded-actions="detailChildActionIds"
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
        <label v-if="parentSelectionRequired" class="flex flex-col gap-1">
          <span class="text-xs text-muted-color">{{ parentSelectionLabel }}</span>
          <Select
            v-model="promptValues[parentSelectionFieldId]"
            :options="parentSelectionOptions"
            option-label="label"
            option-value="value"
          />
        </label>
        <label v-for="field in promptFields" :key="field.id" class="flex flex-col gap-1">
          <span class="text-xs text-muted-color">{{ field.label || field.id }}</span>
          <div
            v-if="field.type === 'cassetteParameters'"
            class="grid grid-cols-2 gap-2"
          >
            <label
              v-for="parameter in cassetteParameterFields(field)"
              :key="parameter.name"
              class="flex flex-col gap-1"
            >
              <span class="text-xs text-muted-color">{{ parameter.name }}</span>
              <InputText
                v-model="promptValues[field.id][parameter.name]"
                type="number"
              />
            </label>
          </div>
          <Textarea
            v-else-if="field.type === 'object'"
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
import { computed, provide, reactive, ref, toRef, watch } from 'vue';
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
import GeneratedHomeScreen from '~/components/generated/GeneratedHomeScreen.vue';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import { entityIdentifier, generatedActionRequiresParent, resolveGeneratedActionEntities } from '~/components/generated/action-context.js';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';
import { generatedActionLabel, generatedEntityLabel, generatedScreenLabel } from '~/utils/generated-labels.js';
import { entityKeyForDisplay } from '~/utils/entity-display-contract.js';
import { occsQueueParameters } from '~/utils/occs/parameters.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const toast = useToast();
const { t, te } = useI18n();
const domainUi = useCutkitDomainUi();
const screenRef = toRef(props, 'screen');
const { screen, sourceStates, loading, error, load, sourceState } = useGeneratedScreen(screenRef);
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
const detailChildActionIds = computed(() => [...new Set(detailChildRegions.value.flatMap(region => region.actions || []))]);
const detailActionContext = computed(() => {
  const state = detailMainRegion.value ? sourceState(detailMainRegion.value.sourceId) : null;
  return {
    parentEntity: state?.entity || null,
    parentEntityType: state?.source?.entityType || ''
  };
});
const actionInputFields = computed(() => collectActionInputFields(pendingAction.value));
const promptFields = computed(() => promptedFields(pendingAction.value));
const pendingActionLabel = computed(() => pendingAction.value ? generatedActionLabel(pendingAction.value, '', { t, te }) : t('common.confirm'));
const dialogSaveLabel = computed(() => pendingAction.value ? generatedActionLabel(pendingAction.value, '', { t, te }) : t('common.save'));
const errorMessage = computed(() => error.value?.data?.message || error.value?.message || t('generatedScreen.loadFailed'));
const parentSelectionFieldId = '__parentEntityId';
const parentSelectionType = computed(() => requiredParentType(pendingAction.value, pendingEntity.value?.entity, pendingEntity.value?.context));
const parentSelectionRequired = computed(() => Boolean(parentSelectionType.value));
const parentSelectionLabel = computed(() => parentSelectionType.value ? generatedEntityLabel(parentSelectionType.value, { t, te }) : '');
const parentSelectionOptions = computed(() => promptOptions[parentSelectionFieldId] || pendingEntity.value?.context?.parentOptions || []);
const screenTitle = computed(() => generatedScreenLabel(screen.value, { t, te }));
const pageTitle = computed(() => screen.value?.template === 'entityDetail' ? '' : screenTitle.value);
const entityContext = computed(() => {
  const entities = {};
  const lists = {};

  for (const state of Object.values(sourceStates.value || {})) {
    const sourceType = state?.source?.entityType;
    if (!sourceType) continue;
    const displayType = entityKeyForDisplay(sourceType);
    const types = Array.from(new Set([sourceType, displayType].filter(Boolean)));
    const stateItems = state.entity ? [state.entity] : (state.items || []);

    for (const type of types) {
      entities[type] ||= {};
      lists[type] ||= [];
      for (const item of stateItems) {
        const id = item?._id?.toString?.() || item?.id?.toString?.() || item?.identity?.uid || '';
        if (!id) continue;
        entities[type][id] = item;
        lists[type].push(item);
      }
    }
  }

  return { entities, lists };
});

provide('entityContext', entityContext);

async function executeAction(action, entity = null, context = {}) {
  actionError.value = '';
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    if (['createEntity', 'updateEntity'].includes(action.actionKind) && (promptedFields(action).length || requiredParentType(action, entity, context))) {
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
  const parentType = requiredParentType(action, entity, context);
  if (parentType) {
    const options = await loadParentSelectionOptions(parentType, context, action);
    if (!options.length) throw new Error(t('generatedScreen.noOptions', { field: parentType }));
    promptOptions[parentSelectionFieldId] = options;
    promptValues[parentSelectionFieldId] = options[0]?.value || '';
  }
  await loadPromptOptions(promptedFields(action));
  syncCassetteParameterValues(promptedFields(action));
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
      contextWithSelectedParent(pendingEntity.value?.context || {})
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
        data,
        parameters: context?.parameters || data?.parameters || {}
      }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 });
    await load();
  } catch (err) {
    showActionError(err);
  }
}

function actionEntities(action = {}, entity = null, context = {}) {
  return resolveGeneratedActionEntities({ action, entity, context, screen: screen.value });
}

function selectedTemplateIdForField(field = {}) {
  const templateFieldId = field.templateFieldId || 'templateId';
  return promptValues[templateFieldId] || promptValues[parentSelectionFieldId] || '';
}

function selectedTemplateForField(field = {}) {
  const templateId = selectedTemplateIdForField(field);
  const pending = pendingEntity.value?.entity;
  if (pending && (pending.origin?.type === 'cassette' || pendingEntity.value?.context?.entityType === 'cassette')) {
    const pendingId = entityIdentifier(pending);
    if (!templateId || pendingId?.toString() === templateId?.toString()) return pending;
  }
  if (!templateId) return null;
  const templateOptions = [
    ...(promptOptions[field.templateFieldId || 'templateId'] || []),
    ...(promptOptions[parentSelectionFieldId] || [])
  ];
  return templateOptions.find(option => option.value?.toString() === templateId?.toString())?.entity || null;
}

function cassetteParameterFields(field = {}) {
  const parameters = occsQueueParameters(cassetteParameterDefinition(selectedTemplateForField(field)));
  return Object.entries(parameters).map(([name]) => ({ name }));
}

function cassetteParameterDefinition(template = {}) {
  return template?.data?.definition || template?.data?.parameters || {};
}

function syncCassetteParameterValues(fields = promptedFields(pendingAction.value)) {
  for (const field of fields.filter(item => item.type === 'cassetteParameters')) {
    const parameters = occsQueueParameters(cassetteParameterDefinition(selectedTemplateForField(field)));
    const current = promptValues[field.id] && typeof promptValues[field.id] === 'object' && !Array.isArray(promptValues[field.id])
      ? promptValues[field.id]
      : {};
    const next = {};
    for (const [name, value] of Object.entries(parameters)) {
      next[name] = current[name] ?? value;
    }
    promptValues[field.id] = next;
  }
}

function requiredParentType(action = {}, entity = null, context = {}) {
  return generatedActionRequiresParent({ action, entity, context, screen: screen.value });
}

async function loadParentSelectionOptions(parentType = '', context = {}, action = {}) {
  const contextOptions = context?.parentEntityType === parentType && Array.isArray(context?.parentOptions) ? context.parentOptions : [];
  const options = contextOptions.length ? contextOptions : await entityOptions(parentType);
  return options.filter(option => !option.entity || actionAppliesToEntity(action, option.entity, parentType));
}

function contextWithSelectedParent(context = {}) {
  const parentType = requiredParentType(pendingAction.value, pendingEntity.value?.entity, context);
  if (!parentType) return context;
  const parentId = promptValues[parentSelectionFieldId];
  const selected = (promptOptions[parentSelectionFieldId] || []).find(option => option.value === parentId);
  return {
    ...context,
    parentEntityType: parentType,
    parentEntityId: parentId,
    parentEntity: selected?.entity || null
  };
}

function initialPromptValue(field = {}) {
  if (field.type === 'entityList') return Array.isArray(field.default) ? field.default : [];
  if (field.type === 'cassetteParameters') return field.default && typeof field.default === 'object' ? { ...field.default } : {};
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

function promptFieldHidden(field = {}, action = pendingAction.value) {
  if (!field) return false;
  const parentType = action?.parentEntityType || action?.inputs?.find(input => input.id === 'parent')?.entityType || '';
  return action?.actionKind === 'createEntity'
    && action?.entityType === 'cassette_design'
    && parentType === 'cassette'
    && field.id === 'templateId';
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
    entityType,
    entity
  };
}

function collectActionInputFields(action = {}) {
  const policyFields = action.inputPolicy?.fields || [];
  const constructionFields = action.construction?.inputs || action.inputs || [];
  return [...policyFields, ...constructionFields]
    .filter((field, index, fields) => fields.findIndex(item => item.id === field.id) === index);
}

function promptedFields(action = {}) {
  return collectActionInputFields(action)
    .filter(field => !promptFieldHidden(field, action))
    .filter(field => field?.prompt || field?.required);
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
  if (field.type === 'cassetteParameters') return normalizeCassetteParameters(value);
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

function normalizeCassetteParameters(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== '' && item !== null && item !== undefined)
    .map(([key, item]) => {
      const numeric = Number(item);
      return [key, Number.isFinite(numeric) ? numeric : item];
    }));
}

watch(
  () => [promptValues.templateId, promptValues[parentSelectionFieldId], pendingAction.value?.actionId || pendingAction.value?.id || ''],
  () => {
    if (!inputDialogVisible.value) return;
    syncCassetteParameterValues();
  }
);

function normalizeEntityListValue(field = {}, value = []) {
  const ids = Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  if (field.path === 'job.items' || field.accepts?.includes('cassette_design')) {
    return ids.map((id, index) => ({
      entryId: `${field.id || 'entry'}_${index + 1}`,
      id,
      entityType: 'cassette_design',
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
