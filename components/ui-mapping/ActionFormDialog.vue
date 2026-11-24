<template>
  <StandardDialog
    :visible="visible"
    :size="fillActive ? 'lg' : 'md'"
    :fill="fillActive"
    :header="action?.label || ''"
    show-default-footer
    :cancel-label="$t('uiMapping.dialogCancel')"
    :save-label="$t('uiMapping.dialogSubmit')"
    :loading="submitting"
    :save-disabled="incomplete"
    @update:visible="value => { if (!value) emit('close'); }"
    @cancel="emit('close')"
    @save="emit('run', createDialogPayload(draft))"
  >
    <FillDialogBody
      :active="fillActive"
      :type-id="action?.typeId || ''"
      :mode="action?.construction?.mode || ''"
      :type="type"
      :draft="createDialogPayload(draft)"
      :ready="!incomplete"
      @meta="value => (previewMeta = value)"
    >
      <div :class="LAYOUT.formGrid">
        <div
          v-for="row in visibleRows"
          :key="row.id"
          class="flex min-w-0 flex-col gap-1"
          :class="row.span === 'full' ? 'ck-span-full' : ''"
        >
          <span class="text-label">{{ row.label }}</span>
          <InstancePicker
            v-if="row.lineage"
            v-model="draft[row.id]"
            :accepts="row.lineage.accepts"
            :pool="pool"
            :bundle="bundle"
            :create-actions="createActions"
            @construct-create="child => openNested(row.id, child)"
          />
          <SpotPartsRow
            v-else-if="row.control === 'spot-parts'"
            :model-value="draft[row.id] || []"
            :template-ref="templateDraftRef"
            :accepts="row.descriptor?.accepts || []"
            :pool="pool"
            :create-actions="createActions"
            @construct-create="child => openNested(null, child)"
            @update:model-value="value => (draft[row.id] = value)"
          />
          <LayerMappingRow
            v-else-if="row.control === 'layer-mapping'"
            :model-value="draft[row.id] || {}"
            :file-ref="fileRef"
            :targets="row.controlOptions?.targets || []"
            @update:model-value="value => (draft[row.id] = value)"
          />
          <CassetteParametersRow
            v-else-if="row.control === 'cassette-parameters'"
            :model-value="draft[row.id] || {}"
            :template-ref="templateDraftRef"
            @update:model-value="value => (draft[row.id] = value)"
          />
          <div v-else-if="row.descriptor?.base === 'ref'" class="flex items-center gap-2">
            <FieldControl
              v-model="draft[row.id]"
              class="min-w-0 flex-1"
              :descriptor="row.descriptor"
              variant="detail"
              :pool="pool"
              :bundle="bundle"
              :payload="type?.payload"
            />
            <RefRowActions
              :type-ids="row.descriptor.accepts || []"
              :value="draft[row.id]"
              :create-actions="createActions"
              @select="value => (draft[row.id] = value)"
              @construct-create="child => openNested(row.id, child)"
            />
          </div>
          <FieldControl
            v-else-if="row.control !== 'template-values'"
            v-model="draft[row.id]"
            :descriptor="row.descriptor"
            variant="detail"
            :pool="pool"
            :bundle="bundle"
            :payload="type?.payload"
          />
          <TemplateValuesRow
            v-else
            :model-value="draft[row.id] || {}"
            :tokens="previewTokens"
            :sections="previewSections"
            @update:model-value="value => (draft[row.id] = value)"
          />
        </div>
      </div>
      <ul v-if="failures" class="m-0 flex list-none flex-col gap-1 p-0">
        <li
          v-for="(failure, index) in failures"
          :key="index"
          class="flex items-center gap-2 text-supporting text-status-danger"
        >
          <i class="pi pi-exclamation-circle" />
          <span>{{ [failure.name, failure.message].filter(Boolean).join(' — ') }}</span>
        </li>
      </ul>
    </FillDialogBody>
  </StandardDialog>
  <NestedCreateDialog
    :entry="nested"
    :bundle="bundle"
    :pool="pool"
    :scoped-instance="scopedInstance"
    @applied="applyNested"
    @close="nested = null"
  />
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { LAYOUT, resolveCreateDialogInputs, resolveRunDialogInputs, createDialogRowUnfilled, createDialogPayload, scopedLineagePayload } from '#shared/ui-mapping/index.js';
import InstancePicker from './InstancePicker.vue';
import SpotPartsRow from './SpotPartsRow.vue';
import LayerMappingRow from './LayerMappingRow.vue';
import CassetteParametersRow from './CassetteParametersRow.vue';
import RefRowActions from './RefRowActions.vue';
import FillDialogBody from './FillDialogBody.vue';
import TemplateValuesRow from './TemplateValuesRow.vue';
import FieldControl from './FieldControl.vue';
import NestedCreateDialog from './NestedCreateDialog.vue';
import StandardDialog from '../shared/StandardDialog.vue';

