<template>
  <FieldControl
    v-if="editing"
    v-model="draft[field.name]"
    :descriptor="field.descriptor"
    variant="detail"
    :pool="pool"
    :bundle="bundle"
  />
  <Inplace v-else-if="editable" closable>
    <template #display>
      <div class="flex min-w-0 items-center gap-1.5 rounded-ui px-1 py-0.5 transition-colors hover:bg-subtle">
        <FieldControl
          :model-value="field.value"
          :descriptor="field.descriptor"
          variant="row"
          :pool="pool"
          :bundle="bundle"
        />
        <i class="pi pi-pencil text-muted shrink-0" />
      </div>
    </template>
    <template #content="{ closeCallback }">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <FieldControl
          v-model="inlineDraft"
          :descriptor="field.descriptor"
          variant="detail"
          :pool="pool"
          :bundle="bundle"
        />
        <Button
          icon="pi pi-check"
          size="small"
          :aria-label="$t('uiMapping.save')"
          :title="$t('uiMapping.save')"
          @click="confirm(); closeCallback()"
        />
        <Button
          icon="pi pi-times"
          size="small"
          severity="danger"
          text
          :aria-label="$t('uiMapping.discard')"
          :title="$t('uiMapping.discard')"
          @click="discard(); closeCallback()"
        />
      </div>
    </template>
  </Inplace>
  <div v-else class="flex min-w-0 items-center gap-1.5 rounded-ui px-1 py-0.5">
    <FieldControl
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
import Inplace from 'primevue/inplace';
import FieldControl from './FieldControl.vue';

// One detail-field value cell: the record's full-edit draft when editing,
// the click-to-edit Inplace (display + pencil, editor + confirm/discard)
// on patchable surfaces, the plain display otherwise. Hosts own the label
// placement — this component is only the value half of a fact row.
const props = defineProps({
  field: { type: Object, required: true },
  editable: { type: Boolean, default: false },
  editing: { type: Boolean, default: false },
  draft: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const emit = defineEmits(['inline-change']);
const inlineDraft = ref(props.field.value);
watch(() => props.field.value, value => { inlineDraft.value = value; });
function confirm() {
  emit('inline-change', { name: props.field.name, value: inlineDraft.value });
}
function discard() {
  inlineDraft.value = props.field.value;
}
</script>
