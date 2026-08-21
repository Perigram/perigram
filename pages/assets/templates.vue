<template>
  <StandardPage :title="$t('assets.templates')">
    <template #actions>
      <Button
        v-if="canWrite"
        :label="$t('assets.newTemplate')"
        icon="pi pi-plus"
        size="small"
        @click="openUpload"
      />
    </template>

    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <StateBlock v-else-if="error" state="error" :message="error" />
    <StateBlock v-else-if="!templates.length" :message="$t('artifactTemplates.empty')" icon="pi pi-file-edit" />
    <ResponsiveGrid v-else variant="cards">
      <ArtifactTemplateCard
        v-for="template in templates"
        :key="template._id"
        :artifact-template="template"
      >
        <template #footer>
          <div class="flex justify-end gap-2">
            <Button
              icon="pi pi-download"
              text
              rounded
              size="small"
              :aria-label="$t('common.download')"
              @click="downloadSource(template)"
            />
            <Button
              v-if="canEdit(template)"
              icon="pi pi-pencil"
              text
              rounded
              size="small"
              :aria-label="$t('common.edit')"
              @click="openEditor(template)"
            />
            <GeneratedDeleteButton entity-type="artifactTemplate" :entity="template" @deleted="load" />
          </div>
        </template>
      </ArtifactTemplateCard>
    </ResponsiveGrid>

    <StandardDialog
      v-model:visible="uploadVisible"
      size="sm"
      :save-label="$t('common.upload')"
      :cancel-label="$t('common.cancel')"
      :show-default-footer="true"
      :loading="uploading"
      @save="uploadTemplate"
      @cancel="uploadVisible = false"
    >
      <template #header>{{ $t('assets.newTemplate') }}</template>
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-muted-color text-supporting">{{ $t('common.name') }}</span>
          <InputText v-model="uploadName" />
        </label>
        <FileUpload
          mode="basic"
          accept=".dxf,.pdf,application/pdf,application/dxf"
          :choose-label="$t('artifactTemplates.selectFile')"
          custom-upload
          @select="onFileSelect"
        />
        <small v-if="uploadFile" class="text-muted-color">{{ uploadFile.name }}</small>
      </div>
    </StandardDialog>

    <StandardDialog
      v-model:visible="editorVisible"
      size="full"
      :save-label="$t('common.save')"
      :cancel-label="$t('common.cancel')"
      :show-default-footer="true"
      :loading="saving"
      @save="saveLayout"
      @cancel="editorVisible = false"
    >
      <template #header>{{ editingTemplate?.identity?.name || $t('artifactTemplates.layout') }}</template>
      <ArtifactLayoutEditor v-if="layoutDraft" v-model="layoutDraft" />
    </StandardDialog>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import ArtifactLayoutEditor from '~/components/ArtifactLayoutEditor.vue';
import ArtifactTemplateCard from '~/components/entities/ArtifactTemplate/ArtifactTemplateCard.vue';
import GeneratedDeleteButton from '~/components/generated/GeneratedDeleteButton.vue';
import { useAuthStore } from '~/stores/auth';
import { hasPermissionGrant } from '#shared/access-control.js';

definePageMeta({ layout: 'app', middleware: 'auth' });

const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();
const templates = ref([]);
const loading = ref(false);
const uploading = ref(false);
const saving = ref(false);
const error = ref('');
const uploadVisible = ref(false);
const editorVisible = ref(false);
const uploadName = ref('');
const uploadFile = ref(null);
const editingTemplate = ref(null);
const layoutDraft = ref(null);
const canWrite = computed(() => authStore.hasPermission('artifact_templates', 'write'));

function canEdit(template) {
  return hasPermissionGrant({
    permissions: authStore.activePermissions,
    feature: 'artifact_templates',
    action: 'update',
    entity: template,
    entityType: 'artifact_template'
  });
}

onMounted(load);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    templates.value = await $fetch('/api/artifact-templates');
  } catch (requestError) {
    error.value = requestError?.data?.message || requestError?.message || t('common.error');
  } finally {
    loading.value = false;
  }
}

function openUpload() {
  uploadName.value = '';
  uploadFile.value = null;
  uploadVisible.value = true;
}

function onFileSelect(event) {
  uploadFile.value = event.files?.[0] || null;
  if (!uploadName.value && uploadFile.value?.name) uploadName.value = uploadFile.value.name.replace(/\.(dxf|pdf)$/i, '');
}

async function uploadTemplate() {
  if (!uploadFile.value) return;
  uploading.value = true;
  try {
    const form = new FormData();
    form.append('file', uploadFile.value);
    if (uploadName.value.trim()) form.append('name', uploadName.value.trim());
    await $fetch('/api/artifact-templates', { method: 'POST', body: form });
    uploadVisible.value = false;
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('artifactTemplates.uploaded'), life: 2000 });
    await load();
  } catch (requestError) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: requestError?.data?.message || requestError?.message, life: 4000 });
  } finally {
    uploading.value = false;
  }
}

function openEditor(template) {
  editingTemplate.value = template;
  layoutDraft.value = JSON.parse(JSON.stringify(template.data?.layout || { pages: [] }));
  editorVisible.value = true;
}

async function saveLayout() {
  if (!editingTemplate.value?._id || !layoutDraft.value) return;
  saving.value = true;
  try {
    await $fetch(`/api/artifact-templates/${editingTemplate.value._id}`, {
      method: 'PUT',
      body: { layout: layoutDraft.value }
    });
    editorVisible.value = false;
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('artifactTemplates.saved'), life: 2000 });
    await load();
  } catch (requestError) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: requestError?.data?.message || requestError?.message, life: 4000 });
  } finally {
    saving.value = false;
  }
}

function downloadSource(template) {
  window.location.href = `/api/artifact-templates/${template._id}/source`;
}
</script>
