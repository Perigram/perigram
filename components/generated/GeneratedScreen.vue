<template>
  <StandardPage :title="pageTitle" :workspace="Boolean(screenOverload)">
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="error" state="error" :message="errorMessage" />
    <StateBlock v-else-if="actionError" state="error" :message="actionError" />
    <component
      :is="screenOverload.component"
      v-else-if="screenOverload"
      :screen="screen"
      :source-state="sourceState"
      :screen-actions="screen.actions || []"
      @refresh="load"
      @execute-action="executeAction"
    />
    <GeneratedOrganizationAccount
      v-else-if="screen.template === 'organizationAccount'"
      :screen="screen"
    />
    <GeneratedOrganizationOverview
      v-else-if="screen.template === 'organizationOverview'"
      :screen="screen"
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
      :body-actions="detailChildActionIds"
      :suppress-child-summaries="detailChildRegions.length > 0"
      :trace-exclusions="detailTraceExclusions"
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
        <div v-for="field in promptFields" :key="field.id" class="flex flex-col gap-1">
          <span v-if="!(relationCreatorMode && field.creator?.actionId)" class="text-muted-color text-supporting">{{ field.label || field.id }}</span>
          <div
            v-if="field.type === 'cassetteParameters'"
            class="grid grid-cols-2 gap-2"
          >
            <label
              v-for="parameter in cassetteParameterFields(field)"
              :key="parameter.name"
              class="flex flex-col gap-1"
            >
              <span class="text-muted-color text-supporting">{{ parameter.name }}</span>
              <InputText
                v-model="promptValues[field.id][parameter.name]"
                type="number"
              />
            </label>
          </div>
          <div
            v-else-if="field.editor === 'artifactTemplateValues'"
            class="grid grid-cols-2 gap-2"
          >
            <label
              v-for="variable in artifactTemplateVariableFields(field)"
              :key="variable.name"
              class="flex flex-col gap-1"
            >
              <span class="text-muted-color text-supporting">{{ variable.name }}</span>
              <Select
                v-if="variable.type === 'boolean'"
                v-model="promptValues[field.id][variable.name]"
                :options="booleanOptions"
                option-label="label"
                option-value="value"
              />
              <InputText
                v-else
                v-model="promptValues[field.id][variable.name]"
                :type="variable.type === 'number' ? 'number' : 'text'"
              />
            </label>
          </div>
          <GeneratedObjectInput
            v-else-if="field.type === 'object' || field.type === 'json'"
            v-model="promptValues[field.id]"
            :schema="field.schema || null"
          />
          <ToggleSwitch
            v-else-if="field.type === 'boolean'"
            v-model="promptValues[field.id]"
          />
          <DatePicker
            v-else-if="field.type === 'date' || field.type === 'dateTime'"
            v-model="promptValues[field.id]"
            :show-time="field.type === 'dateTime'"
            hour-format="24"
            class="w-full"
          />
          <div v-else-if="field.type === 'entity'" class="flex flex-col gap-2">
            <Select
              v-if="!relationCreatorMode"
              v-model="promptValues[field.id]"
              :options="promptOptions[field.id] || []"
              option-label="label"
              option-value="value"
              :entity-type="field.entityType || field.accepts?.[0] || ''"
              class="w-full"
            />
            <Button
              v-if="hasUploadCreator(field)"
              icon="pi pi-upload"
              :label="$t('generatedScreen.createArtifact')"
              size="small"
              severity="secondary"
              outlined
              class="self-start"
              @click="openArtifactCreator(field)"
            />
            <Button
              v-if="field.creator?.actionId"
              icon="pi pi-plus"
              :label="relationCreatorMode ? $t('generatedScreen.selectExisting') : $t('generatedScreen.createRelatedEntity')"
              size="small"
              severity="secondary"
              outlined
              class="self-start"
              @click="toggleRelationCreator(field)"
            />
            <div v-if="relationCreatorMode && field.creator?.actionId" class="flex flex-col gap-3">
              <label v-for="creatorField in relationCreatorFields" :key="creatorField.id" class="flex flex-col gap-1">
                <span class="text-muted-color text-supporting">{{ creatorField.label || creatorField.id }}</span>
                <Select
                  v-if="creatorField.type === 'entity'"
                  v-model="relationCreatorValues[creatorField.id]"
                  :options="relationCreatorOptions[creatorField.id] || []"
                  option-label="label"
                  option-value="value"
                  :entity-type="creatorField.entityType || ''"
                  @update:model-value="syncRelationCreatorParameters"
                />
                <div v-else-if="creatorField.type === 'cassetteParameters'" class="grid grid-cols-2 gap-2">
                  <label v-for="parameter in relationCreatorParameterFields(creatorField)" :key="parameter.name" class="flex flex-col gap-1">
                    <span class="text-muted-color text-supporting">{{ parameter.name }}</span>
                    <InputText v-model="relationCreatorValues[creatorField.id][parameter.name]" type="number" />
                  </label>
                </div>
                <InputText v-else v-model="relationCreatorValues[creatorField.id]" :type="creatorField.type === 'number' ? 'number' : 'text'" />
              </label>
            </div>
          </div>
          <Select
            v-else-if="field.type === 'enum'"
            v-model="promptValues[field.id]"
            :options="fieldOptions(field)"
          />
          <MultiSelect
            v-else-if="field.type === 'entityList'"
            v-model="promptValues[field.id]"
            :options="promptOptions[field.id] || []"
            option-label="label"
            option-value="value"
            :entity-type="field.entityType || field.accepts?.[0] || ''"
            display="chip"
            class="w-full"
          />
          <InputText
            v-else
            v-model="promptValues[field.id]"
            :type="field.type === 'number' ? 'number' : 'text'"
          />
        </div>
      </div>
    </StandardDialog>
    <GeneratedArtifactCreator
      v-if="artifactCreatorField"
      v-model="artifactCreatorVisible"
      :creator="artifactCreatorField.creator"
      :lineage="artifactCreatorLineage"
      @created="selectCreatedArtifact"
    />
  </StandardPage>
