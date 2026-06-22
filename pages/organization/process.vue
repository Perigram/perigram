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
        <template #node-action="props"><ProcessActionNode v-bind="props" /></template>
        <template #node-service="props"><ProcessServiceNode v-bind="props" /></template>
        <template #node-socket="props"><ProcessSocketNode v-bind="props" /></template>
      </VueFlow>

      <div v-if="!nodes.length" class="absolute left-[15rem] right-[30rem] top-24 z-10 flex justify-center">
        <StateBlock :message="emptyCanvasMessage" />
      </div>

      <div class="absolute left-3 top-3 z-10 flex gap-1 rounded-ui border border-content-border bg-content p-1 shadow-card">
        <Button
          v-for="item in palette"
          :key="item.actionKind"
          :icon="item.icon"
          :aria-label="paletteLabel(item)"
          size="small"
          text
          @click="addNode(item)"
        />
      </div>

      <div class="absolute left-[14rem] right-[30rem] top-3 z-10 flex min-w-0 items-center justify-end gap-1 rounded-ui border border-content-border bg-content p-1 shadow-card">
          <Select
            v-if="processOptions.length"
            v-model="selectedProcessId"
            :options="processOptions"
            option-label="label"
            option-value="value"
            class="w-52"
            size="small"
            @change="selectProcessDefinition"
          />
          <Button icon="pi pi-users" :aria-label="$t('organization.teamManagement')" size="small" severity="secondary" outlined @click="navigateTo('/organization/users')" />
          <Button icon="pi pi-check" :aria-label="$t('processDesigner.apply')" size="small" :disabled="!draft?._id" @click="applyProcess" />
      </div>

      <aside class="absolute bottom-3 right-3 top-3 z-10 flex w-[28rem] min-h-0 flex-col overflow-hidden rounded-ui border border-content-border bg-content shadow-card">
        <Tabs value="inspector" class="flex min-h-0 flex-1 flex-col">
          <TabList>
            <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
            <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
            <Tab value="screens">{{ $t('organization.screens') }}</Tab>
          </TabList>
          <TabPanels class="min-h-0 flex-1 overflow-y-auto">
            <TabPanel value="inspector">
              <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
                <div v-if="selectedNode.type !== 'action'" class="flex flex-col gap-1">
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

                <template v-else-if="selectedNode.type === 'action'">
                  <div></div>
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
                  <Button icon="pi pi-users" :label="$t('organization.openTeam')" severity="secondary" outlined size="small" @click="navigateTo('/organization/users')" />
                </div>
              </div>
            </TabPanel>

            <TabPanel value="screens">
              <div class="flex flex-col gap-4">
                <div class="flex justify-end">
                  <Button icon="pi pi-plus" :label="$t('processDesigner.addScreen')" size="small" @click="addScreen" />
                </div>
                <div class="flex flex-wrap gap-2">
                  <Tag
                    v-for="screen in screenList"
                    :key="screen.id"
                    :value="screen.label || screen.id"
                    :severity="selectedScreenId === screen.id ? 'success' : 'secondary'"
                    class="cursor-pointer"
                    @click="selectedScreenId = screen.id"
                  />
                </div>
                <div v-if="selectedScreenRecord" class="flex flex-col gap-3">
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.screenId') }}</label>
                      <InputText :model-value="selectedScreenRecord.id" disabled />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.label') }}</label>
                      <InputText v-model="selectedScreenRecord.label" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.screenKind') }}</label>
                      <Select v-model="selectedScreenRecord.kind" :options="screenKindOptions" option-label="label" option-value="value" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.screenPlacement') }}</label>
                      <Select v-model="selectedScreenRecord.placement" :options="screenPlacementOptions" option-label="label" option-value="value" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.screenRoute') }}</label>
                    <InputText v-model="selectedScreenRecord.route" />
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.entityType') }}</label>
                      <Select v-model="selectedScreenRecord.entityType" :options="optionalEntityTypeOptions" option-label="label" option-value="value" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.roleIds') }}</label>
                      <MultiSelect v-model="selectedScreenRecord.roleIds" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.requiredFeature') }}</label>
                      <Select v-model="selectedScreenRecord.required.feature" :options="screenFeatureOptions" option-label="label" option-value="value" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.requiredLevel') }}</label>
                      <Select v-model="selectedScreenRecord.required.level" :options="accessLevelOptions" option-label="label" option-value="value" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.bindingsJson') }}</label>
                    <Textarea v-model="selectedScreenBindingsJson" rows="4" class="font-mono text-xs" @blur="applySelectedScreenBindingsJson" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.actionsJson') }}</label>
                    <Textarea v-model="selectedScreenActionsJson" rows="3" class="font-mono text-xs" @blur="applySelectedScreenActionsJson" />
                  </div>
                  <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" outlined size="small" @click="removeSelectedScreen" />
                </div>
                <StateBlock v-else :message="$t('processDesigner.selectScreen')" />
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
import { canvasToDefinition, definitionToCanvas } from '~/packages/processes/src/index.js';
import { normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { cncDomain, cncEntityFieldAccess, cncWorkflows } from '@cutkit/domain-cnc';
import ProcessActionNode from '~/components/process-designer/ProcessActionNode.vue';
import ProcessEntityNode from '~/components/process-designer/ProcessEntityNode.vue';
import ProcessServiceNode from '~/components/process-designer/ProcessServiceNode.vue';
import ProcessSocketNode from '~/components/process-designer/ProcessSocketNode.vue';

const { t } = useI18n();
definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const draft = ref(null);
const processDefinitions = ref([]);
const selectedProcessId = ref(null);
const loadingProcess = ref(false);
const processLoadError = ref('');
const nodes = ref([]);
const edges = ref([]);
const selectedNodeId = ref(null);
const validation = ref(null);
const selectedRoleId = ref(null);
const selectedRoleNavigationRoutes = ref([]);
const selectedRoleGrantsJson = ref('[]');
const selectedScreenId = ref(null);
const selectedScreenBindingsJson = ref('{}');
const selectedScreenActionsJson = ref('[]');
const newStateId = ref('');

const palette = [
  { type: 'action', actionKind: 'createEntity', icon: 'pi pi-plus-circle', label: 'create' },
  { type: 'action', actionKind: 'changeStatus', icon: 'pi pi-sync', label: 'status' },
  { type: 'action', actionKind: 'runCommand', icon: 'pi pi-play-circle', label: 'service' },
  { type: 'action', actionKind: 'sendToOrganization', icon: 'pi pi-send', label: 'send' }
];
const actionKindOptions = [
  { label: 'create', value: 'createEntity' },
  { label: 'status', value: 'changeStatus' },
  { label: 'service', value: 'runCommand' },
  { label: 'send', value: 'sendToOrganization' }
];
const triggerModeOptions = [
  { label: 'Manual', value: 'manual' },
  { label: 'Event', value: 'event' }
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
const screenKindOptions = [
  { label: 'workspace', value: 'workspace' },
  { label: 'entityDetail', value: 'entityDetail' },
  { label: 'route', value: 'route' }
];
const screenPlacementOptions = [
  { label: 'hub', value: 'hub' },
  { label: 'detail', value: 'detail' },
  { label: 'hidden', value: 'hidden' }
];
const accessLevelOptions = [
  { label: 'read', value: 'read' },
  { label: 'write', value: 'write' },
  { label: 'admin', value: 'admin' }
];
const defaultEdgeOptions = { type: 'smoothstep' };

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const processOptions = computed(() => processDefinitions.value.map(process => ({
  label: [
    process.identity?.name || process.identity?.uid || process._id,
    process.status?.state?.primary
  ].filter(Boolean).join(' · '),
  value: String(process._id)
})));
const emptyCanvasMessage = computed(() => {
  if (loadingProcess.value) return t('common.loading');
  if (processLoadError.value) return processLoadError.value;
  return t('processDesigner.noActiveDraft');
});
const selectedNode = computed(() => nodes.value.find(node => node.id === selectedNodeId.value) || null);
const selectedRecord = computed(() => {
  if (!selectedNode.value) return {};
  return ensureRecord(recordKeyForType(selectedNode.value.type), selectedNode.value, factoryForType(selectedNode.value.type));
});
const selectedEntity = computed(() => selectedNode.value?.type === 'entity' ? ensureRecord('entityProfiles', selectedNode.value, createEntityProfile) : {});
const selectedAction = computed(() => selectedNode.value?.type === 'action' ? ensureRecord('actions', selectedNode.value, createAction) : {});
const selectedService = computed(() => selectedNode.value?.type === 'service' ? ensureRecord('services', selectedNode.value, createService) : {});
const selectedSocket = computed(() => selectedNode.value?.type === 'socket' ? ensureRecord('sockets', selectedNode.value, createSocket) : {});
const selectedEntityFeature = computed(() => selectedEntity.value.entityType?.replace(/_/g, 's') || 'projects');

const roles = computed(() => draft.value?.data?.roles || {});
const screens = computed(() => draft.value?.data?.screens || {});
const roleList = computed(() => Object.values(roles.value));
const screenList = computed(() => Object.values(screens.value));
const selectedRoleRecord = computed(() => selectedRoleId.value ? roles.value[selectedRoleId.value] : null);
const selectedScreenRecord = computed(() => selectedScreenId.value ? screens.value[selectedScreenId.value] : null);
const roleOptions = computed(() => roleList.value.map(role => ({ label: role.label || role.id, value: role.id })));
const manualTriggerRoleOptions = computed(() => roleList.value
  .filter(role => role.kind !== 'serviceRole')
  .map(role => ({ label: role.label || role.id, value: role.id })));
const entityTypeOptions = computed(() => (cncDomain.entities || []).map(entity => ({ label: entity.type, value: entity.type })));
const optionalEntityTypeOptions = computed(() => [{ label: 'None', value: '' }, ...entityTypeOptions.value]);
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
const screenFeatureOptions = computed(() => [...new Map(navigationRouteOptions.value.map(item => [item.feature, { label: item.label, value: item.feature }])).values()]);
const fieldOptionsForSelectedEntity = computed(() => fieldOptions(selectedEntity.value.entityType));
const fieldOptionsForSelectedAction = computed(() => fieldOptions(selectedAction.value.entityType));
const fieldOptionsForSelectedSocket = computed(() => fieldOptions(selectedSocket.value.entityType));
const lifecycleWorkflow = computed(() => workflowForEntity(selectedEntity.value));
const lifecycleRegion = computed(() => lifecycleWorkflow.value.regions?.main || lifecycleWorkflow.value.regions?.[lifecycleWorkflow.value.primaryRegion] || null);
const lifecycleStateIds = computed(() => Object.keys(lifecycleRegion.value?.states || {}).filter(key => !key.includes('.')));
const lifecycleStateOptions = computed(() => lifecycleStateIds.value.map(value => ({ label: value, value })));
const lifecycleTransitions = computed(() => lifecycleRegion.value?.transitions || []);

watch(selectedRoleRecord, () => syncSelectedRoleEditors(), { immediate: true });
watch(selectedScreenRecord, () => syncSelectedScreenEditors(), { immediate: true });

onMounted(() => {
  loadActiveOrCreateLocal();
  window.addEventListener('keydown', handleCanvasKeydown);
});
onBeforeUnmount(() => window.removeEventListener('keydown', handleCanvasKeydown));

async function loadActiveOrCreateLocal() {
  loadingProcess.value = true;
  processLoadError.value = '';
  try {
    const [active, all] = await Promise.all([
      $fetch('/api/process-definitions/active').catch(() => null),
      $fetch('/api/process-definitions').catch(() => [])
    ]);
    processDefinitions.value = normalizeProcessList(active, all);
    const initial = pickInitialProcess(active, processDefinitions.value);
    if (initial) {
      setDraft(initial);
      return;
    }
    processLoadError.value = t('processDesigner.noActiveDraft');
  } finally {
    loadingProcess.value = false;
  }
}

function normalizeProcessList(active, all = []) {
  const byId = new Map();
  for (const process of [active, ...(Array.isArray(all) ? all : [])].filter(Boolean)) {
    byId.set(String(process._id), process);
  }
  return [...byId.values()].sort(compareProcessDefinitions);
}

function pickInitialProcess(active, processes = []) {
  if (active && canProjectProcess(active)) return active;
  return processes.find(process => process.status?.state?.primary === 'ACTIVE' && canProjectProcess(process))
    || processes.find(process => process.status?.state?.primary === 'DRAFT' && canProjectProcess(process))
    || processes.find(canProjectProcess)
    || active
    || processes[0]
    || null;
}

function canProjectProcess(process) {
  try {
    definitionToCanvas(process?.data || {});
    return true;
  } catch {
    return false;
  }
}

function compareProcessDefinitions(left, right) {
  const statusRank = { ACTIVE: 0, DRAFT: 1, ARCHIVED: 2 };
  const leftRank = statusRank[left?.status?.state?.primary] ?? 3;
  const rightRank = statusRank[right?.status?.state?.primary] ?? 3;
  if (leftRank !== rightRank) return leftRank - rightRank;
  return new Date(right?.status?.timestamp || 0) - new Date(left?.status?.timestamp || 0);
}

function selectProcessDefinition() {
  const selected = processDefinitions.value.find(process => String(process._id) === selectedProcessId.value);
  if (selected) setDraft(selected);
}

function upsertProcessDefinition(process) {
  if (!process?._id) return;
  const next = processDefinitions.value.filter(item => String(item._id) !== String(process._id));
  next.push(process);
  processDefinitions.value = next.sort(compareProcessDefinitions);
}

async function createDraft() {
  const sourceId = draft.value?._id || null;
  const name = isActiveProcess.value && activeName.value ? `${activeName.value} draft` : 'Organization process';
  const created = await $fetch('/api/process-definitions', {
    method: 'POST',
    body: {
      name,
      data: {
        ...serializeProcess(),
        sourceProcessDefinitionId: isActiveProcess.value ? sourceId : null
      }
    }
  });
  upsertProcessDefinition(created);
  setDraft(created);
}

async function saveDraft() {
  syncNodeData();
  if (!draft.value?._id || isActiveProcess.value) return createDraft();
  const updated = await $fetch(`/api/process-definitions/${draft.value._id}`, {
    method: 'PATCH',
    body: { data: serializeProcess() }
  });
  upsertProcessDefinition(updated);
  setDraft(updated);
}

async function validateDraft() {
  await saveDraft();
  validation.value = await $fetch(`/api/process-definitions/${draft.value._id}/validate`, { method: 'POST' });
}

async function activateDraft() {
  await saveDraft();
  const activated = await $fetch(`/api/process-definitions/${draft.value._id}/activate`, { method: 'POST' });
  upsertProcessDefinition(activated);
  setDraft(activated);
}

async function applyProcess() {
  await activateDraft();
}

function setDraft(value) {
  draft.value = value;
  selectedProcessId.value = value?._id ? String(value._id) : null;
  let canvas;
  try {
    canvas = definitionToCanvas(value?.data || {});
    validation.value = null;
  } catch (error) {
    canvas = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    validation.value = { ok: false, errors: [error.message], warnings: [] };
  }
  nodes.value = canvas.nodes.map(enrichNodeData);
  edges.value = canvas.edges;
  selectedRoleId.value = Object.keys(value?.data?.roles || {})[0] || null;
  selectedScreenId.value = Object.keys(value?.data?.screens || {})[0] || null;
}

function addNode(item) {
  const type = typeof item === 'string' ? item : item.type;
  const actionKind = typeof item === 'object' ? item.actionKind : null;
  const id = `${type}_${Date.now()}`;
  const refId = id;
  const node = {
    id,
    type,
    position: { x: 260 + nodes.value.length * 32, y: 140 + nodes.value.length * 24 },
    data: { refId, label: refId }
  };
  const record = ensureRecord(recordKeyForType(type), { data: { refId }, type }, factoryForType(type));
  if (type === 'action' && actionKind) {
    Object.assign(record, createAction(refId, actionKind));
  }
  nodes.value.push(enrichNodeData(node));
  selectedNodeId.value = id;
}

function selectNode(node) {
  selectedNodeId.value = node.id;
}

function handleCanvasKeydown(event) {
  if (!['Delete', 'Backspace'].includes(event.key) || !selectedNodeId.value) return;
  if (isTextEditingTarget(event.target)) return;
  event.preventDefault();
  deleteSelectedNode();
}

function isTextEditingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
}

function deleteSelectedNode() {
  const node = selectedNode.value;
  if (!node) return;
  const refId = node.data?.refId;
  nodes.value = nodes.value.filter(item => item.id !== node.id);
  edges.value = edges.value.filter(edge => edge.source !== node.id && edge.target !== node.id);
  if (refId && draft.value?.data) delete draft.value.data[recordKeyForType(node.type)]?.[refId];
  selectedNodeId.value = null;
}

function serializeProcess() {
  syncNodeData();
  return canvasToDefinition(
    { nodes: nodes.value.map(stripRuntimeNodeData), edges: edges.value, viewport: draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 } },
    draft.value?.data || {}
  );
}

