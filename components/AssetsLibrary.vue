<template>
  <div class="templates-page">
    <div class="template-section">
      <div class="section-header">
        <h2>Pen Templates</h2>
        <Button 
          label="New Pen" 
          icon="pi pi-plus" 
          @click="showPenDialog = true"
        />
      </div>
          
          <div v-if="penState.loading">Loading pens...</div>
          <div v-else-if="penState.error" class="error">{{ penState.error }}</div>
          
          <div v-else class="templates-grid">
            <Card v-for="pen in penState.pens" :key="pen._id" class="template-card">
              <template #title>
                {{ pen.name }}
                <Tag v-if="!pen.ownerId" value="System" severity="info" />
              </template>
              <template #content>
                <div class="pen-preview">
                  <div 
                    class="pen-stroke"
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
                <div class="card-actions" v-if="pen.ownerId">
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
      
      <Divider />
      
      <div class="template-section">
        <div class="section-header">
          <h2>Tool Profiles</h2>
          <Button 
            label="New Tool" 
            icon="pi pi-plus" 
            @click="showToolDialog = true"
          />
        </div>
          
          <div v-if="toolState.loading">Loading tools...</div>
          <div v-else-if="toolState.error" class="error">{{ toolState.error }}</div>
          
          <div v-else class="templates-grid">
            <Card v-for="tool in toolState.tools" :key="tool._id" class="template-card">
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
                <div class="card-actions" v-if="tool.ownerId">
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
      </div>
    </div>
    
    <!-- Pen Dialog -->
    <Dialog 
      v-model:visible="showPenDialog" 
      :header="editingPen ? 'Edit Pen' : 'New Pen'"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="form-field">
        <label>Name</label>
        <InputText v-model="penForm.name" placeholder="My Pen" />
      </div>
      
      <div class="form-field">
        <label>Color</label>
        <InputText v-model="penForm.stroke.color" placeholder="#FF0000" />
      </div>
      
      <div class="form-field">
        <label>Weight (mm)</label>
        <InputNumber v-model="penForm.stroke.weight" :min="0.1" :max="10" :step="0.1" />
      </div>
      
      <div class="form-field">
        <label>Pattern</label>
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
      <div class="form-field">
        <label>Name</label>
        <InputText v-model="toolForm.name" placeholder="My Tool" />
      </div>
      
      <div class="form-field">
        <label>Diameter (mm)</label>
        <InputNumber v-model="toolForm.diameter" :min="0.1" :max="100" :step="0.1" />
      </div>
      
      <div class="form-field">
        <label>Angle (degrees)</label>
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
import Divider from 'primevue/divider';
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

<style scoped>
.templates-page {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
}

.template-section {
  padding: 1rem 0;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
}

.template-card {
  height: 100%;
}

.pen-preview {
  padding: 1rem 0;
}

.pen-stroke {
  width: 100%;
  margin-bottom: 1rem;
  border: 1px solid #ccc;
}

.card-actions {
  display: flex;
  gap: 0.5rem;
}

.form-field {
  margin-bottom: 1.5rem;
}

.form-field label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.error {
  color: red;
  padding: 1rem;
  background: #fee;
  border-radius: 4px;
}
</style>

