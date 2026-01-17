<template>
  <div class="p-4">
    <div class="flex justify-end items-center mb-8">
      <Button 
        :label="$t('assets.newTool')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div v-if="loading">{{ $t('assets.loadingTools') }}</div>
    <div v-else-if="error">{{ error }}</div>
    
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
      <Card v-for="tool in tools" :key="tool._id" class="h-full">
        <template #title>
          {{ tool.name }}
          <Tag v-if="!tool.ownerId" :value="$t('assets.system')" severity="info" />
        </template>
        <template #content>
          <p>
            {{ $t('assets.diameter') }}: Ø{{ tool.diameter }}mm<br>
            {{ $t('assets.angle') }}: {{ tool.angle }}°
          </p>
        </template>
        <template #footer>
          <div class="flex gap-2" v-if="tool.ownerId">
            <Button 
              :label="$t('common.edit')" 
              icon="pi pi-pencil" 
              severity="secondary"
              size="small"
              @click="editTool(tool)"
            />
            <Button 
              :label="$t('common.delete')" 
              icon="pi pi-trash" 
              severity="danger"
              size="small"
              @click="deleteToolConfirm(tool)"
            />
          </div>
        </template>
      </Card>
    </div>
    
    <!-- Tool Dialog -->
    <Dialog 
      v-model:visible="showDialog" 
      :header="editingTool ? $t('assets.editTool') : $t('assets.newTool')"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">{{ $t('batch.name') }}</label>
        <InputText v-model="form.name" :placeholder="$t('assets.placeholders.toolName')" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.diameter') }} (mm)</label>
        <InputNumber v-model="form.diameter" :min="0.1" :max="100" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.angle') }} (°)</label>
        <InputNumber v-model="form.angle" :min="0" :max="180" :step="1" />
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" @click="closeDialog" />
        <Button :label="$t('common.save')" @click="saveTool" />
      </template>
    </Dialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { storeToRefs } from 'pinia';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ConfirmDialog from 'primevue/confirmdialog';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const toolProfilesStore = useToolProfilesStore();
const { tools, loading, error } = storeToRefs(toolProfilesStore);
const confirm = useConfirm();
const toast = useToast();

const showDialog = ref(false);
const editingTool = ref(null);
const form = ref({
  name: '',
  diameter: 3.15,
  angle: 0
});

onMounted(async () => {
  await toolProfilesStore.fetchTools();
});

const editTool = (tool) => {
  editingTool.value = tool;
  form.value = { ...tool };
  showDialog.value = true;
};

const closeDialog = () => {
  showDialog.value = false;
  editingTool.value = null;
  form.value = { name: '', diameter: 3.15, angle: 0 };
};

const saveTool = async () => {
  try {
    if (editingTool.value) {
      await toolProfilesStore.updateTool(editingTool.value._id, form.value);
    } else {
      await toolProfilesStore.createTool(form.value);
    }
    closeDialog();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.saveToolFailed') + ': ' + error.message, life: 3000 });
  }
};

const deleteToolConfirm = (tool) => {
  confirm.require({
    message: t('messages.confirmDeleteFile', { name: tool.name }),
    header: t('artifacts.deleteTitle'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await toolProfilesStore.deleteTool(tool._id);
      } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.deleteToolFailed') + ': ' + error.message, life: 3000 });
      }
    }
  });
};
</script>
