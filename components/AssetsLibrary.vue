<template>
  <div class="p-4">
    <TabView>
      <TabPanel header="Pen Templates">
        <div class="py-4">
          <div class="flex justify-end items-center mb-8">
            <Button 
              label="New Pen" 
              icon="pi pi-plus" 
              @click="showPenDialog = true"
            />
          </div>
          
          <div v-if="penState.loading">Loading pens...</div>
          <div v-else-if="penState.error">{{ penState.error }}</div>
          
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            <Card v-for="pen in penState.pens" :key="pen._id" class="h-full">
              <template #title>
                {{ pen.name }}
                <Tag v-if="!pen.ownerId" value="System" severity="info" />
              </template>
              <template #content>
                <div class="py-4">
                  <div 
                    class="w-full mb-4 border"
                    :style="{
                      backgroundColor: pen.stroke.color,
                      height: `${pen.stroke.weight}px`,
                      borderStyle: pen.stroke.pattern === 'DASHED' ? 'dashed' : 
                                   pen.stroke.pattern === 'DOTTED' ? 'dotted' : 'solid'
                    }"
                  ></div>
                  <p>
                    Color: {{ pen.stroke.color }}<br>
                    Weight: {{ pen.stroke.weight }}mm<br>
                    Pattern: {{ pen.stroke.pattern }}
                  </p>
                </div>
              </template>
              <template #footer>
                <div class="flex gap-2" v-if="pen.ownerId">
                  <Button 
                    label="Edit" 
                    icon="pi pi-pencil" 
                    severity="secondary"
                    size="small"
                    @click="editPen(pen)"
                  />
                  <Button 
                    label="Delete" 
                    icon="pi pi-trash" 
                    severity="danger"
                    size="small"
                    @click="deletePenConfirm(pen)"
                  />
                </div>
              </template>
            </Card>
          </div>
        </div>
      </TabPanel>
      
      <TabPanel header="Tool Profiles">
        <div class="py-4">
          <div class="flex justify-end items-center mb-8">
            <Button 
              label="New Tool" 
              icon="pi pi-plus" 
              @click="showToolDialog = true"
            />
          </div>
          
          <div v-if="toolState.loading">Loading tools...</div>
          <div v-else-if="toolState.error">{{ toolState.error }}</div>
          
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            <Card v-for="tool in toolState.tools" :key="tool._id" class="h-full">
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
        </div>
      </TabPanel>
    </TabView>
    
    <!-- Pen Dialog -->
    <Dialog 
      v-model:visible="showPenDialog" 
      :header="editingPen ? 'Edit Pen' : 'New Pen'"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">Name</label>
        <InputText v-model="penForm.name" placeholder="My Pen" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Color</label>
        <InputText v-model="penForm.stroke.color" placeholder="#FF0000" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Weight (mm)</label>
        <InputNumber v-model="penForm.stroke.weight" :min="0.1" :max="10" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Pattern</label>
        <Select v-model="penForm.stroke.pattern" :options="['SOLID', 'DASHED', 'DOTTED']" />
      </div>
      
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="closePenDialog" />
        <Button label="Save" @click="savePen" />
      </template>
    </Dialog>
    
    <!-- Tool Dialog -->
    <Dialog 
      v-model:visible="showToolDialog" 
      :header="editingTool ? 'Edit Tool' : 'New Tool'"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">Name</label>
        <InputText v-model="toolForm.name" placeholder="My Tool" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Diameter (mm)</label>
        <InputNumber v-model="toolForm.diameter" :min="0.1" :max="100" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Angle (degrees)</label>
        <InputNumber v-model="toolForm.angle" :min="0" :max="180" :step="1" />
      </div>
      
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="closeToolDialog" />
        <Button label="Save" @click="saveTool" />
      </template>
    </Dialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { usePenTemplates } from '~/composables/penTemplates';
import { useToolProfiles } from '~/composables/toolProfiles';
import { useConfirm } from 'primevue/useconfirm';

const { state: penState, fetchPens, createPen, updatePen, deletePen } = usePenTemplates();
const { state: toolState, fetchTools, createTool, updateTool, deleteTool } = useToolProfiles();
const confirm = useConfirm();

// Pen dialog
const showPenDialog = ref(false);
const editingPen = ref(null);
const penForm = ref({
  name: '',
  stroke: {
    color: '#000000',
    weight: 0.35,
    pattern: 'SOLID'
  }
});

// Tool dialog
const showToolDialog = ref(false);
const editingTool = ref(null);
const toolForm = ref({
  name: '',
  diameter: 3.15,
  angle: 0
});

onMounted(async () => {
  await fetchPens();
  await fetchTools();
});

// Pen methods
const editPen = (pen) => {
  editingPen.value = pen;
  penForm.value = { ...pen };
  showPenDialog.value = true;
};

const closePenDialog = () => {
  showPenDialog.value = false;
  editingPen.value = null;
  penForm.value = {
    name: '',
    stroke: { color: '#000000', weight: 0.35, pattern: 'SOLID' }
  };
};

const savePen = async () => {
  try {
    if (editingPen.value) {
      await updatePen(editingPen.value._id, penForm.value);
    } else {
      await createPen(penForm.value);
    }
    closePenDialog();
  } catch (error) {
    alert('Failed to save pen: ' + error.message);
  }
};

const deletePenConfirm = (pen) => {
  confirm.require({
    message: `Delete "${pen.name}"?`,
    header: 'Confirm Delete',
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await deletePen(pen._id);
      } catch (error) {
        alert('Failed to delete pen: ' + error.message);
      }
    }
  });
};

// Tool methods
const editTool = (tool) => {
  editingTool.value = tool;
  toolForm.value = { ...tool };
  showToolDialog.value = true;
};

const closeToolDialog = () => {
  showToolDialog.value = false;
  editingTool.value = null;
  toolForm.value = { name: '', diameter: 3.15, angle: 0 };
};

const saveTool = async () => {
  try {
    if (editingTool.value) {
      await updateTool(editingTool.value._id, toolForm.value);
    } else {
      await createTool(toolForm.value);
    }
    closeToolDialog();
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


