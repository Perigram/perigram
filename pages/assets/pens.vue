<template>
  <div class="p-4">
    <div class="flex justify-end items-center mb-8">
      <Button 
        :label="$t('assets.newPen')" 
        icon="pi pi-plus" 
        @click="showDialog = true"
      />
    </div>
    
    <div v-if="loading">{{ $t('assets.loadingPens') }}</div>
    <div v-else-if="error">{{ error }}</div>
    
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
    
    <!-- Pen Dialog -->
    <Dialog 
      v-model:visible="showDialog" 
      :header="editingPen ? $t('assets.editPen') : $t('assets.newPen')"
      :modal="true"
      :style="{ width: '500px' }"
    >
      <div class="mb-6">
        <label class="block mb-2">{{ $t('batch.name') }}</label>
        <InputText v-model="form.name" :placeholder="$t('assets.placeholders.penName')" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.color') }}</label>
        <InputText v-model="form.stroke.color" :placeholder="$t('assets.placeholders.color')" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.weight') }} (mm)</label>
        <InputNumber v-model="form.stroke.weight" :min="0.1" :max="10" :step="0.1" />
      </div>
      
      <div class="mb-6">
        <label class="block mb-2">{{ $t('assets.pattern') }}</label>
        <Select 
          v-model="form.stroke.pattern" 
          :options="patternOptions" 
          optionLabel="label" 
          optionValue="value" 
        />
      </div>
      
      <template #footer>
        <Button :label="$t('common.cancel')" severity="secondary" @click="closeDialog" />
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
</script>
