<template>
  <!-- The overview owns its page head: the organization's identity and
       management actions render through its own StandardPage. -->
  <GeneratedOrganizationOverview
    v-if="isOverviewScreen && !loading && !error && !actionError"
    :screen="screen"
    :back="back"
  />
  <StandardPage v-else :title="pageTitle" :workspace="Boolean(screenOverload)" :back="back">
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
    <StateBlock v-else :message="$t('generatedScreen.notFound')" icon="pi pi-exclamation-triangle" />
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
          <span v-if="!(relationCreatorMode && field.creator?.actionId)" class="text-muted text-supporting">{{ field.label || field.id }}</span>
          <div
            v-if="field.type === 'cassetteParameters'"
            class="grid grid-cols-2 gap-2"
          >
            <label
              v-for="parameter in parameterEntries(promptValues[field.id])"
              :key="parameter.name"
              class="flex flex-col gap-1"
            >
              <span class="text-muted text-supporting">{{ parameter.name }}</span>
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
              <span class="text-muted text-supporting">{{ variable.name }}</span>
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
          <div v-else-if="field.type === 'file'" class="flex items-center gap-2">
            <input
              :ref="el => setPayloadInputEl(field.id, el)"
              class="hidden"
              type="file"
              :accept="field.accept || undefined"
              :capture="field.capture || undefined"
              @change="event => uploadPayloadFile(field, event)"
            >
            <Button
              icon="pi pi-upload"
              :label="$t('common.upload')"
              size="small"
              severity="secondary"
              outlined
              :loading="uploadingPayloadField === field.id"
              @click="payloadInputEl(field.id)?.click()"
            />
            <span v-if="promptValues[field.id]?.name" class="text-muted text-supporting truncate">{{ promptValues[field.id].name }}</span>
          </div>
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
              :type-id="field.typeId || field.accepts?.[0] || ''"
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
                <span class="text-muted text-supporting">{{ creatorField.label || creatorField.id }}</span>
                <Select
                  v-if="creatorField.type === 'entity'"
                  v-model="relationCreatorValues[creatorField.id]"
                  :options="relationCreatorOptions[creatorField.id] || []"
                  option-label="label"
                  option-value="value"
                  :type-id="creatorField.typeId || ''"
                />
                <div v-else-if="creatorField.type === 'cassetteParameters'" class="grid grid-cols-2 gap-2">
                  <label v-for="parameter in parameterEntries(relationCreatorValues[creatorField.id])" :key="parameter.name" class="flex flex-col gap-1">
                    <span class="text-muted text-supporting">{{ parameter.name }}</span>
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
            v-else-if="field.type === 'typeList'"
            v-model="promptValues[field.id]"
            :options="promptOptions[field.id] || []"
            option-label="label"
            option-value="value"
            :type-id="field.typeId || field.accepts?.[0] || ''"
            display="chip"
            class="w-full"
          />
          <Textarea
            v-else-if="field.control === 'Textarea'"
            v-model="promptValues[field.id]"
            autoResize
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
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import Select from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useI18n } from 'vue-i18n';
import { isOfflineQueuedError } from '~/utils/outbox.js';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import GeneratedOrganizationAccount from '~/components/generated/GeneratedOrganizationAccount.vue';
import GeneratedOrganizationOverview from '~/components/generated/GeneratedOrganizationOverview.vue';
import GeneratedArtifactCreator from '~/components/generated/GeneratedArtifactCreator.vue';
import GeneratedObjectInput from '~/components/generated/GeneratedObjectInput.vue';
import { instanceIdentifier, isContextBoundInput, resolveGeneratedActionEntities } from '~/components/generated/action-context.js';
import { useGeneratedScreen } from '~/composables/useGeneratedScreen.js';
import { usePayloadUpload } from '~/composables/usePayloadUpload.js';
import { useInstancesStore } from '~/stores/instances';
import { useAuthStore } from '~/stores/auth';
import { actionAppliesToEntity, isCreateAction, isDeleteAction, isUpdateAction } from '~/utils/action-visibility.js';
import { withinRelationDomain } from '#shared/relation-domain.js';
import { isEditorProtocolCreate, resolveCreatedInstanceOpen } from '~/components/generated/created-instance-open.js';
import { openBlankFileEditor } from '~/components/generated/file-surfaces.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { generatedActionLabel, generatedScreenLabel } from '~/utils/generated-labels.js';
import { resolveGeneratedScreenOverload } from '~/components/generated/overloads.js';
import {
  artifactCreatorForAction,
  collectActionInputFields,
  hasUploadCreator,
  initialPromptValue,
  promptData,
  promptedFields
} from '~/components/generated/action-inputs.js';

const props = defineProps({
  screen: { type: Object, required: true },
  // Routed-surface back control (`{ icon, label, command }`): hosts
  // that render this screen as a standalone route pass the shared
  // usePageBack affordance; pane hosts leave it unset.
  back: { type: Object, default: null }
});

