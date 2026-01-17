<template>
  <div class="p-4">
    <TabView>
      <TabPanel :header="$t('assets.pens')">
        <div class="py-4">
          <div class="flex justify-end items-center mb-8">
            <Button 
              :label="$t('assets.newPen')" 
              icon="pi pi-plus" 
              @click="showPenDialog = true"
            />
          </div>
          
          <div v-if="pensLoading">{{ $t('assets.loadingPens') }}</div>
          <div v-else-if="pensError">{{ pensError }}</div>
          
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            <Card v-for="pen in pens" :key="pen._id" class="h-full">
              <template #title>
                {{ pen.name }}
                <Tag v-if="!pen.ownerId" :value="$t('assets.system')" severity="info" />
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
                    {{ $t('assets.color') }}: {{ pen.stroke.color }}<br>
                    {{ $t('assets.weight') }}: {{ pen.stroke.weight }}mm<br>
                    {{ $t('assets.pattern') }}: {{ pen.stroke.pattern }}
                  </p>
                </div>
              </template>
              <template #footer>
                <div class="flex gap-2" v-if="pen.ownerId">
                  <Button 
                    :label="$t('common.edit')" 
                    icon="pi pi-pencil" 
                    severity="secondary"
                    size="small"
                    @click="editPen(pen)"
                  />
                  <Button 
                    :label="$t('common.delete')" 
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
      
      <TabPanel :header="$t('assets.tools')">
        <div class="py-4">
          <div class="flex justify-end items-center mb-8">
            <Button 
              :label="$t('assets.newTool')" 
              icon="pi pi-plus" 
              @click="showToolDialog = true"
            />
          </div>
          
          <div v-if="toolsLoading">{{ $t('assets.loadingTools') }}</div>
          <div v-else-if="toolsError">{{ toolsError }}</div>
          
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
        </div>
      </TabPanel>
    </TabView>
    
    <!-- Pen Dialog -->
    <Dialog 
      v-model:visible="showPenDialog" 
      :header="editingPen ? $t('assets.editPen') : $t('assets.newPen')"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">{{ $t('batch.name') }}</label>
        <InputText v-model="penForm.name" :placeholder="$t('assets.placeholders.penName')" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.color') }}</label>
        <InputText v-model="penForm.stroke.color" :placeholder="$t('assets.placeholders.color')" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.weight') }} (mm)</label>
        <InputNumber v-model="penForm.stroke.weight" :min="0.1" :max="10" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.pattern') }}</label>
        <Select 
          v-model="penForm.stroke.pattern" 
          :options="patternOptions" 
          optionLabel="label" 
          optionValue="value"
        />
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" @click="closePenDialog" />
        <Button :label="$t('common.save')" @click="savePen" />
      </template>
    </Dialog>
    
    <!-- Tool Dialog -->
    <Dialog 
      v-model:visible="showToolDialog" 
      :header="editingTool ? $t('assets.editTool') : $t('assets.newTool')"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">{{ $t('batch.name') }}</label>
        <InputText v-model="toolForm.name" :placeholder="$t('assets.placeholders.toolName')" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.diameter') }} (mm)</label>
        <InputNumber v-model="toolForm.diameter" :min="0.1" :max="100" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.angle') }} (°)</label>
        <InputNumber v-model="toolForm.angle" :min="0" :max="180" :step="1" />
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" @click="closeToolDialog" />
        <Button :label="$t('common.save')" @click="saveTool" />
      </template>
    </Dialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { storeToRefs } from 'pinia';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import TabView from 'primevue/tabview';
import TabPanel from 'primevue/tabpanel';
import ConfirmDialog from 'primevue/confirmdialog';

const { t } = useI18n();
const penTemplatesStore = usePenTemplatesStore();
const { pens, loading: pensLoading, error: pensError } = storeToRefs(penTemplatesStore);

const toolProfilesStore = useToolProfilesStore();
const { tools, loading: toolsLoading, error: toolsError } = storeToRefs(toolProfilesStore);

const confirm = useConfirm();
const toast = useToast();

const patternOptions = computed(() => [
  { label: t('assets.patterns.SOLID'), value: 'SOLID' },
  { label: t('assets.patterns.DASHED'), value: 'DASHED' },
  { label: t('assets.patterns.DOTTED'), value: 'DOTTED' }
]);

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
  await penTemplatesStore.fetchPens();
  await toolProfilesStore.fetchTools();
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
      await penTemplatesStore.updatePen(editingPen.value._id, penForm.value);
    } else {
      await penTemplatesStore.createPen(penForm.value);
    }
    closePenDialog();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.savePenFailed') + ': ' + error.message, life: 3000 });
  }
};

const deletePenConfirm = (pen) => {
  confirm.require({
    message: t('messages.confirmDeleteFile', { name: pen.name }),
    header: t('artifacts.deleteTitle'),
    icon: 'pi pi-exclamation-triangle',
    accept: async () => {
      try {
        await penTemplatesStore.deletePen(pen._id);
      } catch (error) {
        toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.deletePenFailed') + ': ' + error.message, life: 3000 });
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
      await toolProfilesStore.updateTool(editingTool.value._id, toolForm.value);
    } else {
      await toolProfilesStore.createTool(toolForm.value);
    }
    closeToolDialog();
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


