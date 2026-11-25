<template>
  <StandardDialog
    :visible="visible"
    size="lg"
    fill
    :title="readOnly ? (readonlyType?.name || $t('classes.title')) : (draftMode ? $t('classes.childTitle') : (isCreate ? $t('classes.createTitle') : $t('classes.editTitle')))"
    :show-default-footer="!readOnly"
    :cancel-label="$t('common.cancel')"
    :save-label="draftMode ? $t('common.add') : (isCreate ? $t('common.create') : $t('common.save'))"
    :loading="saving"
    :save-disabled="!canSave"
    @update:visible="value => emit('update:visible', value)"
    @cancel="close"
    @save="save"
  >
    <template v-if="!readOnly" #footer>
      <div class="flex w-full items-center gap-2">
        <Button
          v-if="!isCreate"
          :label="$t('common.delete')"
          icon="pi pi-trash"
          severity="danger"
          text
          @click="requestDelete"
        />
        <span class="flex-1" />
        <Button :label="$t('common.cancel')" text severity="secondary" @click="close" />
        <Button
          :label="draftMode ? $t('common.add') : (isCreate ? $t('common.create') : $t('common.save'))"
          :loading="saving"
          :disabled="!canSave"
          @click="save"
        />
      </div>
    </template>
    <div v-if="readOnly" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
      <div class="grid items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <div class="flex flex-col gap-1">
          <span class="text-label text-muted">{{ $t('classes.name') }}</span>
          <span class="text-body">{{ readonlyType?.name || $t('common.unnamed') }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-label text-muted">{{ $t('processDesigner.declarationClass') }}</span>
          <span class="text-body">{{ readonlyType?.class || '' }}</span>
        </div>
        <i :class="readonlyType?.glyph || 'pi pi-circle'" class="h-9 w-9 self-end text-center leading-9" :aria-label="$t('processDesigner.icon')" />
      </div>

      <section class="flex flex-col gap-1">
        <span class="text-label text-muted">{{ $t('classes.fields') }}</span>
        <div
          v-for="field in readonlyFields"
          :key="field.name"
          class="flex min-w-0 items-center gap-3 border-b border-chrome-border py-1.5 last:border-b-0"
        >
          <span class="min-w-0 flex-1 truncate text-body">{{ field.name }}</span>
          <span class="text-muted text-supporting">{{ field.summary }}</span>
        </div>
      </section>

      <section v-if="readonlyStates.length" class="flex flex-col gap-1">
        <span class="text-label text-muted">{{ $t('classes.states') }}</span>
        <div class="flex flex-wrap gap-2">
          <Tag
            v-for="state in readonlyStates"
            :key="state.value"
            :value="state.label"
            :severity="state.severity"
            :icon="state.icon || undefined"
          />
        </div>
      </section>

      <section v-if="readonlyChildren.length" class="flex flex-col gap-1">
        <span class="text-label text-muted">{{ $t('classes.children') }}</span>
        <div
          v-for="child in readonlyChildren"
          :key="child.typeId"
          class="flex items-center gap-2 border-b border-chrome-border py-1.5 last:border-b-0"
        >
          <i :class="typeGlyph(child.typeId)" class="shrink-0 text-muted" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate text-body">{{ typeLabelOf(child.typeId) }}</span>
        </div>
      </section>
    </div>

    <div v-else class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto lg:overflow-hidden">
      <div class="grid shrink-0 items-end gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
        <div class="flex flex-col gap-1">
          <label class="text-label text-muted">{{ $t('classes.name') }}</label>
          <InputText
            v-model="draft.name"
            size="small"
            :placeholder="$t('processDesigner.classNamePlaceholder')"
            :aria-label="$t('classes.name')"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-label text-muted">{{ $t('processDesigner.declarationClass') }}</label>
          <Select
            :model-value="draft.class"
            :options="classOptions"
            option-label="label"
            option-value="value"
            size="small"
            @update:model-value="setClass"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-label text-muted">{{ $t('processDesigner.icon') }}</label>
          <GlyphSelect v-model="draft.glyph" :aria-label="$t('processDesigner.icon')" />
        </div>
      </div>

      <Tabs v-model:value="activeTab" class="flex min-h-0 flex-col lg:h-[36rem]">
        <TabList class="shrink-0">
          <Tab value="fields" class="px-2.5 sm:px-4">
            {{ $t('classes.fields') }}
            <Tag :value="String(draft.fields.length)" severity="secondary" />
          </Tab>
          <Tab v-if="draft.class === 'file'" value="payload" class="px-2.5 sm:px-4">
            {{ $t('classes.payload') }}
          </Tab>
          <Tab value="projections" class="px-2.5 sm:px-4">
            {{ $t('processDesigner.projections') }}
            <Tag :value="String(draft.projections.length)" severity="secondary" />
          </Tab>
          <Tab value="states" class="px-2.5 sm:px-4">
            {{ $t('classes.states') }}
            <Tag :value="String(draft.states.length)" severity="secondary" />
          </Tab>
          <Tab v-if="classMayDeclareChildren(draft.class)" value="children" class="px-2.5 sm:px-4">
            {{ $t('classes.children') }}
            <Tag :value="String(draft.children.length)" severity="secondary" />
          </Tab>
        </TabList>

        <TabPanels class="flex flex-col lg:min-h-0 lg:flex-1">
          <TabPanel value="fields" class="flex flex-col p-0 lg:min-h-0 lg:flex-1">
            <div class="flex flex-wrap items-center justify-between gap-2 py-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="text-label text-muted">{{ $t('processDesigner.namesRecord') }}</span>
                <Select
                  :model-value="identifierFieldId"
                  :options="fieldOptions"
                  option-label="label"
                  option-value="value"
                  size="small"
                  class="w-full sm:w-56"
                  :aria-label="$t('processDesigner.namesRecord')"
                  @update:model-value="setIdentifierField"
                />
              </div>
              <Button
                icon="pi pi-plus"
                :label="$t('typesPane.addField')"
                size="small"
                text
                severity="secondary"
                @click="addField"
              />
            </div>
            <div class="hidden shrink-0 grid-cols-[minmax(0,1fr)_9rem_5.5rem_2.5rem] gap-2 pb-2 text-label text-muted sm:grid">
              <span>{{ $t('typeCanvas.fieldName') }}</span>
              <span>{{ $t('classes.type') }}</span>
              <span>{{ $t('typesPane.nullableColumn') }}</span>
              <span />
            </div>
            <div class="flex flex-col gap-4 pb-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <ClassFieldRow
                v-for="field in draft.fields"
                :key="field.key"
                class="border-b border-chrome-border pb-4 last:border-b-0 last:pb-0"
                :name="field.name"
                :descriptor="field.descriptor"
                :type-options="typeOptions"
                :simple="true"
                @update:name="value => renameField(field, value)"
                @update:descriptor="value => updateDescriptor(field, value)"
                @remove="removeField(field)"
              />
            </div>
          </TabPanel>

          <TabPanel v-if="draft.class === 'file'" value="payload" class="p-0">
            <div class="py-3">
              <PayloadTraitsEditor v-model="draft.payload" />
            </div>
          </TabPanel>

          <TabPanel value="projections" class="p-0">
            <div class="py-3">
              <ProjectionsEditor v-model="draft.projections" />
            </div>
          </TabPanel>

          <TabPanel value="states" class="flex flex-col p-0 lg:min-h-0 lg:flex-1">
            <div class="flex items-center justify-end gap-2 py-3">
              <Button
                icon="pi pi-plus"
                :label="$t('typeDeclaration.addState')"
                size="small"
                text
                severity="secondary"
                @click="addState"
              />
            </div>
            <div class="hidden shrink-0 grid-cols-[minmax(0,1fr)_8rem_10rem_2.5rem] gap-2 pb-2 text-label text-muted sm:grid">
              <span>{{ $t('classes.stateColumn') }}</span>
              <span>{{ $t('processDesigner.stateSeverity') }}</span>
              <span>{{ $t('processDesigner.stateIcon') }}</span>
              <span />
            </div>
            <div class="flex flex-col gap-4 pb-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <ClassStateRow
                v-for="state in draft.states"
                :key="state.key"
                class="border-b border-chrome-border pb-4 last:border-b-0 last:pb-0"
                :value="state.value"
                :severity="state.severity"
                :icon="state.icon"
                @update:value="value => state.value = value"
                @update:severity="value => state.severity = value"
                @update:icon="value => state.icon = value"
                @remove="removeState(state)"
              />
            </div>
          </TabPanel>

          <TabPanel
            v-if="classMayDeclareChildren(draft.class)"
            value="children"
            class="flex flex-col p-0 lg:min-h-0 lg:flex-1"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 py-3">
              <Select
                v-model="existingChild"
                :options="existingChildOptions"
                option-label="label"
                option-value="value"
                size="small"
                :placeholder="$t('classes.addExistingChild')"
                :aria-label="$t('classes.addExistingChild')"
                class="min-w-0 flex-1 sm:max-w-xs"
                @update:model-value="value => { addChildType(value); existingChild = null; }"
              />
              <Button
                icon="pi pi-plus"
                :label="$t('classes.addChild')"
                size="small"
                text
                severity="secondary"
                @click="openNewChild"
              />
            </div>
            <div class="flex flex-col pb-1 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <div
                v-for="child in draft.children"
                :key="`${child.entryKey}:${child.draft?.id || child.typeId}`"
                class="flex items-center gap-2 border-b border-chrome-border py-2 last:border-b-0"
              >
                <i :class="child.draft?.glyph || typeGlyph(child.typeId)" class="shrink-0 text-muted" aria-hidden="true" />
                <span class="min-w-0 flex-1 truncate text-body">{{ child.draft?.name || typeLabelOf(child.typeId) }}</span>
                <Button
                  icon="pi pi-pencil"
                  size="small"
                  text
                  severity="secondary"
                  :aria-label="$t('classes.editTitle')"
                  :title="$t('classes.editTitle')"
                  @click="openChild(child)"
                />
                <Button
                  icon="pi pi-times"
                  size="small"
                  text
                  severity="danger"
                  :aria-label="$t('common.delete')"
                  :title="$t('common.delete')"
                  @click="removeChild(child)"
                />
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <div v-if="fieldError || stateError || childError || error || pendingAbandon" class="flex flex-col gap-2">
        <Message v-if="fieldError" severity="warn" :closable="false">{{ fieldError }}</Message>
        <Message v-if="stateError" severity="warn" :closable="false">{{ stateError }}</Message>
        <Message v-if="childError" severity="warn" :closable="false">{{ childError }}</Message>
        <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
        <div v-if="pendingAbandon" class="flex flex-col items-start gap-2">
          <Message severity="warn" :closable="false">{{ deleteImpactMessage }}</Message>
          <Button
            :label="$t('classes.deleteAnyway')"
            icon="pi pi-trash"
            severity="danger"
            size="small"
            :loading="saving"
            @click="deleteClass(true)"
          />
        </div>
      </div>

    </div>

    <ClassDialog
      v-model:visible="childDialogVisible"
      :type-id="childDialogTypeId"
    />
    <ClassDialog
      v-model:visible="childDraftVisible"
      draft-mode
      :initial-draft="childDraftInitial"
      @draft="commitChildDraft"
    />
  </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Select from 'primevue/select';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import ClassFieldRow from '~/components/type-designer/ClassFieldRow.vue';
import ClassStateRow from '~/components/type-designer/ClassStateRow.vue';
import GlyphSelect from '~/components/type-designer/GlyphSelect.vue';
import PayloadTraitsEditor from '~/components/type-designer/PayloadTraitsEditor.vue';
import ProjectionsEditor from '~/components/type-designer/ProjectionsEditor.vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { generateTypeId, mintId } from '~/utils/processDesignerIdentity.js';
import { fieldDescriptorSummary } from '~/utils/processDesignerDeclarationEditor.js';
import { startCaseKey } from '#shared/ui-mapping/index.js';
import { classMayDeclareChildren, DECLARABLE_CLASSES, rowFieldId } from '@perigram/cts';

const props = defineProps({
  visible: { type: Boolean, default: false },
  typeId: { type: String, default: '' },
  type: { type: Object, default: null },
  startInCreate: { type: Boolean, default: false },
  draftMode: { type: Boolean, default: false },
  initialDraft: { type: Object, default: null },
  readOnly: { type: Boolean, default: false }
});

const emit = defineEmits(['update:visible', 'saved', 'draft']);

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const view = useFileTypeView();
const readonlyType = computed(() => props.type || view.typeById(props.typeId));
const readonlyFields = computed(() => Object.entries(readonlyType.value?.fields || {}).map(([name, descriptor]) => ({
  name,
  summary: fieldDescriptorSummary(descriptor, typeId => typeLabelOf(typeId))
})));
const readonlyStates = computed(() => Object.entries(readonlyType.value?.stateVocabulary || {}).map(([value, declaration]) => ({
  value,
  label: declaration?.policy?.label || value,
  severity: declaration?.policy?.severity || 'info',
  icon: declaration?.policy?.icon || null
})));
const readonlyChildren = computed(() => Object.entries(readonlyType.value?.edges?.children || {})
  .flatMap(([, declaration]) => declaration.types || [])
  .map(typeId => ({ typeId })));

const isCreate = computed(() => props.draftMode || props.startInCreate || !props.typeId);
const classOptions = DECLARABLE_CLASSES.map(value => ({ label: value, value }));

const draft = ref(freshDraft());
const activeTab = ref('fields');
const base = ref(null);
const error = ref('');
const pendingAbandon = ref(null);
const saving = ref(false);
const childDraftVisible = ref(false);
const childDraftInitial = ref(null);
const childDraftTarget = ref(null);
const existingChild = ref(null);
const childDialogVisible = ref(false);
const childDialogTypeId = ref('');

const typeOptions = computed(() => view.types.value.map(type => ({
  label: type.name || type.id,
  value: type.id
})));

const fieldOptions = computed(() => draft.value.fields.map(field => ({
  label: field.name || field.id,
  value: field.id
})));

const identifierFieldId = computed(() => draft.value.fields
  .find(field => field.descriptor?.identifier === true)?.id || '');

function setIdentifierField(fieldId) {
  for (const field of draft.value.fields) {
    const descriptor = { ...field.descriptor };
    if (field.id === fieldId) descriptor.identifier = true;
    else delete descriptor.identifier;
    field.descriptor = descriptor;
  }
}

const fieldError = computed(() => {
  const names = draft.value.fields.map(field => String(field.name || '').trim());
  if (names.some(name => !name)) return t('classes.fieldNameRequired');
  const identifiers = draft.value.fields.filter(field => field.descriptor?.identifier === true);
  if (identifiers.length !== 1) return t('classes.identifierRequired');
  return '';
});

const stateError = computed(() => {
  const values = draft.value.states.map(state => String(state.value || '').trim());
  if (values.some(value => !value)) return t('classes.stateNameRequired');
  if (values.some(value => value.includes('.'))) return t('classes.stateNameInvalid');
  if (new Set(values).size !== values.length) return t('classes.stateNameDuplicate');
  return '';
});

const childError = computed(() => (
  draft.value.class === 'group' && !draft.value.children.length
    ? t('classes.groupNeedsChildren')
    : ''
));

const canSave = computed(() => Boolean(
  String(draft.value.name || '').trim()
  && !fieldError.value
  && !stateError.value
  && !childError.value
  && !saving.value
));

const existingChildOptions = computed(() => {
  const taken = new Set(draft.value.children.map(child => child.typeId));
  return view.types.value
    .filter(type => type.id !== draft.value.id && !taken.has(type.id))
    .map(type => ({ label: type.name || type.id, value: type.id }));
});

function freshDraft() {
  return {
    id: generateTypeId(),
    class: 'item',
    name: '',
    glyph: '',
    payload: null,
    projections: [],
    fields: [{ key: mintId('field'), id: 'fName', name: 'Name', descriptor: { base: 'string', identifier: true, label: 'Name' } }],
    children: [],
    states: []
  };
}

function initialize() {
  error.value = '';
  pendingAbandon.value = null;
  existingChild.value = null;
  activeTab.value = 'fields';
  if (props.initialDraft) {
    draft.value = JSON.parse(JSON.stringify(props.initialDraft));
    draft.value.fields ||= [];
    draft.value.children ||= [];
    draft.value.states ||= [];
    draft.value.projections ||= [];
    base.value = null;
    return;
  }
  if (isCreate.value) {
    draft.value = freshDraft();
    base.value = null;
    return;
  }
  const record = props.type || view.typeById(props.typeId);
  if (!record) {
    error.value = t('common.error');
    draft.value = freshDraft();
    base.value = null;
    return;
  }
  base.value = JSON.parse(JSON.stringify(record));
  draft.value = {
    id: record.id,
    class: record.class,
    name: record.name || '',
    glyph: record.glyph || '',
    payload: record.payload || null,
    projections: record.projections || [],
    fields: Object.entries(record.fields || {}).map(([id, descriptor]) => ({
      key: mintId('field'),
      id,
      name: descriptor.label || startCaseKey(id),
      descriptor: { ...descriptor }
    })),
    children: Object.entries(record.edges?.children || {}).flatMap(([entryKey, declaration]) => (
      (declaration.types || []).map(typeId => ({ entryKey, typeId }))
    )),
    states: Object.entries(record.stateVocabulary || {}).map(([value, declaration]) => ({
      key: mintId('state'),
      value,
      severity: declaration?.policy?.severity || 'info',
      icon: declaration?.policy?.icon || ''
    }))
  };
  if (!draft.value.fields.length) {
    draft.value.fields.push({ key: mintId('field'), id: 'fName', name: 'Name', descriptor: { base: 'string', identifier: true, label: 'Name' } });
  }
}

watch(() => props.visible, visible => {
  if (visible) initialize();
}, { immediate: true });

function close() {
  emit('update:visible', false);
}

function setClass(value) {
  draft.value.class = value;
  if (value === 'file') {
    draft.value.children = [];
    if (activeTab.value === 'children') activeTab.value = 'fields';
  } else {
    draft.value.payload = null;
    if (activeTab.value === 'payload') activeTab.value = 'fields';
  }
}

function typeLabelOf(typeId) {
  return view.typeById(typeId)?.name || typeId;
}

function typeGlyph(typeId) {
  return view.typeById(typeId)?.glyph || 'pi pi-box';
}

function renameField(field, name) {
  field.name = String(name || '').trim();
  field.descriptor = { ...field.descriptor, label: field.name };
}

function updateDescriptor(field, value) {
  field.descriptor = value;
}

function uniqueFieldId(name) {
  const base = rowFieldId(name) || `f${Math.random().toString(36).slice(2, 10)}`;
  let id = base;
  let suffix = 2;
  while (draft.value.fields.some(field => field.id === id)) {
    id = `${base}${suffix}`;
    suffix += 1;
  }
  return id;
}

function addField() {
  let index = draft.value.fields.length + 1;
  while (draft.value.fields.some(field => field.name === `Field ${index}`)) index += 1;
  const name = `Field ${index}`;
  const field = {
    key: mintId('field'),
    id: uniqueFieldId(name),
    name,
    descriptor: { base: 'string', label: name }
  };
  draft.value.fields.push(field);
  if (!draft.value.fields.some(candidate => candidate.descriptor?.identifier === true)) {
    setIdentifierField(field.id);
  }
}

function removeField(field) {
  const wasIdentifier = field.descriptor?.identifier === true;
  draft.value.fields = draft.value.fields.filter(candidate => candidate !== field);
  if (wasIdentifier && draft.value.fields.length) setIdentifierField(draft.value.fields[0].id);
}

function addState() {
  let index = draft.value.states.length + 1;
  while (draft.value.states.some(state => state.value === `state${index}`)) index += 1;
  draft.value.states.push({
    key: mintId('state'),
    value: `state${index}`,
    severity: 'info',
    icon: ''
  });
}

function removeState(state) {
  draft.value.states = draft.value.states.filter(candidate => candidate !== state);
}

function primaryChildEntryKey() {
  return draft.value.children[0]?.entryKey
    || Object.keys(base.value?.edges?.children || {})[0]
    || 'children';
}

function addChildType(typeId) {
  if (!typeId || draft.value.children.some(child => child.typeId === typeId)) return;
  draft.value.children.push({ entryKey: primaryChildEntryKey(), typeId });
}

function removeChild(child) {
  draft.value.children = draft.value.children.filter(candidate => candidate !== child);
}

function openChild(child) {
  if (child.draft) {
    childDraftTarget.value = child;
    childDraftInitial.value = JSON.parse(JSON.stringify(child.draft));
    childDraftVisible.value = true;
    return;
  }
  childDialogTypeId.value = child.typeId;
  childDialogVisible.value = true;
}

function openNewChild() {
  childDraftTarget.value = null;
  childDraftInitial.value = null;
  childDraftVisible.value = true;
}

function commitChildDraft(value) {
  if (childDraftTarget.value) {
    Object.assign(childDraftTarget.value, { typeId: value.id, draft: value });
  } else {
    draft.value.children.push({
      entryKey: primaryChildEntryKey(),
      typeId: value.id,
      draft: value
    });
  }
  childDraftTarget.value = null;
  childDraftInitial.value = null;
  childDraftVisible.value = false;
}

function declarationFor(draftValue, record = {}) {
  const declaration = {
    ...record,
    id: record.id || draftValue.id || generateTypeId(),
    class: draftValue.class,
    name: draftValue.name.trim(),
    fields: Object.fromEntries(draftValue.fields.map(field => [
      field.id,
      { ...field.descriptor, label: field.name.trim() }
    ]))
  };
  if (draftValue.glyph) declaration.glyph = draftValue.glyph;
  else delete declaration.glyph;
  if (declaration.class === 'file' && draftValue.payload?.mime?.length) {
    declaration.payload = { ...draftValue.payload };
  } else {
    delete declaration.payload;
  }
  const projections = (draftValue.projections || []).filter(projection => String(projection?.id || '').trim());
  if (projections.length) declaration.projections = projections;
  else delete declaration.projections;

  const states = {};
  for (const state of draftValue.states || []) {
    const value = String(state.value || '').trim();
    const policy = {
      ...(String(state.icon || '').trim() ? { icon: String(state.icon).trim() } : {}),
      ...(state.severity && state.severity !== 'info' ? { severity: state.severity } : {})
    };
    states[value] = Object.keys(policy).length ? { policy } : {};
  }
  if (Object.keys(states).length) declaration.stateVocabulary = states;
  else delete declaration.stateVocabulary;

  const edges = { ...(record.edges || {}) };
  const children = {};
  for (const child of draftValue.children) {
    const entryKey = child.entryKey || 'children';
    const original = record.edges?.children?.[entryKey] || {};
    const current = children[entryKey] || { ...original, types: [] };
    current.types = [...current.types, child.typeId];
    children[entryKey] = current;
  }
  for (const [entryKey, declarationEdge] of Object.entries(children)) {
    children[entryKey] = { ...declarationEdge, onRemove: declarationEdge.onRemove || 'detach' };
  }
  if (Object.keys(children).length && declaration.class !== 'file') edges.children = children;
  else delete edges.children;
  declaration.edges = edges;

  delete declaration.schema;
  delete declaration.sections;
  delete declaration.depiction;
  delete declaration.identifier;
  delete declaration.version;
  delete declaration.scope;
  delete declaration.organizationId;
  return declaration;
}

function buildDeclaration() {
  return declarationFor(draft.value, base.value || {});
}

async function persistChildDrafts(createdIds) {
  for (const child of draft.value.children.filter(candidate => candidate.draft)) {
    await persistDraftTree(child, createdIds);
  }
}

async function persistDraftTree(entry, createdIds) {
  const childDraft = entry.draft;
  for (const nested of childDraft.children.filter(candidate => candidate.draft)) {
    await persistDraftTree(nested, createdIds);
  }
  const result = await $fetch('/api/admin/cts/types', {
    method: 'POST',
    body: declarationFor(childDraft, {})
  });
  entry.typeId = result.type.id;
  createdIds.push(result.type.id);
}

function requestDelete() {
  if (isCreate.value || !draft.value.id) return;
  const typeId = String(draft.value.id);
  confirm.require({
    message: t('classes.deleteConfirm', { name: draft.value.name || typeId }),
    header: t('common.delete'),
    icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: t('common.cancel'), severity: 'secondary', outlined: true },
    acceptProps: { label: t('common.delete'), severity: 'danger' },
    accept: () => deleteClass(false)
  });
}