// The one generated action form dialog (row contracts:
// `resolveCreateDialogInputs`, `resolveRunDialogInputs`). The host owns
// the run: `run` emits the scalarized draft payload, `close` clears the
// action; a structured refusal comes back through the `failures` prop and
// renders inline. A launch context's parent binding (`scopedInstance`)
// submits its reference on lineage rows accepting its type and hides
// those rows (SPEC §4); a dialog whose every row the context supplies
// runs with no form at all.
const props = defineProps({
  // The manifest action whose form opens; null keeps the dialog closed.
  action: { type: Object, default: null },
  bundle: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  // Compiled create actions by type id (nested pickers compose them).
  createActions: { type: Object, default: () => ({}) },
  submitting: { type: Boolean, default: false },
  failures: { type: Array, default: null },
  scopedInstance: { type: Object, default: null }
});

const emit = defineEmits(['run', 'close']);

const draft = reactive({});
const previewMeta = ref(null);
const nested = ref(null);

const type = computed(() => (props.bundle.types || []).find(candidate => candidate.id === props.action?.typeId) || null);
const rows = computed(() => {
  if (!props.action) return [];
  return props.action.actionKind === 'runCommand'
    ? resolveRunDialogInputs(props.action)
    : resolveCreateDialogInputs(props.action, type.value, props.bundle);
});
const visibleRows = computed(() => {
  const scoped = props.scopedInstance;
  if (!scoped) return rows.value;
  return rows.value.filter(row => !row.lineage?.accepts?.includes(scoped.type));
});
const incomplete = computed(() => visibleRows.value.some(row => createDialogRowUnfilled(row, draft[row.id])));

// The fill-dialog shell composes a live preview beside the form when the
// create targets a payload-bearing type through a construction mode.
const fillActive = computed(() => Boolean(type.value?.payload && props.action?.construction?.mode));
const previewTokens = computed(() => {
  const tokens = previewMeta.value?.tokens;
  return Array.isArray(tokens) ? tokens.map(String) : [];
});
const previewSections = computed(() => {
  const sections = previewMeta.value?.sections;
  return Array.isArray(sections) ? sections.map(String) : [];
});

// The create's uploaded file feeds the mapping control beside it.
const fileRef = computed(() => {
  const row = rows.value.find(candidate => candidate.descriptor?.base === 'blob');
  const value = row ? draft[row.id] : null;
  return value && typeof value === 'object' && value.fileId ? value : null;
});

// The spot-parts row reads the picked single-ref input as its template
// source — the action's one `entity` row names the spot vocabulary.
const templateDraftRef = computed(() => {
  const row = rows.value.find(candidate => candidate.descriptor?.base === 'ref' && !candidate.lineage);
  const value = row ? draft[row.id] : null;
  return value && typeof value === 'object' && value.id ? value : null;
});

// A newly selected template has a different token/section vocabulary; do not
// leave the previous template's controls visible while its preview is loading.
watch(() => templateDraftRef.value?.id || '', () => { previewMeta.value = null; });

const visible = computed(() => Boolean(props.action));

watch(() => props.action, (action) => {
  if (!action) return;
  previewMeta.value = null;
  seedDraft();
  // The context supplies every row: the create runs with no form (SPEC §4).
  if (!visibleRows.value.length) {
    emit('run', createDialogPayload(draft));
    emit('close');
  }
}, { immediate: true });

// Prefill the draft: authored defaults, then the scoped detail instance's
// reference on lineage rows accepting its type.
function seedDraft() {
  for (const key of Object.keys(draft)) delete draft[key];
  for (const row of rows.value) {
    if (row.default !== undefined && row.default !== null) draft[row.id] = row.default;
  }
  const scoped = props.scopedInstance;
  if (scoped) {
    Object.assign(draft, scopedLineagePayload(props.action, {
      scopeTypeId: scoped.type,
      scopeId: scoped.id,
      type: type.value,
      bundle: props.bundle
    }));
  }
}

function openNested(rowId, action) {
  if (!action) return;
  nested.value = { rowId, typeId: action.typeId, action };
}

function applyNested({ rowId, typeId, id }) {
  if (rowId) draft[rowId] = { type: typeId, id };
}
</script>
