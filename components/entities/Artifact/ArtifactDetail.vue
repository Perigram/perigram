<template>
  <EntityPage :entity="artifact" entity-type="artifact">
    <template #actions>
      <Button icon="pi pi-download" :label="$t('common.download')" size="small" severity="secondary" outlined @click="download" />
      <Button v-if="canEdit && revision" icon="pi pi-history" :label="$t('artifacts.restoreRevision')" size="small" severity="secondary" outlined @click="restore" />
    </template>

    <div class="flex min-h-[32rem] flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <input ref="replacementInput" class="hidden" type="file" :accept="creation.accept" @change="replaceFile">
        <Button v-if="canReplaceFile" icon="pi pi-upload" :label="$t('generatedScreen.replaceArtifactFile')" size="small" severity="secondary" outlined @click="replacementInput?.click()" />
        <Select v-if="revisions.length" v-model="selectedRevisionId" :options="revisionOptions" option-label="label" option-value="value" size="small" class="min-w-48" />
      </div>
      <template v-if="canEdit && layoutDraft && editor.mode === 'layout'"><ArtifactLayoutEditor v-model="layoutDraft" /></template>
      <ArtifactTextEditor v-else-if="canEdit && ['text', 'csv'].includes(editor.mode)" :artifact="artifact" @saved="$emit('saved', $event)" />
      <SketchEditor v-else-if="canEdit && editor.mode === 'sketch'" :artifact="artifact" @saved="$emit('saved', $event)" />
      <ArtifactViewer v-else :artifact="artifact" :revision="revision" />
    </div>
  </EntityPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Select from '~/components/shared/EntitySelect.vue';
import EntityPage from '~/components/shared/EntityPage.vue';
import ArtifactViewer from '~/components/artifacts/ArtifactViewer.vue';
import ArtifactTextEditor from '~/components/artifacts/ArtifactTextEditor.vue';
import SketchEditor from '~/components/artifacts/SketchEditor.vue';
import ArtifactLayoutEditor from '~/components/ArtifactLayoutEditor.vue';
import { useAuthStore } from '~/stores/auth';

import { hasPermissionGrant } from '#shared/access-control.js';
import { artifactRevisionOptions, resolveArtifactEditingContract } from '~/utils/artifact-detail.js';

const props = defineProps({ artifact: { type: Object, required: true } });
const emit = defineEmits(['saved']);
const authStore = useAuthStore();
const revisions = ref([]);
const selectedRevisionId = ref('');
const layoutDraft = ref(null);
const replacementInput = ref(null);
const canEdit = computed(() => hasPermissionGrant({ permissions: authStore.activePermissions, feature: 'artifacts', level: 'write', entity: props.artifact, entityType: 'artifact' }));
const editing = computed(() => resolveArtifactEditingContract({ artifact: props.artifact, canEdit: canEdit.value }));
const creation = computed(() => editing.value.creation);
const editor = computed(() => editing.value.editor);
const canReplaceFile = computed(() => editing.value.canReplaceFile);
const revision = computed(() => revisions.value.find(item => String(item._id) === String(selectedRevisionId.value)) || null);
const revisionOptions = computed(() => artifactRevisionOptions(revisions.value));

async function loadRevisions() {
  revisions.value = await $fetch(`/api/entity-revisions?entityType=artifact&entityId=${encodeURIComponent(props.artifact._id)}&scope=file`);
  selectedRevisionId.value = '';
}
onMounted(loadRevisions);
watch(() => props.artifact._id, loadRevisions);
watch(() => props.artifact, artifact => { layoutDraft.value = artifact.data?.layout ? structuredClone(artifact.data.layout) : null; }, { immediate: true, deep: true });

async function replaceFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const form = new FormData(); form.append('file', file, file.name);
    const updated = await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}/file`, { method: 'PUT', body: form });
    await loadRevisions();
    emit('saved', updated);
  } finally {
    event.target.value = '';
  }
}
async function restore() {
  const updated = await $fetch(`/api/artifacts/${encodeURIComponent(props.artifact._id)}/revisions/${encodeURIComponent(revision.value._id)}/restore`, { method: 'POST' });
  await loadRevisions();
  emit('saved', updated);
}
function download() { window.open(revision.value?._id ? `/api/entity-revisions/${encodeURIComponent(revision.value._id)}/file` : `/api/artifacts/${encodeURIComponent(props.artifact._id)}`, '_blank', 'noopener'); }
</script>