async function deleteClass(abandon) {
  const typeId = String(draft.value.id);
  saving.value = true;
  error.value = '';
  try {
    await $fetch(`/api/admin/cts/types/${encodeURIComponent(typeId)}${abandon ? '?abandon=true' : ''}`, { method: 'DELETE' });
    pendingAbandon.value = null;
    await view.refresh();
    toast.add({
      severity: 'success',
      summary: t('common.delete'),
      detail: draft.value.name || typeId,
      life: 2400
    });
    emit('saved', null);
    close();
  } catch (failure) {
    if (!abandon && failure?.statusCode === 409 && failure?.data) {
      pendingAbandon.value = failure.data;
      return;
    }
    console.error('Failed to delete class', failure);
    error.value = t('classes.deleteFailed');
  } finally {
    saving.value = false;
  }
}

const deleteImpactMessage = computed(() => {
  if (!pendingAbandon.value) return '';
  const boundBy = Array.isArray(pendingAbandon.value.boundBy) ? pendingAbandon.value.boundBy : [];
  const names = boundBy.map(item => item?.name).filter(Boolean);
  return t('classes.deleteBlastRadius', {
    name: draft.value.name || draft.value.id,
    instances: Number(pendingAbandon.value.instances || 0),
    processes: boundBy.length,
    names: names.length ? ` (${names.join(', ')})` : ''
  });
});

async function save() {
  if (!canSave.value) return;
  if (props.draftMode) {
    emit('draft', JSON.parse(JSON.stringify(draft.value)));
    close();
    return;
  }
  saving.value = true;
  error.value = '';
  const createdIds = [];
  try {
    await persistChildDrafts(createdIds);
    const result = await $fetch('/api/admin/cts/types', {
      method: 'POST',
      body: buildDeclaration()
    });
    await view.refresh();
    toast.add({
      severity: 'success',
      summary: isCreate.value ? t('common.created') : t('classes.saved'),
      detail: draft.value.name.trim(),
      life: 2400
    });
    emit('saved', result.type);
    close();
  } catch (failure) {
    for (const typeId of createdIds.reverse()) {
      await $fetch(`/api/admin/cts/types/${typeId}?abandon=true`, { method: 'DELETE' }).catch(() => {});
    }
    error.value = failure?.data?.message || failure?.message || t('common.error');
  } finally {
    saving.value = false;
  }
}
</script>
