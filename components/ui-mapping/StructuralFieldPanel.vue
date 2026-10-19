<template>
  <div :class="LAYOUT.panelBody">
    <div class="flex items-center justify-end gap-1">
      <template v-if="editing">
        <Button icon="pi pi-check" size="small" :aria-label="$t('uiMapping.save')" :title="$t('uiMapping.save')" @click="confirm" />
        <Button icon="pi pi-times" size="small" severity="danger" text :aria-label="$t('uiMapping.discard')" :title="$t('uiMapping.discard')" @click="$emit('end')" />
      </template>
      <Button
        v-else-if="editable"
        icon="pi pi-pencil"
        size="small"
        severity="secondary"
        text
        rounded
        :aria-label="$t('uiMapping.edit')"
        :title="$t('uiMapping.edit')"
        @click="$emit('begin')"
      />
    </div>
    <FieldControl
      v-if="editing"
      v-model="draft"
      :descriptor="field.descriptor"
      variant="detail"
      :pool="pool"
      :bundle="bundle"
    />
    <FieldControl
      v-else
      :model-value="field.value"
      :descriptor="field.descriptor"
      variant="row"
      :pool="pool"
      :bundle="bundle"
    />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import { LAYOUT } from '#shared/ui-mapping/index.js';
import FieldControl from './FieldControl.vue';

// One structural panel edits at a time over a local draft (SPEC UI);
// the parent owns the editing field, the panel owns its draft.
const props = defineProps({
  field: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const emit = defineEmits(['begin', 'end', 'inline-change']);

const draft = ref(null);
watch(() => props.editing, (editing) => {
  if (editing) draft.value = JSON.parse(JSON.stringify(props.field.value ?? null));
});

function confirm() {
  emit('inline-change', { name: props.field.name, value: draft.value });
  emit('end');
}
</script>