</template>

<script setup>
import { computed, reactive, ref, toRef, watch } from 'vue';
import Button from 'primevue/button';
import DatePicker from 'primevue/datepicker';
import InputText from 'primevue/inputtext';
import MultiSelect from '~/components/shared/EntityMultiSelect.vue';
import Select from '~/components/shared/EntitySelect.vue';
import ToggleSwitch from 'primevue/toggleswitch';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import WorkspaceLanes from '~/components/shared/WorkspaceLanes.vue';
import GeneratedOrganizationAccount from '~/components/generated/GeneratedOrganizationAccount.vue';
import GeneratedOrganizationOverview from '~/components/generated/GeneratedOrganizationOverview.vue';
import GeneratedRegion from '~/components/generated/GeneratedRegion.vue';
import GeneratedArtifactCreator from '~/components/generated/GeneratedArtifactCreator.vue';
import GeneratedObjectInput from '~/components/generated/GeneratedObjectInput.vue';
import { entityIdentifier, resolveGeneratedActionEntities } from '~/components/generated/action-context.js';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { useAuthStore } from '~/stores/auth';
import { actionAppliesToEntity } from '~/components/generated/action-visibility.js';
import { detailRouteForEntity } from '~/components/generated/entity-detail-routing.js';
import { generatedActionLabel, generatedScreenLabel } from '~/utils/generated-labels.js';
import { occsQueueParameters } from '~/utils/occs/parameters.js';
import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js';
import { routeContextTraceExclusions } from '~/utils/entity-hierarchy.js';
import {
  artifactCreatorForAction,
  collectActionInputFields,
  hasUploadCreator,
  initialPromptValue,
  promptData,
  promptedFields
} from '~/components/generated/action-inputs.js';

const props = defineProps({
  screen: { type: Object, required: true }
});

const toast = useToast();
const confirm = useConfirm();
const { t, te } = useI18n();
const authStore = useAuthStore();
const route = useRoute();
const domainUi = useCutkitDomainUi();
const screenRef = toRef(props, 'screen');
const { screen, loading, error, load, applyEntitySnapshot, sourceState } = useGeneratedScreen(screenRef);
const inputDialogVisible = ref(false);
const submittingAction = ref(false);
const pendingAction = ref(null);
const pendingEntity = ref(null);
const actionError = ref('');
const promptValues = reactive({});
const promptOptions = reactive({});
const artifactCreatorVisible = ref(false);
const artifactCreatorField = ref(null);
const relationCreatorMode = ref(false);
const relationCreatorValues = reactive({});
const relationCreatorOptions = reactive({});

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
const detailTraceExclusions = computed(() => {
  const state = detailMainRegion.value ? sourceState(detailMainRegion.value.sourceId) : null;
  return routeContextTraceExclusions(
    state?.entity || {},
    state?.source?.entityType || '',
    (authStore.lineageBindings || []).map(binding => ({
      parentType: binding.ancestorEntityType,
      childType: binding.childEntityType,
      lineageKey: binding.lineageKey
    })),
    route.query
  );
});
const actionInputFields = computed(() => collectActionInputFields(pendingAction.value));
const promptFields = computed(() => promptedFields(pendingAction.value));
const relationCreatorFields = computed(() => pendingAction.value?.relationMutation?.creator?.inputPolicy?.fields
  ?.filter(field => field.prompt) || []);
