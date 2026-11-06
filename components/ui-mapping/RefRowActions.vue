<template>
  <div ref="rootEl" v-if="hasAffordances" class="flex shrink-0 items-center gap-1">
    <Button
      v-if="entries.length === 1"
      icon="pi pi-plus"
      size="small"
      severity="secondary"
      text
      rounded
      :aria-label="createLabel"
      :title="createLabel"
      :loading="creating"
      @click="runCreate(entries[0])"
    />
    <Button
      v-else-if="entries.length"
      icon="pi pi-plus"
      size="small"
      severity="secondary"
      text
      rounded
      :aria-label="createLabel"
      :title="createLabel"
      :loading="creating"
      @click="event => menuRef?.toggle(event)"
    />
    <Menu ref="menuRef" :model="menuModel" :append-to="rootEl" popup />
    <input ref="fileRef" type="file" class="hidden" :accept="fileAccept" @change="onFilePicked" />
    <Button
      v-if="pickedOpenable"
      icon="pi pi-external-link"
      size="small"
      severity="secondary"
      text
      rounded
      :aria-label="t('common.open')"
      :title="t('common.open')"
      @click="entityPopup.open({ typeId: String(value.type), instanceId: String(value.id) })"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { creationModeLabel } from '~/packages/processes/src/ui-contract-projection.js';
import { createdEntity } from '~/utils/instance-run-results.js';
import { useInstancesStore } from '~/stores/instances';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useEntityPopup } from '~/composables/useEntityPopup';
import { openBlankFileEditor } from '~/components/generated/file-surfaces.js';

// The fill dialog's reference-slot affordances (SPEC §24 rails): create
// through the accepted type's declared creation mode — the editor
// protocol opens the blank page, an upload-mode create runs inline over
// the files channel, every other create opens the host's nested dialog —
// and open the picked record (its surface is the editor of an
// editor-bound type, SPEC §4) as the bounded record popup. Pickers
// compose the same component picker-local (SPEC §22.13); type records
// resolve through the served type view, so no bundle travels.
const props = defineProps({
  typeIds: { type: Array, default: () => [] },
  value: { type: Object, default: null },
  // Compiled create actions by accepted type id: `{ [typeId]: action[] }`.
  createActions: { type: Object, default: () => ({}) }
});

const emit = defineEmits(['select', 'construct-create']);
const { t } = useI18n();
const toast = useToast();
const instances = useInstancesStore();
const view = useFileTypeView();
const entityPopup = useEntityPopup();
// The protocol menu mounts inside the component root: a popover-hosted
// create (the pickers') keeps its subtree alive through the async run,
// so the created record's select still lands.
const rootEl = ref(null);
const menuRef = ref(null);
const fileRef = ref(null);
const creating = ref(false);
const pendingUpload = ref(null);

const typeRecordOf = typeId => view.typeById(typeId) || null;

// The editor protocol is the declared `payload.creation` vocabulary; the
// create actions are what the org can actually run.
const entries = computed(() => props.typeIds.flatMap(typeId => {
  const type = typeRecordOf(typeId);
  if (!type) return [];
  const list = [];
  if ((type.payload?.creation || []).includes('editor')) {
    list.push({ typeId, protocol: 'editor', modeLabel: 'Editor', action: null });
  }
  for (const action of props.createActions[typeId] || []) {
    const mode = action.construction?.mode || '';
    list.push({ typeId, protocol: mode === 'upload' ? 'upload' : 'construct', modeLabel: creationModeLabel(mode) || 'Create', action });
  }
  if (!list.length) return [];
  const label = type.name || typeId;
  return list.map(entry => ({ ...entry, label: list.length > 1 ? `${label} · ${entry.modeLabel}` : label }));
}));

const pickedOpenable = computed(() => Boolean(props.value?.id && entityPopup.openable(String(props.value.type))));
const hasAffordances = computed(() => entries.value.length > 0 || pickedOpenable.value);

// The dialog's submit shares the word "Create": the reference-slot create
// names the thing it creates when its accepted set is a single type.
const createLabel = computed(() => {
  const sole = props.typeIds.length === 1 ? typeRecordOf(props.typeIds[0]) : null;
  const typeLabel = sole?.name || sole?.id || '';
  return typeLabel ? `${t('common.create')} ${typeLabel}` : t('common.create');
});

const menuModel = computed(() => entries.value.map((entry, index) => ({
  label: entry.label,
  key: `${entry.typeId}:${entry.protocol}:${index}`,
  command: () => runCreate(entry)
})));

const fileAccept = computed(() => {
  const type = typeRecordOf(pendingUpload.value?.typeId);
  return (type?.payload?.accept || type?.payload?.mime || []).join(',') || undefined;
});

function runCreate(entry) {
  if (entry.protocol === 'editor') {
    openBlankFileEditor(entry.typeId);
    return;
  }
  if (entry.protocol === 'upload') {
    pendingUpload.value = entry;
    fileRef.value?.click();
    return;
  }
  emit('construct-create', entry.action);
}

async function onFilePicked(event = {}) {
  const file = event.target?.files?.[0];
  const entry = pendingUpload.value;
  event.target.value = '';
  if (!file || !entry) return;
  creating.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const stored = await $fetch('/api/files/upload?bucket=files', { method: 'POST', body: form });
    const result = await instances.runAction({
      action: entry.action,
      actionId: entry.action.id,
      entities: {},
      data: { payload: { fileId: stored.id, mime: file.type || null, size: file.size, name: file.name } },
      parameters: {}
    });
    const entity = createdEntity(entry.action, result);
    const id = entity?._id ?? entity?.id;
    if (id) emit('select', { type: entry.typeId, id: String(id), entity });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    creating.value = false;
    pendingUpload.value = null;
  }
}
</script>
