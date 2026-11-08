<template>
  <div class="flex flex-col gap-1">
    <Select
      :model-value="descriptor.base"
      :options="descriptorBaseOptions"
      option-label="label"
      option-value="value"
      size="small"
      class="w-full"
      :aria-label="$t('classes.type')"
      @update:model-value="base => emit('update:modelValue', switchDescriptorBase(descriptor, base))"
    />
    <label class="flex items-center gap-2 text-supporting text-muted">
      <Checkbox
        :model-value="descriptor.nullable === true"
        :binary="true"
        @update:model-value="value => emit('update:modelValue', { ...descriptor, nullable: value === true ? true : undefined })"
      />
      {{ $t('typesPane.nullable') }}
    </label>
  </div>
</template>

<script setup>
import Checkbox from 'primevue/checkbox';
import Select from 'primevue/select';
import { descriptorBaseOptions, switchDescriptorBase } from '~/components/type-designer/descriptor-base.js';

defineProps({
  descriptor: { type: Object, required: true }
});

const emit = defineEmits(['update:modelValue']);
</script>
