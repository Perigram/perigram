<template>
  <StandardPage>
    <div class="relative h-[calc(100vh-8rem)] min-h-[36rem] overflow-hidden rounded-ui border border-content-border bg-subtle">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        class="absolute inset-0 h-full w-full"
        fit-view-on-init
        :default-edge-options="defaultEdgeOptions"
        @node-click="event => selectNode(event.node)"
        @pane-click="selectedNodeId = null"
        @connect="onConnect"
      >
        <template #node-entity="props"><ProcessEntityNode v-bind="props" /></template>
        <template #node-service="props"><ProcessServiceNode v-bind="props" /></template>
        <template #node-socket="props"><ProcessSocketNode v-bind="props" /></template>
      </VueFlow>

      <div
        v-if="!nodes.length"
        class="absolute left-[15rem] right-[30rem] top-24 z-10 flex justify-center"
      >
        <div class="flex items-center gap-2 rounded-ui border border-content-border bg-content px-3 py-2 shadow-card">
          <Button icon="pi pi-box" :label="$t('processDesigner.entity')" size="small" @click="addNode('entity')" />
          <Button icon="pi pi-cog" :label="$t('processDesigner.service')" size="small" severity="secondary" outlined @click="addNode('service')" />
          <Button icon="pi pi-share-alt" :label="$t('processDesigner.socket')" size="small" severity="secondary" outlined @click="addNode('socket')" />
        </div>
      </div>

      <Panel class="absolute left-3 top-3 z-10 w-[13rem]" :header="$t('processDesigner.palette')">
        <div class="grid grid-cols-1 gap-2">
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

      <div class="absolute left-[15rem] right-[30rem] top-3 z-10 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-ui border border-content-border bg-content px-3 py-2 shadow-card">
        <div class="min-w-0">
          <strong class="block truncate">{{ $t('processDesigner.title') }}</strong>
          <small class="text-muted-color">{{ activeName || $t('processDesigner.noActiveDraft') }}</small>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button icon="pi pi-users" :aria-label="$t('organization.teamManagement')" size="small" severity="secondary" outlined @click="navigateTo('/organization/users')" />
          <Button icon="pi pi-plus" :label="$t('processDesigner.newDraft')" size="small" @click="createDraft" />
          <Button icon="pi pi-check-circle" :label="$t('processDesigner.validate')" size="small" severity="secondary" outlined :disabled="!draft?._id" @click="validateDraft" />
          <Button icon="pi pi-bolt" :label="$t('processDesigner.activate')" size="small" :disabled="!draft?._id" @click="activateDraft" />
          <Button icon="pi pi-save" :label="$t('common.save')" size="small" severity="secondary" outlined @click="saveDraft" />
        </div>
      </div>

      <aside class="absolute bottom-3 right-3 top-3 z-10 flex w-[28rem] min-h-0 flex-col overflow-hidden rounded-ui border border-content-border bg-content shadow-card">
        <div class="shrink-0 border-b border-content-border px-4 py-3">
          <strong>{{ $t('processDesigner.properties') }}</strong>
        </div>
        <Tabs value="inspector" class="flex min-h-0 flex-1 flex-col">
          <TabList>
            <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
            <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
            <Tab value="assignments">{{ $t('processDesigner.assignments') }}</Tab>
          </TabList>
          <TabPanels class="min-h-0 flex-1 overflow-y-auto">
            <TabPanel value="inspector">
              <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
                <div class="flex flex-col gap-1">
                  <label>{{ $t('processDesigner.label') }}</label>
                  <InputText v-model="selectedRecord.label" />
                </div>

                <template v-if="selectedNode.type === 'entity'">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.entityType') }}</label>
                    <Select v-model="selectedEntity.entityType" :options="entityTypeOptions" option-label="label" option-value="value" @change="syncEntityDefaults" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.lifecycleMode') }}</label>
                    <Select v-model="selectedEntity.lifecycle.mode" :options="lifecycleModes" option-label="label" option-value="value" />
                  </div>

                  <Panel :header="$t('processDesigner.statusMachine')">
                    <div class="flex flex-col gap-3">
                      <div class="flex flex-wrap gap-2">
                        <Tag v-for="state in lifecycleStateIds" :key="state" :value="state" size="small" />
                      </div>
                      <div class="flex gap-2">
                        <InputText v-model="newStateId" class="min-w-0 flex-1" :placeholder="$t('processDesigner.stateId')" />
                        <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addState')" size="small" @click="addLifecycleState" />
                      </div>
                      <div class="flex flex-col gap-2">
                        <div v-for="(transition, index) in lifecycleTransitions" :key="`${transition.from}-${transition.to}-${index}`" class="rounded-ui border border-content-border p-2">
                          <div class="grid grid-cols-2 gap-2">
                            <Select :model-value="transition.from" :options="lifecycleStateOptions" option-label="label" option-value="value" @update:model-value="value => updateTransition(index, { from: value })" />
                            <Select :model-value="transition.to" :options="lifecycleStateOptions" option-label="label" option-value="value" @update:model-value="value => updateTransition(index, { to: value })" />
                          </div>
                          <div class="mt-2 flex items-center gap-2">
                            <MultiSelect :model-value="transition.access?.processRoleIds || []" :options="roleOptions" option-label="label" option-value="value" display="chip" class="min-w-0 flex-1" @update:model-value="value => updateTransitionRoles(index, value)" />
                            <Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeLifecycleTransition(index)" />
                          </div>
                        </div>
                      </div>
                      <Button icon="pi pi-arrow-right" :label="$t('processDesigner.addTransition')" size="small" severity="secondary" outlined @click="addLifecycleTransition" />
                    </div>
                  </Panel>

                  <div class="grid grid-cols-1 gap-3">
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
                  <div class="grid grid-cols-1 gap-3">
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
                </template>

                <template v-else-if="selectedNode.type === 'service'">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.commandId') }}</label>
                    <Select v-model="selectedService.commandId" :options="commandOptions" option-label="label" option-value="value" @change="syncServiceFromCommand" />
                  </div>
                  <div class="grid grid-cols-1 gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.runRoles') }}</label>
                      <MultiSelect v-model="selectedService.access.runRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.viewRoles') }}</label>
                      <MultiSelect v-model="selectedService.access.viewRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-3">
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
                  <div class="grid grid-cols-1 gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.projectedFields') }}</label>
                      <MultiSelect v-model="selectedSocket.projection.fields" :options="fieldOptionsForSelectedSocket" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.excludedFields') }}</label>
                      <MultiSelect v-model="selectedSocket.projection.excludeFields" :options="fieldOptionsForSelectedSocket" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-3">
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

                <Button icon="pi pi-save" :label="$t('common.save')" size="small" @click="saveDraft" />
              </div>
              <StateBlock v-else :message="$t('processDesigner.selectNode')" />
            </TabPanel>

            <TabPanel value="roles">
              <div class="flex flex-col gap-4">
                <div class="flex justify-end">
                  <Button icon="pi pi-plus" :label="$t('processDesigner.addRole')" size="small" @click="addRole" />
                </div>
                <div class="flex flex-wrap gap-2">
                  <Tag
                    v-for="role in roleList"
                    :key="role.id"
                    :value="role.label || role.id"
                    :severity="selectedRoleId === role.id ? 'success' : 'secondary'"
                    class="cursor-pointer"
                    @click="selectedRoleId = role.id"
                  />
                </div>
                <div v-if="selectedRoleRecord" class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.label') }}</label>
                    <InputText v-model="selectedRoleRecord.label" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.roleKind') }}</label>
                    <Select v-model="selectedRoleRecord.kind" :options="roleKinds" option-label="label" option-value="value" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.navigationRoutes') }}</label>
                    <MultiSelect v-model="selectedRoleNavigationRoutes" :options="navigationRouteOptions" option-label="label" option-value="value" display="chip" class="w-full" @change="applySelectedRoleNavigationRoutes" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.explicitGrants') }}</label>
                    <Textarea v-model="selectedRoleGrantsJson" rows="5" class="font-mono text-xs" @blur="applySelectedRoleGrantsJson" />
                  </div>
                  <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" outlined size="small" @click="removeSelectedRole" />
                </div>
              </div>
            </TabPanel>

            <TabPanel value="assignments">
              <div class="flex flex-col gap-4">
                <div class="flex justify-end">
                  <Button icon="pi pi-plus" :label="$t('processDesigner.addAssignment')" size="small" @click="addAssignment" />
                </div>
                <div v-for="assignment in assignmentList" :key="assignment.userId" class="rounded-ui border border-content-border p-3">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.userId') }}</label>
                      <InputText v-model="assignment.userId" @blur="normalizeAssignmentKey(assignment)" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.roleIds') }}</label>
                      <MultiSelect v-model="assignment.roleIds" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                    <Button icon="pi pi-trash" :aria-label="$t('common.delete')" severity="danger" text size="small" @click="removeAssignment(assignment.userId)" />
                  </div>
                </div>
              </div>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </aside>

      <Panel v-if="validation" class="absolute bottom-3 left-3 z-10 max-w-xl" :header="$t('processDesigner.validation')">
        <div class="flex flex-col gap-2">
          <Message :severity="validation.ok ? 'success' : 'error'">
            {{ validation.ok ? $t('processDesigner.validationOk') : validation.errors.join('; ') }}
          </Message>
          <Message v-for="warning in validation.warnings || []" :key="warning" severity="warn">{{ warning }}</Message>
        </div>
      </Panel>
    </div>
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
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { cncDomain, cncEntityFieldAccess, cncWorkflows } from '@cutkit/domain-cnc';
import ProcessEntityNode from '~/components/process-designer/ProcessEntityNode.vue';
import ProcessServiceNode from '~/components/process-designer/ProcessServiceNode.vue';
import ProcessSocketNode from '~/components/process-designer/ProcessSocketNode.vue';

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
const selectedRoleId = ref(null);
const selectedRoleNavigationRoutes = ref([]);
const selectedRoleGrantsJson = ref('[]');
const newStateId = ref('');

