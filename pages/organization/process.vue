<template>
  <StandardPage>
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <div class="min-w-0">
        <strong class="block truncate">{{ $t('processDesigner.title') }}</strong>
        <small class="text-muted-color">{{ activeName || $t('processDesigner.noActiveDraft') }}</small>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <Button icon="pi pi-users" :aria-label="$t('organization.teamManagement')" size="small" severity="secondary" outlined @click="navigateTo('/organization/users')" />
        <Button icon="pi pi-plus" :label="$t('processDesigner.newDraft')" size="small" @click="createDraft" />
        <Button icon="pi pi-check-circle" :label="$t('processDesigner.validate')" size="small" severity="secondary" outlined :disabled="!draft?._id" @click="validateDraft" />
        <Button icon="pi pi-bolt" :label="$t('processDesigner.activate')" size="small" :disabled="!draft?._id" @click="activateDraft" />
      </div>
    </div>

    <div class="grid min-h-[calc(100vh-12rem)] grid-cols-1 gap-4 xl:grid-cols-[12rem_minmax(0,1fr)_28rem]">
      <Panel :header="$t('processDesigner.palette')">
        <div class="grid grid-cols-2 gap-2 xl:grid-cols-1">
          <Button
            v-for="item in palette"
            :key="item.type"
            :icon="item.icon"
            :label="$t(item.label)"
            size="small"
            outlined
            @click="addNode(item.type)"
          />
        </div>
      </Panel>

      <Panel>
        <template #header>
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div class="min-w-0">
              <span class="font-medium">{{ $t('processDesigner.canvas') }}</span>
              <div class="mt-1 flex flex-wrap gap-2">
                <Tag v-for="legend in connectionLegend" :key="legend.key" :value="$t(legend.label)" :severity="legend.severity" size="small" />
              </div>
            </div>
            <Button icon="pi pi-save" :label="$t('common.save')" size="small" severity="secondary" outlined @click="saveDraft" />
          </div>
        </template>
        <div class="h-[46rem] min-h-0 overflow-hidden rounded-ui border border-content-border bg-subtle">
          <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            fit-view-on-init
            :default-edge-options="defaultEdgeOptions"
            @node-click="event => selectNode(event.node)"
            @pane-click="selectedNodeId = null"
            @connect="onConnect"
          >
            <template #node-role="props"><ProcessRoleNode v-bind="props" /></template>
            <template #node-entity="props"><ProcessEntityNode v-bind="props" /></template>
            <template #node-service="props"><ProcessServiceNode v-bind="props" /></template>
            <template #node-socket="props"><ProcessSocketNode v-bind="props" /></template>
            <template #node-user="props"><ProcessUserNode v-bind="props" /></template>
          </VueFlow>
        </div>
      </Panel>

      <Panel :header="$t('processDesigner.inspector')">
        <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
          <div class="flex flex-col gap-1">
            <label>{{ $t('processDesigner.label') }}</label>
            <InputText v-model="selectedRecord.label" />
          </div>

          <template v-if="selectedNode.type === 'role'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.roleKind') }}</label>
              <Select v-model="selectedRole.kind" :options="roleKinds" option-label="label" option-value="value" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.navigationRoutes') }}</label>
              <MultiSelect v-model="selectedRoleNavigationRoutes" :options="navigationRouteOptions" option-label="label" option-value="value" display="chip" class="w-full" @change="applyRoleNavigationRoutes" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.explicitGrants') }}</label>
              <Textarea v-model="selectedRoleGrantsJson" rows="5" class="font-mono text-xs" @blur="applyRoleGrantsJson" />
            </div>
          </template>

          <template v-else-if="selectedNode.type === 'entity'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.entityType') }}</label>
              <Select v-model="selectedEntity.entityType" :options="entityTypeOptions" option-label="label" option-value="value" @change="syncEntityDefaults" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.lifecycleMode') }}</label>
              <Select v-model="selectedEntity.lifecycle.mode" :options="lifecycleModes" option-label="label" option-value="value" />
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.readRoles') }}</label>
                <MultiSelect v-model="selectedEntity.allowedRoles.read" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.writeRoles') }}</label>
                <MultiSelect v-model="selectedEntity.allowedRoles.write" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.adminRoles') }}</label>
                <MultiSelect v-model="selectedEntity.allowedRoles.admin" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.publicFields') }}</label>
                <MultiSelect v-model="selectedEntity.fields.read" :options="fieldOptionsForSelectedEntity" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.writeFields') }}</label>
                <MultiSelect v-model="selectedEntity.fields.write" :options="fieldOptionsForSelectedEntity" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.privateFields') }}</label>
                <MultiSelect v-model="selectedEntity.fields.private" :options="fieldOptionsForSelectedEntity" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
            </div>
            <WorkflowDesignerV2
              v-if="selectedEntity.lifecycle.mode === 'custom'"
              v-model="selectedEntity.lifecycle.workflow"
              :feature="selectedEntityFeature"
            />
          </template>

          <template v-else-if="selectedNode.type === 'service'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.commandId') }}</label>
              <Select v-model="selectedService.commandId" :options="commandOptions" option-label="label" option-value="value" @change="syncServiceFromCommand" />
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.runRoles') }}</label>
                <MultiSelect v-model="selectedService.access.runRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.viewRoles') }}</label>
                <MultiSelect v-model="selectedService.access.viewRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Panel :header="$t('processDesigner.inputs')">
                <div class="flex flex-wrap gap-2">
                  <Tag v-for="input in selectedService.inputs" :key="input.id" :value="input.entityType || input.id" size="small" />
                </div>
              </Panel>
              <Panel :header="$t('processDesigner.outputs')">
                <div class="flex flex-wrap gap-2">
                  <Tag v-for="output in selectedService.outputs" :key="output.id" :value="output.entityType || output.id" size="small" severity="success" />
                </div>
              </Panel>
            </div>
          </template>

          <template v-else-if="selectedNode.type === 'socket'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.direction') }}</label>
              <Select v-model="selectedSocket.direction" :options="socketDirections" option-label="label" option-value="value" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.entityType') }}</label>
              <Select v-model="selectedSocket.entityType" :options="entityTypeOptions" option-label="label" option-value="value" />
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.projectedFields') }}</label>
                <MultiSelect v-model="selectedSocket.projection.fields" :options="fieldOptionsForSelectedSocket" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.excludedFields') }}</label>
                <MultiSelect v-model="selectedSocket.projection.excludeFields" :options="fieldOptionsForSelectedSocket" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.sendRoles') }}</label>
                <MultiSelect v-model="selectedSocket.access.sendRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
              <div class="flex flex-col gap-1">
                <label>{{ $t('processDesigner.receiveRoles') }}</label>
                <MultiSelect v-model="selectedSocket.access.receiveRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.receiverLifecycle') }}</label>
              <Select v-model="selectedSocket.receiverLifecycle.mode" :options="lifecycleModes" option-label="label" option-value="value" />
            </div>
          </template>

          <template v-else-if="selectedNode.type === 'user'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.userId') }}</label>
              <InputText v-model="selectedAssignment.userId" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.roleIds') }}</label>
              <MultiSelect v-model="selectedAssignment.roleIds" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.bindingsJson') }}</label>
              <Textarea v-model="selectedAssignmentBindingsJson" rows="5" class="font-mono text-xs" @blur="applyAssignmentBindingsJson" />
            </div>
          </template>

          <Button icon="pi pi-save" :label="$t('common.save')" size="small" @click="saveDraft" />
        </div>
        <StateBlock v-else :message="$t('processDesigner.selectNode')" />
      </Panel>
    </div>

    <Panel v-if="validation" :header="$t('processDesigner.validation')">
      <div class="flex flex-col gap-2">
        <Message :severity="validation.ok ? 'success' : 'error'">
          {{ validation.ok ? $t('processDesigner.validationOk') : validation.errors.join('; ') }}
        </Message>
        <Message v-for="warning in validation.warnings || []" :key="warning" severity="warn">{{ warning }}</Message>
      </div>
    </Panel>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from 'primevue/multiselect';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import WorkflowDesignerV2 from '~/components/WorkflowDesignerV2.vue';
