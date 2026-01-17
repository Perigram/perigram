<template>
  <Dialog 
    v-model:visible="isOpen" 
    :header="$t('batch.editTitle')" 
    :modal="true"
    :style="{ width: '95vw', maxWidth: '450px' }"
    @hide="handleClose"
  >
    <div class="flex flex-col gap-6 py-4">
      <div class="flex flex-col gap-2">
        <label for="editBatchName" class="font-bold text-sm uppercase tracking-wider text-[var(--p-text-muted-color)]">{{ $t('batch.name') }}</label>
        <InputText 
          id="editBatchName" 
          v-model="name" 
          :placeholder="$t('batch.namePlaceholder')"
          class="w-full"
          autofocus
          @keyup.enter="handleSave"
        />
      </div>
    </div>
    <template #footer>
      <div class="flex justify-end gap-2">
        <Button 
          :label="$t('common.cancel')" 
          text
          severity="secondary" 
          @click="handleClose"
        />
        <Button 
          :label="$t('common.save')" 
          icon="pi pi-check"
          @click="handleSave"
          :disabled="!name.trim()"
        />
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  batch: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['update:modelValue', 'close', 'save']);

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const name = ref('');

watch(() => props.batch, (newBatch) => {
  if (newBatch) {
    name.value = newBatch.name || '';
  }
}, { immediate: true });

const handleClose = () => {
  isOpen.value = false;
  emit('close');
};

const handleSave = () => {
  if (!name.value.trim()) return;
  
  const updatedBatch = {
    ...props.batch,
    name: name.value.trim()
  };
  
  emit('save', updatedBatch);
};
</script>
