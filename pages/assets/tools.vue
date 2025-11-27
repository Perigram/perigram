<template>
  <div class="p-4">
    <div class="flex justify-end items-center mb-8">
      <Button 
        label="New Tool" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div v-if="state.loading">Loading tools...</div>
    <div v-else-if="state.error">{{ state.error }}</div>
    
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
      <Card v-for="tool in state.tools" :key="tool._id" class="h-full">
        <template #title>
          {{ tool.name }}
          <Tag v-if="!tool.ownerId" value="System" severity="info" />
        </template>
        <template #content>
          <p>
            Diameter: Ø{{ tool.diameter }}mm<br>
            Angle: {{ tool.angle }}°
          </p>
        </template>
        <template #footer>
          <div class="flex gap-2" v-if="tool.ownerId">
            <Button 
              label="Edit" 
              icon="pi pi-pencil" 
              severity="secondary"
              size="small"
              @click="editTool(tool)"
            />
            <Button 
              label="Delete" 
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
      :header="editingTool ? 'Edit Tool' : 'New Tool'"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">Name</label>
        <InputText v-model="form.name" placeholder="My Tool" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Diameter (mm)</label>
        <InputNumber v-model="form.diameter" :min="0.1" :max="100" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Angle (degrees)</label>
        <InputNumber v-model="form.angle" :min="0" :max="180" :step="1" />
      </div>
      
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="closeDialog" />
        <Button label="Save" @click="saveTool" />
      </template>
    </Dialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useToolProfiles } from '~/composables/toolProfiles';
import { useConfirm } from 'primevue/useconfirm';
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

const { state, fetchTools, createTool, updateTool, deleteTool } = useToolProfiles();
const confirm = useConfirm();

const showDialog = ref(false);
const editingTool = ref(null);
const form = ref({
  name: '',
  diameter: 3.15,
  angle: 0
});

onMounted(async () => {
  await fetchTools();
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
      await updateTool(editingTool.value._id, form.value);
    } else {
      await createTool(form.value);
    }
    closeDialog();
  } catch (error) {
    alert('Failed to save tool: ' + error.message);
  }
};

const deleteToolConfirm = (tool) => {
  confirm.require({
    message: `Delete "${tool.name}"?`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await deleteTool(tool._id);
      } catch (error) {
        alert('Failed to delete tool: ' + error.message);
      }
    }
  });
};
</script>
