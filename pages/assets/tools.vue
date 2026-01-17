<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center px-1">
      <Button 
        :label="$t('assets.newTool')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div v-if="loading" class="flex items-center justify-center py-12">
      <ProgressSpinner />
    </div>
    <div v-else-if="error" class="px-1">
      <Message severity="error">{{ error }}</Message>
    </div>
    
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-1">
      <Card v-for="tool in tools" :key="tool._id" 
        class="h-full border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] transition-all duration-300 shadow-sm hover:shadow-md"
      >
        <template #title>
          <div class="flex items-center justify-between gap-3 min-w-0 pt-2 px-1">
            <span class="truncate font-bold text-lg text-[var(--p-text-color)]">{{ tool.name }}</span>
            <Tag v-if="!tool.ownerId" :value="$t('assets.system')" severity="info" class="text-[10px] uppercase flex-shrink-0" />
          </div>
        </template>
        <template #content>
          <div class="py-4 px-1 flex flex-col gap-4">
            <div class="w-16 h-16 mx-auto flex items-center justify-center bg-[var(--p-primary-50)] text-[var(--p-primary-color)] rounded-full">
              <i class="pi pi-cog text-3xl"></i>
            </div>
            <div class="grid grid-cols-2 gap-y-2 text-xs">
              <span class="font-medium text-[var(--p-text-muted-color)]">{{ $t('assets.diameter') }}:</span>
              <span class="text-right font-bold text-[var(--p-text-color)]">Ø{{ tool.diameter }}mm</span>
              
              <span class="font-medium text-[var(--p-text-muted-color)]">{{ $t('assets.angle') }}:</span>
              <span class="text-right font-bold text-[var(--p-text-color)]">{{ tool.angle }}°</span>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 pt-4 border-t border-[var(--p-content-border-color)] mt-auto px-1" v-if="tool.ownerId">
            <Button 
              icon="pi pi-pencil" 
              severity="secondary" 
              text
              rounded
              size="small"
              @click="editTool(tool)"
              v-tooltip.top="$t('common.edit')"
            />
            <Button 
              icon="pi pi-trash" 
              severity="danger" 
              text
              rounded
              size="small"
              @click="deleteToolConfirm(tool)"
              v-tooltip.top="$t('common.delete')"
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
      :style="{ width: '95vw', maxWidth: '500px' }"
    >
      <div class="flex flex-col gap-6 py-4">
        <div class="flex flex-col gap-2">
          <label class="font-medium text-[var(--p-text-color)]">{{ $t('batch.name') }}</label>
          <InputText v-model="form.name" :placeholder="$t('assets.placeholders.toolName')" class="w-full" autofocus />
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label class="font-medium text-[var(--p-text-color)]">{{ $t('assets.diameter') }} (mm)</label>
            <InputNumber v-model="form.diameter" :min="0.1" :max="100" :step="0.1" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          
          <div class="flex flex-col gap-2">
            <label class="font-medium text-[var(--p-text-color)]">{{ $t('assets.angle') }} (°)</label>
            <InputNumber v-model="form.angle" :min="0" :max="180" :step="1" class="w-full" />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="closeDialog" />
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
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';

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
  form.value = JSON.parse(JSON.stringify(tool));
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