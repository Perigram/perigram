<template>
  <div class="flex flex-col gap-2">
    <div v-for="(entry, index) in items" :key="index" class="flex items-center gap-2">
      <div class="min-w-0 flex-1">
        <FieldControl
          :model-value="entry"
          :descriptor="itemDescriptor"
          :variant="variant"
          :pool="pool"
          :bundle="bundle"
          :payload="payload"
          @update:model-value="value => setItem(index, value)"
        />
      </div>
      <Button
        icon="pi pi-times"
        text
        rounded
        size="small"
        :aria-label="$t('uiMapping.remove')"
        @click="removeItem(index)"
      />
    </div>
    <div>
      <Button icon="pi pi-plus" :label="$t('uiMapping.add')" size="small" text @click="addItem" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  descriptor: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const model = defineModel();
const items = computed(() => (Array.isArray(model.value) ? model.value : []));
const itemDescriptor = computed(() => props.descriptor.itemType || { base: 'string' });
const setItem = (index, value) => {
  model.value = items.value.map((entry, position) => (position === index ? value : entry));
};
const removeItem = index => {
  model.value = items.value.filter((_, position) => position !== index);
};
const blank = () => {
  const base = itemDescriptor.value.base;
  if (base === 'string') return '';
  if (base === 'number') return 0;
  if (base === 'quantity') return { value: 0, unit: itemDescriptor.value.unit };
  return {};
};
const addItem = () => {
  model.value = [...items.value, blank()];
};
</script>
