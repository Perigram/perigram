<template>
  <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
    <DeclarationInspector
      v-if="declarationNodeTypes.includes(selectedNode.type)"
      :node="selectedNode"
      :type-id-valid="classTypeIdValid"
      :diagnostics="classDeclarationDiagnostics"
      :type-options="declarationTypeOptions"
      :type-anchor-options="typeAnchorOptions"
      :identifier-field-options="classIdentifierField.options"
      :identifier-field-value="classIdentifierField.value"
      @sync="$emit('sync')"
      @update-name="value => $emit('update-name', value)"
      @update-identifier-field="value => $emit('update-identifier-field', value)"
    />

    <ProcessNodeInspector
      v-else-if="selectedNode.type === 'processNode'"
      :record="selectedProcessNode"
      :producer="selectedEntity"
      :producer-available="selectedEntityAvailable"
      :relation-options-for="relationOptionsForEntity"
      :projection-options-for="projectionOptionsForEntity"
      :type-id-options="typeIdOptions"
      :role-options="roleOptions"
      :command-options="commandOptions"
      :command-service="selectedCommandService"
      :service-principal-options="servicePrincipalOptions"
      :guard-field-options="transitionGuardFieldOptions"
      :state-policy-target="recordStatePolicyTarget"
      :state-field-policy-options="recordStateFieldPolicyOptions"
      :construction-modes="constructionModes"
      :designer="designer"
      :grants="grants"
      :effective-access="effectiveAccess"
      :inputs="inputs"
      :operation-options="operationOptions"
      :status-options="statusOptions"
      :preview="preview"
      :format-preview-path="formatPreviewPath"
      :format-preview-items="formatPreviewItems"
      @sync="$emit('sync')"
      @update-grant-level="payload => $emit('update-grant-level', payload)"
      @update-construction-mode="mode => $emit('update-construction-mode', mode)"
      @run-preview="$emit('run-preview')"
      @create-command-service="$emit('create-command-service')"
      @remove-command-service="$emit('remove-command-service')"
    />
  </div>
  <DeclarationEdgeInspector
    v-else-if="selectedDeclarationEdge"
    :edge="selectedDeclarationEdge"
  />
  <StateBlock v-else :message="$t('processDesigner.selectNode')" />
</template>

<script setup>
import DeclarationInspector from '~/components/process-designer/inspector/DeclarationInspector.vue';
import ProcessNodeInspector from '~/components/process-designer/inspector/ProcessNodeInspector.vue';
import DeclarationEdgeInspector from '~/components/process-designer/inspector/DeclarationEdgeInspector.vue';
import StateBlock from '~/components/shared/StateBlock.vue';

// The node/edge inspector body (process-designer README "Inspector
// anatomy"): pure presentation over the session's selection seams —
// every mutation is an event back to the host's update/sync entry
// points. The host owns the tab shell around it.
defineProps({
  selectedNode: { type: Object, default: null },
  selectedProcessNode: { type: Object, default: null },
  selectedEntity: { type: Object, default: null },
  selectedEntityAvailable: { type: Boolean, default: false },
  selectedDeclarationEdge: { type: Object, default: null },
  declarationNodeTypes: { type: Array, default: () => [] },
  classTypeIdValid: { type: Boolean, default: false },
  classDeclarationDiagnostics: { type: Array, default: () => [] },
  declarationTypeOptions: { type: Array, default: () => [] },
  typeAnchorOptions: { type: Array, default: () => [] },
  classIdentifierField: { type: Object, default: () => ({ options: [], value: '' }) },
  relationOptionsForEntity: { type: Function, required: true },
  projectionOptionsForEntity: { type: Function, required: true },
  typeIdOptions: { type: Array, default: () => [] },
  roleOptions: { type: Array, default: () => [] },
  commandOptions: { type: Array, default: () => [] },
  selectedCommandService: { type: Object, default: null },
  servicePrincipalOptions: { type: Array, default: () => [] },
  transitionGuardFieldOptions: { type: Array, default: () => [] },
  recordStatePolicyTarget: { type: null, default: '' },
  recordStateFieldPolicyOptions: { type: Array, default: () => [] },
  constructionModes: { type: Array, default: () => [] },
  designer: { type: Object, required: true },
  grants: { type: Array, default: () => [] },
  effectiveAccess: { type: Array, default: () => [] },
  inputs: { type: Array, default: () => [] },
  operationOptions: { type: Array, default: () => [] },
  statusOptions: { type: Array, default: () => [] },
  preview: { type: Object, default: null },
  formatPreviewPath: { type: Function, required: true },
  formatPreviewItems: { type: Function, required: true }
});

defineEmits([
  'sync',
  'update-name',
  'update-identifier-field',
  'update-grant-level',
  'update-construction-mode',
  'run-preview',
  'create-command-service',
  'remove-command-service'
]);
</script>
