<template>
  <div class="flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <Select
        :model-value="modelValue.base"
        :options="baseOptions"
        option-label="label"
        option-value="value"
        class="flex-1"
        size="small"
        @update:model-value="value => setBase(value)"
      />
      <Checkbox
        :model-value="modelValue.nullable === true"
        :binary="true"
        @update:model-value="value => patch({ nullable: value === true ? true : undefined })"
      />
      <span class="text-supporting text-muted">{{ $t('typesPane.nullable') }}</span>
    </div>

    <!-- Field policy: mutability is declared on the descriptor. Writable
         governs mutate leaf sockets and update paths; constructible governs
         construct sockets and creation forms. Visibility (read/write/admin
         per role) lives on the producer output's field policy. -->
    <div class="flex flex-wrap items-center gap-4">
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

    <div v-if="modelValue.base === 'quantity'" class="flex flex-col gap-1">
      <label>{{ $t('typeCanvas.unit') }}</label>
      <Select :model-value="modelValue.unit" :options="units" size="small" @update:model-value="value => patch({ unit: value })" />
    </div>

    <div v-else-if="modelValue.base === 'ref'" class="flex flex-col gap-1">
      <label>{{ $t('typeCanvas.accepts') }}</label>
      <Select
        :model-value="modelValue.accepts || []"
        :options="typeOptions"
        multiple
        filter
        size="small"
        @update:model-value="value => patch({ accepts: value })"
      />
    </div>

    <div v-else-if="modelValue.base === 'enum'" class="flex flex-col gap-1">
      <label>{{ $t('typesPane.values') }}</label>
      <InputChips :model-value="modelValue.values || []" size="small" @update:model-value="value => patch({ values: value })" />
    </div>

    <div v-else-if="modelValue.base === 'variant'" class="flex flex-col gap-1">
      <label>{{ $t('typesPane.tags') }}</label>
      <InputChips :model-value="modelValue.tags || []" size="small" @update:model-value="value => patch({ tags: value })" />
    </div>

    <div v-else-if="modelValue.base === 'list' || modelValue.base === 'map'" class="flex flex-col gap-1">
      <label>{{ $t('typeCanvas.itemType') }}</label>
      <DescriptorEditor
        :model-value="modelValue.itemType || { base: 'string' }"
        :type-options="typeOptions"
        :depth="depth + 1"
        @update:model-value="value => patch({ itemType: value })"
      />
    </div>

    <div v-else-if="modelValue.base === 'record'" class="flex flex-col gap-1">
      <label>{{ $t('typesPane.recordFields') }}</label>
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
          class="flex-1"
          @update:model-value="value => setRecordField(index, { descriptor: value })"
        />
        <Button icon="pi pi-times" text size="small" severity="danger" @click="removeRecordField(index)" />
      </div>
      <Button :label="$t('typesPane.addField')" icon="pi pi-plus" text size="small" @click="addRecordField" />
    </div>

    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
  </div>
</template>

<script setup>
// One editor for the whole V row grammar (SPEC §2/§4): every qualifier the
// declaration layer can carry — unit, ref targets, enum values, variant
// tags, list/map item types, nested record fields, nullable — validated
// through the registry's own describeType, so an invalid descriptor is
// visible in the authoring surface, not at save time.
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputChips from 'primevue/inputchips';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import { describeType, FIELD_BASES, UNITS } from '~/packages/cts/src/index.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  typeOptions: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 }
});
const emit = defineEmits(['update:modelValue']);

const baseOptions = FIELD_BASES.map(base => ({ label: base, value: base }));
const units = [...UNITS];

const error = computed(() => {
  // An unset ref (no accepted targets yet) is authored-in-progress, not a
  // validation failure: the multiselect's own empty state communicates it,
  // and the field simply stays out of the declaration until targets are
  // picked. Everything else describeType rejects surfaces live.
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

function setBase(base) {
  const next = { base };
  if (props.modelValue.nullable === true) next.nullable = true;
  if (base === 'quantity') next.unit = props.modelValue.unit || units[0];
  if (base === 'ref') next.accepts = props.modelValue.accepts?.length ? props.modelValue.accepts : [];
  emit('update:modelValue', next);
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
