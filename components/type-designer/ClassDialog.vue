<template>
  <StandardDialog
    :visible="visible"
    size="lg"
    :title="draftMode ? $t('classes.childTitle') : (isCreate ? $t('classes.createTitle') : $t('classes.editTitle'))"
    show-default-footer
    :cancel-label="$t('common.cancel')"
    :save-label="draftMode ? $t('common.add') : (isCreate ? $t('common.create') : $t('common.save'))"
    :loading="saving"
    :save-disabled="!canSave"
    @update:visible="value => emit('update:visible', value)"
    @cancel="close"
    @save="save"
  >
    <div class="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1">
      <div class="grid items-end gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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

      <section class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-label text-muted">{{ $t('classes.fields') }}</span>
          <Button
            icon="pi pi-plus"
            :label="$t('typesPane.addField')"
            size="small"
            text
            severity="secondary"
            @click="addField"
          />
        </div>
        <DeclarationFieldRow
          v-for="field in draft.fields"
          :key="field.key"
          :field="{ node: { data: { name: field.name, descriptor: field.descriptor } } }"
          :summary="summaryOf(field.descriptor)"
          :type-options="typeOptions"
          :expanded="expandedField === field.key"
          @rename="value => renameField(field, value)"
          @descriptor="value => updateDescriptor(field, value)"
          @toggle-identifier="toggleIdentifier(field)"
          @toggle-expand="expandedField = expandedField === field.key ? '' : field.key"
          @remove="removeField(field)"
        />
        <Message v-if="fieldError" severity="warn" :closable="false">{{ fieldError }}</Message>
      </section>

      <section class="flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <span class="text-label text-muted">{{ $t('classes.states') }}</span>
          <Button
            icon="pi pi-plus"
            :label="$t('typeDeclaration.addState')"
            size="small"
            text
            severity="secondary"
            @click="addState"
          />
        </div>
        <DeclarationStateRow
          v-for="state in draft.states"
          :key="state.key"
          :state="state"
          @rename="value => state.value = value"
          @label="value => state.label = value"
          @severity="value => state.severity = value"
          @icon="value => state.icon = value"
          @terminal="value => state.terminal = value"
          @remove="removeState(state)"
        />
        <Message v-if="stateError" severity="warn" :closable="false">{{ stateError }}</Message>
      </section>

      <section v-if="classMayDeclareChildren(draft.class)" class="flex flex-col gap-2">
        <span class="text-label text-muted">{{ $t('classes.children') }}</span>
        <div
          v-for="child in draft.children"
          :key="`${child.entryKey}:${child.draft?.id || child.typeId}`"
          class="flex items-center gap-2 border-b border-chrome-border py-1 last:border-b-0"
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
        <Select
          v-model="existingChild"
          :options="existingChildOptions"
          option-label="label"
          option-value="value"
          size="small"
          :placeholder="$t('classes.addExistingChild')"
          :aria-label="$t('classes.addExistingChild')"
          @update:model-value="value => { addChildType(value); existingChild = null; }"
        />
        <Button
          icon="pi pi-plus"
          :label="$t('classes.addChild')"
          size="small"
          text
          severity="secondary"
          class="self-start"
          @click="openNewChild"
        />
        <Message v-if="childError" severity="warn" :closable="false">{{ childError }}</Message>
      </section>

      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
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
import Select from 'primevue/select';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DeclarationFieldRow from '~/components/type-designer/DeclarationFieldRow.vue';
import DeclarationStateRow from '~/components/type-designer/DeclarationStateRow.vue';
import GlyphSelect from '~/components/type-designer/GlyphSelect.vue';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { generateTypeId, mintId } from '~/utils/processDesignerIdentity.js';
import { fieldDescriptorSummary } from '~/utils/processDesignerDeclarationEditor.js';
import { classMayDeclareChildren, DECLARABLE_CLASSES } from '~/packages/cts/src/index.js';

const props = defineProps({
  visible: { type: Boolean, default: false },
  typeId: { type: String, default: '' },
  type: { type: Object, default: null },
  startInCreate: { type: Boolean, default: false },
  draftMode: { type: Boolean, default: false },
  initialDraft: { type: Object, default: null }
});

const emit = defineEmits(['update:visible', 'saved', 'draft']);

const { t } = useI18n();
const toast = useToast();
const view = useFileTypeView();

