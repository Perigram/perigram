<template>
  <StandardDialog
    v-model:visible="visible"
    size="sm"
    :save-label="$t('common.upload')"
    :cancel-label="$t('common.cancel')"
    :show-default-footer="true"
    :loading="uploading"
    @save="upload"
    @cancel="close"
  >
    <template #header>{{ $t('generatedScreen.createArtifact') }}</template>
    <div class="flex flex-col gap-4">
      <Message v-if="errorMessage" severity="error" :closable="false">
        {{ errorMessage }}
      </Message>
      <Select
        v-if="creationKinds.length > 1"
        v-model="kind"
        :options="creationKinds"
        option-label="kind"
        option-value="kind"
      />
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-color">{{ $t('common.name') }}</span>
        <InputText v-model="name" class="w-full" />
      </label>
      <div v-if="creationMode !== 'editor'" class="flex flex-col items-start gap-2">
        <input ref="fileInput" class="hidden" type="file" :accept="accept" :capture="capture" @change="selectNativeFile">
        <Button :label="$t('generatedScreen.selectArtifactFile')" icon="pi pi-upload" size="small" severity="secondary" outlined @click="fileInput?.click()" />
        <span v-if="file" class="text-sm text-muted-color">{{ file.name }}</span>
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/EntitySelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useI18n } from 'vue-i18n';
import { emitEntityCreated } from '~/utils/entity-events.js';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  creator: { type: Object, required: true },
  lineage: { type: Object, default: () => ({}) }
});
const emit = defineEmits(['update:modelValue', 'created']);
const { t } = useI18n();
const visible = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
});
const file = ref(null);
const kind = ref('');
const uploading = ref(false);
const name = ref('');
const errorMessage = ref('');
const fileInput = ref(null);
const creationKinds = computed(() => (props.creator.attachmentKinds || [])
  .filter(item => ['upload', 'capture', 'editor'].includes(item.creation?.mode)));
const definition = computed(() => creationKinds.value.find(item => item.kind === kind.value) || {});
const creationMode = computed(() => definition.value.creation?.mode || 'upload');
const accept = computed(() => definition.value.creation?.accept || acceptForKind(kind.value));
const capture = computed(() => definition.value.creation?.capture || undefined);

watch(creationKinds, kinds => {
  if (!kinds.some(item => item.kind === kind.value)) kind.value = kinds[0]?.kind || '';
}, { immediate: true });

function selectFile(event) {
  file.value = event.files?.[0] || null;
  if (!name.value && file.value?.name) name.value = file.value.name;
}

function selectNativeFile(event) {
  file.value = event.target.files?.[0] || null;
  if (!name.value && file.value?.name) name.value = file.value.name;
}

async function upload() {
  errorMessage.value = '';
  if (!file.value && creationMode.value !== 'editor') {
    errorMessage.value = t('generatedScreen.artifactFileRequired');
    return;
  }
  if (!kind.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    const initial = creationMode.value === 'editor'
      ? new File([''], `${name.value || 'artifact'}${kind.value.includes('CSV') ? '.csv' : '.txt'}`, { type: kind.value.includes('CSV') ? 'text/csv' : 'text/plain' })
      : file.value;
    form.append('file', initial);
    form.append('type', kind.value);
    form.append('name', name.value || initial.name);
    form.append('lineage', JSON.stringify(props.lineage || {}));
    const artifact = await $fetch('/api/artifacts', { method: 'POST', body: form });
    emitEntityCreated({ type: 'artifact', id: artifact?._id, entity: artifact, reason: 'artifact-uploaded' });
    emit('created', artifact);
    close();
  } catch (error) {
    errorMessage.value = error?.data?.message || error?.message || t('generatedScreen.artifactUploadFailed');
  } finally {
    uploading.value = false;
  }
}

function close() {
  visible.value = false;
  file.value = null;
  name.value = '';
  errorMessage.value = '';
}

function acceptForKind(attachmentKind = '') {
  if (attachmentKind === 'DXF_SOURCE') return '.dxf,application/dxf';
  if (attachmentKind === 'CAPTURE_PHOTO') return 'image/*';
  return '';
}
</script>