const pendingActionLabel = computed(() => pendingAction.value ? generatedActionLabel(pendingAction.value, '', { t, te }) : t('common.confirm'));
const dialogSaveLabel = computed(() => pendingAction.value
  ? generatedActionLabel(pendingAction.value, '', { t, te })
  : t('common.save'));
const errorMessage = computed(() => error.value?.data?.message || error.value?.message || t('generatedScreen.loadFailed'));
const screenTitle = computed(() => generatedScreenLabel(screen.value, { t, te }));
// Workspace overloads (project IDE, home shell) own the whole viewport; they
// render no outer page title.
const pageTitle = computed(() => screenOverload.value || screen.value?.template === 'entityDetail' ? '' : screenTitle.value);
const screenOverload = computed(() => resolveGeneratedScreenOverload(screen.value));
const booleanOptions = computed(() => [
  { label: t('common.yes'), value: true },
  { label: t('common.no'), value: false }
]);

async function executeAction(action, entity = null, context = {}) {
  actionError.value = '';
  const actionId = action?.actionId || action?.id;
  if (!actionId) return;
  try {
    if (action.actionKind === 'deleteEntity') {
      confirm.require({
        message: t('messages.confirmDelete'),
        header: t('common.confirmation'),
        icon: 'pi pi-exclamation-triangle',
        accept: () => postAction(action, entity, context.data || {}, context)
      });
      return;
    }
    const artifactCreator = artifactCreatorForAction(action);
    if (artifactCreator) {
      pendingAction.value = action;
      pendingEntity.value = { entity, context };
      artifactCreatorField.value = { id: 'artifact', creator: artifactCreator };
      artifactCreatorVisible.value = true;
      return;
    }
    if (['createEntity', 'updateEntity', 'runCommand'].includes(action.actionKind) && promptedFields(action).length) {
      await openInputDialog(action, entity, context);
      return;
    }
    await postAction(action, entity, context.data || promptData(collectActionInputFields(action), {}), context);
  } catch (err) {
    showActionError(err);
  }
}

async function openInputDialog(action, entity = null, context = {}) {
  pendingAction.value = action;
  pendingEntity.value = { entity, context };
  for (const key of Object.keys(promptValues)) delete promptValues[key];
  for (const key of Object.keys(promptOptions)) delete promptOptions[key];
  relationCreatorMode.value = false;
  for (const key of Object.keys(relationCreatorValues)) delete relationCreatorValues[key];
  for (const key of Object.keys(relationCreatorOptions)) delete relationCreatorOptions[key];
  const fields = collectActionInputFields(action);
  for (const field of fields) {
    promptValues[field.id] = initialPromptValue(field);
  }
  await loadPromptOptions(promptedFields(action));
  syncDependentOptionValues(fields);
  syncCassetteParameterValues(promptedFields(action));
  syncArtifactTemplateValues(promptedFields(action));
  inputDialogVisible.value = true;
}

function closeInputDialog() {
  inputDialogVisible.value = false;
  pendingAction.value = null;
  pendingEntity.value = null;
}

function openArtifactCreator(field = {}) {
  artifactCreatorField.value = field;
  artifactCreatorVisible.value = true;
}

const artifactCreatorLineage = computed(() => {
  const owner = pendingEntity.value?.entity || {};
  const ownerType = pendingEntity.value?.context?.entityType || pendingAction.value?.entityType || '';
  const ownerId = entityIdentifier(owner);
  return {
    ...(owner.lineage || {}),
    ...(ownerType && ownerId ? { [`${camelEntityType(ownerType)}Id`]: ownerId } : {})
  };
});

function selectCreatedArtifact(artifact = {}) {
  const field = artifactCreatorField.value;
  const id = entityIdentifier(artifact);
  if (!field || !id) return;
  if (pendingAction.value?.entityType && pendingAction.value.entityType === field.creator?.entityType) {
    artifactCreatorField.value = null;
    pendingAction.value = null;
    pendingEntity.value = null;
    return;
  }
  promptOptions[field.id] = [...(promptOptions[field.id] || []), entityOption(artifact, 'artifact')];
  promptValues[field.id] = id;
}

function camelEntityType(entityType = '') {
  return String(entityType).replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
}

