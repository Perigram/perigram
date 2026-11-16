<template>
  <div v-if="node" class="flex min-w-0 flex-col gap-3">
    <strong class="text-label">{{ node.data.label }}</strong>
    <template v-if="isBoundary">
      <InputText v-model="label" size="small" @blur="applyLabel" @keydown.enter.prevent="applyLabel" />
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
import Textarea from 'primevue/textarea';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';

const props = defineProps({
  node: { type: Object, default: null }
});
const emit = defineEmits(['update-config', 'update-boundary-label', 'update-boundary-declaration']);
const configText = ref('{}');
const configError = ref('');\nconst declarationText = ref('{}');\nconst declarationError = ref('');
const label = ref('');

const isBoundary = computed(() => [
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
].includes(props.node?.data?.operation?.id));

watch(() => props.node?.id, () => {
  configText.value = JSON.stringify(props.node?.data?.config || {}, null, 2);
  configError.value = '';
  label.value = props.node?.data?.label || '';
}, { immediate: true });\n\nwatch(() => props.boundaryDeclaration, declaration => {\n  if (!isBoundary.value) return;\n  declarationText.value = JSON.stringify({\n    contract: declaration?.contract || { shape: 'item', semantic: { base: 'json' } },\n    required: declaration?.required !== false,\n    ...(Object.hasOwn(declaration || {}, 'default') ? { default: declaration.default } : {})\n  }, null, 2);\n}, { deep: true });

function applyConfig() {
  try {
    const value = JSON.parse(configText.value || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be a JSON object');
    configError.value = '';
    emit('update-config', { nodeId: props.node.id, config: value });
  } catch (error) {
    configError.value = error.message;
  }
}

function applyDeclaration() {\n  try {\n    const declaration = JSON.parse(declarationText.value || '{}');\n    if (!declaration || typeof declaration !== 'object' || Array.isArray(declaration)) throw new Error('Declaration must be a JSON object');\n    emit('update-boundary-declaration', { nodeId: props.node.id, declaration });\n    declarationError.value = '';\n  } catch (error) {\n    declarationError.value = error.message;\n  }\n}\n\nfunction applyLabel() {
  emit('update-boundary-label', { nodeId: props.node.id, label: label.value });
}
</script>