import { cncDomain, cncEntityFieldAccess } from '@cutkit/domain-cnc';
import ProcessRoleNode from '~/components/process-designer/ProcessRoleNode.vue';
import ProcessEntityNode from '~/components/process-designer/ProcessEntityNode.vue';
import ProcessServiceNode from '~/components/process-designer/ProcessServiceNode.vue';
import ProcessSocketNode from '~/components/process-designer/ProcessSocketNode.vue';
import ProcessUserNode from '~/components/process-designer/ProcessUserNode.vue';

const { t } = useI18n();
definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const draft = ref(null);
const nodes = ref([]);
const edges = ref([]);
const selectedNodeId = ref(null);
const validation = ref(null);

const palette = [
  { type: 'role', icon: 'pi pi-shield', label: 'processDesigner.role' },
  { type: 'entity', icon: 'pi pi-box', label: 'processDesigner.entity' },
  { type: 'service', icon: 'pi pi-cog', label: 'processDesigner.service' },
  { type: 'socket', icon: 'pi pi-share-alt', label: 'processDesigner.socket' },
  { type: 'user', icon: 'pi pi-user', label: 'processDesigner.assignment' }
];
const roleKinds = [
  { label: 'orgRole', value: 'orgRole' },
  { label: 'userRole', value: 'userRole' },
  { label: 'serviceRole', value: 'serviceRole' }
];
const lifecycleModes = [
  { label: 'defaultCreated', value: 'defaultCreated' },
  { label: 'domainDefault', value: 'domainDefault' },
  { label: 'custom', value: 'custom' }
];
const socketDirections = [
  { label: 'outbound', value: 'outbound' },
  { label: 'inbound', value: 'inbound' }
];
const connectionLegend = [
  { key: 'assignment', label: 'processDesigner.assignmentEdge', severity: 'info' },
  { key: 'access', label: 'processDesigner.accessEdge', severity: 'success' },
  { key: 'service', label: 'processDesigner.serviceEdge', severity: 'warning' },
  { key: 'socket', label: 'processDesigner.socketEdge', severity: 'secondary' }
];
const defaultEdgeOptions = { type: 'smoothstep' };

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedRecord = computed(() => {
  if (!selectedNode.value) return {};
  return ensureRecord(recordKeyForType(selectedNode.value.type), selectedNode.value, factoryForType(selectedNode.value.type));
});
const selectedRole = computed(() => selectedNode.value?.type === 'role' ? ensureRecord('roles', selectedNode.value, createRole) : {});
const selectedEntity = computed(() => selectedNode.value?.type === 'entity' ? ensureRecord('entityProfiles', selectedNode.value, createEntityProfile) : {});
const selectedService = computed(() => selectedNode.value?.type === 'service' ? ensureRecord('services', selectedNode.value, createService) : {});
const selectedSocket = computed(() => selectedNode.value?.type === 'socket' ? ensureRecord('sockets', selectedNode.value, createSocket) : {});
const selectedAssignment = computed(() => selectedNode.value?.type === 'user' ? ensureRecord('assignments', selectedNode.value, createAssignment) : {});
const selectedEntityFeature = computed(() => selectedEntity.value.entityType?.replace(/_/g, 's') || 'projects');