const toast = useToast();
const confirm = useConfirm();
const { t, te } = useI18n();
const authStore = useAuthStore();
const instances = useInstancesStore();
const screenRef = toRef(props, 'screen');
const { screen, loading, error, load, applyInstanceSnapshot, sourceState } = useGeneratedScreen(screenRef);
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

// Payload creation protocol (SPEC §4): the `file` prompt control uploads
// to the files bucket and submits the payload reference — shared with
// ChatSupport through usePayloadUpload so both create file instances
// through the same control.
const { uploadingPayloadField, setPayloadInputEl, payloadInputEl, uploadPayloadFile, pendingPayloadUpload } = usePayloadUpload(
  promptValues,
  { onError: error => toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 8000 }) }
);

const actionInputFields = computed(() => collectActionInputFields(pendingAction.value));
// Launch-context bindings (SPEC §UI): a lineage/relation input whose
// reference the context already carries never prompts — the entities
// channel submits it.
function visiblePromptFields(action = null, entity = null, context = {}) {
  if (!action) return [];
  const bound = new Set(Object.keys(actionEntities(action, entity, context)));
  return promptedFields(action).filter(field => !isContextBoundInput(field, bound));
}
const promptFields = computed(() => visiblePromptFields(
  pendingAction.value,
  pendingEntity.value?.entity || null,
  pendingEntity.value?.context || {}
));
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
const pageTitle = computed(() => screenOverload.value || screen.value?.template === 'instanceDetail' ? '' : screenTitle.value);
const isOverviewScreen = computed(() => screen.value?.template === 'organizationOverview');
const screenOverload = computed(() => resolveGeneratedScreenOverload(screen.value));
const booleanOptions = computed(() => [
  { label: t('common.yes'), value: true },
  { label: t('common.no'), value: false }
]);

async function executeAction(action, entity = null, context = {}) {
  actionError.value = '';
  const actionId = action?.id;
  if (!actionId) return;
  try {
    if (isDeleteAction(action)) {
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
    // Unscoped editor creates defer to the editor (SPEC §UI): the blank
    // page opens and the first save creates the record. A context-bound
    // create keeps the construct — its binding rides the run.
    if (isCreateAction(action) && isEditorProtocolCreate(action)
      && !visiblePromptFields(action, entity, context).length
      && openBlankFileEditor(action.typeId)) {
      return;
    }
    if ((isCreateAction(action) || isUpdateAction(action) || action.actionKind === 'runCommand') && visiblePromptFields(action, entity, context).length) {
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
  await loadPromptOptions(visiblePromptFields(action, entity, context));
  syncDependentOptionValues(fields);
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
  const ownerType = pendingEntity.value?.context?.typeId || pendingAction.value?.typeId || '';
  const ownerId = instanceIdentifier(owner);
  return {
    ...(owner.lineage || {}),
    ...(ownerType && ownerId ? { [`${camelTypeId(ownerType)}Id`]: ownerId } : {})
  };
});

function selectCreatedArtifact(artifact = {}) {
  const field = artifactCreatorField.value;
  const id = instanceIdentifier(artifact);
  if (!field || !id) return;
  if (pendingAction.value?.typeId && pendingAction.value.typeId === field.creator?.typeId) {
    artifactCreatorField.value = null;
    pendingAction.value = null;
    pendingEntity.value = null;
    return;
  }
  promptOptions[field.id] = [...(promptOptions[field.id] || []), entityOption(artifact, 'artifact')];
  promptValues[field.id] = id;
}

function camelTypeId(typeId = '') {
  return String(typeId).replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
}

async function submitPromptedAction() {
  if (!pendingAction.value) return;
  submittingAction.value = true;
  try {
    // A selected payload file finishes uploading before the create
    // posts — the submission awaits the reference it must carry.
    await pendingPayloadUpload();
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
  const actionId = action?.id;
  if (!actionId) return;
  try {
    const result = await instances.runAction({
      action,
      actionId,
      instanceId: entity?._id || entity?.id || null,
      entities: { ...actionEntities(action, entity, context), ...(data?.entities || {}) },
      data,
      parameters: { ...(context?.parameters || {}), ...(data?.parameters || {}) }
    });
    if (isDeleteAction(action)) await load();
    else applyActionResult(action, result);
    await openCreatedEntity(action, result);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('generatedScreen.actionCompleted'), life: 2000 });
  } catch (err) {
    if (isOfflineQueuedError(err)) {
      toast.add({ severity: 'info', summary: t('outbox.queuedTitle'), detail: t('outbox.queuedNotice'), life: 4000 });
      return;
    }
    showActionError(err);
  }
}

function applyActionResult(action = {}, result = null) {
  if (!result || typeof result !== 'object') return;
  const mapped = mappedMutationItems(result);
  if (mapped) {
    for (const entity of mapped) applyInstanceSnapshot(action.typeId, entity?.entity || entity);
    return;
  }
  if (action.actionKind === 'runCommand') {
    for (const output of result.entities || []) {
      if (output?.entity) applyInstanceSnapshot(output.type, output.entity);
    }
    return;
  }
  if (result.owner) applyInstanceSnapshot(action.typeId, result.owner);
  if (result.created) {
    for (const entity of mappedMutationItems(result.created) || [result.created]) {
      applyInstanceSnapshot([].concat(action.relationMutation?.targetTypes || [])[0] || action.typeId, entity);
    }
  }
  if (!result.owner && !result.created) {
    applyInstanceSnapshot(action.typeId, result.entity || result);
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
  if (!isCreateAction(action)) return;
  const target = resolveCreatedInstanceOpen({
    action,
    result,
    screenKey: screen.value.screenKey || screen.value.id,
    manifest: authStore.screenManifest
  });
  if (!target) return;
  if (target.kind === 'route') {
    await navigateTo(target.route);
    return;
  }
  // Editor protocol without a compiled route: the blank instance opens
  // in the home workspace, whose pane body mounts the type's editor
  // surface. A create is never silent — the toast carries the name even
  // when the workspace opens the editor.
  toast.add({ severity: 'success', summary: t('common.created'), detail: target.name || target.typeId, life: 4000 });
  if (target.kind === 'workspace') {
    openInstanceInWorkspace({ typeId: target.typeId, instanceId: target.instanceId, editor: target.editor === true });
  }
}

function actionEntities(action = {}, entity = null, context = {}) {
  return resolveGeneratedActionEntities({ action, entity, context, screen: screen.value });
}

// A cassetteParameters input edits its declared entries: the authored
// input's default object names the parameters; the values stay numbers
// when numeric (the construction services receive them as quantities).
function parameterEntries(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([name]) => ({ name }));
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
    .filter(field => ['entity', 'typeList'].includes(field.type))
    .map(async (field) => {
      // A multi-target relation input offers every accepted type's
      // instances — the first accept is a fallback for single-typed
      // inputs, never a filter for union-typed ones.
      const typeIds = field.typeId
        ? [field.typeId]
        : (Array.isArray(field.accepts) && field.accepts.length ? field.accepts : [field.accepts?.[0]].filter(Boolean));
      const options = (await Promise.all(typeIds.map(typeId => entityOptions(typeId, field).catch(() => []))))
        .flat();
      promptOptions[field.id] = options;
    }));
}

