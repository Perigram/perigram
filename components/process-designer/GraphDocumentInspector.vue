<template>
  <div v-if="node" class="flex min-w-0 flex-col gap-3">
    <strong class="text-label">{{ node.data.label }}</strong>
    <template v-if="isBoundary">
      <InputText v-model="label" size="small" @blur="applyLabel" @keydown.enter.prevent="applyLabel" />
      <div class="flex flex-col gap-2">
        <label class="text-supporting text-muted">{{ $t('processDesigner.graphInterfaceDeclaration') }}</label>
        <ValueSelect
          v-model="declarationShape"
          :options="shapeOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="w-full"
        />
        <ValueSelect
          v-model="declarationBase"
          :options="baseOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="w-full"
          :aria-label="$t('processDesigner.graphSemanticBase')"
        />
        <InputText v-model="declarationKind" size="small" :placeholder="$t('processDesigner.graphSemanticKind')" :aria-label="$t('processDesigner.graphSemanticKind')" />
        <div class="flex items-center justify-between">
          <label class="text-supporting">{{ $t('processDesigner.graphNullable') }}</label>
          <ToggleSwitch v-model="declarationNullable" />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-supporting">{{ $t('processDesigner.graphRequired') }}</label>
          <ToggleSwitch v-model="declarationRequired" />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-supporting">{{ $t('processDesigner.graphDefaultValue') }}</label>
          <ToggleSwitch v-model="declarationHasDefault" />
        </div>
        <TypedValueControl
          v-if="declarationHasDefault"
          :base="declarationBase"
          :model-value="declarationDefault"
          @update:model-value="declarationDefault = $event"
        />
      </div>
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
    </template>
    <template v-else-if="node.data.definition">
      <div v-if="configFields.length" class="flex flex-col gap-3">
        <div v-for="field in configFields" :key="field.id" class="flex min-w-0 flex-col gap-1">
          <label class="text-supporting text-muted">{{ field.label }}{{ field.required ? ' *' : '' }}</label>
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
          <TemplateValuesControl
            v-else-if="field.schema.semantic?.kind === 'documents.template-values'"
            :tokens="templateTokens"
            :sections="templateSections"
            :model-value="configFieldValue(field)"
            @update:model-value="value => updateConfigField(field.id, value)"
          />
          <TypedValueControl
            v-else
            :base="configBase(field.schema)"
            :model-value="configFieldValue(field)"
            @update:model-value="value => updateConfigField(field.id, value)"
          />
          <span v-if="field.schema.description" class="text-supporting text-muted">{{ field.schema.description }}</span>
        </div>
      </div>
      <Message v-if="configError" severity="error">{{ configError }}</Message>
      <p v-else-if="node.data.definition.description" class="text-supporting text-muted">
        {{ node.data.definition.description }}
      </p>
    </template>
    <Message v-else severity="warn">{{ $t('processDesigner.graphUnavailableNode') }}</Message>
  </div>
  <StateBlock v-else :message="$t('processDesigner.graphNoSelection')" />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ValueSelect from '~/components/shared/ValueSelect.vue';
import ToggleSwitch from 'primevue/toggleswitch';
import InstanceSelect from '~/components/shared/InstanceSelect.vue';
import TypedValueControl from '~/components/process-designer/TypedValueControl.vue';
import TemplateValuesControl from '~/components/process-designer/TemplateValuesControl.vue';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_INVOKE_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';
import { SEMANTIC_BASES, TRANSPORT_SHAPES } from '@perigram/plugin-sdk/nodes';

const { t } = useI18n();

const props = defineProps({
  node: { type: Object, default: null },
  boundaryDeclaration: { type: Object, default: null },
  graphDocuments: { type: Array, default: () => [] },
  graphDocumentsLoading: { type: Boolean, default: false },
  graphDocumentsError: { type: String, default: '' },
  graphRevisions: { type: Array, default: () => [] },
  graphRevisionsLoading: { type: Boolean, default: false },
  graphRevisionsError: { type: String, default: '' },
  nodeOutput: { type: [Object, Array, String, Number, Boolean], default: null }
});
const emit = defineEmits(['update-config', 'update-boundary-label', 'update-boundary-declaration', 'hydrate-graph', 'select-graph-document']);
const configDraft = ref({});
const configError = ref('');
const declarationShape = ref('item');
const declarationBase = ref('json');
const declarationKind = ref('');
const declarationNullable = ref(false);
const declarationRequired = ref(true);
const declarationHasDefault = ref(false);
const declarationDefault = ref(null);
const declarationError = ref('');
const shapeOptions = TRANSPORT_SHAPES.map(value => ({ label: value, value }));
// A stored base outside the convention set stays selectable so foreign
// provider bases round-trip instead of silently clearing.
const baseOptions = computed(() => {
  const bases = SEMANTIC_BASES.includes(declarationBase.value) || !declarationBase.value
    ? [...SEMANTIC_BASES]
    : [declarationBase.value, ...SEMANTIC_BASES];
  return bases.map(value => ({ label: value, value }));
});
const label = ref('');

