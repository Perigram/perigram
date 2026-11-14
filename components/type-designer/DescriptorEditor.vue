<template>
  <div class="flex flex-col gap-2">
    <DescriptorBaseControl
      v-if="!detailsOnly"
      :descriptor="modelValue"
      @update:model-value="value => emit('update:modelValue', value)"
    />

    <div v-if="!simple && !detailsOnly" class="flex flex-wrap items-center gap-4">
      <label class="flex items-center gap-2">
        <Checkbox
          :model-value="modelValue.writable !== false"
          :binary="true"
          @update:model-value="value => patch({ writable: value === false ? false : undefined })"
        />
        <span class="text-supporting text-muted">{{ $t('typesPane.writable') }}</span>
      </label>
      <label class="flex items-center gap-2">
        <Checkbox
          :model-value="modelValue.constructible !== false"
          :binary="true"
          @update:model-value="value => patch({ constructible: value === false ? false : undefined })"
        />
        <span class="text-supporting text-muted">{{ $t('typesPane.constructible') }}</span>
      </label>
    </div>

    <div class="descriptor-qualifiers grid gap-3">
      <div v-if="modelValue.base === 'quantity'" class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typeCanvas.unit') }}</label>
        <Select :model-value="modelValue.unit" :options="units" size="small" class="w-full" @update:model-value="value => patch({ unit: value })" />
      </div>

      <div v-else-if="modelValue.base === 'ref'" class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typeCanvas.accepts') }}</label>
        <MultiSelect
          :model-value="modelValue.accepts || []"
          :options="typeOptions"
          option-label="label"
          option-value="value"
          display="chip"
          size="small"
          class="w-full"
          @update:model-value="value => patch({ accepts: value })"
        />
        <template v-if="!simple">
          <label class="text-label text-muted">{{ $t('typeCanvas.unlink') }}</label>
          <Select
            :model-value="modelValue.unlink || 'detach'"
            :options="unlinkOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="w-full"
            @update:model-value="value => patch({ unlink: value === 'delete' ? 'delete' : undefined })"
          />
        </template>
      </div>

      <div v-else-if="modelValue.base === 'enum'" class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typesPane.values') }}</label>
        <InputChips :model-value="modelValue.values || []" size="small" @update:model-value="value => patch({ values: value })" />
      </div>

      <div v-else-if="modelValue.base === 'variant'" class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typesPane.tags') }}</label>
        <InputChips :model-value="modelValue.tags || []" size="small" @update:model-value="value => patch({ tags: value })" />
      </div>

      <div v-else-if="modelValue.base === 'list' || modelValue.base === 'map'" class="flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typeCanvas.itemType') }}</label>
        <DescriptorEditor
          :model-value="modelValue.itemType || { base: 'string' }"
          :type-options="typeOptions"
          :depth="depth + 1"
          :simple="simple"
          @update:model-value="value => patch({ itemType: value })"
        />
      </div>

      <div v-else-if="modelValue.base === 'record'" class="descriptor-span-all flex flex-col gap-1">
        <label class="text-label text-muted">{{ $t('typesPane.recordFields') }}</label>
        <div v-for="(field, index) of recordEntries" :key="index" class="flex items-start gap-1">
          <InputText
            :model-value="field.name"
            size="small"
            class="w-32"
            :placeholder="$t('typeCanvas.fieldName')"
            @update:model-value="value => setRecordField(index, { name: value })"
          />
          <DescriptorEditor
            :model-value="field.descriptor"
            :type-options="typeOptions"
            :depth="depth + 1"
            :simple="simple"
            class="flex-1"
            @update:model-value="value => setRecordField(index, { descriptor: value })"
          />
          <Button icon="pi pi-times" text size="small" severity="danger" @click="removeRecordField(index)" />
        </div>
        <Button :label="$t('typesPane.addField')" icon="pi pi-plus" text size="small" @click="addRecordField" />
      </div>

    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
  </div>
</template>

<script setup>
// Grammar contract: components/type-designer/README.md → DescriptorEditor.
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputChips from 'primevue/inputchips';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import Message from 'primevue/message';
import { describeType, UNITS, UNLINK_POLICIES } from '#packages/cts';
import DescriptorBaseControl from '~/components/type-designer/DescriptorBaseControl.vue';

const props = defineProps({
  modelValue: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 },
  simple: { type: Boolean, default: false },
  detailsOnly: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);

const units = [...UNITS];
const unlinkOptions = UNLINK_POLICIES.map(value => ({ label: value, value }));

const error = computed(() => {
  // An unset ref is authored-in-progress, staying out of the declaration
  // until targets are picked (components/type-designer/README.md).
  if (props.modelValue.base === 'ref'
    && (!Array.isArray(props.modelValue.accepts) || !props.modelValue.accepts.length)) {
    return '';
  }
  try {
    describeType(props.modelValue);
    return '';
  } catch (issue) {
    return issue.message;
  }
});

const recordEntries = computed(() => Object.entries(props.modelValue.fields || {}).map(([name, descriptor]) => ({ name, descriptor })));

function patch(changes) {
  emit('update:modelValue', { ...props.modelValue, ...changes });
}


function setRecordField(index, changes) {
  const entries = recordEntries.value.map(entry => ({ name: entry.name, descriptor: entry.descriptor }));
  Object.assign(entries[index], changes);
  patch({ fields: Object.fromEntries(entries.filter(entry => entry.name).map(entry => [entry.name, entry.descriptor])) });
}

function addRecordField() {
  const fields = { ...(props.modelValue.fields || {}) };
  let index = 1;
  while (fields[`field${index}`]) index += 1;
  fields[`field${index}`] = { base: 'string' };
  patch({ fields });
}

function removeRecordField(index) {
  const entries = recordEntries.value.filter((_, position) => position !== index);
  patch({ fields: Object.fromEntries(entries.filter(entry => entry.name).map(entry => [entry.name, entry.descriptor])) });
}
</script>

<style scoped>
.descriptor-qualifiers {
  grid-template-columns: minmax(0, 1fr);
}

@container (min-width: 28rem) {
  .descriptor-qualifiers {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.descriptor-span-all {
  grid-column: 1 / -1;
}
</style>