const roles = computed(() => draft.value?.data?.roles || {});
const entityProfiles = computed(() => draft.value?.data?.entityProfiles || {});
const services = computed(() => draft.value?.data?.services || {});
const sockets = computed(() => draft.value?.data?.sockets || {});
const roleOptions = computed(() => Object.values(roles.value).map(role => ({ label: role.label || role.id, value: role.id })));
const entityTypeOptions = computed(() => (cncDomain.entities || []).map(entity => ({ label: entity.type, value: entity.type })));
const commandOptions = computed(() => Object.values(cncDomain.commands || {}).map(command => ({ label: command.label || command.id, value: command.id })));
const navigationRouteOptions = computed(() => [
  { label: t('features.projects'), value: '/projects', feature: 'projects' },
  { label: t('features.warehouses'), value: '/warehouses', feature: 'warehouses' },
  { label: t('features.catalogs'), value: '/catalog', feature: 'catalogs' },
  { label: t('features.requisitions'), value: '/requisitions', feature: 'requisitions' },
  { label: t('features.assets'), value: '/assets/cassettes', feature: 'cassettes' },
  { label: t('organization.teamManagement'), value: '/organization/users', feature: 'users' },
  { label: t('processDesigner.title'), value: '/organization/process', feature: 'organizations' }
]);
const selectedRoleNavigationRoutes = ref([]);
const selectedRoleGrantsJson = ref('[]');
const selectedAssignmentBindingsJson = ref('{}');
const fieldOptionsForSelectedEntity = computed(() => fieldOptions(selectedEntity.value.entityType));
const fieldOptionsForSelectedSocket = computed(() => fieldOptions(selectedSocket.value.entityType));