async function submitPromptedAction() {
  if (!pendingAction.value) return;
  submittingAction.value = true;
  try {
    const data = relationCreatorMode.value
      ? { relationCreator: promptData(relationCreatorFields.value, relationCreatorValues) }
      : promptData(actionInputFields.value, promptValues);
    await postAction(
      pendingAction.value,
      pendingEntity.value?.entity || null,
      data,
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
    const result = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/execute`, {
      method: 'POST',
      body: {
        entityId: entity?._id || entity?.identity?.uid || null,
        entities: { ...actionEntities(action, entity, context), ...(data?.entities || {}) },
        data,
        parameters: { ...(context?.parameters || {}), ...(data?.parameters || {}) }
      }
    });
    if (action.actionKind === 'deleteEntity') await load();
    else applyActionResult(action, result);
    await openCreatedEntity(action, result);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 });
  } catch (err) {
    showActionError(err);
  }
}

function applyActionResult(action = {}, result = null) {
  if (!result || typeof result !== 'object') return;
  const mapped = mappedMutationItems(result);
  if (mapped) {
    for (const entity of mapped) applyEntitySnapshot(action.entityType, entity?.entity || entity);
    return;
  }
  if (action.actionKind === 'runCommand') {
    for (const output of result.entities || []) {
      if (output?.entity) applyEntitySnapshot(output.type, output.entity);
    }
    return;
  }
  if (result.owner) applyEntitySnapshot(action.entityType, result.owner);
  if (result.created) {
    for (const entity of mappedMutationItems(result.created) || [result.created]) {
      applyEntitySnapshot(action.relationMutation?.targetType || action.entityType, entity);
    }
  }
  if (!result.owner && !result.created) {
    applyEntitySnapshot(action.entityType, result.entity || result);
  }
}

// A mapped mutation response is either a bare shape-preserving data tree
// (zero failures) or a failure-carrying `{ result, failures, ... }` envelope.
// Failed slots hold their MutationFailure record, so only items without an
// `error` payload are completed entity snapshots.
function mappedMutationItems(result) {
  const tree = Array.isArray(result?.branches) ? result : result?.result;
  if (!Array.isArray(tree?.branches)) return null;
  return tree.branches.flatMap(branch => branch.items || []).filter(item => item && !item.error);
}

async function openCreatedEntity(action = {}, result = null) {
  if (action.actionKind !== 'createEntity' || !result || typeof result !== 'object') return;
  const mapped = mappedMutationItems(result);
  const entity = mapped
    ? (mapped.length === 1 ? mapped[0] : null)
    : result.created || (!result.owner ? (result.entity || result) : null);
  const entityType = action.relationMutation?.targetType || action.entityType;
  const route = detailRouteForEntity({
    entity,
    entityType,
    screenKey: screen.value.screenKey || screen.value.id,
    manifest: authStore.screenManifest
  });
  if (route) await navigateTo(route);
}

function actionEntities(action = {}, entity = null, context = {}) {
  return resolveGeneratedActionEntities({ action, entity, context, screen: screen.value });
}

function selectedTemplateIdForField(field = {}) {
  const templateFieldId = field.templateFieldId || 'templateId';
  return promptValues[templateFieldId] || '';
}

function selectedTemplateForField(field = {}) {
  const templateId = selectedTemplateIdForField(field);
  const pending = pendingEntity.value?.entity;
  const templateEntityType = field.templateEntityType || field.entityType || '';
  if (pending && templateEntityType && (
    pending.origin?.type === templateEntityType
    || pendingEntity.value?.context?.entityType === templateEntityType
  )) {
    const pendingId = entityIdentifier(pending);
    if (!templateId || pendingId?.toString() === templateId?.toString()) return pending;
  }
  if (!templateId) return null;
  const templateOptions = promptOptions[field.templateFieldId || 'templateId'] || [];
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

function fieldOptions(field = {}) {
  const options = field.options || [];
  const sourceFieldId = field.optionsFromEntity;
  if (!sourceFieldId) return options;
  const sourceId = promptValues[sourceFieldId];
  const source = sourceId
    ? (promptOptions[sourceFieldId] || []).find(option => String(option.value) === String(sourceId))?.entity
    : pendingEntity.value?.entity;
  const sourceKind = source?.data?.type;
  if (!sourceKind) return options;
  return options.filter(option => !option.sourceKinds || option.sourceKinds.includes(sourceKind));
}

function syncDependentOptionValues(fields = []) {
  for (const field of fields.filter(field => field.type === 'enum' && field.optionsFromEntity)) {
    const options = fieldOptions(field);
    if (!options.some(option => option.value === promptValues[field.id])) {
      promptValues[field.id] = options[0]?.value || '';
    }
  }
}

function artifactTemplateVariableFields(field = {}) {
  const templateId = promptValues[field.templateFieldId || 'template'];
  const option = (promptOptions[field.templateFieldId || 'template'] || [])
    .find(item => String(item.value) === String(templateId));
  return option?.entity?.data?.variables || [];
}

function syncArtifactTemplateValues(fields = promptedFields(pendingAction.value)) {
  for (const field of fields.filter(item => item.editor === 'artifactTemplateValues')) {
    const templateFieldId = field.templateFieldId || 'template';
    const templateId = promptValues[templateFieldId];
    const template = (promptOptions[templateFieldId] || [])
      .find(item => String(item.value) === String(templateId))?.entity;
    if (template?.data?.format === 'PDF') promptValues.kind = 'PDF_PASSPORT';
    if (template?.data?.format === 'DXF') promptValues.kind = 'LAYOUT_DXF';
    const current = promptValues[field.id] && typeof promptValues[field.id] === 'object' && !Array.isArray(promptValues[field.id])
      ? promptValues[field.id]
      : {};
    promptValues[field.id] = Object.fromEntries(artifactTemplateVariableFields(field).map(variable => [
      variable.name,
      current[variable.name] ?? variable.default ?? ''
    ]));
  }
}

async function loadPromptOptions(fields = []) {
  await Promise.all(fields
    .filter(field => ['entity', 'entityList'].includes(field.type))
    .map(async (field) => {
      const options = await entityOptions(field.entityType || field.accepts?.[0], field).catch(() => []);
      promptOptions[field.id] = options;
    }));
}

async function entityOptions(entityType, field = {}) {
  if (field.relationKey && pendingAction.value?.relationMutation?.operation === 'link') {
    const actionId = pendingAction.value.actionId || pendingAction.value.id;
    const ownerId = entityIdentifier(pendingEntity.value?.entity);
    const items = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/options`, {
      query: { entityId: ownerId }
    });
    return (items || []).map(entity => entityOption(entity, entityType));
  }
  if (!entityType) return [];
  const items = await $fetch(domainUi.getListEndpoint(uiEntityType(entityType)));
  const constructable = domainUi.construction[entityType]?.isConstructable;
  return (Array.isArray(items) ? items : items.items || items.data || [])
    .filter(constructable || (entity => true))
    .filter(entity => !field.attachmentKinds?.length || field.attachmentKinds.includes(entity.data?.type))
    .map(entity => entityOption(entity, entityType));
}

