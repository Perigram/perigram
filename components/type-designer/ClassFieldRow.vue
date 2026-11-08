<template>
  <div class="class-field-row flex flex-col gap-2">
    <div class="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_5.5rem_2.5rem]">
      <InputText
        :model-value="name"
        size="small"
        class="min-w-0"
        :placeholder="$t('typeCanvas.fieldName')"
        :aria-label="$t('typeCanvas.fieldName')"
        @update:model-value="value => emit('update:name', String(value || ''))"
      />
      <Button
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        class="sm:hidden"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        @click="emit('remove')"
      />
      <div class="col-span-2 flex items-center gap-2 sm:col-span-1 sm:block">
        <span class="text-label text-muted sm:hidden">{{ $t('classes.type') }}</span>
        <Select
          :model-value="descriptor.base"
          :options="descriptorBaseOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="w-full"
          :aria-label="$t('classes.type')"
          @update:model-value="base => emit('update:descriptor', switchDescriptorBase(descriptor, base))"
        />
      </div>
      <label class="col-span-2 flex items-center gap-2 sm:col-span-1">
        <Checkbox
          :model-value="descriptor.nullable === true"
          :binary="true"
          :aria-label="$t('typesPane.nullable')"
          @update:model-value="value => emit('update:descriptor', { ...descriptor, nullable: value === true ? true : undefined })"
        />
        <span class="text-supporting text-muted sm:hidden">{{ $t('typesPane.nullable') }}</span>
      </label>
      <Button
        icon="pi pi-trash"
        size="small"
        text
        severity="danger"
        class="hidden sm:inline-flex"
        :aria-label="$t('common.delete')"
        :title="$t('common.delete')"
        @click="emit('remove')"
      />
    </div>
    <DescriptorEditor
      :model-value="descriptor"
      :type-options="typeOptions"
      :simple="simple"
      details-only
      @update:model-value="value => emit('update:descriptor', value)"
    />
  </div>
</template>

<script setup>
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { descriptorBaseOptions, switchDescriptorBase } from '~/components/type-designer/descriptor-base.js';

defineProps({
  name: { type: String, default: '' },
  descriptor: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] },
  simple: { type: Boolean, default: false }
});

const emit = defineEmits(['update:name', 'update:descriptor', 'remove']);
</script>

<style scoped>
.class-field-row {
  container-type: inline-size;
}
</style>