const palette = [
  { type: 'entity', icon: 'pi pi-box', label: 'processDesigner.entity' },
  { type: 'service', icon: 'pi pi-cog', label: 'processDesigner.service' },
  { type: 'socket', icon: 'pi pi-share-alt', label: 'processDesigner.socket' }
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
const defaultEdgeOptions = { type: 'smoothstep' };

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedRecord = computed(() => {
  if (!selectedNode.value) return {};
  return ensureRecord(recordKeyForType(selectedNode.value.type), selectedNode.value, factoryForType(selectedNode.value.type));
});
const selectedEntity = computed(() => selectedNode.value?.type === 'entity' ? ensureRecord('entityProfiles', selectedNode.value, createEntityProfile) : {});
const selectedService = computed(() => selectedNode.value?.type === 'service' ? ensureRecord('services', selectedNode.value, createService) : {});
const selectedSocket = computed(() => selectedNode.value?.type === 'socket' ? ensureRecord('sockets', selectedNode.value, createSocket) : {});
const selectedEntityFeature = computed(() => selectedEntity.value.entityType?.replace(/_/g, 's') || 'projects');

const roles = computed(() => draft.value?.data?.roles || {});
const assignments = computed(() => draft.value?.data?.assignments || {});
const roleList = computed(() => Object.values(roles.value));
const assignmentList = computed(() => Object.values(assignments.value));
const selectedRoleRecord = computed(() => selectedRoleId.value ? roles.value[selectedRoleId.value] : null);
const roleOptions = computed(() => roleList.value.map(role => ({ label: role.label || role.id, value: role.id })));
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
const fieldOptionsForSelectedEntity = computed(() => fieldOptions(selectedEntity.value.entityType));
const fieldOptionsForSelectedSocket = computed(() => fieldOptions(selectedSocket.value.entityType));
const lifecycleWorkflow = computed(() => workflowForEntity(selectedEntity.value));
const lifecycleRegion = computed(() => lifecycleWorkflow.value.regions?.main || lifecycleWorkflow.value.regions?.[lifecycleWorkflow.value.primaryRegion] || null);
const lifecycleStateIds = computed(() => Object.keys(lifecycleRegion.value?.states || {}).filter(key => !key.includes('.')));
const lifecycleStateOptions = computed(() => lifecycleStateIds.value.map(value => ({ label: value, value })));
const lifecycleTransitions = computed(() => lifecycleRegion.value?.transitions || []);

watch(selectedRoleRecord, () => syncSelectedRoleEditors(), { immediate: true });
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
  const processNodes = (value?.data?.graph?.nodes || [])
    .filter(node => !['role', 'user'].includes(node.type))
    .map(enrichNodeData);
  nodes.value = processNodes.length ? processNodes : createNodesFromProcessRecords(value?.data || {});
  edges.value = (value?.data?.graph?.edges || []).filter(edge =>
    nodes.value.some(node => node.id === edge.source) && nodes.value.some(node => node.id === edge.target)
  );
  selectedRoleId.value = Object.keys(value?.data?.roles || {})[0] || null;
}

