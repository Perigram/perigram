<template>
  <div class="group/field-row flex flex-col gap-2 py-3">
    <div class="flex min-w-0 items-center gap-2">
      <InputText
        :model-value="field.node.data.name || ''"
        size="small"
        class="min-w-0 flex-1"
        :placeholder="$t('typeCanvas.fieldName')"
        :aria-label="$t('typeCanvas.fieldName')"
        @update:model-value="value => $emit('rename', String(value || ''))"
      />
      <Button
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        @click="$emit('remove')"
      />
    </div>
    <DescriptorEditor
      :model-value="field.node.data.descriptor || { base: 'string' }"
      :type-options="typeOptions"
      :simple="simple"
      @update:model-value="value => $emit('descriptor', value)"
    />
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';

defineProps({
  field: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] },
  simple: { type: Boolean, default: false }
});

defineEmits(['rename', 'descriptor', 'remove']);
</script>