async function entityOptions(typeId, field = {}) {
  if (field.relationKey && pendingAction.value?.relationMutation?.operation === 'link') {
    const actionId = pendingAction.value.actionId || pendingAction.value.id;
    const ownerId = instanceIdentifier(pendingEntity.value?.entity);
    const items = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/options`, {
      query: { instanceId: ownerId }
    });
    return (items || []).map(entity => entityOption(entity, typeId));
  }
  if (!typeId) return [];
  const typeKey = instances.canonicalTypeKey(typeId);
  const items = await instances.listInstances(typeKey);
  const constructable = instances.constructible(typeKey);
  return (Array.isArray(items) ? items : items.items || items.data || [])
    .filter(constructable || (entity => true))
    .filter(entity => !field.attachmentKinds?.length || field.attachmentKinds.includes(entity.data?.type))
    // The declared target domain (SPEC §6): pickers offer what writes
    // accept — the same expression the write boundary enforces.
    .filter(entity => withinRelationDomain(entity, field.where))
    .map(entity => entityOption(entity, typeId));
}

async function toggleRelationCreator(field = {}) {
  relationCreatorMode.value = !relationCreatorMode.value;
  if (!relationCreatorMode.value) return;
  for (const creatorField of relationCreatorFields.value) {
    relationCreatorValues[creatorField.id] = initialPromptValue(creatorField);
  }
  const actionId = pendingAction.value?.actionId || pendingAction.value?.id;
  const ownerId = instanceIdentifier(pendingEntity.value?.entity);
  for (const creatorField of relationCreatorFields.value.filter(item => item.type === 'entity')) {
    const items = await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(actionId)}/options`, {
      query: { instanceId: ownerId, source: 'creator' }
    });
    relationCreatorOptions[creatorField.id] = (items || []).map(entity => entityOption(entity, creatorField.typeId));
  }
  for (const field of relationCreatorFields.value.filter(item => item.type === 'cassetteParameters')) {
    const current = relationCreatorValues[field.id];
    relationCreatorValues[field.id] = current && typeof current === 'object' && !Array.isArray(current)
      ? current
      : { ...(field.default && typeof field.default === 'object' ? field.default : {}) };
  }
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

function entityOption(entity = {}, typeId = '') {
  return {
    // Identity name, else the localized unnamed placeholder (titleFor law).
    label: entity.identity?.name || t('common.unnamed'),
    value: entity._id || entity.identity?.uid,
    typeId,
    entity
  };
}


watch(
  () => [promptValues.template, pendingAction.value?.actionId || pendingAction.value?.id || ''],
  () => {
    if (!inputDialogVisible.value) return;
    syncArtifactTemplateValues();
  }
);

</script>