function createNodesFromProcessRecords(data = {}) {
  const entityNodes = Object.values(data.entityProfiles || {}).map((record, index) =>
    enrichNodeData(createRecordNode({ type: 'entity', record, x: 260, y: 140 + index * 140 }))
  );
  const serviceNodes = Object.values(data.services || {}).map((record, index) =>
    enrichNodeData(createRecordNode({ type: 'service', record, x: 600, y: 140 + index * 140 }))
  );
  const socketNodes = Object.values(data.sockets || {}).map((record, index) =>
    enrichNodeData(createRecordNode({ type: 'socket', record, x: 940, y: 140 + index * 140 }))
  );
  return [...entityNodes, ...serviceNodes, ...socketNodes];
}

function createRecordNode({ type, record, x, y }) {
  const refId = record.id || `${type}_${Date.now()}`;
  return {
    id: refId,
    type,
    position: { x, y },
    data: {
      refId,
      label: record.label || record.entityType || record.commandId || refId
    }
  };
}

function addNode(type) {
  const id = `${type}_${Date.now()}`;
  const refId = id;
  const node = {
    id,
    type,
    position: { x: 260 + nodes.value.length * 32, y: 140 + nodes.value.length * 24 },
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
    node.data.label = record.label || record.entityType || record.commandId || node.data.label;
    node.data.entityType = record.entityType;
    node.data.commandId = record.commandId;
    node.data.direction = record.direction;
    node.data.lifecycleMode = record.lifecycle?.mode;
    node.data.roleCount = record.allowedRoles ? countRoleBindings(record.allowedRoles) : 0;
    node.data.fieldCount = record.fields ? countFieldBindings(record.fields) : (record.projection?.fields?.length || 0);
    node.data.stateLabels = workflowStateLabels(record);
    node.data.transitionCount = workflowTransitionCount(record);
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
  return ({ entity: 'entityProfiles', service: 'services', socket: 'sockets' })[type] || 'entityProfiles';
}

function factoryForType(type) {
  return ({ entity: createEntityProfile, service: createService, socket: createSocket })[type] || createEntityProfile;
}

function createRole(id) {
  return { id, label: id, kind: 'userRole', capabilities: [], grants: [], navigation: [] };
}

function createEntityProfile(id) {
  const workflow = createCreatedWorkflow();
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

function addRole() {
  const id = `role_${Date.now()}`;
  draft.value ||= { data: {} };
  draft.value.data.roles ||= {};
  draft.value.data.roles[id] = createRole(id);
  selectedRoleId.value = id;
}

function removeSelectedRole() {
  if (!selectedRoleId.value || !draft.value?.data?.roles) return;
  const removedRoleId = selectedRoleId.value;
  delete draft.value.data.roles[selectedRoleId.value];
  for (const profile of Object.values(draft.value.data.entityProfiles || {})) {
    for (const key of ['read', 'write', 'admin']) profile.allowedRoles[key] = (profile.allowedRoles[key] || []).filter(roleId => roleId !== removedRoleId);
    for (const region of Object.values(workflowForEntity(profile).regions || {})) {
      for (const transition of region.transitions || []) {
        if (transition.access?.processRoleIds) {
          transition.access.processRoleIds = transition.access.processRoleIds.filter(roleId => roleId !== removedRoleId);
        }
      }
    }
  }
  for (const service of Object.values(draft.value.data.services || {})) {
    service.access ||= {};
    for (const key of ['runRoles', 'viewRoles']) service.access[key] = (service.access[key] || []).filter(roleId => roleId !== removedRoleId);
  }
  for (const socket of Object.values(draft.value.data.sockets || {})) {
    socket.access ||= {};
    for (const key of ['sendRoles', 'receiveRoles']) socket.access[key] = (socket.access[key] || []).filter(roleId => roleId !== removedRoleId);
  }
  for (const assignment of Object.values(draft.value.data.assignments || {})) {
    assignment.roleIds = (assignment.roleIds || []).filter(roleId => roleId !== removedRoleId);
  }
  selectedRoleId.value = Object.keys(draft.value.data.roles)[0] || null;
}

function syncSelectedRoleEditors() {
  selectedRoleNavigationRoutes.value = (selectedRoleRecord.value?.navigation || []).map(item => item.route).filter(Boolean);
  selectedRoleGrantsJson.value = JSON.stringify(selectedRoleRecord.value?.grants || [], null, 2);
}

function applySelectedRoleNavigationRoutes() {
  if (!selectedRoleRecord.value) return;
  selectedRoleRecord.value.navigation = selectedRoleNavigationRoutes.value.map(route => {
    const option = navigationRouteOptions.value.find(item => item.value === route);
    return {
      id: `${option?.feature || 'route'}.${route.replace(/^\//, '').replaceAll('/', '.')}`,
      route,
      requires: { feature: option?.feature || 'organizations', level: route.includes('/process') ? 'admin' : 'read' }
    };
  });
}

function applySelectedRoleGrantsJson() {
  if (!selectedRoleRecord.value) return;
  selectedRoleRecord.value.grants = parseJson(selectedRoleGrantsJson.value, []);
}

function addAssignment() {
  const userId = `user_${Date.now()}`;
  draft.value ||= { data: {} };
  draft.value.data.assignments ||= {};
  draft.value.data.assignments[userId] = { userId, roleIds: [], bindings: {}, status: 'active' };
}

function removeAssignment(userId) {
  if (draft.value?.data?.assignments) delete draft.value.data.assignments[userId];
}

function normalizeAssignmentKey(assignment) {
  const oldKey = Object.entries(assignments.value).find(([, value]) => value === assignment)?.[0];
  if (!oldKey || !assignment.userId || oldKey === assignment.userId) return;
  draft.value.data.assignments[assignment.userId] = assignment;
  delete draft.value.data.assignments[oldKey];
}

function addLifecycleState() {
  const id = newStateId.value.trim().toUpperCase().replace(/\s+/g, '_');
  if (!id) return;
  const region = ensureCustomLifecycleRegion();
  region.states[id] ||= { canUpdateMeta: true };
  if (!region.initial) region.initial = id;
  newStateId.value = '';
}

function addLifecycleTransition() {
  const region = ensureCustomLifecycleRegion();
  const states = Object.keys(region.states);
  if (states.length < 2) return;
  region.transitions.push({ from: states[0], to: states[1], access: { processRoleIds: [] } });
}

function updateTransition(index, updates) {
  const region = ensureCustomLifecycleRegion();
  region.transitions[index] = { ...region.transitions[index], ...updates };
}

function updateTransitionRoles(index, roleIds) {
  const region = ensureCustomLifecycleRegion();
  const transition = region.transitions[index] || {};
  region.transitions[index] = {
    ...transition,
    access: {
      ...(transition.access || {}),
      processRoleIds: roleIds
    }
  };
}

function removeLifecycleTransition(index) {
  const region = ensureCustomLifecycleRegion();
  region.transitions.splice(index, 1);
}

function workflowForEntity(profile = {}) {
  if (profile.lifecycle?.mode === 'domainDefault' && cncWorkflows[profile.entityType]) return normalizeWorkflow(cncWorkflows[profile.entityType]);
  if (profile.lifecycle?.workflow) return normalizeWorkflow(profile.lifecycle.workflow);
  return normalizeWorkflow(createCreatedWorkflow());
}

function ensureCustomLifecycleRegion() {
  selectedEntity.value.lifecycle ||= {};
  if (selectedEntity.value.lifecycle.mode !== 'custom') {
    selectedEntity.value.lifecycle = {
      mode: 'custom',
      workflow: workflowForEntity(selectedEntity.value)
    };
  }
  const workflow = normalizeWorkflow(selectedEntity.value.lifecycle.workflow || createCreatedWorkflow());
  selectedEntity.value.lifecycle.workflow = workflow;
  const regionId = workflow.primaryRegion || 'main';
  workflow.regions[regionId] ||= { id: regionId, label: 'Lifecycle', initial: 'CREATED', states: { CREATED: { canUpdateMeta: true } }, transitions: [] };
  return workflow.regions[regionId];
}

function createCreatedWorkflow() {
  return {
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
      label: record.label || record.entityType || record.commandId || node.data?.label,
      entityType: record.entityType,
      commandId: record.commandId,
      direction: record.direction,
      lifecycleMode: record.lifecycle?.mode,
      roleCount: record.allowedRoles ? countRoleBindings(record.allowedRoles) : 0,
      fieldCount: record.fields ? countFieldBindings(record.fields) : (record.projection?.fields?.length || 0),
      stateLabels: workflowStateLabels(record),
      transitionCount: workflowTransitionCount(record),
      inputCount: record.inputs?.length || 0,
      outputCount: record.outputs?.length || 0
    }
  };
}

function workflowStateLabels(record) {
  if (!record?.lifecycle) return [];
  const workflow = workflowForEntity(record);
  const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
  return Object.keys(region?.states || {}).filter(key => !key.includes('.')).slice(0, 5);
}

function workflowTransitionCount(record) {
  if (!record?.lifecycle) return 0;
  return Object.values(workflowForEntity(record).regions || {}).reduce((total, region) => total + (region.transitions?.length || 0), 0);
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

function onConnect(connection) {
  edges.value.push({
    ...connection,
    id: `${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`,
    type: 'smoothstep',
    data: { kind: connection.sourceHandle || connection.targetHandle || 'link' }
  });
}
</script>
