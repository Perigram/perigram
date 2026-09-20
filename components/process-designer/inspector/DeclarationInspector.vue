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
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <label>{{ $t('processDesigner.lifecycle') }}</label>
            <Button :label="$t('typesPane.addState')" icon="pi pi-plus" text size="small" @click="emit('add-state', suggestedStateValue)" />
          </div>
          <Message v-if="!lifecycle.states.length" severity="secondary" size="small" :closable="false">
            {{ $t('processDesigner.lifecycleEmptyHint') }}
          </Message>
          <small class="text-muted">{{ $t('processDesigner.lifecycleHint') }}</small>
          <Message severity="secondary" size="small" :closable="false">{{ $t('processDesigner.entryHint') }}</Message>
          <div
            v-for="state in lifecycle.states"
            :key="state.nodeId"
            class="flex flex-col gap-1 rounded-ui border border-content-border p-1.5"
            :class="state.initial ? 'border-primary' : ''"
          >
            <div class="flex items-center gap-2">
              <InputText
                :model-value="state.value"
                size="small"
                class="min-w-0 flex-1"
                :placeholder="$t('typeCanvas.stateName')"
                @update:model-value="value => emit('update-state', { nodeId: state.nodeId, changes: { value: String(value || '') } })"
              />
              <Tag v-if="state.initial" :value="$t('processDesigner.entryState')" severity="info" size="small" />
              <Tag v-else-if="state.terminal" :value="$t('processDesigner.endState')" severity="secondary" size="small" />
              <Button icon="pi pi-times" text severity="danger" size="small" :aria-label="$t('common.delete')" @click="emit('remove-state', state.nodeId)" />
            </div>
            <div class="flex items-center gap-2">
              <Select
                :model-value="state.severity || 'info'"
                :options="severityOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="min-w-0 flex-1"
                :aria-label="$t('processDesigner.stateSeverity')"
                @update:model-value="value => emit('update-state', { nodeId: state.nodeId, changes: { severity: value } })"
              />
              <Select
                :model-value="state.icon || ''"
                :options="stateIconOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="min-w-0 flex-1"
                :aria-label="$t('processDesigner.stateIcon')"
                @update:model-value="value => emit('update-state', { nodeId: state.nodeId, changes: { icon: value || null } })"
              />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label>{{ $t('typesPane.transitions') }}</label>
            <div v-if="lifecycle.states.length > 1" class="flex items-center gap-2 rounded-ui border border-dashed border-content-border p-1.5">
              <Select
                v-model="newTransitionFrom"
                :options="stateOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="w-24"
                :aria-label="$t('processDesigner.transitionFrom')"
              />
              <i class="pi pi-arrow-right text-muted" aria-hidden="true" />
              <Select
                v-model="newTransitionTo"
                :options="stateOptions"
                option-label="label"
                option-value="value"
                size="small"
                class="w-24"
                :aria-label="$t('processDesigner.transitionTo')"
              />
              <InputText
                v-model="newTransitionIntent"
                size="small"
                class="min-w-0 flex-1"
                :placeholder="$t('typesPane.intent')"
              />
              <Button icon="pi pi-plus" text size="small" :disabled="!newTransitionFrom || !newTransitionTo" :aria-label="$t('typesPane.addTransition')" @click="emitTransition" />
            </div>
            <div v-if="lifecycle.transitions.length" class="flex flex-col gap-1">
            <div
              v-for="transition in lifecycle.transitions"
              :key="transition.edgeId"
              class="flex items-center gap-2 rounded-ui border border-content-border p-1.5"
              :title="transition.from === transition.to ? $t('processDesigner.transitionLoopHint') : ''"
            >
              <span class="shrink-0 text-supporting text-muted">{{ transition.from }} → {{ transition.to }}</span>
              <InputText
                :model-value="transition.intent"
                size="small"
                class="min-w-0 flex-1"
                :placeholder="$t('typesPane.intent')"
                @update:model-value="value => emit('update-transition', { edgeId: transition.edgeId, intent: String(value || '') })"
              />
              <Button icon="pi pi-times" text severity="danger" size="small" :aria-label="$t('common.delete')" @click="emit('remove-transition', transition.edgeId)" />
            </div>
            </div>
          </div>
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
          <Select
            :model-value="node.data.icon || ''"
            :options="stateIconOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="min-w-0 flex-1"
            :aria-label="$t('processDesigner.stateIcon')"
            @update:model-value="value => { node.data.icon = value || null; $emit('sync'); }"
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
// The declaration inspector: class (class preset + type id with live
// validity and declaration diagnostics), field (name + descriptor via the
// shared type-designer editor), state (value, initial, terminal), and type
// reference selection. Payload traits and operator signatures are
// pack/registry authoring and stay off the canvas. Mutations write the
// canvas node's declaration data and emit `sync`; the live-graph pass
// re-derives records, ports, and the tree overlay from it.
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Tag from 'primevue/tag';
import Select from '~/components/shared/EntitySelect.vue';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import { DECLARABLE_CLASSES } from '~/packages/cts/src/index.js';

const props = defineProps({
  node: { type: Object, required: true },
  typeIdValid: { type: Boolean, default: true },
  diagnostics: { type: Array, default: () => [] },
  typeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] },
  // Lifecycle of THIS class, derived from the declaration tree
  // (classLifecycleOf): panel edits go through the same state nodes and
  // transition wires the canvas renders.
  lifecycle: { type: Object, default: () => ({ states: [], transitions: [] }) }
});

const emit = defineEmits(['sync', 'update-name', 'add-state', 'update-state', 'remove-state', 'add-transition', 'update-transition', 'remove-transition']);

const classOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));

const severityOptions = ['info', 'success', 'warn', 'danger', 'secondary'].map(value => ({ label: value, value }));
const stateIconOptions = [
  { label: 'default', value: '' },
  { label: 'circle', value: 'pi pi-circle-fill' },
  { label: 'draft', value: 'pi pi-file-edit' },
  { label: 'active', value: 'pi pi-play-circle' },
  { label: 'review', value: 'pi pi-eye' },
  { label: 'ready', value: 'pi pi-check-circle' },
  { label: 'blocked', value: 'pi pi-ban' },
  { label: 'warning', value: 'pi pi-exclamation-triangle' },
  { label: 'archived', value: 'pi pi-box' }
];

const suggestedStateValue = computed(() => {
  const taken = new Set(props.lifecycle.states.map(state => state.value));
  let index = 1;
  while (taken.has(`state-${index}`)) index += 1;
  return `state-${index}`;
});

const stateOptions = computed(() => props.lifecycle.states.map(state => ({ label: state.value || '…', value: state.nodeId })));
const newTransitionFrom = ref(null);
const newTransitionTo = ref(null);
const newTransitionIntent = ref('');
function emitTransition() {
  if (!newTransitionFrom.value || !newTransitionTo.value) return;
  emit('add-transition', {
    fromNodeId: newTransitionFrom.value,
    toNodeId: newTransitionTo.value,
    intent: newTransitionIntent.value.trim()
  });
  newTransitionIntent.value = '';
}


</script>
