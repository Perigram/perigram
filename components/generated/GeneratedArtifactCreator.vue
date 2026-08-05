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
        v-if="uploadKinds.length > 1"
        v-model="kind"
        :options="uploadKinds"
        option-label="kind"
        option-value="kind"
      />
      <label class="flex flex-col gap-1">
        <span class="text-xs text-muted-color">{{ $t('common.name') }}</span>
        <InputText v-model="name" class="w-full" />
      </label>
      <div class="flex flex-col items-start gap-2">
        <FileUpload
          mode="basic"
          :accept="accept"
          :choose-label="$t('generatedScreen.selectArtifactFile')"
          custom-upload
          @select="selectFile"
        />
        <span v-if="file" class="text-sm text-muted-color">{{ file.name }}</span>
      </div>
    </div>
  </StandardDialog>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import FileUpload from 'primevue/fileupload';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/EntitySelect.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import { useI18n } from 'vue-i18n';

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
const uploadKinds = computed(() => (props.creator.attachmentKinds || [])
  .filter(item => item.creation?.mode === 'upload'));
const accept = computed(() => uploadKinds.value
  .map(item => item.creation?.accept || acceptForKind(item.kind)).filter(Boolean).join(','));

watch(uploadKinds, kinds => {
  if (!kinds.some(item => item.kind === kind.value)) kind.value = kinds[0]?.kind || '';
}, { immediate: true });

function selectFile(event) {
  file.value = event.files?.[0] || null;
  if (!name.value && file.value?.name) name.value = file.value.name;
}

async function upload() {
  errorMessage.value = '';
  if (!file.value) {
    errorMessage.value = t('generatedScreen.artifactFileRequired');
    return;
  }
  if (!kind.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', file.value);
    form.append('type', kind.value);
    form.append('name', name.value || file.value.name);
    form.append('lineage', JSON.stringify(props.lineage || {}));
    const artifact = await $fetch('/api/artifacts', { method: 'POST', body: form });
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