async function toggleRelationCreator(field = {}) {
  relationCreatorMode.value = !relationCreatorMode.value;
  if (!relationCreatorMode.value) return;
  for (const creatorField of relationCreatorFields.value) {
    relationCreatorValues[creatorField.id] = initialPromptValue(creatorField);
  }
  const actionId = pendingAction.value?.actionId || pendingAction.value?.id;
  const ownerId = entityIdentifier(pendingEntity.value?.entity);
  for (const creatorField of relationCreatorFields.value.filter(item => item.type === 'entity')) {
    const items = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/options`, {
      query: { entityId: ownerId, source: 'creator' }
    });
    relationCreatorOptions[creatorField.id] = (items || []).map(entity => entityOption(entity, creatorField.entityType));
  }
  syncRelationCreatorParameters();
}

function relationCreatorParameterFields(field = {}) {
  const templateId = relationCreatorValues[field.templateFieldId || 'templateId'];
  const template = (relationCreatorOptions[field.templateFieldId || 'templateId'] || [])
    .find(item => String(item.value) === String(templateId))?.entity;
  return Object.keys(occsQueueParameters(cassetteParameterDefinition(template))).map(name => ({ name }));
}

function syncRelationCreatorParameters() {
  for (const field of relationCreatorFields.value.filter(item => item.type === 'cassetteParameters')) {
    const templateId = relationCreatorValues[field.templateFieldId || 'templateId'];
    const template = (relationCreatorOptions[field.templateFieldId || 'templateId'] || [])
      .find(item => String(item.value) === String(templateId))?.entity;
    relationCreatorValues[field.id] = { ...occsQueueParameters(cassetteParameterDefinition(template)) };
  }
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

function entityOption(entity = {}, entityType = '') {
  return {
    label: entity.identity?.name || entity.identity?.uid || entity._id,
    value: entity._id || entity.identity?.uid,
    entityType,
    entity
  };
}

watch(
  () => [promptValues.templateId, pendingAction.value?.actionId || pendingAction.value?.id || ''],
  () => {
    if (!inputDialogVisible.value) return;
    syncCassetteParameterValues();
  }
);

watch(
  () => [promptValues.template, pendingAction.value?.actionId || pendingAction.value?.id || ''],
  () => {
    if (!inputDialogVisible.value) return;
    syncArtifactTemplateValues();
  }
);

</script>
