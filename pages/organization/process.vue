<template>
  <StandardPage>
    <template #header>
        <div class="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <h1 class="m-0 truncate">{{ $t('processDesigner.title') }}</h1>
          <small class="text-muted-color">{{ activeName }}</small>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button icon="pi pi-plus" :label="$t('processDesigner.newDraft')" size="small" @click="createDraft" />
          <Button icon="pi pi-check-circle" :label="$t('processDesigner.validate')" size="small" severity="secondary" outlined :disabled="!draft?._id" @click="validateDraft" />
          <Button icon="pi pi-bolt" :label="$t('processDesigner.activate')" size="small" :disabled="!draft?._id" @click="activateDraft" />
        </div>
        <Button icon="pi pi-users" :label="$t('organization.teamManagement')" size="small" severity="secondary" outlined @click="navigateTo('/organization/users')" />
      </div>
    </template>

    <div class="grid min-h-[calc(100vh-12rem)] grid-cols-1 gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_24rem]">
      <Panel :header="$t('processDesigner.palette')">
        <div class="flex flex-col gap-2">
          <Button v-for="item in palette" :key="item.type" :icon="item.icon" :label="$t(item.label)" size="small" outlined @click="addNode(item.type)" />
        </div>
      </Panel>

      <Panel :header="$t('processDesigner.canvas')">
        <div class="h-[42rem] min-h-0 overflow-hidden rounded-ui border border-content-border">
          <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            fit-view-on-init
            @node-click="event => selectNode(event.node)"
            @pane-click="selectedNodeId = null"
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
        <div v-if="selectedNode" class="flex min-w-0 flex-col gap-3">
          <div class="flex flex-col gap-1">
            <label>{{ $t('processDesigner.label') }}</label>
            <InputText v-model="selectedNode.data.label" />
          </div>

          <template v-if="selectedNode.type === 'role'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.roleKind') }}</label>
              <Select v-model="selectedRole.kind" :options="roleKinds" option-label="label" option-value="value" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.grantsJson') }}</label>
              <Textarea v-model="selectedRoleGrantsJson" rows="8" class="font-mono text-xs" @blur="applyRoleGrantsJson" />
            </div>
          </template>

          <template v-else-if="selectedNode.type === 'entity'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.entityType') }}</label>
              <InputText v-model="selectedEntity.entityType" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.lifecycleMode') }}</label>
              <Select v-model="selectedEntity.lifecycle.mode" :options="lifecycleModes" option-label="label" option-value="value" />
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
              <InputText v-model="selectedService.commandId" />
            </div>
          </template>

          <template v-else-if="selectedNode.type === 'socket'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.direction') }}</label>
              <Select v-model="selectedSocket.direction" :options="socketDirections" option-label="label" option-value="value" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.projectionJson') }}</label>
              <Textarea v-model="selectedSocketProjectionJson" rows="8" class="font-mono text-xs" @blur="applySocketProjectionJson" />
            </div>
          </template>

          <template v-else-if="selectedNode.type === 'user'">
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.userId') }}</label>
              <InputText v-model="selectedAssignment.userId" />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('processDesigner.roleIds') }}</label>
              <Textarea v-model="selectedAssignmentRolesText" rows="3" @blur="applyAssignmentRoles" />
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
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Textarea from 'primevue/textarea';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import WorkflowDesignerV2 from '~/components/WorkflowDesignerV2.vue';
import ProcessRoleNode from '~/components/process-designer/ProcessRoleNode.vue';
import ProcessEntityNode from '~/components/process-designer/ProcessEntityNode.vue';
import ProcessServiceNode from '~/components/process-designer/ProcessServiceNode.vue';
import ProcessSocketNode from '~/components/process-designer/ProcessSocketNode.vue';
import ProcessUserNode from '~/components/process-designer/ProcessUserNode.vue';

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

const activeName = computed(() => draft.value?.identity?.name || '');
const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedRole = computed(() => ensureRecord('roles', selectedNode.value, createRole));
const selectedEntity = computed(() => ensureRecord('entityProfiles', selectedNode.value, createEntityProfile));
const selectedService = computed(() => ensureRecord('services', selectedNode.value, createService));
const selectedSocket = computed(() => ensureRecord('sockets', selectedNode.value, createSocket));
const selectedAssignment = computed(() => ensureRecord('assignments', selectedNode.value, createAssignment));
const selectedEntityFeature = computed(() => selectedEntity.value.entityType?.replace(/_/g, 's') || 'projects');

const selectedRoleGrantsJson = ref('[]');
const selectedSocketProjectionJson = ref('{}');
const selectedAssignmentRolesText = ref('');

watch(selectedNode, () => {
  selectedRoleGrantsJson.value = JSON.stringify(selectedRole.value.grants || [], null, 2);
  selectedSocketProjectionJson.value = JSON.stringify(selectedSocket.value.projection || {}, null, 2);
  selectedAssignmentRolesText.value = (selectedAssignment.value.roleIds || []).join('\n');
});

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
  if (!draft.value?._id) return createDraft();
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
  nodes.value = value?.data?.graph?.nodes || [];
  edges.value = value?.data?.graph?.edges || [];
}

function addNode(type) {
  const id = `${type}_${Date.now()}`;
  const refId = id;
  nodes.value.push({
    id,
    type,
    position: { x: 80 + nodes.value.length * 32, y: 80 + nodes.value.length * 24 },
    data: { refId, label: refId }
  });
  ensureRecord(recordKeyForType(type), { data: { refId }, type }, factoryForType(type));
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
  return { userId: id, roleIds: [], bindings: {}, status: 'active' };
}

function applyRoleGrantsJson() {
  selectedRole.value.grants = parseJson(selectedRoleGrantsJson.value, []);
}

function applySocketProjectionJson() {
  selectedSocket.value.projection = parseJson(selectedSocketProjectionJson.value, {});
}

function applyAssignmentRoles() {
  selectedAssignment.value.roleIds = selectedAssignmentRolesText.value.split(/\s+/).map(value => value.trim()).filter(Boolean);
}

function parseJson(source, fallback) {
  try {
    return JSON.parse(source);
  } catch {
    return fallback;
  }
}
</script>
