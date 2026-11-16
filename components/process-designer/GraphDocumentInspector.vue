<template>
  <div v-if="node" class="flex min-w-0 flex-col gap-3">
    <strong class="text-label">{{ node.data.label }}</strong>
    <template v-if="isBoundary">
      <InputText v-model="label" size="small" @blur="applyLabel" @keydown.enter.prevent="applyLabel" />
      <label class="text-supporting text-muted" for="graph-boundary-declaration">{{ $t('processDesigner.graphInterfaceDeclaration') }}</label>
      <Textarea id="graph-boundary-declaration" v-model="declarationText" rows="8" auto-resize class="w-full text-supporting" />
      <Message v-if="declarationError" severity="error">{{ declarationError }}</Message>
      <Button size="small" :label="$t('processDesigner.graphApplyInterfaceDeclaration')" @click="applyDeclaration" />
    </template>
    <template v-else-if="isGraphInvocation">
      <label class="text-supporting text-muted" for="graph-document-source">{{ $t('processDesigner.graphDocumentSource') }}</label>
      <InstanceSelect
        id="graph-document-source"
        v-model="selectedGraphId"
        :options="graphDocuments"
        option-label="name"
        option-value="_id"
        :loading="graphDocumentsLoading"
        :disabled="graphDocumentsLoading || !graphDocuments.length"
        class="w-full"
        :placeholder="$t('processDesigner.selectGraphDocument')"
      />
      <Message v-if="graphDocumentsError" severity="error">{{ graphDocumentsError }}</Message>
      <Button
        size="small"
        :label="$t('processDesigner.pinGraphRevision')"
        :disabled="!selectedGraphId || graphDocumentsLoading"
        @click="emit('hydrate-graph', { nodeId: node.id, graphId: selectedGraphId })"
      />
      <div v-if="node.data.config?.graphId" class="text-supporting text-muted">
        {{ node.data.config.graphId }} · {{ node.data.config.revision }}
      </div>
    </template>
    <template v-else-if="node.data.definition">
      <label class="text-supporting text-muted" for="graph-node-config">{{ $t('processDesigner.graphConfiguration') }}</label>
      <Textarea id="graph-node-config" v-model="configText" rows="8" auto-resize class="w-full text-supporting" />
      <Message v-if="configError" severity="error">{{ configError }}</Message>
      <Button size="small" :label="$t('processDesigner.graphApplyConfiguration')" @click="applyConfig" />
    </template>
    <Message v-else severity="warn">{{ $t('processDesigner.graphUnavailableNode') }}</Message>
    <div v-if="node.data.definition" class="flex flex-col gap-2">
      <div v-if="node.data.definition.inputs?.length">
        <span class="text-supporting text-muted">{{ $t('processDesigner.inputs') }}</span>
        <div v-for="port in node.data.definition.inputs" :key="port.id" class="text-supporting">
          {{ port.label || port.id }} · {{ port.semantic?.base || 'json' }} · {{ port.shape || 'item' }}
        </div>
      </div>
      <div v-if="node.data.definition.outputs?.length">
        <span class="text-supporting text-muted">{{ $t('processDesigner.outputs') }}</span>
        <div v-for="port in node.data.definition.outputs" :key="port.id" class="text-supporting">
          {{ port.label || port.id }} · {{ port.semantic?.base || 'json' }} · {{ port.shape || 'item' }}
        </div>
      </div>
    </div>
  </div>
  <StateBlock v-else :message="$t('processDesigner.graphNoSelection')" />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';

const props = defineProps({
  node: { type: Object, default: null },
  boundaryDeclaration: { type: Object, default: null },
  graphDocuments: { type: Array, default: () => [] },
  graphDocumentsLoading: { type: Boolean, default: false },
  graphDocumentsError: { type: String, default: '' }
});
const emit = defineEmits(['update-config', 'update-boundary-label', 'update-boundary-declaration', 'hydrate-graph']);
const configText = ref('{}');
const configError = ref('');
const declarationText = ref('{}');
const declarationError = ref('');
const label = ref('');

const selectedGraphId = ref('');
const isGraphInvocation = computed(() => props.node?.data?.operation?.id === 'perigram.core.use-graph');
const isBoundary = computed(() => [
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
].includes(props.node?.data?.operation?.id));

watch(
  [() => props.node?.id, () => props.node?.data?.config?.graphId, () => props.boundaryDeclaration],
  () => {
    configText.value = JSON.stringify(props.node?.data?.config || {}, null, 2);
    configError.value = '';
    declarationError.value = '';
    declarationText.value = JSON.stringify({
      contract: props.boundaryDeclaration?.contract || { shape: 'item', semantic: { base: 'json' } },
      required: props.boundaryDeclaration?.required !== false,
      ...(Object.hasOwn(props.boundaryDeclaration || {}, 'default')
        ? { default: props.boundaryDeclaration.default }
        : {})
    }, null, 2);
    label.value = props.node?.data?.label || '';
    selectedGraphId.value = String(props.node?.data?.config?.graphId || '');
  },
  { immediate: true, deep: true }
);

function applyConfig() {
  try {
    const value = JSON.parse(configText.value || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Configuration must be a JSON object');
    }
    configError.value = '';
    emit('update-config', { nodeId: props.node.id, config: value });
  } catch (error) {
    configError.value = error.message;
  }
}

function applyDeclaration() {
  try {
    const declaration = JSON.parse(declarationText.value || '{}');
    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) {
      throw new Error('Declaration must be a JSON object');
    }
    emit('update-boundary-declaration', { nodeId: props.node.id, declaration });
    declarationError.value = '';
  } catch (error) {
    declarationError.value = error.message;
  }
}

function applyLabel() {
  emit('update-boundary-label', { nodeId: props.node.id, label: label.value });
}
</script>
