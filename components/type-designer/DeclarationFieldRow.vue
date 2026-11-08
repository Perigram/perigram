<template>
  <div class="group/field-row flex flex-col gap-2 py-2">
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_9rem_8rem_4.5rem_2.5rem] items-center gap-2">
      <InputText
        :model-value="field.node.data.name || ''"
        size="small"
        class="min-w-0"
        :placeholder="$t('typeCanvas.fieldName')"
        :aria-label="$t('typeCanvas.fieldName')"
        @update:model-value="value => $emit('rename', String(value || ''))"
      />
      <Select
        :model-value="descriptor.base"
        :options="descriptorBaseOptions"
        option-label="label"
        option-value="value"
        size="small"
        :aria-label="$t('classes.type')"
        @update:model-value="base => emit('descriptor', switchDescriptorBase(descriptor, base))"
      />
      <Checkbox
        :model-value="descriptor.nullable === true"
        :binary="true"
        :aria-label="$t('typesPane.nullable')"
        @update:model-value="value => emit('descriptor', { ...descriptor, nullable: value === true ? true : undefined })"
      />
      <RadioButton
        :model-value="descriptor.identifier === true"
        :binary="true"
        name="class-title-field"
        :aria-label="$t('classes.titleColumn')"
        @update:model-value="value => { if (value) $emit('title'); }"
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
      :model-value="descriptor"
      :type-options="typeOptions"
      :simple="simple"
      details-only
      @update:model-value="value => $emit('descriptor', value)"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { descriptorBaseOptions, switchDescriptorBase } from '~/components/type-designer/descriptor-base.js';

const props = defineProps({
  field: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] },
  simple: { type: Boolean, default: false }
});

const emit = defineEmits(['rename', 'descriptor', 'remove', 'title']);

const descriptor = computed(() => props.field.node.data.descriptor || { base: 'string' });
</script>
