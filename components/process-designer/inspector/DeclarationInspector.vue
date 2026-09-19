<template>
  <div class="flex flex-col gap-4">
    <template v-if="node.type === 'ctsClass'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.class') }}</label>
          <Select
            :model-value="node.data.class"
            :options="classOptions"
            option-label="label"
            option-value="value"
            @update:model-value="value => { node.data.class = value; }"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.typeId') }}</label>
          <InputText v-model="node.data.typeId" :invalid="!typeIdValid" />
          <Message v-if="!typeIdValid" severity="error" size="small" :closable="false">
            {{ $t('typesPane.typeIdHint') }}
          </Message>
        </div>
        <Message
          v-for="diagnostic in diagnostics"
          :key="diagnostic"
          severity="error"
          size="small"
          :closable="false"
        >{{ diagnostic }}</Message>
        <div class="flex flex-col gap-1">
          <label>{{ $t('typesPane.payloadMime') }}</label>
          <InputChips v-model="payloadMimeValues" :placeholder="'application/perigram+occs'" />
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="flex flex-col gap-1">
            <label>{{ $t('typesPane.maxSize') }}</label>
            <InputNumber
              :model-value="node.data.payload?.maxSize"
              :placeholder="'5242880'"
              :use-grouping="false"
              @update:model-value="value => updatePayload({ maxSize: value ?? undefined })"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('typesPane.preview') }}</label>
            <Select
              :model-value="node.data.payload?.preview || 'attachment'"
              :options="payloadPreviewOptions"
              option-label="label"
              option-value="value"
              @update:model-value="value => updatePayload({ preview: value === 'attachment' ? undefined : value })"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <label>{{ $t('typesPane.operators') }}</label>
            <Button :label="$t('common.add')" icon="pi pi-plus" text size="small" @click="addOperator" />
          </div>
          <div v-for="(operator, index) of operators" :key="index" class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <InputText
                :model-value="operator.id"
                size="small"
                class="flex-1"
                @update:model-value="value => updateOperator(index, { id: value })"
              />
              <Select
                :model-value="operator.species"
                :options="operatorSpeciesOptions"
                option-label="label"
                option-value="value"
                size="small"
                @update:model-value="value => updateOperator(index, { species: value })"
              />
              <Button icon="pi pi-times" text size="small" severity="danger" @click="removeOperator(index)" />
            </div>
            <details>
              <summary class="cursor-pointer text-supporting text-muted">{{ $t('typesPane.signature') }}</summary>
              <div class="mt-2 flex flex-col gap-2">
                <div class="flex items-center gap-2">
                  <Checkbox :model-value="Boolean(operator.input)" :binary="true" @update:model-value="value => updateOperator(index, { input: value ? { base: 'record', fields: {} } : null })" />
                  <span>input</span>
                </div>
                <DescriptorEditor
                  v-if="operator.input"
                  :model-value="operator.input"
                  :type-options="typeOptions"
                  @update:model-value="value => updateOperator(index, { input: value })"
                />
                <div class="flex items-center gap-2">
                  <Checkbox :model-value="Boolean(operator.output)" :binary="true" @update:model-value="value => updateOperator(index, { output: value ? { base: 'string' } : null })" />
                  <span>output</span>
                </div>
                <DescriptorEditor
                  v-if="operator.output"
                  :model-value="operator.output"
                  :type-options="typeOptions"
                  @update:model-value="value => updateOperator(index, { output: value })"
                />
              </div>
            </details>
            <details>
              <summary class="cursor-pointer text-supporting text-muted">{{ $t('typesPane.triggers') }} ({{ (operator.triggers || []).length }})</summary>
              <div class="mt-2 flex flex-col gap-2">
                <div v-for="(trigger, triggerIndex) of operator.triggers || []" :key="triggerIndex" class="flex items-center gap-2">
                  <Select
                    :model-value="trigger.event ? 'event' : 'schedule'"
                    :options="[{ label: 'event', value: 'event' }, { label: 'schedule', value: 'schedule' }]"
                    size="small"
                    @update:model-value="value => updateOperatorTrigger(index, triggerIndex, value === 'event' ? { event: '' } : { schedule: '' })"
                  />
                  <InputText
                    :model-value="trigger.event || trigger.schedule || ''"
                    size="small"
                    class="flex-1"
                    @update:model-value="value => updateOperatorTriggerValue(index, triggerIndex, value)"
                  />
                  <Button icon="pi pi-times" text size="small" severity="danger" @click="removeOperatorTrigger(index, triggerIndex)" />
                </div>
                <Button :label="$t('typesPane.addTrigger')" icon="pi pi-plus" text size="small" @click="updateOperator(index, { triggers: [...(operator.triggers || []), { event: '' }] })" />
              </div>
            </details>
          </div>
        </div>

        <Message severity="info" :closable="false">{{ $t('processDesigner.classDeclaresHint') }}</Message>
      </div>
    </template>

    <template v-else-if="node.type === 'ctsField'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.fieldName') }}</label>
          <InputText v-model="node.data.name" @update:model-value="$emit('sync')" />
        </div>
        <DescriptorEditor
          :model-value="node.data.descriptor || { base: 'string' }"
          :type-options="typeOptions"
          @update:model-value="value => { node.data.descriptor = value; $emit('sync'); }"
        />
      </div>
    </template>

    <template v-else-if="node.type === 'ctsState'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('typeCanvas.stateName') }}</label>
          <InputText v-model="node.data.value" @update:model-value="$emit('sync')" />
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="node.data.initial" :binary="true" />
          <label>{{ $t('typesPane.initial') }}</label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="node.data.terminal" :binary="true" />
          <label>{{ $t('typesPane.terminal') }}</label>
        </div>
      </div>
    </template>

    <template v-else-if="node.type === 'ctsType'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.entityType') }}</label>
          <Select
            :model-value="node.data?.typeId || ''"
            :options="typeAnchorOptions"
            option-label="label"
            option-value="value"
            filter
            @update:model-value="value => { node.data.typeId = value; $emit('sync'); }"
          />
        </div>
        <Message severity="info" :closable="false">{{ $t('processDesigner.typeBindingHint') }}</Message>
      </div>
    </template>
  </div>
