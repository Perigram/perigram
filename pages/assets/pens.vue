<template>
  <div class="flex flex-col gap-6">
    <div class="flex justify-end items-center px-1">
      <Button 
        :label="$t('assets.newPen')" 
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
      <Card v-for="pen in pens" :key="pen._id" 
        class="h-full border border-[var(--p-content-border-color)] hover:border-[var(--p-primary-color)] transition-all duration-300 shadow-sm hover:shadow-md"
      >
        <template #title>
          <div class="flex items-center justify-between gap-3 min-w-0 pt-2 px-1">
            <span class="truncate font-bold text-lg text-[var(--p-text-color)]">{{ pen.name }}</span>
            <Tag v-if="!pen.ownerId" :value="$t('assets.system')" severity="info" class="text-[10px] uppercase flex-shrink-0" />
          </div>
        </template>
        <template #content>
          <div class="py-4 px-1 flex flex-col gap-4">
            <div 
              class="w-full h-8 rounded border border-[var(--p-content-border-color)] flex items-center justify-center"
              :style="{
                background: pen.stroke.color
              }"
            >
              <div 
                class="w-full mx-2"
                :style="{
                  borderTop: `${pen.stroke.weight}px ${pen.stroke.pattern === 'DASHED' ? 'dashed' : pen.stroke.pattern === 'DOTTED' ? 'dotted' : 'solid'} white`,
                  mixBlendMode: 'difference'
                }"
              ></div>
            </div>
            <div class="grid grid-cols-2 gap-y-2 text-xs">
              <span class="font-medium text-[var(--p-text-muted-color)]">{{ $t('assets.color') }}:</span>
              <span class="font-mono text-right text-[var(--p-text-color)]">{{ pen.stroke.color }}</span>
              
              <span class="font-medium text-[var(--p-text-muted-color)]">{{ $t('assets.weight') }}:</span>
              <span class="text-right text-[var(--p-text-color)]">{{ pen.stroke.weight }}mm</span>
              
              <span class="font-medium text-[var(--p-text-muted-color)]">{{ $t('assets.pattern') }}:</span>
              <span class="text-right text-[var(--p-text-color)]">{{ $t(`assets.patterns.${pen.stroke.pattern}`) }}</span>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex justify-end gap-2 pt-4 border-t border-[var(--p-content-border-color)] mt-auto px-1" v-if="pen.ownerId">
            <Button 
              icon="pi pi-pencil" 
              severity="secondary"
              text
              rounded
              size="small"
              @click="editPen(pen)"
              v-tooltip.top="$t('common.edit')"
            />
            <Button 
              icon="pi pi-trash" 
              severity="danger"
              text
              rounded
              size="small"
              @click="deletePenConfirm(pen)"
              v-tooltip.top="$t('common.delete')"
            />
          </div>
        </template>
      </Card>
    </div>
    
    <!-- Pen Dialog -->
    <Dialog 
      v-model:visible="showDialog" 
      :header="editingPen ? $t('assets.editPen') : $t('assets.newPen')"
      :modal="true"
      :style="{ width: '95vw', maxWidth: '500px' }"
    >
      <div class="flex flex-col gap-6 py-4">
        <div class="flex flex-col gap-2">
          <label class="font-medium text-[var(--p-text-color)]">{{ $t('batch.name') }}</label>
          <InputText v-model="form.name" :placeholder="$t('assets.placeholders.penName')" class="w-full" autofocus />
        </div>
        
        <div class="flex flex-col gap-2">
          <label class="font-medium text-[var(--p-text-color)]">{{ $t('assets.color') }}</label>
          <div class="flex gap-2">
            <InputText v-model="form.stroke.color" :placeholder="$t('assets.placeholders.color')" class="flex-1" />
            <div class="w-[42px] h-[42px] border border-[var(--p-content-border-color)] rounded shrink-0" :style="{ background: form.stroke.color }"></div>
          </div>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label class="font-medium text-[var(--p-text-color)]">{{ $t('assets.weight') }} (mm)</label>
            <InputNumber v-model="form.stroke.weight" :min="0.1" :max="10" :step="0.1" mode="decimal" :minFractionDigits="2" class="w-full" />
          </div>
          
          <div class="flex flex-col gap-2">
            <label class="font-medium text-[var(--p-text-color)]">{{ $t('assets.pattern') }}</label>
            <Select 
              v-model="form.stroke.pattern" 
              :options="patternOptions" 
              optionLabel="label" 
              optionValue="value"
              class="w-full"
            />
          </div>
        </div>
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="closeDialog" />
        <Button :label="$t('common.save')" @click="savePen" />
      </template>
    </Dialog>
    
    <ConfirmDialog />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import ConfirmDialog from 'primevue/confirmdialog';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';

definePageMeta({
  layout: 'app',
  middleware: 'auth',
});

const { t } = useI18n();
const penTemplatesStore = usePenTemplatesStore();
const { pens, loading, error } = storeToRefs(penTemplatesStore);
const confirm = useConfirm();
const toast = useToast();

const patternOptions = computed(() => [
  { label: t('assets.patterns.SOLID'), value: 'SOLID' },
  { label: t('assets.patterns.DASHED'), value: 'DASHED' },
  { label: t('assets.patterns.DOTTED'), value: 'DOTTED' }
]);

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
  await penTemplatesStore.fetchPens();
});

const editPen = (pen) => {
  editingPen.value = pen;
  form.value = JSON.parse(JSON.stringify(pen));
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
      await penTemplatesStore.updatePen(editingPen.value._id, form.value);
    } else {
      await penTemplatesStore.createPen(form.value);
    }
    closeDialog();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('assets.errors.savePenFailed') + ': ' + error.message, life: 3000 });
  }
};

const deletePenConfirm = (pen) => {
  confirm.require({
    message: t('messages.confirmDeleteFile', { name: pen.name }),
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
</script>