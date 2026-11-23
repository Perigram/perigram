<template>
  <div v-if="node" class="flex min-w-0 flex-col gap-3">
    <strong class="text-label">{{ node.data.label }}</strong>
    <Message v-if="node.data.error" severity="error">{{ node.data.error }}</Message>
    <template v-if="isBoundary">
      <InputText v-model="label" size="small" @blur="applyLabel" @keydown.enter.prevent="applyLabel" />
      <div class="flex flex-col gap-2">
        <label class="text-supporting text-muted">{{ $t('processDesigner.graphInterfaceDeclaration') }}</label>
        <ValueSelect
          :model-value="declarationShape"
          :options="shapeOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="w-full"
          @update:model-value="value => { declarationShape = value; commitDeclaration(); }"
        />
        <ValueSelect
          :model-value="declarationBase"
          :options="baseOptions"
          option-label="label"
          option-value="value"
          size="small"
          class="w-full"
          :aria-label="$t('processDesigner.graphSemanticBase')"
          @update:model-value="value => { declarationBase = value; commitDeclaration(); }"
        />
        <InputText
          :model-value="declarationKind"
          size="small"
          :placeholder="$t('processDesigner.graphSemanticKind')"
          :aria-label="$t('processDesigner.graphSemanticKind')"
          @update:model-value="value => declarationKind = value"
          @blur="commitDeclaration()"
          @keydown.enter.prevent="commitDeclaration()"
        />
        <div class="flex items-center justify-between">
          <label class="text-supporting">{{ $t('processDesigner.graphNullable') }}</label>
          <ToggleSwitch :model-value="declarationNullable" @update:model-value="value => { declarationNullable = value; commitDeclaration(); }" />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-supporting">{{ $t('processDesigner.graphRequired') }}</label>
          <ToggleSwitch :model-value="declarationRequired" @update:model-value="value => { declarationRequired = value; commitDeclaration(); }" />
        </div>
        <div class="flex items-center justify-between">
          <label class="text-supporting">{{ $t('processDesigner.graphDefaultValue') }}</label>
          <ToggleSwitch :model-value="declarationHasDefault" @update:model-value="value => { declarationHasDefault = value; commitDeclaration(); }" />
        </div>
        <TypedValueControl
          v-if="declarationHasDefault"
          :base="declarationBase"
          :model-value="declarationDefault"
          @update:model-value="value => { declarationDefault = value; commitDeclaration(); }"
        />
      </div>
      <Message v-if="declarationError" severity="error">{{ declarationError }}</Message>
      <GraphInputBindingControl
        v-if="selectedInputPort"
        :port="selectedInputPort"
        :bindings="inputBindings"
        @apply="emit('update-input-binding', $event)"
      />
      <GraphOutputBakeControl
        v-else-if="selectedOutputPort"
        :output="selectedOutputPort"
        :execution="execution"
        :can-bake-to-saved-graph="canBakeToSavedGraph"
        :baking="baking"
        @bake="emit('bake', $event)"
      />
      <Message v-if="consumerGraphs.length" severity="warn">
        {{ $t('processDesigner.graphInterfaceConsumers', { graphs: consumerGraphs.map(item => item.name).join(', ') }) }}
      </Message>
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
          <TypedLiteralControl
            v-else-if="field.schema.semantic?.kind === 'perigram.typed-value'"
            :bases="field.schema.semantic.bases || []"
            :base="configDraft.type?.base || 'string'"
            :type-id="configDraft[field.schema.semantic.typeIdField || 'typeId'] || ''"
            :model-value="configFieldValue(field)"
            :type-options="typeOptions"
            @update:base="base => setConfigValueBase(field, base)"
            @update:type-id="value => updateTypeFieldId(field, value)"
            @update:model-value="value => updateConfigField(field.id, value)"
          />
          <InstanceSelect
            v-else-if="field.schema.semantic?.kind === 'perigram.value-base'"
            :model-value="configDraft[field.id]?.base || 'string'"
            :options="baseSelectOptions(field.schema.semantic.bases || [])"
            option-label="label"
            option-value="value"
            size="small"
            class="w-full"
            @update:model-value="value => updateConfigField(field.id, { base: value, nullable: false })"
          />
          <InstanceSelect
            v-else-if="field.schema.semantic?.kind === 'perigram.entity-type'"
            :model-value="configFieldValue(field)"
            :options="typeOptions"
            option-label="label"
            option-value="value"
            size="small"
            class="w-full"
            @update:model-value="value => updateConfigField(field.id, value || '')"
          />
          <div v-else-if="field.schema.semantic?.kind === 'perigram.field-list'" class="flex flex-col gap-1">
            <div v-for="(path, index) in (configFieldValue(field) || [])" :key="index" class="flex items-center gap-1">
              <InputText
                :model-value="path"
                size="small"
                class="min-w-0 flex-1"
                @update:model-value="value => updateFieldListItem(field, index, value)"
              />
              <Button
                icon="pi pi-times"
                text
                size="small"
                severity="secondary"
                :aria-label="$t('common.delete')"
                @click="removeFieldListItem(field, index)"
              />
            </div>
            <Button
              icon="pi pi-plus"
              :label="$t('common.add')"
              text
              size="small"
              severity="secondary"
              @click="addFieldListItem(field)"
            />
          </div>
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
import TypedLiteralControl from '~/components/process-designer/TypedLiteralControl.vue';
import TemplateValuesControl from '~/components/process-designer/TemplateValuesControl.vue';
import GraphInputBindingControl from '~/components/process-designer/inspector/GraphInputBindingControl.vue';
import GraphOutputBakeControl from '~/components/process-designer/inspector/GraphOutputBakeControl.vue';
import Message from 'primevue/message';
import StateBlock from '~/components/shared/StateBlock.vue';
import { GRAPH_INPUT_OPERATION, GRAPH_INVOKE_OPERATION, GRAPH_OUTPUT_OPERATION } from '@perigram/core';
import { SEMANTIC_BASES, TRANSPORT_SHAPES } from '@perigram/plugin-sdk/nodes';

