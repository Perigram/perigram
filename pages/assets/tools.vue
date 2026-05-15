<template>
  <StandardPage :title="$t('assets.tools')" :subtitle="$t('assets.toolsSubtitle')">
    <template #actions>
      <Button 
        :label="$t('assets.newTool')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </template>
    
    <StateBlock v-if="loading" state="loading" :message="$t('common.loading')" />
    <div v-else-if="error">
      <Message severity="error">{{ error }}</Message>
    </div>
    
    <StateBlock v-else-if="!tools.length" :message="$t('assets.noTools')" icon="pi pi-wrench" />

    <ResponsiveGrid v-else>
      <div v-for="tool in tools" :key="tool._id" class="flex flex-col gap-2">
        <ToolProfileCard :tool="tool" variant="card" />
        <div class="flex justify-end gap-2" v-if="tool.ownerId">
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
      </div>
    </ResponsiveGrid>
    
    <StandardDialog 
      v-model:visible="showDialog" 
      :header="editingTool ? $t('assets.editTool') : $t('assets.newTool')"
      size="sm"
    >
      <div class="flex flex-col gap-6 py-4">
        <div class="flex flex-col gap-2">
          <label>{{ $t('batch.name') }}</label>
          <InputText v-model="form.name" :placeholder="$t('assets.placeholders.toolName')" class="w-full" autofocus />
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.diameter') }} (mm)</label>
            <InputNumber v-model="form.diameter" :min="0.1" :max="100" :step="0.1" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.angle') }} (°)</label>
            <InputNumber v-model="form.angle" :min="0" :max="180" :step="1" class="w-full" />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="closeDialog" />
        <Button :label="$t('common.save')" @click="saveTool" />
      </template>
    </StandardDialog>
    
    <ConfirmDialog />
  </StandardPage>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { storeToRefs } from 'pinia';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ConfirmDialog from 'primevue/confirmdialog';
import Message from 'primevue/message';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import ToolProfileCard from '~/components/entities/ToolProfile/ToolProfileCard.vue';

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
