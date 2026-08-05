<template>
  <EntityPage :entity="artifact" entity-type="artifact">
    <template #actions>
      <Button icon="pi pi-download" :label="$t('common.download')" size="small" severity="secondary" outlined @click="download" />
      <Button v-if="canEdit" icon="pi pi-save" :label="$t('common.save')" size="small" :loading="saving" @click="save" />
    </template>

    <Panel>
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-muted-color">{{ $t('common.name') }}</span>
          <InputText v-model="name" :disabled="!canEdit" class="w-full" />
        </label>
        <FileUpload
          v-if="canReplaceFile"
          mode="basic"
          :accept="creation.accept"
          :choose-label="$t('generatedScreen.replaceArtifactFile')"
          custom-upload
          @select="replaceFile"
        />
      </div>
    </Panel>

    <Panel v-if="layoutDraft && editor.mode === 'layout'" :header="$t('artifactTemplates.layout')">
      <ArtifactLayoutEditor v-model="layoutDraft" />
    </Panel>
  </EntityPage>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import InputText from 'primevue/inputtext';
import Panel from 'primevue/panel';
import EntityPage from '~/components/shared/EntityPage.vue';
import ArtifactLayoutEditor from '~/components/ArtifactLayoutEditor.vue';
import { useAuthStore } from '~/stores/auth';
import { useCutkitDomainUi } from '~/composables/useCutkitDomainUi.js';
import { hasPermissionGrant } from '#shared/access-control.js';

const props = defineProps({ artifact: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const authStore = useAuthStore();
const domainUi = useCutkitDomainUi();
const saving = ref(false);
const name = ref('');
const layoutDraft = ref(null);
const kind = computed(() => props.artifact.data?.type || '');
const creation = computed(() => domainUi.getAttachmentCreation(kind.value));
const editor = computed(() => domainUi.getAttachmentEditor(kind.value));
const canEdit = computed(() => hasPermissionGrant({
  permissions: authStore.activePermissions,
  feature: 'artifacts',
  level: 'write',
  entity: props.artifact,
  entityType: 'artifact'
}));
const canReplaceFile = computed(() => canEdit.value && creation.value.mode === 'upload');

watch(() => props.artifact, artifact => {
  name.value = artifact.identity?.name || '';
  layoutDraft.value = artifact.data?.layout ? structuredClone(artifact.data.layout) : null;
}, { immediate: true, deep: true });

async function save() {
  saving.value = true;
  try {
    let updated = await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}`, {
      method: 'PUT',
      body: { name: name.value }
    });
    if (editor.value.mode === 'layout' && layoutDraft.value) {
      updated = await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}/layout`, {
        method: 'PUT',
        body: { layout: layoutDraft.value, values: props.artifact.data?.values || {} }
      });
    }
    emit('saved', updated);
  } finally {
    saving.value = false;
  }
}

async function replaceFile(event) {
  const file = event.files?.[0];
  if (!file) return;
  const form = new FormData();
  form.append('file', file);
  const updated = await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}/file`, { method: 'PUT', body: form });
  emit('saved', updated);
}

function download() {
  window.open(`/api/artifacts/${encodeURIComponent(props.artifact._id)}`, '_blank', 'noopener');
}
</script>