const { t, te } = useI18n();

const props = defineProps({
  node: { type: Object, default: null },
  typeOptions: { type: Array, default: () => [] },
  boundaryDeclaration: { type: Object, default: null },
  graphDocuments: { type: Array, default: () => [] },
  graphDocumentsLoading: { type: Boolean, default: false },
  graphDocumentsError: { type: String, default: '' },
  // Readable graph documents pinning this graph through Use Graph; their
  // interface snapshot desynchronizes on an interface edit until re-pinned.
  consumerGraphs: { type: Array, default: () => [] },
  graphRevisions: { type: Array, default: () => [] },
  graphRevisionsLoading: { type: Boolean, default: false },
  graphRevisionsError: { type: String, default: '' },
  graphInputs: { type: Array, default: () => [] },
  graphOutputs: { type: Array, default: () => [] },
  inputBindings: { type: Object, default: () => ({}) },
  execution: { type: Object, default: null },
  canBakeToSavedGraph: { type: Boolean, default: false },
  baking: { type: Boolean, default: false },
  nodeOutput: { type: [Object, Array, String, Number, Boolean], default: null }
});
const emit = defineEmits(['update-config', 'update-boundary-label', 'update-boundary-declaration', 'hydrate-graph', 'select-graph-document', 'update-input-binding', 'bake']);
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
const boundaryPortId = computed(() => String(props.node?.data?.config?.interfaceId || ''));
const boundaryPorts = computed(() => props.node?.data?.operation?.id === GRAPH_INPUT_OPERATION
  ? props.graphInputs
  : props.graphOutputs);
const selectedBoundaryPort = computed(() => boundaryPortId.value
  ? boundaryPorts.value.find(port => String(port.id) === boundaryPortId.value) || null
  : null);
const selectedInputPort = computed(() => props.node?.data?.operation?.id === GRAPH_INPUT_OPERATION
  ? selectedBoundaryPort.value
  : null);
const selectedOutputPort = computed(() => props.node?.data?.operation?.id === GRAPH_OUTPUT_OPERATION
  ? selectedBoundaryPort.value
  : null);

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

function baseSelectOptions(bases) {
  return bases.map(value => {
    const key = `processDesigner.dataTypes.${value}`;
    return { label: te(key) ? t(key) : value, value };
  });
}

function setConfigValueBase(field, base) {
  const semantic = field.schema.semantic || {};
  const typeField = semantic.typeField || 'type';
  const typeIdField = semantic.typeIdField || 'typeId';
  const typeId = configDraft.value[typeIdField] || '';
  const type = { base, nullable: false, ...(base === 'entityRef' ? { typeId } : {}) };
  const value = base === 'boolean' ? false
    : ['number', 'integer'].includes(base) ? 0
      : base === 'json' ? {}
        : '';
  configDraft.value = {
    ...configDraft.value,
    [typeField]: type,
    [field.id]: value,
    ...(base === 'entityRef' ? { [typeIdField]: typeId } : {})
  };
  commitConfigDraft();
}

function updateFieldListItem(field, index, value) {
  const items = [...(configFieldValue(field) || [])];
  items[index] = value;
  updateConfigField(field.id, items);
}

function addFieldListItem(field) {
  updateConfigField(field.id, [...(configFieldValue(field) || []), '']);
}

function removeFieldListItem(field, index) {
  updateConfigField(field.id, (configFieldValue(field) || []).filter((_, position) => position !== index));
}

function updateTypeFieldId(field, value) {
  const semantic = field.schema.semantic || {};
  const typeField = semantic.typeField || 'type';
  const typeIdField = semantic.typeIdField || 'typeId';
  configDraft.value = {
    ...configDraft.value,
    [typeIdField]: value || '',
    [typeField]: { ...(configDraft.value[typeField] || {}), base: 'entityRef', typeId: value || '' },
    [field.id]: null
  };
  commitConfigDraft();
}

function commitConfigDraft() {
  const schema = props.node?.data?.definition?.configuration || {};
  const required = schema.required || [];
  for (const fieldId of required) {
    if (configDraft.value[fieldId] == null || configDraft.value[fieldId] === '') {
      configError.value = t('processDesigner.graphConfigurationFieldRequired', { field: fieldId });
      return;
    }
  }
  configError.value = '';
  emit('update-config', { nodeId: props.node.id, config: { ...configDraft.value } });
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

function commitDeclaration() {
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
