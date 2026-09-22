<template>
  <div class="flex flex-col gap-6">
    <Tabs value="0" class="flex flex-col">
      <TabList>
        <Tab value="0">{{ $t('assets.pens') }}</Tab>
        <Tab value="1">{{ $t('assets.tools') }}</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="0">
          <div class="py-6 flex flex-col gap-6">
            <div class="flex justify-end items-center px-1">
              <Button 
                :label="$t('assets.newPen')" 
                icon="pi pi-plus" 
                @click="showPenDialog = true"
              />
            </div>
            
            <div v-if="pensLoading" class="flex items-center justify-center py-12">
              <ProgressSpinner />
            </div>
            <div v-else-if="pensError" class="px-1">
              <Message severity="error">{{ pensError }}</Message>
            </div>
            
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-1">
              <PenTemplateCard 
                v-for="pen in pens" 
                :key="pen._id" 
                :pen="pen" 
                variant="card"
                @edit="editPen"
                @delete="deletePenConfirm"
              />
            </div>
          </div>
        </TabPanel>
        
        <TabPanel value="1">
          <div class="py-6 flex flex-col gap-6">
            <div class="flex justify-end items-center px-1">
              <Button 
                :label="$t('assets.newTool')" 
                icon="pi pi-plus" 
                @click="showToolDialog = true"
              />
            </div>
            
            <div v-if="toolsLoading" class="flex items-center justify-center py-12">
              <ProgressSpinner />
            </div>
            <div v-else-if="toolsError" class="px-1">
              <Message severity="error">{{ toolsError }}</Message>
            </div>
            
            <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-1">
              <ToolProfileCard 
                v-for="tool in tools" 
                :key="tool._id" 
                :tool="tool" 
                variant="card"
                @edit="editTool"
                @delete="deleteToolConfirm"
              />
            </div>
          </div>
        </TabPanel>
      </TabPanels>
    </Tabs>
    
    <!-- Pen Dialog -->
    <StandardDialog
      v-model:visible="showPenDialog" 
      :header="editingPen ? $t('assets.editPen') : $t('assets.newPen')"
      size="sm"
    >
      <div class="flex flex-col gap-6 py-4">
        <div class="flex flex-col gap-2">
          <label>{{ $t('batch.name') }}</label>
          <InputText v-model="penForm.name" :placeholder="$t('assets.placeholders.penName')" class="w-full" autofocus />
        </div>
        
        <div class="flex flex-col gap-2">
          <label>{{ $t('assets.color') }}</label>
          <div class="flex gap-2">
            <InputText v-model="penForm.stroke.color" :placeholder="$t('assets.placeholders.color')" class="flex-1" />
            <div class="w-swatch h-swatch border rounded shrink-0" :style="{ backgroundColor: penForm.stroke.color }"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.weight') }} (mm)</label>
            <InputNumber v-model="penForm.stroke.weight" :min="0.1" :max="10" :step="0.1" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.pattern') }}</label>
            <Select 
              v-model="penForm.stroke.pattern" 
              :options="patternOptions" 
              optionLabel="label" 
              optionValue="value"
              class="w-full"
            />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="closePenDialog" />
        <Button :label="$t('common.save')" @click="savePen" />
      </template>
    </StandardDialog>
    
    <!-- Tool Dialog -->
    <StandardDialog
      v-model:visible="showToolDialog" 
      :header="editingTool ? $t('assets.editTool') : $t('assets.newTool')"
      size="sm"
    >
      <div class="flex flex-col gap-6 py-4">
        <div class="flex flex-col gap-2">
          <label>{{ $t('batch.name') }}</label>
          <InputText v-model="toolForm.name" :placeholder="$t('assets.placeholders.toolName')" class="w-full" autofocus />
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.diameter') }} (mm)</label>
            <InputNumber v-model="toolForm.diameter" :min="0.1" :max="100" :step="0.1" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          
          <div class="flex flex-col gap-2">
            <label>{{ $t('assets.angle') }} (°)</label>
            <InputNumber v-model="toolForm.angle" :min="0" :max="180" :step="1" class="w-full" />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="closeToolDialog" />
        <Button :label="$t('common.save')" @click="saveTool" />
      </template>
    </StandardDialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { useToolProfilesStore } from '~/stores/toolProfiles';
import { storeToRefs } from 'pinia';
import { useConfirm } from 'primevue/useconfirm';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from '~/components/shared/InstanceSelect.vue';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ConfirmDialog from 'primevue/confirmdialog';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import { useToast } from 'primevue/usetoast';
import PenTemplateCard from './entities/PenTemplate/PenTemplateCard.vue';
import ToolProfileCard from './entities/ToolProfile/ToolProfileCard.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';

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
  penForm.value = {
    name: pen.identity?.name || pen.name || '',
    stroke: {
      color: pen.data?.stroke?.color || pen.stroke?.color || '#000000',
      weight: pen.data?.stroke?.weight || pen.stroke?.weight || 0.35,
      pattern: pen.data?.stroke?.pattern || pen.stroke?.pattern || 'SOLID'
    }
  };
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
    message: t('messages.confirmDeleteFile', { name: pen.identity?.name || pen.name || pen._id }),
    header: t('common.confirmation'),
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
  toolForm.value = {
    name: tool.identity?.name || '',
    diameter: tool.data?.diameter || 3.15,
    angle: tool.data?.angle || 0
  };
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
    message: t('messages.confirmDeleteFile', { name: tool.identity?.name || tool._id }),
    header: t('common.confirmation'),
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
