<template>
  <div class="p-4">
    <div class="flex justify-end items-center mb-8">
      <Button 
        label="New Pen" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div v-if="state.loading">Loading pens...</div>
    <div v-else-if="state.error">{{ state.error }}</div>
    
    <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
      <Card v-for="pen in state.pens" :key="pen._id" class="h-full">
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
    
    <!-- Pen Dialog -->
    <Dialog 
      v-model:visible="showDialog" 
      :header="editingPen ? 'Edit Pen' : 'New Pen'"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">Name</label>
        <InputText v-model="form.name" placeholder="My Pen" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Color</label>
        <InputText v-model="form.stroke.color" placeholder="#FF0000" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Weight (mm)</label>
        <InputNumber v-model="form.stroke.weight" :min="0.1" :max="10" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">Pattern</label>
        <Select v-model="form.stroke.pattern" :options="['SOLID', 'DASHED', 'DOTTED']" />
      </div>
      
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="closeDialog" />
        <Button label="Save" @click="savePen" />
      </template>
    </Dialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { usePenTemplates } from '~/composables/penTemplates';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import ConfirmDialog from 'primevue/confirmdialog';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { state, fetchPens, createPen, updatePen, deletePen } = usePenTemplates();
const confirm = useConfirm();

const showDialog = ref(false);
const editingPen = ref(null);
const form = ref({
  name: '',
  stroke: {
    color: '#000000',
    weight: 0.35,
    pattern: 'SOLID'
  }
});

onMounted(async () => {
  await fetchPens();
});

const editPen = (pen) => {
  editingPen.value = pen;
  form.value = { ...pen };
  showDialog.value = true;
};

const closeDialog = () => {
  showDialog.value = false;
  editingPen.value = null;
  form.value = {
    name: '',
    stroke: { color: '#000000', weight: 0.35, pattern: 'SOLID' }
  };
};

const savePen = async () => {
  try {
    if (editingPen.value) {
      await updatePen(editingPen.value._id, form.value);
    } else {
      await createPen(form.value);
    }
    closeDialog();
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
</script>
