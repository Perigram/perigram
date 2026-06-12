<template>
  <div class="flex flex-col gap-6">
    <ActionToolbar :title="$t('nav.cassettes')">
      <template #actions>
        <Button 
          :label="$t('cassette.upload')" 
          icon="pi pi-upload"
          outlined
          @click="showUploadDialog = true"
        />
        <Button 
          :label="$t('cassette.designer')" 
          icon="pi pi-pencil"
          @click="showDesignerDialog = true"
        />
      </template>
    </ActionToolbar>

    <StateBlock v-if="!cassettes || cassettes.length === 0" :message="!cassettes ? $t('cassette.loading') : $t('cassette.noCassettes')" icon="pi pi-inbox" />

    <ResponsiveGrid v-else>
      <EntityCard
        v-for="cassette in cassettes"
        :key="cassette._id"
        :entity="cassette"
        entity-type="cassette_template"
        :show-trace="false"
        :show-status="false"
      >
        <template #before-identity>
          <i class="pi pi-clone"></i>
        </template>

        <template #subtitle>
          <small>{{ formatDate(cassette.status?.timestamp || cassette.origin?.timestamp) }}</small>
        </template>

        <div class="flex flex-col gap-4">
          <CassetteThumbnail :cassette="cassette" />
        </div>

        <template #footer>
          <div class="flex justify-end gap-2" data-entity-card-interactive="true" @click.stop>
            <NameEditPopover
              :model-value="getCassetteName(cassette)"
              :label="$t('common.name')"
              :aria-label="$t('common.edit')"
              @save="(name, close) => onRename(cassette, name, close)"
            />
            <Button icon="pi pi-pencil" text rounded size="small" :aria-label="$t('common.edit')" @click="editCassette(cassette)" />
            <Button
              icon="pi pi-sitemap"
              text
              rounded
              size="small"
              :loading="creatingDesignId === cassette._id"
              :aria-label="$t('cassetteDesign.createFromTemplate')"
              data-testid="cassette-template-create-design"
              @click="createDesignFromTemplate(cassette)"
            />
            <Button
              icon="pi pi-download"
              text
              rounded
              size="small"
              :aria-label="$t('cassette.downloadDxf')"
              @click="downloadCassetteDxf(cassette)"
            />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" :aria-label="$t('common.delete')" @click="handleDelete(cassette._id)" />
          </div>
        </template>
      </EntityCard>
    </ResponsiveGrid>

    <CassetteEditorDialog 
      v-model="showUploadDialog"
      @uploaded="handleUploaded"
    />

    <StandardDialog
      v-model:visible="showDesignerDialog"
      :header="$t('cassette.designerTitle')"
      size="full"
      @hide="editingCassette = null"
    >
      <CassetteDesignerV2
        :template="editingCassette"
        :template-options="cassetteTemplateOptions"
        :persisted-template-ids="persistedTemplateIds"
        @load-template="loadDesignerTemplate"
        @save-template="handleDesignerSaved"
      />
    </StandardDialog>
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCassettesStore } from '~/stores/cassettes';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import ConfirmDialog from 'primevue/confirmdialog';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteDesignerV2 from './CassetteDesignerV2.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import ActionToolbar from '~/components/shared/ActionToolbar.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import NameEditPopover from '~/components/shared/NameEditPopover.vue';

const { t } = useI18n();
const cassettesStore = useCassettesStore();
const { cassettes } = storeToRefs(cassettesStore);
const toast = useToast();
const confirm = useConfirm();

// UI State
const showUploadDialog = ref(false);
const showDesignerDialog = ref(false);
const editingCassette = ref(null);
const creatingDesignId = ref(null);
const cassetteTemplateOptions = computed(() => (cassettes.value || []).map(cassette => ({
  label: getCassetteName(cassette),
  value: cassette._id?.toString()
})));
const persistedTemplateIds = computed(() => (cassettes.value || [])
  .map(cassette => cassette._id?.toString())
  .filter(Boolean));

onMounted(async () => {
  await cassettesStore.fetchCassettes();
});

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
};

const getCassetteName = (cassette) => {
    return cassette?.identity?.name || cassette?.identity?.slug || t('common.unnamed');
};

const handleDelete = async (cassetteId) => {
  confirm.require({
    message: t('messages.confirmDeleteCassette'),
    header: t('common.confirm'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      await cassettesStore.deleteCassette(cassetteId);
      const result = await cassettesStore.fetchCassettes();
      cassettes.value = result || [];
    }
  });
};

const editCassette = (cassette) => {
  editingCassette.value = cassette;
  showDesignerDialog.value = true;
};

const createDesignFromTemplate = async (cassette) => {
  if (!cassette?._id) return;
  creatingDesignId.value = cassette._id;
  try {
    await $fetch(`/api/cassettes/${encodeURIComponent(cassette._id)}/designs`, {
      method: 'POST',
      body: { parameters: defaultTemplateParameters(cassette) }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassetteDesign.createdFromTemplate'), life: 3000 });
  } catch {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassetteDesign.createFromTemplateFailed'), life: 4000 });
  } finally {
    creatingDesignId.value = null;
  }
};

const defaultTemplateParameters = (cassette) => {
  const definitions = cassette?.data?.parameters || cassette?.data?.definition?.parameters || [];
  if (!Array.isArray(definitions)) return {};
  return definitions.reduce((parameters, item) => {
    const key = item?.key || item?.name || item;
    if (!key) return parameters;
    parameters[key] = Number(item?.default ?? item?.value ?? item?.min ?? 1);
    return parameters;
  }, {});
};

const downloadCassetteDxf = (cassette) => {
  if (!cassette?._id || !import.meta.client) return;
  window.location.href = `/api/cassettes/${encodeURIComponent(cassette._id)}/export`;
};

const loadDesignerTemplate = async (cassetteId) => {
  const id = cassetteId?.toString?.() || cassetteId;
  if (!id) return;
  editingCassette.value = cassettes.value.find(cassette => cassette._id?.toString() === id) ||
    await cassettesStore.fetchById(id);
};

const handleDesignerSaved = async (payload = {}) => {
  const result = await cassettesStore.fetchCassettes();
  cassettes.value = result || [];
  const savedId = payload.savedEntity?._id || payload.id;
  editingCassette.value = savedId
    ? cassettes.value.find(cassette => cassette._id?.toString() === savedId.toString()) || payload.savedEntity || null
    : null;
  showDesignerDialog.value = false;
};

const onRename = async (cassette, newName, closeCallback) => {
  if (!newName) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.nameRequired'), life: 3000 });
    return;
  }
  
  if (newName === getCassetteName(cassette)) {
    closeCallback();
    return;
  }

  try {
    await cassettesStore.updateCassette(cassette._id, { name: newName });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.messages.renamed'), life: 2000 });
    closeCallback();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.renameFailed'), life: 3000 });
  }
};

const handleUploaded = async () => {
  showUploadDialog.value = false;
  const result = await cassettesStore.fetchCassettes();
  cassettes.value = result || [];
};
</script>

<style scoped lang="scss">
</style>
