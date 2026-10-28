<template>
  <div v-if="hasAffordances" class="flex shrink-0 items-center gap-1">
    <Button
      v-if="entries.length === 1"
      icon="pi pi-plus"
      size="small"
      severity="secondary"
      text
      rounded
      :aria-label="t('common.create')"
      :title="t('common.create')"
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
      :aria-label="t('common.create')"
      :title="t('common.create')"
      :loading="creating"
      @click="event => menuRef?.toggle(event)"
    />
    <Menu ref="menuRef" :model="menuModel" popup />
    <input ref="fileRef" type="file" class="hidden" :accept="fileAccept" @change="onFilePicked" />
    <component
      :is="editorAction"
      v-if="editorAction && value?.id"
      :entity="value"
      :type-id="String(value.type)"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Menu from 'primevue/menu';
import { useInstancesStore } from '~/stores/instances';
import { openBlankFileEditor } from '~/components/generated/file-surfaces.js';

// The fill dialog's reference-slot affordances (SPEC §24 rails): create
// through the accepted type's declared creation mode — upload inline,
// editor as the blank page, construct through the host dialog — and open
// the picked instance's editor when its type binds one.
const props = defineProps({
  typeIds: { type: Array, default: () => [] },
  bundle: { type: Object, default: null },
  value: { type: Object, default: null },
  editorActions: { type: Object, default: null },
  constructibleTypeIds: { type: Array, default: () => [] }
});

const emit = defineEmits(['select', 'construct']);
const { t } = useI18n();
const instances = useInstancesStore();
const menuRef = ref(null);
const fileRef = ref(null);
const creating = ref(false);
const pendingFileEntry = ref(null);

const PROTOCOL_LABELS = { upload: 'Upload', capture: 'Capture', editor: 'Editor', content: 'Content', construct: 'Create' };

const entries = computed(() => props.typeIds.flatMap(typeId => {
  const type = (props.bundle?.types || []).find(candidate => candidate.id === typeId);
  if (!type) return [];
  const label = type.name || typeId;
  if (type.payload) {
    const protocols = type.payload.creation?.length ? type.payload.creation : ['upload'];
    return protocols.map(protocol => ({ typeId, protocol, label: protocols.length > 1 ? `${label} · ${PROTOCOL_LABELS[protocol] || protocol}` : label }));
  }
  return props.constructibleTypeIds.includes(typeId) ? [{ typeId, protocol: 'construct', label }] : [];
}));

const hasAffordances = computed(() => entries.value.length > 0 || Boolean(props.value?.id && props.editorActions?.[String(props.value.type)]));
const editorAction = computed(() => (props.value?.id ? props.editorActions?.[String(props.value.type)] || null : null));

const menuModel = computed(() => entries.value.map((entry, index) => ({
  label: entry.label,
  key: `${entry.typeId}:${entry.protocol}:${index}`,
  command: () => runCreate(entry)
})));

const fileAccept = computed(() => {
  const type = (props.bundle?.types || []).find(candidate => candidate.id === pendingFileEntry.value?.typeId);
  return (type?.payload?.accept || type?.payload?.mime || []).join(',') || undefined;
});

function runCreate(entry) {
  if (entry.protocol === 'editor') {
    if (!openBlankFileEditor(entry.typeId) && props.constructibleTypeIds.includes(entry.typeId)) emit('construct', entry.typeId);
    return;
  }
  if (entry.protocol === 'upload' || entry.protocol === 'capture') {
    pendingFileEntry.value = entry;
    fileRef.value?.click();
    return;
  }
  emit('construct', entry.typeId);
}

async function onFilePicked(event = {}) {
  const file = event.target?.files?.[0];
  const entry = pendingFileEntry.value;
  event.target.value = '';
  if (!file || !entry) return;
  creating.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    const stored = await $fetch('/api/files/upload?bucket=files', { method: 'POST', body: form });
    const created = await instances.createInstance(entry.typeId, {
      name: file.name.replace(/\.[^.]+$/, '') || file.name,
      payload: { fileId: stored.id, mime: file.type || null, size: file.size, name: file.name }
    });
    if (created?._id) emit('select', { type: entry.typeId, id: String(created._id) });
  } finally {
    creating.value = false;
    pendingFileEntry.value = null;
  }
}
</script>