watch(selectedNode, () => {
  if (!selectedNode.value) return;
  selectedRoleGrantsJson.value = JSON.stringify(selectedRole.value.grants || [], null, 2);
  selectedRoleNavigationRoutes.value = (selectedRole.value.navigation || []).map(item => item.route).filter(Boolean);
  selectedAssignmentBindingsJson.value = JSON.stringify(selectedAssignment.value.bindings || {}, null, 2);
});
watch(() => draft.value?.data, () => {
  if (draft.value) syncNodeData();
}, { deep: true });

onMounted(loadActiveOrCreateLocal);

async function loadActiveOrCreateLocal() {
  const active = await $fetch('/api/process-definitions/active').catch(() => null);
  if (active) setDraft(active);
}

async function createDraft() {
  const created = await $fetch('/api/process-definitions', {
    method: 'POST',
    body: { name: 'Organization process', data: serializeProcess() }
  });
  setDraft(created);
}

async function saveDraft() {
  syncNodeData();
  if (!draft.value?._id || isActiveProcess.value) return createDraft();
  const updated = await $fetch(`/api/process-definitions/${draft.value._id}`, {
    method: 'PATCH',
    body: { data: serializeProcess() }
  });
  setDraft(updated);
}

async function validateDraft() {
  await saveDraft();
  validation.value = await $fetch(`/api/process-definitions/${draft.value._id}/validate`, { method: 'POST' });
}

async function activateDraft() {
  await saveDraft();
  const activated = await $fetch(`/api/process-definitions/${draft.value._id}/activate`, { method: 'POST' });
  setDraft(activated);
}

function setDraft(value) {
  draft.value = value;
  nodes.value = (value?.data?.graph?.nodes || []).map(enrichNodeData);
  edges.value = value?.data?.graph?.edges || [];
}

function addNode(type) {
  const id = `${type}_${Date.now()}`;
  const refId = id;
  const node = {
    id,
    type,
    position: { x: 80 + nodes.value.length * 32, y: 80 + nodes.value.length * 24 },
    data: { refId, label: refId }
  };
  ensureRecord(recordKeyForType(type), { data: { refId }, type }, factoryForType(type));
  nodes.value.push(enrichNodeData(node));
  selectedNodeId.value = id;
}

function selectNode(node) {
  selectedNodeId.value = node.id;
}

function serializeProcess() {
  syncNodeData();
  return {
    schemaVersion: 1,
    graph: { nodes: nodes.value, edges: edges.value, viewport: { x: 0, y: 0, zoom: 1 } },
    roles: draft.value?.data?.roles || {},
    entityProfiles: draft.value?.data?.entityProfiles || {},
    services: draft.value?.data?.services || {},
    sockets: draft.value?.data?.sockets || {},
    assignments: draft.value?.data?.assignments || {}
  };
}

function syncNodeData() {
  for (const node of nodes.value) {
    if (!node.data?.refId) continue;
    const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
    node.data.label = record.label || record.userId || record.entityType || record.commandId || node.data.label;
    node.data.entityType = record.entityType;
    node.data.commandId = record.commandId;
    node.data.direction = record.direction;
    node.data.lifecycleMode = record.lifecycle?.mode;
    node.data.grantCount = record.grants?.length || 0;
    node.data.roleCount = record.allowedRoles ? countRoleBindings(record.allowedRoles) : (record.roleIds?.length || 0);
    node.data.fieldCount = record.fields ? countFieldBindings(record.fields) : (record.projection?.fields?.length || 0);
    node.data.inputCount = record.inputs?.length || 0;
    node.data.outputCount = record.outputs?.length || 0;
  }
}

function ensureRecord(key, node, factory) {
  if (!draft.value) draft.value = { data: {} };
  draft.value.data[key] ||= {};
  const refId = node?.data?.refId || node?.id || `${key}_${Date.now()}`;
  draft.value.data[key][refId] ||= factory(refId);
  return draft.value.data[key][refId];
}

function recordKeyForType(type) {
  return ({ role: 'roles', entity: 'entityProfiles', service: 'services', socket: 'sockets', user: 'assignments' })[type] || 'roles';
}

function factoryForType(type) {
  return ({ role: createRole, entity: createEntityProfile, service: createService, socket: createSocket, user: createAssignment })[type] || createRole;
}

function createRole(id) {
  return { id, label: id, kind: 'userRole', capabilities: [], grants: [], navigation: [] };
}

function createEntityProfile(id) {
  const workflow = {
    schemaVersion: 2,
    primaryRegion: 'main',
    regions: {
      main: {
        label: 'Lifecycle',
        initial: 'CREATED',
        states: { CREATED: { canUpdateMeta: true } },
        transitions: []
      }
    }
  };
  return {
    id,
    entityType: 'project',
    label: id,
    lifecycle: { mode: 'defaultCreated', workflow },
    fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
    stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
    allowedRoles: { read: [], write: [], admin: [] }
  };
}

