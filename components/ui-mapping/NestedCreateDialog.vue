<template>
  <StandardDialog
    :visible="Boolean(entry)"
    size="sm"
    :header="entry?.action?.label || ''"
    show-default-footer
    :cancel-label="$t('uiMapping.dialogCancel')"
    :save-label="$t('uiMapping.dialogSubmit')"
    :loading="submitting"
    :save-disabled="incomplete"
    @update:visible="visible => { if (!visible) emit('close'); }"
    @cancel="emit('close')"
    @save="submit"
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
        />
        <FieldControl
          v-else
          v-model="draft[row.id]"
          :descriptor="row.descriptor"
          variant="detail"
          :pool="pool"
          :bundle="bundle"
          :payload="type?.payload"
        />
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useToast } from 'primevue/usetoast';
import { LAYOUT, resolveCreateDialogInputs, createDialogRowUnfilled, createDialogPayload } from '#shared/ui-mapping/index.js';
import { refusalFailuresOf } from '~/utils/action-failures.js';
import { createdEntity } from '~/utils/instance-run-results.js';
import { useInstancesStore } from '~/stores/instances';
import InstancePicker from './InstancePicker.vue';
import FieldControl from './FieldControl.vue';
import StandardDialog from '../shared/StandardDialog.vue';

// The nested part-create (SPEC §24 rails): a construct-protocol create
// opens inside its host dialog; the created record selects into the row
// (or becomes the link target) without leaving the host. `entry` is
// `{ rowId, typeId, action, apply }`; `applied` carries the created ref
// back for the host to place. The host's launch context
// (`scopedInstance`) seeds and hides lineage rows accepting its type —
// the same law the action form dialog follows.
const props = defineProps({
  entry: { type: Object, default: null },
  bundle: { type: Object, required: true },
  pool: { type: Object, default: () => ({}) },
  scopedInstance: { type: Object, default: null }
});

const emit = defineEmits(['applied', 'close']);

const toast = useToast();
const instances = useInstancesStore();
const draft = reactive({});
const submitting = ref(false);

const type = computed(() => (
  props.entry ? (props.bundle.types || []).find(candidate => candidate.id === props.entry.typeId) || null : null
));
const rows = computed(() => (
  props.entry?.action ? resolveCreateDialogInputs(props.entry.action, type.value, props.bundle) : []
));
const visibleRows = computed(() => {
  const scoped = props.scopedInstance;
  if (!scoped) return rows.value;
  return rows.value.filter(row => !row.lineage?.accepts?.includes(scoped.type));
});
const incomplete = computed(() => visibleRows.value.some(row => createDialogRowUnfilled(row, draft[row.id])));

watch(() => props.entry, () => {
  seedDraft();
}, { immediate: true });

// Prefill the draft: authored defaults, then the launch context's parent
// reference on lineage rows accepting its type.
function seedDraft() {
  for (const key of Object.keys(draft)) delete draft[key];
  for (const row of rows.value) {
    if (row.default !== undefined && row.default !== null) draft[row.id] = row.default;
  }
  const scoped = props.scopedInstance;
  if (scoped) {
    for (const row of rows.value) {
      if (row.lineage?.accepts?.includes(scoped.type)) {
        draft[row.id] = { type: scoped.type, id: scoped.id };
      }
    }
  }
}

async function submit() {
  const entry = props.entry;
  if (!entry) return;
  submitting.value = true;
  try {
    const result = await instances.runAction({
      action: entry.action,
      actionId: entry.action.id,
      entities: {},
      data: createDialogPayload(draft),
      parameters: {}
    });
    const entity = createdEntity(entry.action, result);
    const id = entity?._id ?? entity?.id;
    if (id) emit('applied', { rowId: entry.rowId, apply: entry.apply, typeId: entry.typeId, id: String(id) });
    emit('close');
  } catch (error) {
    const failures = refusalFailuresOf(error);
    if (failures) {
      toast.add({
        severity: 'error',
        summary: entry.action.label || entry.action.id,
        detail: failures.map(failure => [failure.name, failure.message].filter(Boolean).join(' — ')).join('\n'),
        life: 6000
      });
      return;
    }
    throw error;
  } finally {
    submitting.value = false;
  }
}
</script>