const selectedGraphId = ref('');
const selectedRevisionId = ref('');
const isGraphInvocation = computed(() => props.node?.data?.operation?.id === GRAPH_INVOKE_OPERATION);
const templateOutput = computed(() => props.nodeOutput?.value ?? props.nodeOutput);
const templateTokens = computed(() => Array.isArray(templateOutput.value?.meta?.tokens) ? templateOutput.value.meta.tokens : []);
const templateSections = computed(() => Array.isArray(templateOutput.value?.meta?.sections) ? templateOutput.value.meta.sections : []);
const configFields = computed(() => Object.entries(props.node?.data?.definition?.configuration?.properties || {})
  .map(([id, schema]) => ({
    id,
    label: schema.title || id,
    required: (props.node?.data?.definition?.configuration?.required || []).includes(id),
    schema
  })));
const isBoundary = computed(() => [
  GRAPH_INPUT_OPERATION,
  GRAPH_OUTPUT_OPERATION
].includes(props.node?.data?.operation?.id));

watch(
  [() => props.node?.id, () => props.node?.data?.config, () => props.boundaryDeclaration, () => props.graphDocuments],
  () => {
    configDraft.value = { ...(props.node?.data?.config || {}) };
    configError.value = '';
    declarationError.value = '';
    const contract = props.boundaryDeclaration?.contract || { shape: 'item', semantic: { base: 'json' } };
    declarationShape.value = contract.shape || 'item';
    declarationBase.value = contract.semantic?.base || 'json';
    declarationKind.value = contract.semantic?.kind || '';
    declarationNullable.value = contract.semantic?.nullable === true;
    declarationRequired.value = props.boundaryDeclaration?.required !== false;
    declarationHasDefault.value = Object.hasOwn(props.boundaryDeclaration || {}, 'default');
    declarationDefault.value = props.boundaryDeclaration?.default ?? null;
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
  const next = { ...configDraft.value, [id]: value };
  configDraft.value = next;
  const schema = props.node?.data?.definition?.configuration || {};
  const required = schema.required || [];
  for (const fieldId of required) {
    if (next[fieldId] == null || next[fieldId] === '') {
      configError.value = t('processDesigner.graphConfigurationFieldRequired', { field: fieldId });
      return;
    }
  }
  const fieldSchema = schema.properties?.[id] || {};
  if (fieldSchema.enum && !fieldSchema.enum.some(option => option === value)) {
    configError.value = t('processDesigner.graphConfigurationFieldInvalid', { field: id });
    return;
  }
  if (typeof value === 'number'
    && ((fieldSchema.minimum != null && value < fieldSchema.minimum)
      || (fieldSchema.maximum != null && value > fieldSchema.maximum))) {
    configError.value = t('processDesigner.graphConfigurationFieldOutOfRange', { field: id });
    return;
  }
  if (typeof value === 'string'
    && ((fieldSchema.minLength != null && value.length < fieldSchema.minLength)
      || (fieldSchema.maxLength != null && value.length > fieldSchema.maxLength))) {
    configError.value = t('processDesigner.graphConfigurationFieldInvalid', { field: id });
    return;
  }
  configError.value = '';
  emit('update-config', { nodeId: props.node.id, config: next });
}

function applyDeclaration() {
  const base = declarationBase.value.trim();
  if (!base) {
    declarationError.value = t('processDesigner.graphSemanticBaseRequired');
    return;
  }
  const declaration = {
    contract: {
      shape: declarationShape.value,
      semantic: {
        base,
        ...(declarationKind.value.trim() ? { kind: declarationKind.value.trim() } : {}),
        ...(declarationNullable.value ? { nullable: true } : {})
      }
    },
    required: declarationRequired.value,
    ...(declarationHasDefault.value ? { default: declarationDefault.value } : {})
  };
  try {
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