function createService(id) {
  return { id, label: id, serviceType: '', commandId: '', inputs: [], outputs: [], access: { runRoles: [], viewRoles: [] } };
}

function createSocket(id) {
  return {
    id,
    label: id,
    direction: 'outbound',
    entityType: 'project',
    projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
    receiverLifecycle: { mode: 'defaultCreated', workflow: null },
    access: { sendRoles: [], receiveRoles: [] }
  };
}

function createAssignment(id) {
  return { userId: id, label: id, roleIds: [], bindings: {}, status: 'active' };
}

function applyRoleGrantsJson() {
  selectedRole.value.grants = parseJson(selectedRoleGrantsJson.value, []);
}

function applyAssignmentBindingsJson() {
  selectedAssignment.value.bindings = parseJson(selectedAssignmentBindingsJson.value, {});
}

function parseJson(source, fallback) {
  try {
    return JSON.parse(source);
  } catch {
    return fallback;
  }
}

function enrichNodeData(node) {
  const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
  return {
    ...node,
    data: {
      ...(node.data || {}),
      label: record.label || record.userId || record.entityType || record.commandId || node.data?.label,
      entityType: record.entityType,
      commandId: record.commandId,
      direction: record.direction,
      lifecycleMode: record.lifecycle?.mode,
      grantCount: record.grants?.length || 0,
      roleCount: record.allowedRoles ? countRoleBindings(record.allowedRoles) : (record.roleIds?.length || 0),
      fieldCount: record.fields ? countFieldBindings(record.fields) : (record.projection?.fields?.length || 0),
      inputCount: record.inputs?.length || 0,
      outputCount: record.outputs?.length || 0
    }
  };
}

function countRoleBindings(access = {}) {
  return ['read', 'write', 'admin', 'runRoles', 'viewRoles', 'sendRoles', 'receiveRoles']
    .reduce((total, key) => total + (access[key]?.length || 0), 0);
}

function countFieldBindings(fields = {}) {
  return (fields.read?.length || 0) + (fields.write?.length || 0) + (fields.private?.length || 0);
}

function fieldOptions(entityType) {
  const policy = fieldPolicyForEntity(entityType);
  const paths = [...(policy.read || []), ...(policy.write || []), ...(policy.admin || [])];
  return [...new Set(paths)].map(path => ({ label: path, value: path }));
}

function fieldPolicyForEntity(entityType) {
  if (!entityType) return {};
  const camel = entityType.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
  return cncEntityFieldAccess[entityType] || cncEntityFieldAccess[camel] || {};
}

function syncEntityDefaults() {
  selectedEntity.value.label = selectedEntity.value.entityType;
  selectedEntity.value.fields ||= { read: [], write: [], private: [] };
  if (!selectedEntity.value.fields.read?.length) {
    selectedEntity.value.fields.read = ['identity.*', 'status.*', 'lineage.*']
      .filter(path => fieldOptionsForSelectedEntity.value.some(item => item.value === path));
  }
}

function syncServiceFromCommand() {
  const command = cncDomain.commands?.[selectedService.value.commandId];
  if (!command) return;
  selectedService.value.label = command.label || command.id;
  selectedService.value.serviceType = command.service;
  selectedService.value.inputs = (command.input?.entities || []).map(input => ({
    id: input.name || input.type,
    entityType: input.type,
    required: Boolean(input.required),
    multiple: Boolean(input.multiple)
  }));
  selectedService.value.outputs = (command.output?.entities || []).map(entityType => ({
    id: entityType,
    entityType,
    multiple: true
  }));
}

function applyRoleNavigationRoutes() {
  selectedRole.value.navigation = selectedRoleNavigationRoutes.value.map(route => {
    const option = navigationRouteOptions.value.find(item => item.value === route);
    return {
      id: `${option?.feature || 'route'}.${route.replace(/^\//, '').replaceAll('/', '.')}`,
      route,
      requires: { feature: option?.feature || 'organizations', level: route.includes('/process') ? 'admin' : 'read' }
    };
  });
}

function onConnect(connection) {
  edges.value.push({
    ...connection,
    id: `${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`,
    type: 'smoothstep',
    data: { kind: connection.sourceHandle || connection.targetHandle || 'link' }
  });
}
</script>
