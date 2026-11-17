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
        :model-value="selectedGraphId"
        @update:model-value="selectGraphDocument"
        :options="graphDocuments"
        option-label="name"
        option-value="_id"
        :loading="graphDocumentsLoading"
        :disabled="graphDocumentsLoading || !graphDocuments.length"
        class="w-full"
        :placeholder="$t('processDesigner.selectGraphDocument')"
      />
      <Message v-if="graphDocumentsError" severity="error">{{ graphDocumentsError }}</Message>
      <label class="text-supporting text-muted" for="graph-document-revision">{{ $t('processDesigner.graphRevision') }}</label>
      <InstanceSelect
        id="graph-document-revision"
        v-model="selectedRevisionId"
        :options="graphRevisions"
        option-label="label"
        option-value="_id"
        :loading="graphRevisionsLoading"
        :disabled="!selectedGraphId || graphRevisionsLoading || !graphRevisions.length"
        class="w-full"
        :placeholder="$t('processDesigner.selectGraphRevision')"
      />
      <Message v-if="graphRevisionsError" severity="error">{{ graphRevisionsError }}</Message>
      <Button
        size="small"
        :label="$t('processDesigner.pinGraphRevision')"
        :disabled="!selectedGraphId || !selectedRevisionId || graphDocumentsLoading || graphRevisionsLoading"
        @click="emit('hydrate-graph', { nodeId: node.id, graphId: selectedGraphId, revisionId: selectedRevisionId })"
      />
      <div v-if="node.data.config?.graphId" class="text-supporting text-muted">
        {{ node.data.config.graphId }} · {{ node.data.config.revision }}
      </div>
    </template>
    <template v-else-if="node.data.definition">
      <div v-if="configFields.length" class="flex flex-col gap-3">
        <div v-for="field in configFields" :key="field.id" class="flex min-w-0 flex-col gap-1">
          <label class="text-supporting text-muted">{{ field.label }}</label>
          <Select
            v-if="Array.isArray(field.schema.enum)"
            :model-value="configFieldValue(field)"
            :options="field.schema.enum.map(value => ({ label: String(value), value }))"
            option-label="label"
            option-value="value"
            size="small"
            class="w-full"
            @update:model-value="value => updateConfigField(field.id, value)"
          />
          <InputNumber
            v-else-if="['integer', 'number'].includes(field.schema.type)"
            :model-value="configFieldValue(field)"
            :min="field.schema.minimum"
            :max="field.schema.maximum"
            :use-grouping="false"
            size="small"
            class="w-full"
            @update:model-value="value => updateConfigField(field.id, value)"
          />
          <TypedValueControl
            v-else
            :base="configBase(field.schema)"
            :model-value="configFieldValue(field)"
            @update:model-value="value => updateConfigField(field.id, value)"
          />
          <span v-if="field.schema.description" class="text-xs text-muted">{{ field.schema.description }}</span>
        </div>
      </div>
      <p v-else-if="node.data.definition.description" class="text-supporting text-muted">
        {{ node.data.definition.description }}
      </p>
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
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import Textarea from 'primevue/textarea';
import TypedValueControl from '~/components/process-designer/TypedValueControl.vue';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';

const props = defineProps({
  node: { type: Object, default: null },
  boundaryDeclaration: { type: Object, default: null },
  graphDocuments: { type: Array, default: () => [] },
  graphDocumentsLoading: { type: Boolean, default: false },
  graphDocumentsError: { type: String, default: '' },
  graphRevisions: { type: Array, default: () => [] },
  graphRevisionsLoading: { type: Boolean, default: false },
  graphRevisionsError: { type: String, default: '' }
});
const emit = defineEmits(['update-config', 'update-boundary-label', 'update-boundary-declaration', 'hydrate-graph', 'select-graph-document']);
const configDraft = ref({});
const declarationText = ref('{}');
const declarationError = ref('');
const label = ref('');

const selectedGraphId = ref('');
const selectedRevisionId = ref('');
const isGraphInvocation = computed(() => props.node?.data?.operation?.id === 'perigram.core.use-graph');
const configFields = computed(() => Object.entries(props.node?.data?.definition?.configuration?.properties || {})
  .map(([id, schema]) => ({ id, label: schema.title || id, schema })));
const isBoundary = computed(() => [
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
].includes(props.node?.data?.operation?.id));

watch(
  [() => props.node?.id, () => props.node?.data?.config, () => props.boundaryDeclaration, () => props.graphDocuments],
  () => {
    configDraft.value = { ...(props.node?.data?.config || {}) };
    declarationError.value = '';
    declarationText.value = JSON.stringify({
      contract: props.boundaryDeclaration?.contract || { shape: 'item', semantic: { base: 'json' } },
      required: props.boundaryDeclaration?.required !== false,
      ...(Object.hasOwn(props.boundaryDeclaration || {}, 'default')
        ? { default: props.boundaryDeclaration.default }
        : {})
    }, null, 2);
    label.value = props.node?.data?.label || '';
    const canonicalGraphId = String(props.node?.data?.config?.graphId || '');
    const stored = props.graphDocuments.find(item => String(item.fields?.graphId || '') === canonicalGraphId);
    const nextId = String(stored?._id || '');
    if (nextId !== selectedGraphId.value) {
      selectedGraphId.value = nextId;
      selectedRevisionId.value = '';
      if (nextId) emit('select-graph-document', nextId);
    }
  },
  { immediate: true, deep: true }
);

watch(() => props.graphRevisions, revisions => {
  if (!revisions.some(revision => String(revision._id) === String(selectedRevisionId.value))) {
    selectedRevisionId.value = String(revisions[0]?._id || '');
  }
}, { deep: true });

function selectGraphDocument(id) {
  selectedGraphId.value = String(id || '');
  selectedRevisionId.value = '';
  emit('select-graph-document', selectedGraphId.value);
}

function configFieldValue(field) {
  return Object.hasOwn(configDraft.value, field.id)
    ? configDraft.value[field.id]
    : field.schema.default ?? null;
}

function configBase(schema = {}) {
  if (schema.type === 'array' || schema.type === 'object') return 'json';
  if (schema.type === 'integer' || schema.type === 'number') return schema.type;
  if (schema.type === 'boolean') return 'boolean';
  return 'string';
}

function updateConfigField(id, value) {
  configDraft.value = { ...configDraft.value, [id]: value };
  emit('update-config', { nodeId: props.node.id, config: { ...configDraft.value } });
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
