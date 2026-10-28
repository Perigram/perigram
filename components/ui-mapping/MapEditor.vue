<template>
  <div class="flex w-full flex-col gap-2">
    <div v-for="row in rows" :key="row.id" :class="LAYOUT.row" class="w-full items-center gap-2">
      <InputText
        :model-value="row.key"
        class="min-w-0 flex-1"
        :aria-label="t('uiMapping.mapKey')"
        @update:model-value="value => rename(row, value)"
      />
      <FieldControl
        :model-value="row.value"
        :descriptor="cellDescriptor(row.value)"
        :variant="variant"
        :pool="pool"
        :bundle="bundle"
        :payload="payload"
        class="min-w-0 flex-1"
        @update:model-value="value => setValue(row, value)"
      />
      <Button
        icon="pi pi-times"
        text
        severity="danger"
        :aria-label="t('uiMapping.remove')"
        @click="drop(row)"
      />
    </div>
    <Button
      icon="pi pi-plus"
      text
      severity="secondary"
      :aria-label="t('uiMapping.add')"
      @click="add"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { useI18n } from 'vue-i18n';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

const props = defineProps({
  descriptor: { type: Object, required: true },
  variant: { type: String, default: 'detail' },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null },
  payload: { type: Object, default: null }
});

const model = defineModel();
const { t } = useI18n();

let nextId = 0;
let internalWrite = false;
const rows = ref([]);

const syncFromModel = () => {
  const value = model.value && typeof model.value === 'object' && !Array.isArray(model.value) ? model.value : {};
  rows.value = Object.entries(value).map(([key, entry]) => ({ id: nextId++, key, value: entry }));
};
watch(model, () => {
  // A row write re-enters here through commit; only external model
  // changes rebuild the rows (a rebuild mid-typing would drop focus).
  if (internalWrite) {
    internalWrite = false;
    return;
  }
  syncFromModel();
}, { immediate: true });

const commit = () => {
  const next = {};
  for (const row of rows.value) {
    if (!row.key) continue;
    next[row.key] = row.value;
  }
  internalWrite = true;
  model.value = next;
};

const rename = (row, key) => {
  row.key = key;
  commit();
};
const setValue = (row, value) => {
  row.value = value;
  commit();
};
const drop = (row) => {
  rows.value = rows.value.filter(item => item.id !== row.id);
  commit();
};
const add = () => {
  rows.value = [...rows.value, { id: nextId++, key: '', value: null }];
};

// A declared itemType types every cell; an undeclared map types each
// cell from its value, and a nested value stays read-only (the json
// summary) per the Field I/O law.
const cellDescriptor = (value) => {
  if (props.descriptor.itemType?.base) return props.descriptor.itemType;
  if (value !== null && typeof value === 'object') return { base: 'json' };
  if (typeof value === 'boolean') return { base: 'boolean' };
  if (typeof value === 'number') return { base: 'number' };
  return { base: 'string' };
};
</script>
