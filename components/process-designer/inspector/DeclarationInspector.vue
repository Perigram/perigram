<template>
  <div class="flex flex-col gap-4">
    <template v-if="node.type === 'ctsClass'">
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <label>{{ $t('processDesigner.label') }}</label>
          <InputText
            :model-value="node.data.name || ''"
            :placeholder="$t('processDesigner.classNamePlaceholder')"
            @update:model-value="value => $emit('update-name', String(value || ''))"
          />
        </div>
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

        <Message
          v-for="diagnostic in diagnostics"
          :key="diagnostic"
          severity="error"
          size="small"
          :closable="false"
        >{{ diagnostic }}</Message>
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
          <Select
            :model-value="node.data.severity || 'info'"
            :options="severityOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="$t('processDesigner.stateSeverity')"
            @update:model-value="value => { node.data.severity = value; $emit('sync'); }"
          />
          <InputText
            :model-value="node.data.icon || ''"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="$t('processDesigner.stateIcon')"
            @update:model-value="value => { node.data.icon = String(value || '').trim() || null; $emit('sync'); }"
          />
        </div>
        <Message severity="info" size="small" :closable="false">{{ $t('processDesigner.stateNodeHint') }}</Message>
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
// The declaration inspector: class (name + class preset + declaration
// diagnostics), field (name + descriptor via the shared type-designer
// editor), state (name, severity, icon — a first-class canvas node wired
// into the class, into a Create node for the entry, or into a
// status-mutating effect for the transition target), and type reference
// selection. The class owns no lifecycle editor: states and transitions
// author on the canvas and in the process graph. Mutations write the
// canvas node's declaration data and emit `sync`; the live-graph pass
// re-derives records, ports, and the tree overlay from it.
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from '~/components/shared/EntitySelect.vue';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { DECLARABLE_CLASSES } from '~/packages/cts/src/index.js';

defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] }
});

defineEmits(['sync', 'update-name']);

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));

const severityOptions = ['info', 'success', 'warn', 'danger', 'secondary'].map(value => ({ label: value, value }));
</script>