function syncNodeData() {
  for (const node of nodes.value) {
    if (!node.data?.refId) continue;
    const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
    if (node.type === 'action') syncActionIo(record);
    node.data.label = record.label || actionKindLabel(record.actionKind) || record.entityType || record.commandId || node.data.label;
    node.data.actionKind = record.actionKind;
    node.data.entityType = record.entityType;
    node.data.commandId = record.commandId;
    node.data.triggerMode = record.trigger?.mode;
    node.data.triggerRoleLabels = roleLabels(record.trigger?.roleIds || []);
    node.data.actionKindLabel = node.type === 'action' ? actionKindLabel(record.actionKind) : null;
    node.data.eventLabel = node.type === 'action' ? (record.events?.[0]?.label || t('processDesigner.actionCompleted')) : null;
    node.data.actionRecord = node.type === 'action' ? record : null;
    node.data.entityTypeOptions = node.type === 'action' ? entityTypeOptions.value : [];
    node.data.commandOptions = node.type === 'action' ? commandOptions.value : [];
    node.data.roleOptions = node.type === 'action' ? manualTriggerRoleOptions.value : [];
    node.data.triggerModeOptions = node.type === 'action' ? localizedTriggerModeOptions() : [];
    node.data.fieldOptions = node.type === 'action' ? fieldOptions(record.entityType) : [];
    node.data.onActionUpdate = node.type === 'action' ? (updates, options = {}) => updateActionRecord(record.id || node.data.refId, updates, options) : null;
    node.data.statusFrom = record.status?.from;
    node.data.statusTo = record.status?.to;
    node.data.direction = record.direction;
    node.data.lifecycleMode = record.lifecycle?.mode;
    node.data.roleCount = record.allowedRoles ? countRoleBindings(record.allowedRoles) : (record.trigger?.roleIds?.length || 0);
    node.data.runRoleLabels = roleLabels(record.access?.runRoles || []);
    node.data.receiveRoleLabels = roleLabels(record.access?.receiveRoles || []);
    node.data.fieldCount = record.fields ? countFieldBindings(record.fields) : (record.projection?.fields?.length || 0);
    node.data.stateLabels = workflowStateLabels(record);
    node.data.transitionCount = workflowTransitionCount(record);
    node.data.inputCount = record.inputs?.length || 0;
    node.data.outputCount = record.outputs?.length || 0;
    node.data.inputLabels = (record.inputs || []).map(ioLabel);
    node.data.outputLabels = (record.outputs || []).map(ioLabel);
    node.data.inputSpecs = (record.inputs || []).map(ioSpec);
    node.data.outputSpecs = (record.outputs || []).map(ioSpec);
    node.data.fieldPolicy = record.fields || null;
    node.data.projection = record.projection || null;
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
  return ({ entity: 'entityProfiles', action: 'actions', service: 'services', socket: 'sockets' })[type] || 'entityProfiles';
}

function factoryForType(type) {
  return ({ entity: createEntityProfile, action: createAction, service: createService, socket: createSocket })[type] || createEntityProfile;
}

function createRole(id) {
  return { id, label: id, kind: 'userRole', capabilities: [], grants: [], navigation: [] };
}

function paletteLabel(item) {
  return item.label?.startsWith('processDesigner.') ? t(item.label) : item.label;
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

function createAction(id, actionKind = 'createEntity') {
  const action = {
    id,
    label: actionKindLabel(actionKind),
    actionKind,
    entityType: ['changeStatus', 'runCommand'].includes(actionKind) ? '' : 'project',
    commandId: '',
    parentEntityType: '',
    status: { from: '', to: actionKind === 'createEntity' ? 'CREATED' : '' },
    projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
    trigger: { mode: 'manual', roleIds: [] },
    inputs: [],
    outputs: [],
    events: []
  };
  syncActionIo(action);
  return action;
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
  for (const action of Object.values(draft.value.data.actions || {})) {
    action.trigger ||= { mode: 'user', roleIds: [] };
    action.trigger.roleIds = (action.trigger.roleIds || []).filter(roleId => roleId !== removedRoleId);
  }
  for (const assignment of Object.values(draft.value.data.assignments || {})) {
    assignment.roleIds = (assignment.roleIds || []).filter(roleId => roleId !== removedRoleId);
  }
  for (const [screenId, screen] of Object.entries(draft.value.data.screens || {})) {
    screen.roleIds = (screen.roleIds || []).filter(roleId => roleId !== removedRoleId);
    if (!screen.roleIds.length) delete draft.value.data.screens[screenId];
  }
  selectedRoleId.value = Object.keys(draft.value.data.roles)[0] || null;
}

function addScreen() {
  const id = `screen_${Date.now()}`;
  draft.value ||= { data: {} };
  draft.value.data.screens ||= {};
  draft.value.data.screens[id] = createScreen(id);
  selectedScreenId.value = id;
}

function createScreen(id) {
  return {
    id,
    label: id,
    kind: 'workspace',
    route: '/projects',
    placement: 'hub',
    entityType: 'project',
    roleIds: selectedRoleId.value ? [selectedRoleId.value] : [],
    required: { feature: 'projects', level: 'read' },
    bindings: {},
    actions: []
  };
}

function removeSelectedScreen() {
  if (!selectedScreenId.value || !draft.value?.data?.screens) return;
  delete draft.value.data.screens[selectedScreenId.value];
  selectedScreenId.value = Object.keys(draft.value.data.screens)[0] || null;
}

function syncSelectedRoleEditors() {
  const quickScreenIds = new Set(navigationRouteOptions.value.map(routeScreenId));
  const screenRoutes = Object.values(screens.value)
    .filter(screen => quickScreenIds.has(screen.id) && (screen.roleIds || []).includes(selectedRoleId.value))
    .map(screen => screen.route)
    .filter(Boolean);
  selectedRoleNavigationRoutes.value = screenRoutes.length
    ? screenRoutes
    : (selectedRoleRecord.value?.navigation || []).map(item => item.route).filter(Boolean);
  selectedRoleGrantsJson.value = JSON.stringify(selectedRoleRecord.value?.grants || [], null, 2);
}

function syncSelectedScreenEditors() {
  if (!selectedScreenRecord.value) {
    selectedScreenBindingsJson.value = '{}';
    selectedScreenActionsJson.value = '[]';
    return;
  }
  selectedScreenRecord.value.required ||= { feature: 'projects', level: 'read' };
  selectedScreenRecord.value.roleIds ||= [];
  selectedScreenRecord.value.bindings ||= {};
  selectedScreenRecord.value.actions ||= [];
  selectedScreenBindingsJson.value = JSON.stringify(selectedScreenRecord.value.bindings || {}, null, 2);
  selectedScreenActionsJson.value = JSON.stringify(selectedScreenRecord.value.actions || [], null, 2);
}

function applySelectedScreenBindingsJson() {
  if (!selectedScreenRecord.value) return;
  selectedScreenRecord.value.bindings = parseJson(selectedScreenBindingsJson.value, {});
}

function applySelectedScreenActionsJson() {
  if (!selectedScreenRecord.value) return;
  const parsed = parseJson(selectedScreenActionsJson.value, []);
  selectedScreenRecord.value.actions = Array.isArray(parsed) ? parsed : [];
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
  syncRoleScreens(selectedRoleRecord.value.id, selectedRoleNavigationRoutes.value);
}

function syncRoleScreens(roleId, routes = []) {
  if (!roleId) return;
  draft.value ||= { data: {} };
  draft.value.data.screens ||= {};
  const quickScreenIds = new Set(navigationRouteOptions.value.map(routeScreenId));
  for (const [screenId, screen] of Object.entries(draft.value.data.screens)) {
    if (!quickScreenIds.has(screenId)) continue;
    if (!(screen.roleIds || []).includes(roleId)) continue;
    screen.roleIds = screen.roleIds.filter(item => item !== roleId);
    if (!screen.roleIds.length) delete draft.value.data.screens[screenId];
  }
  for (const route of routes) {
    const option = navigationRouteOptions.value.find(item => item.value === route);
    const id = routeScreenId(option || { value: route, feature: 'route' });
    const level = route.includes('/process') ? 'admin' : 'read';
    draft.value.data.screens[id] = {
      id,
      label: option?.label || route,
      kind: route.includes('/project/') ? 'entityDetail' : 'workspace',
      route,
      placement: 'hub',
      entityType: featureEntityType(option?.feature),
      roleIds: [roleId],
      required: { feature: option?.feature || 'organizations', level },
      bindings: {},
      actions: []
    };
  }
}

function routeScreenId(option = {}) {
  const route = option.value || '';
  return `${option.feature || 'route'}.${route.replace(/^\//, '').replaceAll('/', '.')}`;
}

function featureEntityType(feature) {
  return ({
    projects: 'project',
    warehouses: 'warehouse',
    catalogs: 'catalog',
    requisitions: 'requisition',
    cassettes: 'cassette',
    users: 'user',
    organizations: 'organization'
  })[feature] || null;
}

function applySelectedRoleGrantsJson() {
  if (!selectedRoleRecord.value) return;
  selectedRoleRecord.value.grants = parseJson(selectedRoleGrantsJson.value, []);
}

function addLifecycleState() {
  const id = newStateId.value.trim().toUpperCase().replace(/\s+/g, '_');
  if (!id) return;
  const region = ensureCustomLifecycleRegion();
  region.states[id] ||= { canUpdateMeta: true };
  if (!region.initial) region.initial = id;
  newStateId.value = '';
}

function syncSelectedAction() {
  syncActionIo(selectedAction.value);
  syncNodeData();
}

function syncActionIo(action = {}) {
  action.trigger ||= { mode: 'manual', roleIds: [] };
  action.trigger.mode = normalizeTriggerMode(action.trigger.mode);
  if (action.trigger.mode === 'event') action.trigger.roleIds = [];
  action.status ||= {};
  action.events = actionEventOutputs(action);
  if (action.actionKind === 'createEntity') {
    action.status.to ||= 'CREATED';
    action.parentEntityType = '';
    action.inputs = [{ id: 'parent', label: t('processDesigner.parentEntity'), required: false }];
    action.outputs = [{ id: 'created', entityType: action.entityType, status: action.status.to }];
    return;
  }
  if (action.actionKind === 'changeStatus') {
    action.entityType = '';
    action.status.to ||= '';
    action.inputs = [{ id: 'entity', label: t('processDesigner.incomingEntity'), status: action.status.from || t('processDesigner.currentStatus') }];
    action.outputs = [{ id: 'entity', label: t('processDesigner.sameEntity'), status: action.status.to || t('processDesigner.targetStatus') }];
    return;
  }
  if (action.actionKind === 'sendToOrganization') {
    action.projection ||= { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } };
    action.inputs = [{ id: 'entity', entityType: action.entityType }];
    action.outputs = [{ id: 'projection', entityType: action.entityType, projection: true, fields: action.projection.fields || [] }];
    return;
  }
  if (action.actionKind === 'runCommand') {
    const command = cncDomain.commands?.[action.commandId];
    action.inputs = commandInputs(command);
    action.outputs = commandOutputs(command);
  }
}

function actionKindLabel(actionKind) {
  return actionKindOptions.find(option => option.value === actionKind)?.label || 'Action';
}

function localizedTriggerModeOptions() {
  return triggerModeOptions.map(option => ({
    ...option,
    label: ({
      manual: t('processDesigner.manualTrigger'),
      event: t('processDesigner.eventTrigger')
    })[option.value] || option.label
  }));
}

function normalizeTriggerMode(mode) {
  if (mode === 'event' || mode === 'system') return 'event';
  return 'manual';
}

function actionEventOutputs(action = {}) {
  return [{
    id: 'completed',
    label: action.label ? `${action.label} ${t('processDesigner.completedEvent')}` : t('processDesigner.actionCompleted'),
    kind: 'event'
  }];
}

function ioLabel(io) {
  return [io.label || io.entityType || io.kind || io.id, io.status].filter(Boolean).join(' @ ');
}

function ioSpec(io = {}) {
  const detail = [
    io.capability || '',
    io.accepts?.length ? io.accepts.join(', ') : '',
    io.required ? t('processDesigner.required') : '',
    io.multiple ? t('processDesigner.multiple') : '',
    io.projection ? t('processDesigner.projectedFields') : '',
    io.fields?.length ? io.fields.join(', ') : ''
  ].filter(Boolean).join(' · ');
  return {
    id: io.id || io.entityType || detail,
    label: ioLabel(io),
    detail
  };
}

function commandInputs(command = {}) {
  const abstractInputs = command?.input?.abstractEntities || [];
  const source = abstractInputs.length ? abstractInputs : (command?.input?.entities || []);
  return source.map(input => ({
    id: input.name || input.type || input.capability,
    label: input.label,
    entityType: input.type,
    capability: input.capability,
    accepts: input.accepts || [],
    required: Boolean(input.required),
    multiple: Boolean(input.multiple),
    abstract: Boolean(input.capability || input.accepts?.length)
  }));
}

function commandOutputs(command = {}) {
  return [
    ...(command?.output?.entities || []).map(entityType => ({
      id: entityType,
      entityType,
      multiple: true
    })),
    ...(command?.output?.attachments || []).map(kind => ({
      id: `attachment:${kind}`,
      label: kind,
      kind: 'attachment',
      multiple: true
    })),
    ...(command?.output?.tasks || []).map(task => ({
      id: `task:${task}`,
      label: task,
      kind: 'task'
    }))
  ];
}

function roleLabels(roleIds = []) {
  return roleIds.map(roleId => roles.value[roleId]?.label || roleId).filter(Boolean);
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
  if (node.type === 'action') syncActionIo(record);
  return {
    ...node,
    data: {
      ...(node.data || {}),
      label: record.label || record.entityType || record.commandId || node.data?.label,
      entityType: record.entityType,
      commandId: record.commandId,
      actionKindLabel: node.type === 'action' ? actionKindLabel(record.actionKind) : null,
      actionRecord: node.type === 'action' ? record : null,
      entityTypeOptions: node.type === 'action' ? entityTypeOptions.value : [],
      commandOptions: node.type === 'action' ? commandOptions.value : [],
      roleOptions: node.type === 'action' ? manualTriggerRoleOptions.value : [],
      triggerModeOptions: node.type === 'action' ? localizedTriggerModeOptions() : [],
      fieldOptions: node.type === 'action' ? fieldOptions(record.entityType) : [],
      onActionUpdate: node.type === 'action' ? (updates, options = {}) => updateActionRecord(record.id || node.data?.refId, updates, options) : null,
      triggerMode: record.trigger?.mode,
      triggerRoleLabels: roleLabels(record.trigger?.roleIds || []),
      eventLabel: node.type === 'action' ? (record.events?.[0]?.label || t('processDesigner.actionCompleted')) : null,
      direction: record.direction,
      lifecycleMode: record.lifecycle?.mode,
      roleCount: record.allowedRoles ? countRoleBindings(record.allowedRoles) : 0,
      runRoleLabels: roleLabels(record.access?.runRoles || []),
      receiveRoleLabels: roleLabels(record.access?.receiveRoles || []),
      fieldCount: record.fields ? countFieldBindings(record.fields) : (record.projection?.fields?.length || 0),
      stateLabels: workflowStateLabels(record),
      transitionCount: workflowTransitionCount(record),
      inputCount: record.inputs?.length || 0,
      outputCount: record.outputs?.length || 0,
      inputLabels: (record.inputs || []).map(ioLabel),
      outputLabels: (record.outputs || []).map(ioLabel),
      inputSpecs: (record.inputs || []).map(ioSpec),
      outputSpecs: (record.outputs || []).map(ioSpec),
      fieldPolicy: record.fields || null,
      projection: record.projection || null
    }
  };
}

function updateActionRecord(actionId, updates = {}, options = {}) {
  const action = draft.value?.data?.actions?.[actionId];
  if (!action) return;
  Object.assign(action, updates);
  if (options.syncIo) syncActionIo(action);
  syncNodeData();
}

function stripRuntimeNodeData(node) {
  const data = { ...(node.data || {}) };
  for (const key of [
    'actionRecord',
    'entityTypeOptions',
    'commandOptions',
    'roleOptions',
    'triggerModeOptions',
    'fieldOptions',
    'onActionUpdate'
  ]) {
    delete data[key];
  }
  return { ...node, data };
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
  selectedService.value.inputs = commandInputs(command);
  selectedService.value.outputs = commandOutputs(command);
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