</template>

<script setup>
// The declaration inspector: class (id, class preset, payload, operators
// with signatures and triggers), field (name + descriptor via the shared
// type-designer editor), state (value, initial, terminal), and type
// reference selection. Mutations write the canvas node's declaration data
// and emit `sync`; the live-graph pass re-derives records, ports, and the
// tree overlay from it.
import { computed } from 'vue';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputChips from 'primevue/inputchips';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/EntitySelect.vue';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { DECLARABLE_CLASSES, OPERATOR_SPECIES } from '~/packages/cts/src/index.js';

const props = defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] }
});

const emit = defineEmits(['sync']);

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));
const operatorSpeciesOptions = OPERATOR_SPECIES.map(species => ({ label: species, value: species }));
const payloadPreviewOptions = [
  { label: 'attachment', value: 'attachment' },
  { label: 'none', value: 'none' }
];

const operators = computed(() => (props.node.type === 'ctsClass' ? props.node.data.operators || [] : []));

const payloadMimeValues = computed({
  get: () => (props.node.data?.payload ? [].concat(props.node.data.payload.mime || []) : []),
  set: values => updatePayload({ mime: values })
});

function updatePayload(changes) {
  if (props.node.type !== 'ctsClass') return;
  const next = { ...(props.node.data.payload || {}), ...changes };
  props.node.data.payload = next.mime?.length ? next : null;
  emit('sync');
}

function addOperator() {
  if (props.node.type !== 'ctsClass') return;
  props.node.data.operators ||= [];
  let index = props.node.data.operators.length + 1;
  const taken = new Set(props.node.data.operators.map(operator => operator.id));
  while (taken.has(`${props.node.data.typeId || 'op'}-${index}`)) index += 1;
  props.node.data.operators.push({ id: `${props.node.data.typeId || 'op'}-${index}`, species: 'construct', input: null, output: null, triggers: [] });
  emit('sync');
}

function updateOperator(index, changes) {
  if (!props.node.data.operators) return;
  props.node.data.operators[index] = { ...props.node.data.operators[index], ...changes };
  emit('sync');
}

function removeOperator(index) {
  props.node.data.operators.splice(index, 1);
  emit('sync');
}

function updateOperatorTrigger(operatorIndex, triggerIndex, trigger) {
  const triggers = [...(props.node.data.operators[operatorIndex].triggers || [])];
  triggers[triggerIndex] = trigger;
  updateOperator(operatorIndex, { triggers });
}

function updateOperatorTriggerValue(operatorIndex, triggerIndex, value) {
  const trigger = (props.node.data.operators[operatorIndex].triggers || [])[triggerIndex] || {};
  updateOperatorTrigger(operatorIndex, triggerIndex, trigger.event !== undefined ? { event: value } : { schedule: value });
}

function removeOperatorTrigger(operatorIndex, triggerIndex) {
  const triggers = [...(props.node.data.operators[operatorIndex].triggers || [])];
  triggers.splice(triggerIndex, 1);
  updateOperator(operatorIndex, { triggers });
}
</script>
