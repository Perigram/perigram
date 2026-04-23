<template>
  <div class="flex flex-col gap-6">
    <div class="flex items-center justify-between gap-4">
      <h2>{{ $t('nav.cassettes') }}</h2>
      <div class="flex gap-2">
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
      </div>
    </div>

    <div v-if="!cassettes || cassettes.length === 0" class="text-center py-20 border border-dashed rounded italic opacity-50">
      <i class="pi pi-inbox text-6xl block mb-4"></i>
      <p>{{ !cassettes ? $t('cassette.loading') : $t('cassette.noCassettes') }}</p>
    </div>

    <div class="grid-hub">
      <Card v-for="cassette in cassettes" :key="cassette._id" 
        class="card-interactive"
      >
        <template #header>
            <div class="aspect-square relative overflow-hidden">
                <CassetteThumbnail :cassette="cassette" />
                <!-- Actions overlay -->
                <div class="absolute top-2 right-2 flex gap-1">
                    <Button icon="pi pi-pencil" text @click="editCassette(cassette)" />
                    <Button icon="pi pi-trash" text severity="danger" @click="handleDelete(cassette._id)" />
                </div>
            </div>
        </template>
        <template #title>
          <Inplace @open="onRenameStart(cassette)">
            <template #display>
              <span class="truncate block">
                {{ getCassetteName(cassette) }}
              </span>
            </template>
            <template #content="{ closeCallback }">
              <InputText v-model="editingName" size="small" autofocus @keyup.enter="onRename(cassette, closeCallback)" @keyup.esc="closeCallback" />
            </template>
          </Inplace>
        </template>
        <template #subtitle>
            <div class="flex items-center justify-between gap-2">
                <EntityStatus :entity="cassette" entity-type="cassette" variant="inline" />
                <small>{{ formatDate(cassette.status?.timestamp || cassette.origin?.timestamp) }}</small>
            </div>
        </template>
      </Card>
    </div>

    <CassetteEditorDialog 
      v-model="showUploadDialog"
      @uploaded="handleUploaded"
    />

    <Dialog 
      v-model:visible="showDesignerDialog"
      :header="$t('cassette.designerTitle')"
      :style="{ width: '95vw', height: '95vh' }"
      :modal="true"
      @hide="editingCassette = null"
    >
      <CassetteDesigner :initial-data="editingCassette" @saved="showDesignerDialog = false" />
    </Dialog>
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCassettesStore } from '~/stores/cassettes';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import Inplace from 'primevue/inplace';
import InputText from 'primevue/inputtext';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import CassetteEditorDialog from './CassetteEditorDialog.vue';
import CassetteDesigner from './CassetteDesigner.vue';
import CassetteThumbnail from './CassetteThumbnail.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const { t } = useI18n();
const cassettesStore = useCassettesStore();
const { cassettes } = storeToRefs(cassettesStore);
const toast = useToast();
const confirm = useConfirm();

// UI State
const showUploadDialog = ref(false);
const showDesignerDialog = ref(false);
const editingCassette = ref(null);
const editingName = ref('');

onMounted(async () => {
  await cassettesStore.fetchCassettes();
});

const formatDate = (date) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
};

const getCassetteName = (cassette) => {
    const { name } = useIdentity(cassette);
    return name.value;
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

const onRenameStart = (cassette) => {
  editingName.value = getCassetteName(cassette);
};

const onRename = async (cassette, closeCallback) => {
  const newName = editingName.value.trim();
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