const isCreate = computed(() => props.draftMode || props.startInCreate || !props.typeId);
const classOptions = DECLARABLE_CLASSES.map(value => ({ label: value, value }));

const draft = ref(freshDraft());
const base = ref(null);
const expandedField = ref('');
const error = ref('');
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

const fieldError = computed(() => {
  const names = draft.value.fields.map(field => String(field.name || '').trim());
  if (names.some(name => !name)) return t('classes.fieldNameRequired');
  if (names.some(name => !/^[a-z][a-zA-Z0-9]*$/.test(name))) return t('classes.fieldNameInvalid');
  if (new Set(names).size !== names.length) return t('classes.fieldNameDuplicate');
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
    fields: [{ key: mintId('field'), name: 'name', descriptor: { base: 'string', identifier: true } }],
    children: [],
    states: []
  };
}

function initialize() {
  error.value = '';
  expandedField.value = '';
  existingChild.value = null;
  if (props.initialDraft) {
    draft.value = JSON.parse(JSON.stringify(props.initialDraft));
    draft.value.fields ||= [];
    draft.value.children ||= [];
    draft.value.states ||= [];
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
    fields: Object.entries(record.fields || {}).map(([name, descriptor]) => ({
      key: mintId('field'),
      name,
      descriptor: { ...descriptor }
    })),
    children: Object.entries(record.edges?.children || {}).flatMap(([entryKey, declaration]) => (
      (declaration.types || []).map(typeId => ({ entryKey, typeId }))
    )),
    states: Object.entries(record.stateVocabulary || {}).map(([value, declaration]) => ({
      key: mintId('state'),
      value,
      label: declaration?.policy?.label || '',
      severity: declaration?.policy?.severity || 'info',
      icon: declaration?.policy?.icon || '',
      terminal: declaration?.terminal === true
    }))
  };
  if (!draft.value.fields.length) {
    draft.value.fields.push({ key: mintId('field'), name: 'name', descriptor: { base: 'string', identifier: true } });
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
  if (value === 'file') draft.value.children = [];
}

function summaryOf(descriptor) {
  return fieldDescriptorSummary(descriptor, typeId => typeLabelOf(typeId));
}

function typeLabelOf(typeId) {
  return view.typeById(typeId)?.name || typeId;
}

function typeGlyph(typeId) {
  return view.typeById(typeId)?.glyph || 'pi pi-box';
}

function renameField(field, name) {
  field.name = String(name || '');
}

function updateDescriptor(field, value) {
  field.descriptor = value;
}

function toggleIdentifier(field) {
  const enabled = field.descriptor?.identifier !== true;
  for (const candidate of draft.value.fields) {
    const descriptor = { ...candidate.descriptor };
    if (candidate === field && enabled) descriptor.identifier = true;
    else delete descriptor.identifier;
    candidate.descriptor = descriptor;
  }
}

function addField() {
  let index = draft.value.fields.length + 1;
  while (draft.value.fields.some(field => field.name === `field${index}`)) index += 1;
  const field = { key: mintId('field'), name: `field${index}`, descriptor: { base: 'string' } };
  draft.value.fields.push(field);
  expandedField.value = field.key;
}

function removeField(field) {
  draft.value.fields = draft.value.fields.filter(candidate => candidate !== field);
}

function addState() {
  let index = draft.value.states.length + 1;
  while (draft.value.states.some(state => state.value === `state${index}`)) index += 1;
  draft.value.states.push({
    key: mintId('state'),
    value: `state${index}`,
    label: '',
    severity: 'info',
    icon: '',
    terminal: false
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
      String(field.name).trim(),
      { ...field.descriptor }
    ]))
  };
  if (draftValue.glyph) declaration.glyph = draftValue.glyph;
  else delete declaration.glyph;
  if (declaration.class !== 'file') delete declaration.payload;

  const states = {};
  for (const state of draftValue.states || []) {
    const value = String(state.value || '').trim();
    const policy = {
      ...(String(state.label || '').trim() ? { label: String(state.label).trim() } : {}),
      ...(String(state.icon || '').trim() ? { icon: String(state.icon).trim() } : {}),
      ...(state.severity && state.severity !== 'info' ? { severity: state.severity } : {})
    };
    states[value] = {
      ...(state.terminal === true ? { terminal: true } : {}),
      ...(Object.keys(policy).length ? { policy } : {})
    };
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
