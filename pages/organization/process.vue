<template>
  <StandardPage>
    <div ref="canvasFrame" class="relative h-[calc(100vh-8rem)] min-h-[36rem] overflow-hidden rounded-ui border border-content-border bg-subtle">
      <VueFlow
        v-model:nodes="nodes"
        v-model:edges="edges"
        class="absolute inset-0 h-full w-full"
        fit-view-on-init
        :default-edge-options="defaultEdgeOptions"
        @node-click="event => selectNode(event.node)"
        @edge-click="event => selectEdge(event.edge)"
        @pane-click="clearGraphSelection"
        @connect="onConnect"
      >
        <template #node-entity="props"><ProcessEntityNode v-bind="props" /></template>
        <template #node-action="props"><ProcessActionNode v-bind="props" /></template>
        <template #node-service="props"><ProcessServiceNode v-bind="props" /></template>
        <template #node-socket="props"><ProcessSocketNode v-bind="props" /></template>
        <template #node-statusDefinition="props"><ProcessStatusDefinitionNode v-bind="props" /></template>
        <template #node-valueInput="props"><ProcessValueInputNode v-bind="props" /></template>
        <template #node-processNode="props"><ProcessNode v-bind="props" /></template>
      </VueFlow>

      <div v-if="!nodes.length" class="absolute left-[15rem] right-[30rem] top-24 z-10 flex justify-center">
        <StateBlock :message="emptyCanvasMessage" />
      </div>

      <div class="absolute left-3 top-3 z-10 flex max-h-[calc(100%-1.5rem)] w-56 flex-col gap-2 overflow-y-auto rounded-ui border border-content-border bg-content p-2 shadow-card">
        <div v-for="group in paletteGroups" :key="group.id" class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted-color">{{ $t(`processDesigner.paletteGroups.${group.id}`) }}</span>
          <div class="grid grid-cols-2 gap-1">
            <Button
              v-for="item in group.items"
              :key="`${item.type}-${item.actionKind || item.direction || item.kind}`"
              :icon="item.icon"
              :label="paletteLabel(item)"
              :aria-label="paletteLabel(item)"
              size="small"
              text
              class="min-w-0 justify-start"
              @click="addNode(item)"
            />
          </div>
        </div>
      </div>

      <div class="absolute left-1/2 top-3 z-10 flex min-w-0 max-w-[calc(100%-32rem)] -translate-x-1/2 items-center justify-center gap-1 rounded-ui border border-content-border bg-content p-1 shadow-card">
          <Select
            v-if="processOptions.length"
            v-model="selectedProcessId"
            :options="processOptions"
            option-label="label"
            option-value="value"
            entity-type="processDefinition"
            class="w-56 max-w-full"
            size="small"
            @change="selectProcessDefinition"
          />
          <Button icon="pi pi-users" :aria-label="$t('organization.teamManagement')" size="small" severity="secondary" outlined @click="navigateTo('/organization/users')" />
          <Button icon="pi pi-check" :aria-label="$t('processDesigner.apply')" size="small" :loading="applyingProcess" :disabled="!draft?._id" @click="applyProcess" />
      </div>

      <aside class="absolute bottom-3 right-3 top-3 z-10 flex w-[26rem] max-w-[calc(100%-19rem)] min-h-0 flex-col overflow-hidden rounded-ui border border-content-border bg-content shadow-card">
        <Tabs value="inspector" class="flex min-h-0 flex-1 flex-col">
          <TabList>
            <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
            <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
            <Tab value="screens">{{ $t('organization.screens') }}</Tab>
          </TabList>
          <TabPanels class="min-h-0 flex-1 overflow-y-auto">
            <TabPanel value="inspector">
              <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
                <div v-if="!['action', 'statusDefinition'].includes(selectedNode.type)" class="flex flex-col gap-1">
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
                        <Tag v-for="state in lifecycleStateEntries" :key="state.value" :value="state.label" size="small" />
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
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.relations') }}</label>
                      <MultiSelect v-model="selectedEntity.relations" :options="relationOptionsForEntity(selectedEntity.entityType)" option-label="label" option-value="value" display="chip" class="w-full" @change="syncNodeData" />
                    </div>
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'action'">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.label') }}</label>
                    <InputText v-model="selectedAction.label" @update:model-value="syncNodeData" />
                  </div>
                  <div v-if="['createEntity', 'sendToOrganization'].includes(selectedAction.actionKind)" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.entityType') }}</label>
                    <Select v-model="selectedAction.entityType" :options="entityTypeOptions" option-label="label" option-value="value" @change="syncSelectedAction" />
                  </div>
                  <div v-if="selectedAction.actionKind === 'runCommand'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.commandId') }}</label>
                    <Select v-model="selectedAction.commandId" :options="commandOptions" option-label="label" option-value="value" @change="syncSelectedAction" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.trigger') }}</label>
                    <Select v-model="selectedAction.trigger.mode" :options="localizedTriggerModeOptions()" option-label="label" option-value="value" @change="syncSelectedAction" />
                  </div>
                  <div v-if="selectedAction.actionKind === 'updateEntity'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.writeFields') }}</label>
                    <MultiSelect v-model="selectedAction.mutation.fields" :options="fieldOptionsForSelectedAction" option-label="label" option-value="value" display="chip" class="w-full" @change="syncSelectedAction" />
                  </div>
                  <div v-if="selectedAction.actionKind === 'sendToOrganization'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.projectedFields') }}</label>
                    <MultiSelect v-model="selectedAction.projection.fields" :options="fieldOptionsForSelectedAction" option-label="label" option-value="value" display="chip" class="w-full" @change="syncSelectedAction" />
                  </div>
                  <div v-if="selectedAction.actionKind === 'createEntity'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.constructionMode') }}</label>
                    <Select v-model="selectedAction.construction.mode" :options="constructionModeOptions(selectedAction.entityType)" option-label="label" option-value="value" @change="syncSelectedAction" />
                  </div>
                  <div v-if="selectedAction.actionKind === 'createEntity' && parentRevisionScopeOptions(selectedAction.parentEntityType).length" class="flex flex-col gap-2">
                    <div class="flex items-center gap-2">
                      <Checkbox
                        :model-value="selectedAction.parentRevision?.enabled === true"
                        binary
                        input-id="pin-parent-revision"
                        @update:model-value="updateParentRevisionEnabled"
                      />
                      <label for="pin-parent-revision">{{ $t('processDesigner.pinParentRevision') }}</label>
                    </div>
                    <div v-if="selectedAction.parentRevision?.enabled" class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.revisionScope') }}</label>
                      <Select
                        v-model="selectedAction.parentRevision.scope"
                        :options="parentRevisionScopeOptions(selectedAction.parentEntityType)"
                        option-label="label"
                        option-value="value"
                        @change="syncSelectedAction"
                      />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.roles') }}</label>
                      <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addRole')" text size="small" @click="addSelectedActionGrant" />
                    </div>
                    <div v-for="(grant, index) in selectedActionGrants" :key="`${grant.roleId}-${index}`" class="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-2">
                      <Select :model-value="grant.roleId" :options="roleOptions" option-label="label" option-value="value" size="small" @update:model-value="value => updateSelectedActionGrant(index, { roleId: value })" />
                      <Select :model-value="grant.level" :options="accessLevelOptions" option-label="label" option-value="value" size="small" @update:model-value="value => updateSelectedActionGrant(index, { level: value })" />
                      <Button icon="pi pi-trash" :aria-label="$t('common.delete')" text severity="danger" size="small" @click="removeSelectedActionGrant(index)" />
                    </div>
                    <Button v-if="selectedAction.actionKind === 'updateEntity' && inheritedActionAccessLabels(selectedAction, selectedNode).length" icon="pi pi-refresh" :label="$t('common.reset')" text size="small" class="self-start" @click="resetActionAccess(selectedAction.id)" />
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'service'">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.commandId') }}</label>
                    <Select v-model="selectedService.commandId" :options="commandOptions" option-label="label" option-value="value" @change="syncServiceFromCommand" />
                  </div>
                  <div class="grid grid-cols-1 gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.runPrincipals') }}</label>
                      <MultiSelect v-model="selectedService.access.runPrincipals" :options="servicePrincipalOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.viewPrincipals') }}</label>
                      <MultiSelect v-model="selectedService.access.viewPrincipals" :options="servicePrincipalOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                  </div>
                  <div class="grid grid-cols-1 gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.serviceBillingMode') }}</label>
                      <Select v-model="selectedService.billing.mode" :options="serviceBillingModeOptions" option-label="label" option-value="value" />
                    </div>
                    <div v-if="selectedService.billing.mode === 'prepaidTokens'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.serviceTokenCost') }}</label>
                        <InputNumber v-model="selectedService.billing.tokenCost" :min="0" :max-fraction-digits="2" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.serviceMeterKey') }}</label>
                        <InputText v-model="selectedService.billing.meterKey" class="w-full" />
                      </div>
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

                <template v-else-if="selectedNode.type === 'statusDefinition'">
                  <div class="flex flex-col gap-4">
                    <div class="grid grid-cols-2 gap-3">
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.stateId') }}</label>
                        <InputText v-model="selectedStatusDefinition.statusId" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('common.label') }}</label>
                        <InputText v-model="selectedStatusDefinition.label" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.severity') }}</label>
                        <Select v-model="selectedStatusDefinition.severity" :options="statusSeverityOptions" option-label="label" option-value="value" />
                      </div>
                      <div class="col-span-2 flex flex-col gap-1">
                        <label>{{ $t('processDesigner.icon') }}</label>
                        <Select v-model="selectedStatusDefinition.icon" :options="statusIconOptions" option-label="label" option-value="value">
                          <template #option="{ option }">
                            <div class="flex items-center gap-2">
                              <i :class="option.value"></i>
                              <span>{{ option.label }}</span>
                            </div>
                          </template>
                          <template #value="{ value }">
                            <div class="flex items-center gap-2">
                              <i :class="value || selectedStatusDefinition.icon"></i>
                              <span>{{ iconLabel(value || selectedStatusDefinition.icon) }}</span>
                            </div>
                          </template>
                        </Select>
                      </div>
                    </div>

                    <Panel :header="$t('processDesigner.evidence')">
                      <div class="flex flex-col gap-3">
                        <div class="flex items-center gap-2">
                          <Checkbox
                            :model-value="Boolean(selectedStatusDefinition.lifecycle?.description?.required)"
                            binary
                            input-id="status-description-required"
                            @update:model-value="updateStatusDescriptionRequired"
                          />
                          <label for="status-description-required">{{ $t('processDesigner.requireDescription') }}</label>
                        </div>

                        <div class="flex items-center justify-between gap-2">
                          <span class="font-medium">{{ $t('processDesigner.attachments') }}</span>
                          <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addAttachment')" size="small" text @click="addStatusAttachment" />
                        </div>
                        <div v-for="entry in selectedStatusAttachmentEntries" :key="entry.key" class="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
                          <InputText :model-value="entry.key" size="small" @update:model-value="value => renameStatusAttachment(entry.key, value)" />
                          <Select v-model="entry.schema.kind" :options="designer.attachmentKindOptions" option-label="label" option-value="value" editable size="small" :placeholder="$t('processDesigner.attachmentKind')" />
                          <div class="flex items-center gap-2">
                            <Checkbox v-model="entry.schema.required" binary />
                            <span>{{ $t('processDesigner.required') }}</span>
                          </div>
                          <Button icon="pi pi-trash" :aria-label="$t('common.delete')" size="small" text severity="danger" @click="removeStatusAttachment(entry.key)" />
                        </div>

                        <div class="flex items-center justify-between gap-2">
                          <span class="font-medium">{{ $t('processDesigner.snapshots') }}</span>
                          <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addSnapshot')" size="small" text @click="addStatusSnapshot" />
                        </div>
                        <div v-for="entry in selectedStatusSnapshotEntries" :key="entry.key" class="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                          <InputText :model-value="entry.key" size="small" @update:model-value="value => renameStatusSnapshot(entry.key, value)" />
                          <Select v-model="entry.schema.entityType" :options="entityTypeOptions" option-label="label" option-value="value" size="small" />
                          <InputText v-model="entry.schema.lineageKey" size="small" :placeholder="$t('processDesigner.lineageKey')" />
                          <Button icon="pi pi-trash" :aria-label="$t('common.delete')" size="small" text severity="danger" @click="removeStatusSnapshot(entry.key)" />
                        </div>
                      </div>
                    </Panel>
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'valueInput'">
                  <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.block') }}</label>
                      <Select v-model="selectedValueInput.block" :options="blockOptions" option-label="label" option-value="value" @change="syncSelectedValueInputPath" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('common.type') }}</label>
                      <Select v-model="selectedValueInput.valueType" :options="valueTypeOptions" option-label="label" option-value="value" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.path') }}</label>
                      <Select v-model="selectedValueInput.path" :options="selectedValueInputFieldOptions" option-label="label" option-value="value" editable @change="syncValueInput(selectedValueInput)" />
                    </div>
                    <div class="col-span-2 flex flex-col gap-1">
                      <label>{{ $t('common.default') }}</label>
                      <Textarea v-if="selectedValueInput.valueType === 'object'" v-model="selectedValueInput.value" rows="3" auto-resize />
                      <InputText v-else v-model="selectedValueInput.value" />
                    </div>
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'processNode'">
                  <div class="grid grid-cols-2 gap-3">
                    <div v-if="selectedProcessNode.kind === 'entityRef'" class="col-span-2 flex flex-col gap-1">
                      <label>{{ $t('processDesigner.traversal') }}</label>
                      <Select v-model="selectedProcessNode.mode" :options="processNodeOperationOptions('entityRef')" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="['stringOp', 'compare', 'logic', 'collection'].includes(selectedProcessNode.kind)" class="col-span-2 flex flex-col gap-1">
                      <label>{{ processNodeOperationLabel(selectedProcessNode.kind) }}</label>
                      <Select v-model="selectedProcessNode.operation" :options="processNodeOperationOptions(selectedProcessNode.kind)" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="processNodeNeedsSourceEntity(selectedProcessNode)" class="col-span-2 flex flex-col gap-1">
                      <label>{{ processNodeSourceEntityLabel(selectedProcessNode) }}</label>
                      <Select v-model="selectedProcessNode.entityType" :options="optionalEntityTypeOptions" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="selectedProcessNode.kind === 'entityRef' && selectedProcessNode.mode === 'related'" class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.relation') }}</label>
                      <Select v-model="selectedProcessNode.relationKey" :options="relationOptionsForEntity(selectedProcessNode.entityType)" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="processNodeNeedsResultEntity(selectedProcessNode) && selectedProcessNode.mode !== 'related'" class="flex flex-col gap-1">
                      <label>{{ processNodeResultEntityLabel(selectedProcessNode) }}</label>
                      <Select v-model="selectedProcessNode.relationEntityType" :options="optionalEntityTypeOptions" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="['blockRead', 'blockCompose'].includes(selectedProcessNode.kind)" class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.block') }}</label>
                      <Select v-model="selectedProcessNode.block" :options="processBlockOptions" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="['blockRead', 'blockCompose'].includes(selectedProcessNode.kind)" class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.path') }}</label>
                      <Select v-model="selectedProcessNode.path" :options="selectedProcessNodeFieldOptions" option-label="label" option-value="value" editable @change="syncSelectedProcessNode" />
                    </div>
                    <div v-if="selectedProcessNode.kind === 'blockRead'" class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.outputValue') }}</label>
                      <Select v-model="selectedProcessNode.valueType" :options="processValueTypeOptions" option-label="label" option-value="value" @change="syncSelectedProcessNode" />
                    </div>
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
                  <div class="flex flex-wrap gap-1">
                    <Tag v-for="item in selectedRoleAccessSummary" :key="item" :value="item" size="small" />
                  </div>
                  <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" outlined size="small" @click="removeSelectedRole" />
                  <Button icon="pi pi-users" :label="$t('organization.openTeam')" severity="secondary" outlined size="small" @click="navigateTo('/organization/users')" />
                </div>
              </div>
            </TabPanel>

            <TabPanel value="screens">
              <div class="flex flex-col gap-4">
                <Message v-if="compiledPreviewError" severity="error">{{ compiledPreviewError }}</Message>
                <ProcessScreenPreview
                  v-if="compiledScreenPreview.length"
                  :screens="compiledScreenPreview"
                  :roles="roles"
                  :actions="draft?.data?.actions || {}"
                />
                <StateBlock v-if="!compiledScreenPreview.length && !compiledPreviewError" :message="$t('processDesigner.noCompiledScreens')" />
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
                      <label>{{ $t('processDesigner.screenTemplate') }}</label>
                      <Select v-model="selectedScreenRecord.template" :options="screenTemplateOptions" option-label="label" option-value="value" @change="syncSelectedScreenUi" />
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
                      <Select v-model="selectedScreenRecord.entityType" :options="optionalEntityTypeOptions" option-label="label" option-value="value" @change="syncSelectedScreenUi" />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.roleIds') }}</label>
                      <MultiSelect v-model="selectedScreenRecord.roleIds" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.sources') }}</label>
                      <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addSource')" size="small" text @click="addSelectedScreenSource" />
                    </div>
                    <div v-for="(source, index) in selectedScreenRecord.sources" :key="source.id || index" class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <InputText v-model="source.id" size="small" />
                      <Select v-model="source.entityType" :options="entityTypeOptions" option-label="label" option-value="value" size="small" @change="syncSelectedScreenUi" />
                      <Select v-model="source.mode" :options="screenSourceModeOptions" option-label="label" option-value="value" size="small" />
                      <Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeSelectedScreenSource(index)" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.regions') }}</label>
                      <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addRegion')" size="small" text @click="addSelectedScreenRegion" />
                    </div>
                    <div v-for="(region, index) in selectedScreenRecord.regions" :key="region.id || index" class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <Select v-model="region.slot" :options="screenSlotOptions" option-label="label" option-value="value" size="small" />
                      <Select v-model="region.sourceId" :options="selectedScreenSourceOptions" option-label="label" option-value="value" size="small" />
                      <Select v-model="region.surface" :options="screenSurfaceOptions" option-label="label" option-value="value" size="small" />
                      <Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeSelectedScreenRegion(index)" />
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
                    <label>{{ $t('processDesigner.entityBinding') }}</label>
                    <InputText v-model="selectedScreenRecord.bindings.entityId" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('common.actions.title') }}</label>
                    <MultiSelect v-model="selectedScreenRecord.actions" :options="screenActionOptions" option-label="label" option-value="value" display="chip" class="w-full" @change="syncSelectedScreenUi" />
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
            {{ validation.ok ? (validation.message || $t('processDesigner.validationOk')) : validation.errors.join('; ') }}
          </Message>
          <Message v-for="warning in validation.warnings || []" :key="warning" severity="warn">{{ warning }}</Message>
        </div>
      </Panel>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/EntityMultiSelect.vue';
import Panel from 'primevue/panel';
import Select from '~/components/shared/EntitySelect.vue';
import Tab from 'primevue/tab';
import TabList from 'primevue/tablist';
import TabPanel from 'primevue/tabpanel';
import TabPanels from 'primevue/tabpanels';
import Tabs from 'primevue/tabs';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import { canvasToDefinition, compileProcessDefinition, createProcessDesignerContract, definitionToCanvas, portSpecsCompatible, resolveNodePort } from '~/packages/processes/src/index.js';
import { normalizeScreenContract, SCREEN_TEMPLATES, SCREEN_SOURCE_MODES, SCREEN_REGION_SLOTS } from '~/packages/processes/src/screen-contract.js';
import { normalizeWorkflow } from '~/packages/workflows/src/index.js';
import { cncDomain } from '@cutkit/domain-cnc';
import ProcessActionNode from '~/components/process-designer/ProcessActionNode.vue';
import ProcessEntityNode from '~/components/process-designer/ProcessEntityNode.vue';
import ProcessServiceNode from '~/components/process-designer/ProcessServiceNode.vue';
import ProcessSocketNode from '~/components/process-designer/ProcessSocketNode.vue';
import ProcessNode from '~/components/process-designer/ProcessNode.vue';
import ProcessScreenPreview from '~/components/process-designer/ProcessScreenPreview.vue';
import ProcessStatusDefinitionNode from '~/components/process-designer/ProcessStatusDefinitionNode.vue';
import ProcessValueInputNode from '~/components/process-designer/ProcessValueInputNode.vue';
import { normalizeProcessDisplayName } from '~/utils/processDesignerDisplay.js';

const { t } = useI18n();
const toast = useToast();
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
const selectedEdgeId = ref(null);
const validation = ref(null);
const applyingProcess = ref(false);
const selectedRoleId = ref(null);
const selectedPrincipalId = ref(null);
const selectedScreenId = ref(null);
const newStateId = ref('');
const canvasFrame = ref(null);
const compiledPreview = ref(null);
const compiledPreviewError = ref('');
const { getViewport } = useVueFlow();

const designer = createProcessDesignerContract(cncDomain);
const paletteGroups = designer.paletteGroups;
const actionKindOptions = [
  { label: t('processDesigner.paletteItems.create'), value: 'createEntity' },
  { label: t('processDesigner.paletteItems.modify'), value: 'updateEntity' },
  { label: t('processDesigner.paletteItems.service'), value: 'runCommand' },
  { label: t('processDesigner.paletteItems.send'), value: 'sendToOrganization' }
];
const genericActionLabels = new Set(['action', 'create', 'modify', 'status', 'service', 'send', 'update']);
const triggerModeOptions = [
  { label: 'Manual', value: 'manual' },
  { label: 'Event', value: 'event' }
];
const serviceBillingModeOptions = [
  { label: t('processDesigner.serviceBillingNone'), value: 'none' },
  { label: t('processDesigner.serviceBillingPrepaidTokens'), value: 'prepaidTokens' }
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
const screenTemplateOptions = SCREEN_TEMPLATES
  .filter(value => !['route', 'organizationOverview', 'organizationAccount'].includes(value))
  .map(value => ({ label: value, value }));
const screenSourceModeOptions = SCREEN_SOURCE_MODES.map(value => ({ label: value, value }));
const screenSlotOptions = SCREEN_REGION_SLOTS.map(value => ({ label: value, value }));
const screenSurfaceOptions = ['card', 'compact', 'detail', 'table', 'workspace'].map(value => ({ label: value, value }));
const screenPlacementOptions = [
  { label: 'hub', value: 'hub' },
  { label: 'detail', value: 'detail' },
  { label: 'hidden', value: 'hidden' }
];
const accessLevelOptions = [
  { label: t('processDesigner.accessRead'), value: 'read' },
  { label: t('processDesigner.accessWrite'), value: 'write' },
  { label: t('processDesigner.accessAdmin'), value: 'admin' }
];
const valueTypeOptions = ['string', 'number', 'object', 'entity'].map(value => ({ label: value, value }));
const processValueTypeOptions = ['string', 'number', 'boolean', 'json'].map(value => ({ label: value, value }));
const processBlockOptions = designer.blocks.map(block => ({ label: block.label, value: block.id }));
const processNodeOperations = {
  entityRef: ['current', 'parent', 'children', 'related'],
  stringOp: ['concat', 'template', 'replace', 'lower', 'upper', 'trim'],
  compare: ['eq', 'neq', 'gt', 'lt', 'contains', 'exists'],
  logic: ['and', 'or', 'not', 'coalesce'],
  collection: ['first', 'count']
};
const processNodeOperationLabels = {
  current: t('processDesigner.useCurrentEntity'),
  parent: t('processDesigner.useParentEntity'),
  children: t('processDesigner.useChildEntities'),
  related: t('processDesigner.useRelatedEntities'),
  concat: t('processDesigner.useJoinText'),
  template: t('processDesigner.useBuildText'),
  replace: t('processDesigner.useReplaceText'),
  lower: t('processDesigner.useLowerText'),
  upper: t('processDesigner.useUpperText'),
  trim: t('processDesigner.useTrimText'),
  eq: t('processDesigner.useEquals'),
  neq: t('processDesigner.useNotEquals'),
  gt: t('processDesigner.useGreaterThan'),
  lt: t('processDesigner.useLessThan'),
  contains: t('processDesigner.useContains'),
  exists: t('processDesigner.useExists'),
  and: t('processDesigner.useAllConditions'),
  or: t('processDesigner.useAnyCondition'),
  not: t('processDesigner.useInvertCondition'),
  coalesce: t('processDesigner.useFirstPresentCondition'),
  first: t('processDesigner.useFirstItem'),
  count: t('processDesigner.useCountItems')
};
const blockOptions = processBlockOptions;
const statusSeverityOptions = [
  { label: 'info', value: 'info' },
  { label: 'success', value: 'success' },
  { label: 'warning', value: 'warn' },
  { label: 'danger', value: 'danger' },
  { label: 'secondary', value: 'secondary' }
];
const statusIconOptions = [
  { label: 'circle', value: 'pi pi-circle-fill' },
  { label: 'draft', value: 'pi pi-file-edit' },
  { label: 'active', value: 'pi pi-play-circle' },
  { label: 'review', value: 'pi pi-eye' },
  { label: 'ready', value: 'pi pi-check-circle' },
  { label: 'blocked', value: 'pi pi-ban' },
  { label: 'warning', value: 'pi pi-exclamation-triangle' },
  { label: 'archived', value: 'pi pi-box' }
];
const accessLevelRank = { read: 1, write: 2, admin: 3 };
const defaultEdgeOptions = { type: 'default' };

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const processOptions = computed(() => processDefinitions.value.map(process => ({
  label: [
    normalizeProcessDisplayName(process.identity?.name || process.identity?.uid || process._id),
    process.status?.state?.primary
  ].filter(Boolean).join(' · '),
  value: String(process._id),
  entity: process
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
const selectedStatusDefinition = computed(() => selectedNode.value?.type === 'statusDefinition' ? ensureRecord('statusDefinitions', selectedNode.value, createStatusDefinition) : {});
const selectedValueInput = computed(() => selectedNode.value?.type === 'valueInput' ? ensureRecord('valueInputs', selectedNode.value, createValueInput) : {});
const selectedProcessNode = computed(() => selectedNode.value?.type === 'processNode' ? ensureRecord('processNodes', selectedNode.value, createProcessNode) : {});
const selectedEntityFeature = computed(() => selectedEntity.value.entityType ? featureForEntityType(selectedEntity.value.entityType) : defaultFeature());
const selectedStatusAttachmentEntries = computed(() => Object.entries(selectedStatusDefinition.value.lifecycle?.attachments || {})
  .map(([key, schema]) => ({ key, schema })));
const selectedStatusSnapshotEntries = computed(() => Object.entries(selectedStatusDefinition.value.lifecycle?.snapshots || {})
  .map(([key, schema]) => ({ key, schema })));

const roles = computed(() => draft.value?.data?.roles || {});
const servicePrincipals = computed(() => draft.value?.data?.servicePrincipals || {});
const screens = computed(() => draft.value?.data?.screens || {});
const roleList = computed(() => Object.values(roles.value));
const servicePrincipalList = computed(() => Object.values(servicePrincipals.value));
const screenList = computed(() => Object.values(screens.value));
const selectedRoleRecord = computed(() => selectedRoleId.value ? roles.value[selectedRoleId.value] : null);
const selectedPrincipalRecord = computed(() => selectedPrincipalId.value ? servicePrincipals.value[selectedPrincipalId.value] : null);
const selectedScreenRecord = computed(() => selectedScreenId.value ? screens.value[selectedScreenId.value] : null);
const selectedScreenSource = computed(() => ensureSelectedScreenSource());
const selectedScreenRegion = computed(() => ensureSelectedScreenRegion());
const roleOptions = computed(() => roleList.value.map(role => ({ label: role.label || role.id, value: role.id })));
const servicePrincipalOptions = computed(() => servicePrincipalList.value.map(principal => ({ label: principal.label || principal.id, value: principal.id })));
const entityTypeOptions = computed(() => designer.entityOptions);
const optionalEntityTypeOptions = computed(() => [{ label: 'None', value: '' }, ...entityTypeOptions.value]);
const commandOptions = computed(() => designer.commandOptions);
const screenActionOptions = computed(() => Object.values(draft.value?.data?.actions || {}).map(action => ({
  label: action.label || action.id,
  value: action.id
})));
const selectedScreenSourceOptions = computed(() => (selectedScreenRecord.value?.sources || []).map(source => ({
  label: source.id || source.entityType,
  value: source.id
})));
const screenFeatureOptions = computed(() => (cncDomain.entities || []).map(entity => ({
  label: entity.label || entity.type,
  value: featureForEntityType(entity.type)
})));
const fieldOptionsForSelectedEntity = computed(() => fieldOptions(selectedEntity.value.entityType));
const selectedActionEntityType = computed(() => actionEntityType(selectedAction.value) || (selectedNode.value ? inferIncomingEntityContract(selectedNode.value.id).entityType : ''));
const fieldOptionsForSelectedAction = computed(() => fieldOptions(selectedActionEntityType.value));
const fieldOptionsForSelectedSocket = computed(() => fieldOptions(selectedSocket.value.entityType));
const selectedActionGrants = computed(() => normalizeDesignerAccess(selectedAction.value.access).grants);
const selectedValueInputFieldOptions = computed(() => fieldOptionsForBlock(selectedValueInput.value.block));
const selectedProcessNodeFieldOptions = computed(() => fieldOptionsForBlock(selectedProcessNode.value.block, selectedProcessNode.value.entityType));
const lifecycleWorkflow = computed(() => workflowForEntity(selectedEntity.value));
const lifecycleRegion = computed(() => lifecycleWorkflow.value.regions?.main || lifecycleWorkflow.value.regions?.[lifecycleWorkflow.value.primaryRegion] || null);
const lifecycleStateIds = computed(() => Object.keys(lifecycleRegion.value?.states || {}).filter(key => !key.includes('.')));
const lifecycleStateEntries = computed(() => lifecycleStateIds.value.map(value => ({
  label: lifecycleRegion.value?.states?.[value]?.label || value,
  value
})));
const lifecycleStateOptions = computed(() => lifecycleStateEntries.value);
const lifecycleTransitions = computed(() => lifecycleRegion.value?.transitions || []);
const selectedRoleAccessSummary = computed(() => selectedRoleId.value ? roleAccessSummary(selectedRoleId.value) : []);
const compiledScreenPreview = computed(() => Object.values(compiledPreview.value?.screens || {})
  .map(screen => {
    const normalized = normalizeScreenContract(screen);
    return {
      ...normalized,
      roleLabels: (screen.roleIds || []).map(roleId => roles.value[roleId]?.label || roleId),
      requiredLabel: screen.required?.feature ? `${screen.required.feature}:${screen.required.level || 'read'}` : ''
    };
  })
  .sort((left, right) => String(left.label || left.id).localeCompare(String(right.label || right.id))));

watch(selectedScreenRecord, () => syncSelectedScreenUi(), { immediate: true });
watch([draft, nodes, edges], () => recomputeProcessPreview(), { deep: true });

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
  const name = isActiveProcess.value && activeName.value ? `${normalizeProcessDisplayName(activeName.value)} draft` : 'Organization process';
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
  return activated;
}

async function applyProcess() {
  applyingProcess.value = true;
  try {
    const activated = await activateDraft();
    validation.value = {
      ok: true,
      errors: [],
      warnings: activated?.data?.compiled?.warnings || [],
      message: t('processDesigner.applySuccess')
    };
  } catch (error) {
    validation.value = {
      ok: false,
      errors: [error.data?.message || error.message],
      warnings: []
    };
  } finally {
    applyingProcess.value = false;
  }
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
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  nodes.value = canvas.nodes.map(enrichNodeData);
  edges.value = decorateEdges(canvas.edges);
  selectedRoleId.value = Object.keys(value?.data?.roles || {})[0] || null;
  selectedPrincipalId.value = Object.keys(value?.data?.servicePrincipals || {})[0] || null;
  selectedScreenId.value = Object.keys(value?.data?.screens || {})[0] || null;
  recomputeProcessPreview();
}

function addNode(item) {
  const type = typeof item === 'string' ? item : item.type;
  const actionKind = typeof item === 'object' ? item.actionKind : null;
  const socketDirection = typeof item === 'object' ? item.direction : null;
  const processNodeKind = typeof item === 'object' ? item.kind : null;
  const id = `${type}_${Date.now()}`;
  const refId = id;
  const node = {
    id,
    type,
    position: activeViewportCenter(),
    data: { refId, label: refId }
  };
  const record = ensureRecord(recordKeyForType(type), { data: { refId }, type }, factoryForType(type));
  if (type === 'action' && actionKind) {
    Object.assign(record, createAction(refId, actionKind));
  }
  if (type === 'socket' && socketDirection) {
    Object.assign(record, createSocket(refId, socketDirection));
  }
  if (type === 'processNode' && processNodeKind) {
    Object.assign(record, createProcessNode(refId, processNodeKind));
  }
  nodes.value.push(enrichNodeData(node));
  selectedNodeId.value = id;
  selectedEdgeId.value = null;
  syncEdgeSelection();
}

function selectNode(node) {
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;
  syncEdgeSelection();
}

function selectEdge(edge) {
  selectedEdgeId.value = edge.id;
  selectedNodeId.value = null;
  syncEdgeSelection();
}

function clearGraphSelection() {
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  syncEdgeSelection();
}

function handleCanvasKeydown(event) {
  if (!['Delete', 'Backspace'].includes(event.key) || (!selectedNodeId.value && !selectedEdgeId.value)) return;
  if (isTextEditingTarget(event.target)) return;
  event.preventDefault();
  if (selectedNodeId.value) deleteSelectedNode();
  else deleteSelectedEdge();
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
  selectedEdgeId.value = null;
  syncInferredActionInputs();
}

function deleteSelectedEdge() {
  if (!selectedEdgeId.value) return;
  edges.value = edges.value.filter(edge => edge.id !== selectedEdgeId.value);
  selectedEdgeId.value = null;
  syncInferredActionInputs();
}

function decorateEdges(items = []) {
  return items.map(edge => decorateEdge(edge));
}

function decorateEdge(edge = {}) {
  const selected = edge.id === selectedEdgeId.value;
  const type = edge.type === 'smoothstep' || edge.type === 'step' ? 'default' : (edge.type || 'default');
  return {
    ...edge,
    type,
    animated: selected,
    style: selected ? { stroke: 'var(--p-primary-color)', strokeWidth: 3 } : undefined
  };
}

function activeViewportCenter() {
  const viewport = getViewport?.() || draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 };
  const zoom = Number(viewport.zoom) || 1;
  const rect = canvasFrame.value?.getBoundingClientRect?.();
  const width = rect?.width || 1200;
  const height = rect?.height || 720;
  return {
    x: Math.round((width / 2 - Number(viewport.x || 0)) / zoom - 140),
    y: Math.round((height / 2 - Number(viewport.y || 0)) / zoom - 80)
  };
}

function syncEdgeSelection() {
  edges.value = decorateEdges(edges.value);
}

function serializeProcess() {
  syncNodeData();
  return processDefinitionSnapshot();
}

function processDefinitionSnapshot() {
  return canvasToDefinition(
    { nodes: nodes.value.map(stripRuntimeNodeData), edges: edges.value.map(stripRuntimeEdgeData), viewport: draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 } },
    draft.value?.data || {}
  );
}

function recomputeProcessPreview() {
  if (!draft.value?.data) {
    compiledPreview.value = null;
    compiledPreviewError.value = '';
    return;
  }
  try {
    compiledPreview.value = compileProcessDefinition(processDefinitionSnapshot(), cncDomain);
    compiledPreviewError.value = '';
  } catch (error) {
    compiledPreview.value = null;
    compiledPreviewError.value = error.message || String(error);
  }
}

function syncNodeData() {
  for (const node of nodes.value) {
    if (!node.data?.refId) continue;
    const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
    if (node.type === 'action') syncActionIo(record, node);
    if (node.type === 'entity') syncEntityProfileIo(record);
    if (node.type === 'socket') syncSocketIo(record);
    if (node.type === 'statusDefinition') syncStatusDefinition(record);
    if (node.type === 'valueInput') syncValueInput(record);
    if (node.type === 'processNode') {
      applyInferredProcessNodeInputs(record, node);
      syncProcessNode(record);
    }
    node.data.label = nodeDisplayLabel(record, node);
    node.data.actionKind = record.actionKind;
    node.data.entityType = record.entityType;
    node.data.commandId = record.commandId;
    node.data.triggerMode = record.trigger?.mode;
    node.data.actionKindLabel = node.type === 'action' ? actionHeaderLabel(record) : null;
    node.data.actionTitleLabel = node.type === 'action' ? actionTitleLabel(record) : null;
    node.data.eventLabel = node.type === 'action' ? (record.events?.[0]?.label || t('processDesigner.actionCompleted')) : null;
    node.data.actionRecord = node.type === 'action' ? record : null;
    node.data.entityTypeOptions = node.type === 'action' ? entityTypeOptions.value : [];
    node.data.commandOptions = node.type === 'action' ? commandOptions.value : [];
    node.data.roleOptions = node.type === 'action' ? actionRoleOptions(record, node) : [];
    node.data.effectiveAccessLabels = node.type === 'action' ? effectiveActionAccessLabels(record, node) : [];
    node.data.inheritedAccessLabels = node.type === 'action' ? inheritedActionAccessLabels(record, node) : [];
    node.data.accessLevelOptions = node.type === 'action' ? accessLevelOptions : [];
    node.data.triggerModeOptions = node.type === 'action' ? localizedTriggerModeOptions() : [];
    node.data.fieldOptions = node.type === 'action' ? fieldOptions(actionEntityType(record) || inferIncomingEntityContract(node.id).entityType) : [];
    node.data.onActionUpdate = node.type === 'action' ? (updates, options = {}) => updateActionRecord(record.id || node.data.refId, updates, options) : null;
    node.data.onActionResetAccess = node.type === 'action' ? () => resetActionAccess(record.id || node.data.refId) : null;
    node.data.statusFrom = record.status?.from;
    node.data.statusTo = record.status?.to;
    node.data.direction = record.direction;
    node.data.lifecycleMode = record.lifecycle?.mode;
    node.data.roleCount = record.allowedRoles ? countRoleBindings(record.allowedRoles) : normalizeDesignerAccess(record.access).grants.length;
    node.data.runPrincipalLabels = principalLabels(record.access?.runPrincipals || []);
    node.data.sendRoleLabels = roleLabels(record.access?.sendRoles || []);
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
    node.data.statusId = record.statusId;
    node.data.color = record.color;
    node.data.severity = record.severity;
    node.data.icon = record.icon;
    node.data.valueType = record.valueType;
    node.data.block = record.block;
    node.data.path = record.path;
    node.data.kind = record.kind;
    node.data.kindLabel = node.type === 'processNode' ? processNodeDisplayLabel(record) : record.kind;
    node.data.summary = processNodeSummary(record);
  }
}

function ensureRecord(key, node, factory) {
  if (!draft.value) draft.value = { data: {} };
  draft.value.data[key] ||= {};
  const refId = node?.data?.refId || node?.id || `${key}_${Date.now()}`;
  draft.value.data[key][refId] ||= factory(refId);
  if (key === 'services') {
    draft.value.data[key][refId].billing ||= { mode: 'none', tokenCost: 0, meterKey: '' };
  }
  return draft.value.data[key][refId];
}

function recordKeyForType(type) {
  return ({ entity: 'entityProfiles', action: 'actions', service: 'services', socket: 'sockets', statusDefinition: 'statusDefinitions', valueInput: 'valueInputs', processNode: 'processNodes' })[type] || 'entityProfiles';
}

function factoryForType(type) {
  return ({ entity: createEntityProfile, action: createAction, service: createService, socket: createSocket, statusDefinition: createStatusDefinition, valueInput: createValueInput, processNode: createProcessNode })[type] || createEntityProfile;
}

function createRole(id) {
  return { id, label: id };
}

function createServicePrincipal(id) {
  return { id, label: id };
}

function paletteLabel(item) {
  return t(`processDesigner.paletteItems.${item.label}`);
}

function defaultEntityType() {
  return designer.entityOptions[0]?.value || '';
}

function defaultFeature() {
  return featureForEntityType(defaultEntityType());
}

function createEntityProfile(id) {
  const workflow = createCreatedWorkflow();
  const profile = {
    id,
    entityType: defaultEntityType(),
    label: id,
    lifecycle: { mode: 'defaultCreated', workflow },
    fields: { read: ['identity.*', 'status.*', 'lineage.*'], write: [], private: [] },
    relations: relationOptionsForEntity(defaultEntityType()).map(option => option.value),
    stateVisibility: { publicRegions: ['main'], privateRegions: [], publicStates: [] },
    allowedRoles: { read: [], write: [], admin: [] }
  };
  syncEntityProfileIo(profile);
  return profile;
}

function createService(id) {
  return {
    id,
    label: id,
    serviceType: '',
    commandId: '',
    inputs: [],
    outputs: [],
    access: { runPrincipals: [], viewPrincipals: [] },
    billing: { mode: 'none', tokenCost: 0, meterKey: '' }
  };
}

function createAction(id, actionKind = 'createEntity') {
  const action = {
    id,
    label: '',
    actionKind,
    entityType: ['runCommand', 'updateEntity'].includes(actionKind) ? '' : defaultEntityType(),
    commandId: '',
    parentEntityType: '',
    parentRevision: { enabled: false, scope: '' },
    status: { from: '', to: '' },
    mutation: { fields: [] },
    projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
    access: { grants: [] },
    trigger: { mode: 'manual' },
    inputs: [],
    outputs: [],
    events: []
  };
  syncActionIo(action);
  return action;
}

function createSocket(id, direction = 'outbound') {
  return {
    id,
    label: id,
    direction,
    entityType: defaultEntityType(),
    projection: { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } },
    receiverLifecycle: { mode: 'defaultCreated', workflow: null },
    access: { sendRoles: [], receiveRoles: [] }
  };
}

function createStatusDefinition(id) {
  return { id, label: '', statusId: 'STATUS', severity: 'info', color: 'info', icon: 'pi pi-circle-fill' };
}

function createValueInput(id) {
  return { id, label: 'Name', block: 'identity', valueType: 'string', path: 'identity.name', value: '' };
}

function createProcessNode(id, kind = 'fieldRead') {
  const node = {
    id,
    label: kind,
    kind,
    mode: kind === 'entityRef' ? 'current' : '',
    entityType: '',
    relationEntityType: '',
    relationKey: '',
    relationCardinality: '',
    block: ['blockRead', 'blockCompose'].includes(kind) ? 'identity' : '',
    path: ['blockRead', 'blockCompose'].includes(kind) ? 'name' : '',
    valueType: kind === 'compare' || kind === 'logic' ? 'boolean' : 'string',
    operation: defaultProcessNodeOperation(kind),
    icon: iconForProcessNode(kind),
    inputs: [],
    outputs: []
  };
  syncProcessNode(node);
  return node;
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
  }
  for (const socket of Object.values(draft.value.data.sockets || {})) {
    socket.access ||= {};
    for (const key of ['sendRoles', 'receiveRoles']) socket.access[key] = (socket.access[key] || []).filter(roleId => roleId !== removedRoleId);
  }
  for (const action of Object.values(draft.value.data.actions || {})) {
    action.trigger ||= { mode: 'manual' };
    action.access = normalizeDesignerAccess(action.access);
    action.access.grants = action.access.grants.filter(grant => grant.roleId !== removedRoleId);
    action.access.roleIds = action.access.grants.map(grant => grant.roleId);
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

function addServicePrincipal() {
  const id = `principal_${Date.now()}`;
  draft.value ||= { data: {} };
  draft.value.data.servicePrincipals ||= {};
  draft.value.data.servicePrincipals[id] = createServicePrincipal(id);
  selectedPrincipalId.value = id;
}

function removeSelectedPrincipal() {
  if (!selectedPrincipalId.value || !draft.value?.data?.servicePrincipals) return;
  const removedPrincipalId = selectedPrincipalId.value;
  delete draft.value.data.servicePrincipals[removedPrincipalId];
  for (const service of Object.values(draft.value.data.services || {})) {
    service.access ||= {};
    for (const key of ['runPrincipals', 'viewPrincipals']) service.access[key] = (service.access[key] || []).filter(principalId => principalId !== removedPrincipalId);
  }
  selectedPrincipalId.value = Object.keys(draft.value.data.servicePrincipals)[0] || null;
}

function addScreen() {
  const id = `screen_${Date.now()}`;
  draft.value ||= { data: {} };
  draft.value.data.screens ||= {};
  draft.value.data.screens[id] = createScreen(id);
  selectedScreenId.value = id;
}

function createScreen(id) {
  const entityType = defaultEntityType();
  const feature = featureForEntityType(entityType);
  return {
    id,
    label: id,
    kind: 'route',
    template: 'entityList',
    route: `/screens/${id}`,
    placement: 'hub',
    entityType,
    roleIds: selectedRoleId.value ? [selectedRoleId.value] : [],
    required: { feature, level: 'read' },
    bindings: {},
    sources: [{
      id: entityType || id,
      entityType,
      mode: 'list',
      required: { feature, level: 'read' },
      filters: {}
    }],
    regions: [{
      id: 'main',
      slot: 'main',
      sourceId: entityType || id,
      surface: 'card',
      actions: []
    }],
    actions: []
  };
}

function removeSelectedScreen() {
  if (!selectedScreenId.value || !draft.value?.data?.screens) return;
  delete draft.value.data.screens[selectedScreenId.value];
  selectedScreenId.value = Object.keys(draft.value.data.screens)[0] || null;
}

function syncSelectedScreenUi() {
  if (!selectedScreenRecord.value) return;
  selectedScreenRecord.value.required ||= { feature: defaultFeature(), level: 'read' };
  selectedScreenRecord.value.roleIds ||= [];
  selectedScreenRecord.value.bindings ||= {};
  selectedScreenRecord.value.actions ||= [];
  const normalized = normalizeScreenContract(selectedScreenRecord.value);
  selectedScreenRecord.value.kind = 'route';
  selectedScreenRecord.value.template = normalized.template;
  selectedScreenRecord.value.sources = normalized.sources;
  selectedScreenRecord.value.regions = normalized.regions;
  const entityType = selectedScreenRecord.value.entityType || selectedScreenRecord.value.sources[0]?.entityType || '';
  if (entityType) {
    const feature = featureForEntityType(entityType);
    selectedScreenRecord.value.required.feature = feature;
    for (const source of selectedScreenRecord.value.sources) {
      const sourceFeature = featureForEntityType(source.entityType || entityType);
      source.required = { ...(source.required || {}), feature: sourceFeature, level: source.required?.level || selectedScreenRecord.value.required.level || 'read' };
    }
  }
  const source = ensureSelectedScreenSource();
  const region = ensureSelectedScreenRegion();
  if (source && region) {
    source.mode = selectedScreenRecord.value.template === 'entityDetail' || selectedScreenRecord.value.template === 'formAction' ? 'single' : source.mode || 'list';
    for (const screenRegion of selectedScreenRecord.value.regions || []) {
      if (!selectedScreenRecord.value.sources.some(item => item.id === screenRegion.sourceId)) screenRegion.sourceId = source.id;
      screenRegion.actions = selectedScreenRecord.value.actions || [];
    }
  }
}

function ensureSelectedScreenSource() {
  const screen = selectedScreenRecord.value;
  if (!screen) return {};
  screen.sources ||= [];
  if (!screen.sources.length) {
    const entityType = screen.entityType || defaultEntityType();
    screen.sources.push({
      id: entityType || 'source',
      entityType,
      mode: screen.template === 'entityDetail' ? 'single' : 'list',
      required: screen.required || { feature: featureForEntityType(entityType), level: 'read' },
      filters: {}
    });
  }
  return screen.sources[0];
}

function ensureSelectedScreenRegion() {
  const screen = selectedScreenRecord.value;
  if (!screen) return {};
  const source = ensureSelectedScreenSource();
  screen.regions ||= [];
  if (!screen.regions.length) {
    screen.regions.push({
      id: 'main',
      slot: screen.template === 'workspaceLanes' ? 'center' : 'main',
      sourceId: source.id,
      surface: screen.template === 'entityDetail' ? 'detail' : 'card',
      actions: screen.actions || []
    });
  }
  return screen.regions[0];
}

function addSelectedScreenSource() {
  const screen = selectedScreenRecord.value;
  if (!screen) return;
  screen.sources ||= [];
  const entityType = screen.entityType || defaultEntityType();
  const id = uniqueRecordId('source', Object.fromEntries(screen.sources.map(source => [source.id, source])));
  screen.sources.push({
    id,
    entityType,
    mode: screen.template === 'entityDetail' ? 'single' : 'list',
    required: { feature: featureForEntityType(entityType), level: screen.required?.level || 'read' },
    filters: {}
  });
}

function removeSelectedScreenSource(index) {
  const screen = selectedScreenRecord.value;
  if (!screen?.sources || screen.sources.length <= 1) return;
  const [removed] = screen.sources.splice(index, 1);
  for (const region of screen.regions || []) {
    if (region.sourceId === removed?.id) region.sourceId = screen.sources[0]?.id || '';
  }
}

function addSelectedScreenRegion() {
  const screen = selectedScreenRecord.value;
  if (!screen) return;
  const source = ensureSelectedScreenSource();
  screen.regions ||= [];
  const id = uniqueRecordId('region', Object.fromEntries(screen.regions.map(region => [region.id, region])));
  screen.regions.push({
    id,
    slot: screen.template === 'workspaceLanes' ? 'right' : 'main',
    sourceId: source.id,
    surface: screen.template === 'entityDetail' ? 'detail' : 'card',
    actions: screen.actions || []
  });
}

function removeSelectedScreenRegion(index) {
  const screen = selectedScreenRecord.value;
  if (!screen?.regions || screen.regions.length <= 1) return;
  screen.regions.splice(index, 1);
}

function featureForEntityType(entityType) {
  const entity = (cncDomain.entities || []).find(item => item.type === entityType);
  return entity?.collection || `${entityType}s`;
}

function uniqueRecordId(prefix, records = {}) {
  let index = Object.keys(records).length + 1;
  let id = `${prefix}_${index}`;
  while (records[id]) {
    index += 1;
    id = `${prefix}_${index}`;
  }
  return id;
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
  syncActionIo(selectedAction.value, selectedNode.value);
  syncNodeData();
}

function syncActionIo(action = {}, node = null) {
  action.trigger ||= { mode: 'manual' };
  action.access = normalizeDesignerAccess(action.access);
  action.trigger.mode = normalizeTriggerMode(action.trigger.mode);
  delete action.trigger.roleIds;
  action.access.level = normalizeAccessLevel(action.access.level);
  action.status ||= {};
  applyStatusDefinitionToAction(action);
  action.events = actionEventOutputs(action);
  if (action.actionKind === 'createEntity') {
    const incoming = node?.id ? inferIncomingEntityContract(node.id) : {};
    syncActionConstruction(action);
    action.status.to ||= initialStatusForEntity(action.entityType);
    action.parentEntityType = incoming.entityType || '';
    syncParentRevision(action);
    const parentInput = {
      id: 'parent',
      label: incoming.entityType || t('processDesigner.parentEntity'),
      entityType: incoming.entityType || '',
      status: incoming.status || '',
      required: false
    };
    action.inputs = [
      parentInput,
      { id: 'status', label: t('processDesigner.targetStatus'), kind: 'status', required: true },
      ...createInputSockets(action)
    ];
    action.outputs = [{ id: 'created', entityType: action.entityType, status: action.status.to }];
    return;
  }
  if (action.actionKind === 'updateEntity') {
    const incoming = node?.id ? inferIncomingEntityContract(node.id) : {};
    const incomingEntityType = node ? (incoming.entityType || '') : (action.inputs?.find(input => input.id === 'entity')?.entityType || '');
    const inheritedAccess = incoming.access || {};
    action.entityType = '';
    action.mutation ||= { fields: [] };
    if (node) action.status.from = incoming.status || '';
    else if (incoming.status && !action.status.from) action.status.from = incoming.status;
    if (node && !action.access.modified && inheritedAccess.grants?.length) {
      action.access = normalizeDesignerAccess({
        ...action.access,
        grants: inheritedAccess.grants.map(grant => ({ ...grant }))
      });
    }
    action.access.statusFrom = action.status.from || '';
    action.access.statusTo = action.status.to || '';
    syncMutationInputPolicy(action);
    const fieldInputs = (action.mutation.fields || []).length
      ? (action.mutation.fields || []).map(path => ({
          id: `field:${path}`,
          label: fieldLabel(incomingEntityType, path),
          dataPath: path,
          kind: 'data',
          required: false
        }))
      : [{ id: 'field', label: t('processDesigner.field'), dataPath: '', kind: 'data', required: false }];
    const relationInputs = declaredRelationsForEntity(incomingEntityType).map(relation => ({
      id: `relation:${relation.key}`,
      label: relation.key,
      kind: 'entity',
      entityType: relation.targetType,
      relationKey: relation.key,
      cardinality: relation.cardinality,
      required: false
    }));
    action.inputs = [
      { id: 'entity', label: incomingEntityType || t('processDesigner.incomingEntity'), entityType: incomingEntityType, status: incoming.status || '' },
      { id: 'status', label: t('processDesigner.targetStatus'), kind: 'status', required: false },
      ...fieldInputs,
      ...relationInputs
    ];
    action.outputs = [{ id: 'entity', label: incomingEntityType || t('processDesigner.sameEntity'), entityType: incomingEntityType, status: action.status.to || incoming.status || '' }];
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

function syncMutationInputPolicy(action = {}) {
  const existingFields = new Map((action.inputPolicy?.fields || []).map(field => [field.id || field.path, field]));
  const fields = (action.mutation?.fields || []).map(path => {
    const id = `field:${path}`;
    const existing = existingFields.get(id) || existingFields.get(path) || {};
    return {
      ...existing,
      id,
      label: path,
      path,
      type: existing.type || 'string',
      prompt: existing.prompt !== false,
      required: false
    };
  });
  action.inputPolicy = {
    ...(action.inputPolicy || {}),
    prompt: fields.length > 0,
    fields
  };
}

function syncActionConstruction(action = {}) {
  const contract = constructionContractForEntity(action.entityType);
  action.construction ||= {};
  const modes = Array.isArray(contract.modes) ? contract.modes : [];
  const requestedMode = action.construction.mode || contract.defaultMode || 'genericCreate';
  action.construction.mode = modes.includes(requestedMode)
    ? requestedMode
    : (contract.defaultMode || modes[0] || 'genericCreate');
  const constructionInputs = constructionInputsForMode(contract, action.construction.mode);
  action.construction.inputs = constructionInputs.map(input => ({ ...input }));
  const promptFields = constructionInputs.filter(input => input.prompt || input.required);
  const existingFields = new Map((action.inputPolicy?.fields || []).map(field => [field.id || field.path, field]));
  action.inputPolicy = {
    ...(action.inputPolicy || {}),
    prompt: promptFields.length > 0,
    fields: promptFields.map(input => ({
      ...(existingFields.get(input.id || input.path) || {}),
      ...input,
      default: existingFields.get(input.id || input.path)?.default,
      valueRef: existingFields.get(input.id || input.path)?.valueRef
    }))
  };
}

function constructionModeOptions(entityType = '') {
  return (constructionContractForEntity(entityType).modes || []).map(value => ({ label: value, value }));
}

function constructionInputsForMode(contract = {}, mode = '') {
  return contract.modeInputs?.[mode] || contract.inputs || [];
}

function parentRevisionScopeOptions(entityType = '') {
  const contract = cncDomain.revisions?.[entityType] || {};
  return (contract.scopes || []).map(value => ({ label: value, value }));
}

function syncParentRevision(action = {}) {
  const contract = cncDomain.revisions?.[action.parentEntityType] || {};
  const scopes = Array.isArray(contract.scopes) ? contract.scopes : [];
  action.parentRevision ||= { enabled: false, scope: '' };
  if (!scopes.length) {
    action.parentRevision.enabled = false;
    action.parentRevision.scope = '';
    return;
  }
  if (!scopes.includes(action.parentRevision.scope)) {
    action.parentRevision.scope = contract.defaultScope || scopes[0];
  }
}

function updateParentRevisionEnabled(enabled) {
  selectedAction.value.parentRevision ||= { enabled: false, scope: '' };
  selectedAction.value.parentRevision.enabled = enabled === true;
  syncParentRevision(selectedAction.value);
  syncNodeData();
}

function applyStatusDefinitionToAction(action = {}) {
  if (!action.statusRef) return;
  const status = draft.value?.data?.statusDefinitions?.[action.statusRef];
  if (!status) return;
  syncStatusDefinition(status);
  action.status ||= {};
  action.status.to = status.statusId;
  action.access = normalizeDesignerAccess(action.access);
  action.access.statusTo = status.statusId;
}

function constructionContractForEntity(entityType) {
  return designer.construction(entityType);
}

function syncSocketIo(socket = {}) {
  socket.direction = socket.direction === 'inbound' ? 'inbound' : 'outbound';
  socket.projection ||= { fields: [], excludeFields: [], lifecycle: { exposedRegions: ['main'], stateMap: {} } };
  socket.receiverLifecycle ||= { mode: 'defaultCreated', workflow: null };
  socket.access ||= { sendRoles: [], receiveRoles: [] };
  if (socket.direction === 'inbound') {
    socket.inputs = [];
    socket.outputs = [{ id: 'received', label: socket.entityType, entityType: socket.entityType, status: initialSocketStatus(socket) }];
    return;
  }
  socket.inputs = [{ id: 'entity', label: socket.entityType, entityType: socket.entityType, required: true }];
  socket.outputs = [{ id: 'projection', label: socket.entityType, entityType: socket.entityType, projection: true, fields: socket.projection.fields || [] }];
}

function syncEntityProfileIo(profile = {}) {
  const entityType = profile.entityType || 'entity';
  if (!Array.isArray(profile.relations)) {
    profile.relations = relationOptionsForEntity(entityType).map(option => option.value);
  }
  const relations = declaredRelationsForProfile(profile);
  profile.inputs = [
    { id: 'status', label: t('processDesigner.statusMachine'), kind: 'status' },
    ...relations.map(relation => ({
      id: `relation:${relation.key}`,
      label: relation.key,
      kind: 'entity',
      entityType: relation.targetType,
      relationKey: relation.key,
      cardinality: relation.cardinality,
      required: false
    })),
    ...standardBlockSockets(entityType, 'input')
  ];
  profile.outputs = [
    { id: 'entity', label: entityType, entityType, status: initialStatusForProfile(profile) },
    ...standardBlockSockets(entityType, 'output')
  ];
}

function standardBlockSockets(entityType = '', direction = 'output') {
  return standardBlocksForEntity(entityType).map(block => ({
    id: block.id,
    label: block.label,
    block: block.id,
    dataPath: block.defaultPath,
    kind: 'block',
    direction
  }));
}

function standardBlocksForEntity(entityType = '') {
  return designer.blocksForEntity(entityType);
}

function initialStatusForProfile(profile = {}) {
  const workflow = workflowForEntity(profile);
  const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
  return region?.initial || '';
}

function syncStatusDefinition(status = {}) {
  status.statusId ||= String(status.label || 'STATUS').trim().toUpperCase().replace(/\s+/g, '_');
  if (status.label === 'Created' && status.statusId !== 'CREATED') status.label = '';
  if (isLegacyStatusNodeLabel(status.label)) status.label = '';
  status.label ??= '';
  status.severity ||= status.color || 'info';
  status.color = status.severity;
  status.icon ||= 'pi pi-circle-fill';
  pruneStatusLifecycle(status);
}

function isLegacyStatusNodeLabel(label = '') {
  const value = String(label || '').trim();
  return (cncDomain.entities || []).some(entity => entity.type === value);
}

function ensureStatusLifecycle() {
  selectedStatusDefinition.value.lifecycle ||= {};
  return selectedStatusDefinition.value.lifecycle;
}

function pruneStatusLifecycle(status = selectedStatusDefinition.value) {
  const lifecycle = status.lifecycle;
  if (!lifecycle) return;
  if (!lifecycle.description?.required) delete lifecycle.description;
  if (!lifecycle.attachments || Object.keys(lifecycle.attachments).length === 0) delete lifecycle.attachments;
  if (!lifecycle.snapshots || Object.keys(lifecycle.snapshots).length === 0) delete lifecycle.snapshots;
  if (Object.keys(lifecycle).length === 0) delete status.lifecycle;
}

function updateStatusDescriptionRequired(value) {
  if (value) ensureStatusLifecycle().description = { required: true };
  else if (selectedStatusDefinition.value.lifecycle) delete selectedStatusDefinition.value.lifecycle.description;
  pruneStatusLifecycle();
}

function ensureStatusAttachments() {
  const lifecycle = ensureStatusLifecycle();
  lifecycle.attachments ||= {};
  return lifecycle.attachments;
}

function addStatusAttachment() {
  const attachments = ensureStatusAttachments();
  const key = uniqueName('proof', Object.keys(attachments));
  attachments[key] = { kind: 'photo', required: true };
}

function renameStatusAttachment(previous, value) {
  const next = String(value || '').trim();
  const attachments = selectedStatusDefinition.value.lifecycle?.attachments;
  if (!attachments || !next || next === previous || attachments[next]) return;
  attachments[next] = attachments[previous];
  delete attachments[previous];
}

function removeStatusAttachment(key) {
  const attachments = selectedStatusDefinition.value.lifecycle?.attachments;
  if (!attachments) return;
  delete attachments[key];
  pruneStatusLifecycle();
}

function ensureStatusSnapshots() {
  const lifecycle = ensureStatusLifecycle();
  lifecycle.snapshots ||= {};
  return lifecycle.snapshots;
}

function addStatusSnapshot() {
  const snapshots = ensureStatusSnapshots();
  const key = uniqueName('snapshot', Object.keys(snapshots));
  snapshots[key] = { entityType: defaultEntityType(), lineageKey: '', required: true };
}

function renameStatusSnapshot(previous, value) {
  const next = String(value || '').trim();
  const snapshots = selectedStatusDefinition.value.lifecycle?.snapshots;
  if (!snapshots || !next || next === previous || snapshots[next]) return;
  snapshots[next] = snapshots[previous];
  delete snapshots[previous];
}

function removeStatusSnapshot(key) {
  const snapshots = selectedStatusDefinition.value.lifecycle?.snapshots;
  if (!snapshots) return;
  delete snapshots[key];
  pruneStatusLifecycle();
}

function syncValueInput(input = {}) {
  input.block ||= blockForPath(input.path);
  input.valueType ||= 'string';
  input.path = normalizeBlockPath(input.block, input.path || defaultPathForBlock(input.block));
  input.label ||= input.path || input.id;
  input.icon ||= iconForBlock(input.block);
  input.value ??= '';
  input.outputs = [{
    id: 'value',
    label: input.label || input.path,
    dataPath: input.path,
    kind: input.valueType,
    block: input.block
  }];
}

function syncProcessNode(node = {}) {
  node.kind ||= 'fieldRead';
  node.operation ||= defaultProcessNodeOperation(node.kind);
  node.valueType ||= defaultProcessNodeValueType(node.kind);
  node.icon = iconForProcessNode(node.kind);
  if (node.kind !== 'entityRef') node.mode = '';
  else node.mode ||= node.operation || 'current';
  if (node.kind === 'entityRef') node.operation = node.mode;
  if (node.kind === 'entityRef' && node.mode === 'related') {
    const relation = relationForNode(node);
    node.relationEntityType = relation?.targetType || '';
    node.relationCardinality = relation?.cardinality || '';
  } else {
    node.relationKey = '';
    node.relationCardinality = '';
  }
  if (!['blockRead', 'blockCompose'].includes(node.kind)) node.block = '';
  else node.block ||= 'identity';
  node.label = processNodeDisplayLabel(node);
  node.inputs = processNodeInputs(node);
  node.outputs = processNodeOutputs(node);
}

function syncSelectedProcessNode() {
  syncProcessNode(selectedProcessNode.value);
  syncNodeData();
}

function applyInferredProcessNodeInputs(record = {}, node = {}) {
  const incoming = inferIncomingPortContract(node.id);
  if (!incoming) return;
  if (['entityRef', 'fieldRead'].includes(record.kind) && incoming.entityType) {
    record.entityType = incoming.entityType;
  }
  if (record.kind === 'collection' && incoming.entityType) {
    record.entityType = incoming.entityType;
  }
  if (['blockRead', 'blockCompose'].includes(record.kind) && incoming.block) {
    record.block = incoming.block;
    record.entityType = incoming.entityType || record.entityType || '';
  }
}

function processNodeNeedsSourceEntity(node = {}) {
  return node.kind === 'entityRef' || node.kind === 'fieldRead' || node.kind === 'collection';
}

function processNodeNeedsResultEntity(node = {}) {
  return node.kind === 'entityRef' && ['parent', 'children', 'related'].includes(node.mode || node.operation);
}

function processNodeSourceEntityLabel(node = {}) {
  if (node.kind === 'collection') return t('processDesigner.collectionEntity');
  if (node.kind === 'fieldRead') return t('processDesigner.entityToDecompose');
  if (node.kind === 'entityRef' && node.mode === 'children') return t('processDesigner.parentEntity');
  if (node.kind === 'entityRef' && node.mode === 'parent') return t('processDesigner.childEntity');
  return t('processDesigner.sourceEntity');
}

function processNodeResultEntityLabel(node = {}) {
  if (node.kind === 'entityRef' && node.mode === 'children') return t('processDesigner.childEntity');
  if (node.kind === 'entityRef' && node.mode === 'parent') return t('processDesigner.parentEntity');
  return t('processDesigner.relatedEntity');
}

function processNodeOperationLabel(kind = '') {
  if (kind === 'stringOp') return t('processDesigner.textTransform');
  if (kind === 'compare') return t('processDesigner.condition');
  if (kind === 'logic') return t('processDesigner.booleanRule');
  if (kind === 'collection') return t('processDesigner.collectionResult');
  return t('processDesigner.operation');
}

function defaultProcessNodeValueType(kind = '') {
  if (kind === 'compare' || kind === 'logic') return 'boolean';
  if (kind === 'collection') return 'number';
  return 'string';
}

function defaultProcessNodeOperation(kind = '') {
  return (processNodeOperations[kind] || [''])[0] || '';
}

function processNodeOperationOptions(kind = '') {
  return (processNodeOperations[kind] || []).map(value => ({ label: processNodeOperationLabels[value] || value, value }));
}

function processNodeInputs(node = {}) {
  if (node.kind === 'entityRef' && ['parent', 'children', 'related'].includes(node.mode)) {
    return [{ id: 'entity', label: node.entityType || t('processDesigner.incomingEntity'), kind: 'entity', entityType: node.entityType || '' }];
  }
  if (node.kind === 'fieldRead') {
    return [{ id: 'entity', label: node.entityType || t('processDesigner.incomingEntity'), kind: 'entity', entityType: node.entityType || '' }];
  }
  if (node.kind === 'blockRead') {
    return [{ id: 'block', label: node.block || 'block', kind: 'block', block: node.block || '' }];
  }
  if (node.kind === 'blockCompose') {
    return [
      { id: 'block', label: node.block || 'block', kind: 'block', block: node.block || '', required: false },
      { id: 'value', label: node.path || 'value', kind: 'data', dataPath: node.path || '' }
    ];
  }
  if (node.kind === 'stringOp') return [{ id: 'value', label: 'value', kind: 'data' }];
  if (node.kind === 'compare') return [{ id: 'left', label: 'left', kind: 'data' }, { id: 'right', label: 'right', kind: 'data', required: false }];
  if (node.kind === 'logic') return [{ id: 'left', label: 'left', kind: 'data' }, { id: 'right', label: 'right', kind: 'data', required: node.operation !== 'not' }];
  if (node.kind === 'collection') return [{ id: 'items', label: node.entityType || 'items', kind: 'entity_list', entityType: node.entityType || '' }];
  return [];
}

function processNodeOutputs(node = {}) {
  if (node.kind === 'entityRef') {
    const entityType = node.relationEntityType || node.entityType || '';
    const multiple = node.mode === 'children' || (node.mode === 'related' && node.relationCardinality === 'many');
    return [{ id: 'entity', label: entityType || (multiple ? 'entities' : 'entity'), kind: multiple ? 'entity_list' : 'entity', entityType, multiple }];
  }
  if (node.kind === 'fieldRead') return standardBlocksForEntity(node.entityType).map(block => ({
    id: block.id,
    label: block.label,
    kind: 'block',
    block: block.id,
    entityType: node.entityType
  }));
  if (node.kind === 'blockRead') return [{ id: 'value', label: node.path || 'value', kind: node.valueType || 'data', block: node.block || '', dataPath: node.path || '' }];
  if (node.kind === 'blockCompose') return [{ id: 'block', label: node.block || 'block', kind: 'block', block: node.block || '', dataPath: node.path || '' }];
  if (node.kind === 'collection' && node.operation === 'first') return [{ id: 'entity', label: node.entityType || 'entity', kind: 'entity', entityType: node.entityType || '' }];
  if (node.kind === 'collection' && node.operation === 'count') return [{ id: 'count', label: 'count', kind: 'number' }];
  if (node.kind === 'compare' || node.kind === 'logic') return [{ id: 'result', label: 'result', kind: 'boolean' }];
  if (node.kind === 'stringOp') return [{ id: 'value', label: 'value', kind: 'string' }];
  return [];
}

function processNodeSummary(node = {}) {
  return [node.relationKey, node.relationEntityType || node.entityType, node.block, node.path].filter(Boolean).join(' · ');
}

function relationOptionsForEntity(entityType = '') {
  return (cncDomain.relations || [])
    .filter(relation => relation.ownerType === entityType)
    .map(relation => ({
      label: `${relation.key} · ${relation.targetType} · ${relation.cardinality}`,
      value: relation.key
    }));
}

function relationForNode(node = {}) {
  return (cncDomain.relations || []).find(relation => (
    relation.ownerType === node.entityType && relation.key === node.relationKey
  ));
}

function declaredRelationsForProfile(profile = {}) {
  const keys = new Set(profile.relations || []);
  return (cncDomain.relations || []).filter(relation => relation.ownerType === profile.entityType && keys.has(relation.key));
}

function declaredRelationsForEntity(entityType = '') {
  const profiles = Object.values(draft.value?.data?.entityProfiles || {}).filter(profile => profile.entityType === entityType);
  if (!profiles.length) return [];
  const keys = new Set(profiles.flatMap(profile => profile.relations || []));
  return (cncDomain.relations || []).filter(relation => relation.ownerType === entityType && keys.has(relation.key));
}

function processNodeDisplayLabel(node = {}) {
  if (node.kind === 'fieldRead') return t('processDesigner.useDecomposeEntity');
  if (node.kind === 'blockRead') return t('processDesigner.useReadField');
  if (node.kind === 'blockCompose') return t('processDesigner.useComposeBlock');
  return processNodeOperationLabels[node.kind === 'entityRef' ? (node.mode || node.operation || 'current') : node.operation] || node.kind || '';
}

function iconForProcessNode(kind = '') {
  return ({
    entityRef: 'pi pi-share-alt',
    fieldRead: 'pi pi-box',
    blockRead: 'pi pi-search',
    blockCompose: 'pi pi-pencil',
    stringOp: 'pi pi-align-left',
    compare: 'pi pi-equals',
    logic: 'pi pi-code-branch',
    collection: 'pi pi-list'
  })[kind] || 'pi pi-sitemap';
}

function fieldLabel(entityType = '', path = '') {
  return fieldOptions(entityType).find(option => option.value === path)?.label || path || t('processDesigner.field');
}

function blockForPath(path = '') {
  const root = String(path || '').split('.')[0];
  if (designer.blocks.some(block => block.id === root)) return root;
  return 'data';
}

function defaultPathForBlock(block = 'data') {
  return designer.blocks.find(item => item.id === block)?.defaultPath || 'data.value';
}

function normalizeBlockPath(block = 'data', path = '') {
  const clean = String(path || '').trim();
  if (!clean) return defaultPathForBlock(block);
  if (clean.startsWith(`${block}.`)) return clean;
  if (designer.blocks.some(item => clean.startsWith(`${item.id}.`))) return clean;
  return `${block}.${clean}`;
}

function iconForBlock(block = 'data') {
  return designer.blocks.find(item => item.id === block)?.icon || 'pi pi-database';
}

function syncSelectedValueInputPath() {
  selectedValueInput.value.path = defaultPathForBlock(selectedValueInput.value.block);
  selectedValueInput.value.icon = iconForBlock(selectedValueInput.value.block);
  selectedValueInput.value.label = selectedValueInput.value.path;
}

function initialSocketStatus(socket = {}) {
  if (socket.receiverLifecycle?.mode !== 'custom') return '';
  const workflow = socket.receiverLifecycle.workflow;
  const region = workflow?.regions?.[workflow.primaryRegion] || Object.values(workflow?.regions || {})[0];
  return region?.initial || '';
}

function initialStatusForEntity(entityType) {
  const profile = Object.values(draft.value?.data?.entityProfiles || {}).find(item => item.entityType === entityType);
  if (!profile) return '';
  const workflow = workflowForEntity(profile);
  const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
  return region?.initial || '';
}

function actionKindLabel(actionKind) {
  return actionKindOptions.find(option => option.value === actionKind)?.label || '';
}

function nodeDisplayLabel(record = {}, node = {}) {
  if (node.type === 'action') return actionTitleLabel(record) || actionKindLabel(record.actionKind) || record.entityType || record.commandId || node.data?.label || '';
  return record.label || record.entityType || record.commandId || node.data?.label || '';
}

function actionHeaderLabel(action = {}) {
  if (isStatusUpdate(action)) return `${actionKindLabel(action.actionKind)} · ${statusTargetLabel(action)}`;
  return actionKindLabel(action.actionKind);
}

function actionTitleLabel(action = {}) {
  const explicit = String(action.label || '').trim();
  if (explicit && !isGenericDesignerActionLabel(explicit, action.actionKind)) return explicit;
  if (isStatusUpdate(action)) return statusTargetLabel(action) || t('processDesigner.targetStatus');
  if (action.actionKind === 'runCommand') {
    return commandOptions.value.find(option => option.value === action.commandId)?.label || action.commandId || action.id || '';
  }
  return actionEntityType(action) || actionKindLabel(action.actionKind) || action.id || '';
}

function isStatusUpdate(action = {}) {
  return action.actionKind === 'updateEntity' && Boolean(action.statusRef || action.status?.to || action.access?.statusTo);
}

function statusTargetLabel(action = {}) {
  const definition = action.statusRef ? draft.value?.data?.statusDefinitions?.[action.statusRef] : null;
  return definition?.label
    || definition?.statusId
    || action.status?.label
    || action.status?.to
    || action.access?.statusTo
    || action.outputs?.find(output => output.status)?.status
    || '';
}

function isGenericDesignerActionLabel(label, actionKind = '') {
  const normalized = String(label || '').trim().toLowerCase();
  if (!normalized) return false;
  return genericActionLabels.has(normalized) || normalized === String(actionKind || '').toLowerCase();
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
  if (mode === 'event') return 'event';
  return 'manual';
}

function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

function normalizeDesignerAccess(access = {}) {
  const level = normalizeAccessLevel(access?.level);
  const grants = Array.isArray(access?.grants)
    ? access.grants
        .filter(grant => grant?.roleId)
        .map(grant => ({ roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
    : (access?.roleIds || []).map(roleId => ({ roleId, level }));
  const normalizedLevel = grants.reduce((current, grant) => (
    accessLevelRank[grant.level] > accessLevelRank[current] ? grant.level : current
  ), level);
  return {
    ...(access || {}),
    level: normalizedLevel,
    roleIds: [...new Set(grants.map(grant => grant.roleId))],
    grants
  };
}

function addSelectedActionGrant() {
  const used = new Set(selectedActionGrants.value.map(grant => grant.roleId));
  const role = roleOptions.value.find(option => !used.has(option.value));
  if (!role) return;
  setSelectedActionGrants([...selectedActionGrants.value, { roleId: role.value, level: 'write' }]);
}

function updateSelectedActionGrant(index, updates = {}) {
  setSelectedActionGrants(selectedActionGrants.value.map((grant, grantIndex) => (
    grantIndex === index ? { ...grant, ...updates } : grant
  )));
}

function removeSelectedActionGrant(index) {
  setSelectedActionGrants(selectedActionGrants.value.filter((_, grantIndex) => grantIndex !== index));
}

function setSelectedActionGrants(grants = []) {
  const seen = new Set();
  const normalized = grants.filter(grant => {
    if (!grant.roleId || seen.has(grant.roleId)) return false;
    seen.add(grant.roleId);
    return true;
  });
  updateActionRecord(selectedAction.value.id, {
    access: {
      ...(selectedAction.value.access || {}),
      grants: normalized
    }
  }, { syncIo: true });
}

function createInputSockets(action = {}) {
  const contract = constructionContractForEntity(action.entityType);
  return constructionInputsForMode(contract, action.construction?.mode).map(input => ({
    ...input,
    id: `data:${input.id || input.path}`,
    label: input.label || input.path,
    dataPath: input.path,
    kind: input.type || 'data',
    constructionInputId: input.id || input.path
  }));
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
    io.dataPath || '',
    io.capability || '',
    io.entityType || '',
    io.accepts?.length ? io.accepts.join(', ') : '',
    io.required ? t('processDesigner.required') : '',
    io.multiple ? t('processDesigner.multiple') : '',
    io.projection ? t('processDesigner.projectedFields') : '',
    io.fields?.length ? io.fields.join(', ') : ''
  ].filter(Boolean).join(' · ');
  return {
    id: io.id || io.entityType || detail,
    label: ioLabel(io),
    detail,
    kind: socketKind(io),
    required: Boolean(io.required)
  };
}

function socketKind(io = {}) {
  if (io.kind === 'event') return 'event';
  if (io.kind === 'status') return 'status';
  if (['string', 'number', 'boolean', 'json'].includes(io.kind)) return io.kind;
  if (io.kind === 'object') return 'json';
  if (io.kind === 'entity_list') return 'entity_list';
  if (io.projection) return 'projection';
  if (io.block) return 'block';
  if (io.entityType) return 'entity';
  if (io.kind) return io.kind;
  if (io.dataPath) return 'data';
  return 'data';
}

function commandInputs(command = {}) {
  const abstractInputs = command?.input?.abstractEntities || [];
  const acceptedTypes = new Set(abstractInputs.flatMap(input => input.accepts || []));
  const abstractPorts = abstractInputs.map(input => ({
    id: input.name || input.type || input.capability,
    label: input.label,
    entityType: input.type,
    capability: input.capability,
    accepts: input.accepts || [],
    required: Boolean(input.required),
    multiple: Boolean(input.multiple),
    abstract: Boolean(input.capability || input.accepts?.length),
    prompt: false
  }));
  const entityPorts = (command?.input?.entities || [])
    .filter(input => !acceptedTypes.has(input.type))
    .map(input => ({
      id: input.name || input.type,
      label: input.label || input.name || input.type,
      entityType: input.type,
      kind: 'entity',
      required: Boolean(input.required),
      prompt: true,
      path: `entities.${input.name || input.type}`
    }));
  const parameterPorts = (command?.input?.parameters || []).map(input => ({
    id: input.name,
    label: input.label || input.name,
    kind: input.type === 'object' ? 'json' : input.type || 'data',
    type: input.type || 'string',
    options: input.options || [],
    default: input.default ?? null,
    required: Boolean(input.required),
    prompt: input.display !== 'hidden',
    path: `parameters.${input.name}`,
    dataPath: `parameters.${input.name}`,
    entityType: input.entityType || '',
    editor: input.editor || '',
    templateFieldId: input.templateFieldId || ''
  }));
  return [...abstractPorts, ...entityPorts, ...parameterPorts];
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

function principalLabels(principalIds = []) {
  return principalIds.map(principalId => servicePrincipals.value[principalId]?.label || principalId).filter(Boolean);
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
  if (profile.lifecycle?.mode === 'domainDefault' && cncDomain.workflows?.[profile.entityType]) return normalizeWorkflow(cncDomain.workflows[profile.entityType]);
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
  if (node.type === 'action') syncActionIo(record, node);
  if (node.type === 'entity') syncEntityProfileIo(record);
  if (node.type === 'socket') syncSocketIo(record);
  if (node.type === 'statusDefinition') syncStatusDefinition(record);
  if (node.type === 'valueInput') syncValueInput(record);
  if (node.type === 'processNode') applyInferredProcessNodeInputs(record, node);
  if (node.type === 'processNode') syncProcessNode(record);
  return {
    ...node,
    data: {
      ...(node.data || {}),
      label: nodeDisplayLabel(record, node),
      entityType: record.entityType,
      commandId: record.commandId,
      actionKindLabel: node.type === 'action' ? actionHeaderLabel(record) : null,
      actionTitleLabel: node.type === 'action' ? actionTitleLabel(record) : null,
      actionRecord: node.type === 'action' ? record : null,
      entityTypeOptions: node.type === 'action' ? entityTypeOptions.value : [],
      commandOptions: node.type === 'action' ? commandOptions.value : [],
      roleOptions: node.type === 'action' ? actionRoleOptions(record, node) : [],
      effectiveAccessLabels: node.type === 'action' ? effectiveActionAccessLabels(record, node) : [],
      inheritedAccessLabels: node.type === 'action' ? inheritedActionAccessLabels(record, node) : [],
      accessLevelOptions: node.type === 'action' ? accessLevelOptions : [],
      triggerModeOptions: node.type === 'action' ? localizedTriggerModeOptions() : [],
      fieldOptions: node.type === 'action' ? fieldOptions(actionEntityType(record) || inferIncomingEntityContract(node.id).entityType) : [],
      onActionUpdate: node.type === 'action' ? (updates, options = {}) => updateActionRecord(record.id || node.data?.refId, updates, options) : null,
      onActionResetAccess: node.type === 'action' ? () => resetActionAccess(record.id || node.data?.refId) : null,
      triggerMode: record.trigger?.mode,
      eventLabel: node.type === 'action' ? (record.events?.[0]?.label || t('processDesigner.actionCompleted')) : null,
      direction: record.direction,
      lifecycleMode: record.lifecycle?.mode,
      roleCount: record.allowedRoles ? countRoleBindings(record.allowedRoles) : normalizeDesignerAccess(record.access).grants.length,
      runPrincipalLabels: principalLabels(record.access?.runPrincipals || []),
      sendRoleLabels: roleLabels(record.access?.sendRoles || []),
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
      projection: record.projection || null,
      statusId: record.statusId,
      severity: record.severity,
      color: record.color,
      icon: record.icon,
      valueType: record.valueType,
      block: record.block,
      path: record.path,
      kind: record.kind,
      kindLabel: node.type === 'processNode' ? processNodeDisplayLabel(record) : record.kind,
      summary: processNodeSummary(record)
    }
  };
}

function updateActionRecord(actionId, updates = {}, options = {}) {
  const action = draft.value?.data?.actions?.[actionId];
  if (!action) return;
  Object.assign(action, updates);
  if (updates.access && !options.inheritAccess) {
    action.access = normalizeDesignerAccess(action.access);
    action.access.modified = true;
  }
  if (updates.status && action.actionKind === 'updateEntity') {
    action.access = normalizeDesignerAccess(action.access);
    action.access.statusFrom = action.status?.from || '';
    action.access.statusTo = action.status?.to || '';
  }
  if (options.syncIo) syncActionIo(action, selectedNode.value);
  syncNodeData();
}

function resetActionAccess(actionId) {
  const action = draft.value?.data?.actions?.[actionId];
  if (!action || action.actionKind !== 'updateEntity') return;
  const node = nodes.value.find(item => item.data?.refId === actionId);
  const inherited = node ? inferIncomingEntityContract(node.id).access : null;
  if (!inherited?.grants?.length) return;
  action.access = {
    ...(action.access || {}),
    grants: inherited.grants.map(grant => ({ ...grant })),
    modified: false
  };
  action.access = normalizeDesignerAccess(action.access);
  syncActionIo(action, node);
  syncNodeData();
}

function stripRuntimeNodeData(node) {
  const data = { ...(node.data || {}) };
  for (const key of [
    'actionRecord',
    'entityTypeOptions',
    'commandOptions',
    'roleOptions',
    'effectiveAccessLabels',
    'inheritedAccessLabels',
    'accessLevelOptions',
    'triggerModeOptions',
    'fieldOptions',
    'onActionUpdate',
    'onActionResetAccess'
  ]) {
    delete data[key];
  }
  return { ...node, data };
}

function stripRuntimeEdgeData(edge) {
  const { animated, style, selected, ...rest } = edge;
  return rest;
}

function workflowStateLabels(record) {
  if (!record?.lifecycle) return [];
  const workflow = workflowForEntity(record);
  const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
  return Object.entries(region?.states || {})
    .filter(([key]) => !key.includes('.'))
    .map(([key, state]) => state.label || key)
    .slice(0, 5);
}

function workflowTransitionCount(record) {
  if (!record?.lifecycle) return 0;
  return Object.values(workflowForEntity(record).regions || {}).reduce((total, region) => total + (region.transitions?.length || 0), 0);
}

function countRoleBindings(access = {}) {
  return ['read', 'write', 'admin', 'sendRoles', 'receiveRoles']
    .reduce((total, key) => total + (access[key]?.length || 0), 0);
}

function countFieldBindings(fields = {}) {
  return (fields.read?.length || 0) + (fields.write?.length || 0) + (fields.private?.length || 0);
}

function fieldOptions(entityType) {
  return designer.fieldsForEntity(entityType);
}

function fieldOptionsForBlock(block = '', entityType = '') {
  if (entityType) return designer.fieldsForEntity(entityType, block).filter(option => !option.value.endsWith('.*'));
  const options = designer.entityOptions.flatMap(option => designer.fieldsForEntity(option.value, block));
  return [...new Map(options.map(option => [option.value, option])).values()]
    .filter(option => !option.value.endsWith('.*'));
}

function fieldPolicyForEntity(entityType) {
  return entityType ? designer.fieldPolicy(entityType) : {};
}

function syncEntityDefaults() {
  selectedEntity.value.label = selectedEntity.value.entityType;
  selectedEntity.value.relations = relationOptionsForEntity(selectedEntity.value.entityType).map(option => option.value);
  selectedEntity.value.fields ||= { read: [], write: [], private: [] };
  if (!selectedEntity.value.fields.read?.length) {
    selectedEntity.value.fields.read = ['identity.*', 'status.*', 'lineage.*']
      .filter(path => fieldOptionsForSelectedEntity.value.some(item => item.value === path));
  }
  syncEntityProfileIo(selectedEntity.value);
  syncNodeData();
}

function syncServiceFromCommand() {
  const command = cncDomain.commands?.[selectedService.value.commandId];
  if (!command) return;
  selectedService.value.label = command.label || command.id;
  selectedService.value.serviceType = command.service;
  selectedService.value.inputs = commandInputs(command);
  selectedService.value.outputs = commandOutputs(command);
}

function roleAccessSummary(roleId) {
  const items = [];
  for (const profile of Object.values(draft.value?.data?.entityProfiles || {})) {
    for (const level of ['read', 'write', 'admin']) {
      if ((profile.allowedRoles?.[level] || []).includes(roleId)) items.push(`${profile.entityType}:${level}`);
    }
  }
  for (const action of Object.values(draft.value?.data?.actions || {})) {
    if (normalizeDesignerAccess(action.access).roleIds.includes(roleId)) {
      const summary = actionAccessSummary(action);
      if (summary) items.push(summary);
    }
  }
  for (const screen of Object.values(draft.value?.data?.screens || {})) {
    if ((screen.roleIds || []).includes(roleId)) items.push(`${screen.label || screen.id}:screen`);
  }
  for (const profile of Object.values(draft.value?.data?.entityProfiles || {})) {
    for (const region of Object.values(workflowForEntity(profile).regions || {})) {
      for (const transition of region.transitions || []) {
        if ((transition.access?.processRoleIds || []).includes(roleId)) items.push(`${profile.entityType}:${transition.from}->${transition.to}`);
      }
    }
  }
  return [...new Set(items)];
}

function onConnect(connection) {
  syncNodeData();
  const compatibility = connectionCompatibility(connection);
  if (!compatibility.ok) {
    toast.add({
      severity: 'warn',
      summary: t('processDesigner.incompatiblePorts'),
      detail: t('processDesigner.incompatiblePortsDetail', {
        source: compatibility.source?.label || compatibility.source?.id || t('processDesigner.source'),
        target: compatibility.target?.label || compatibility.target?.id || t('processDesigner.target')
      }),
      life: 3000
    });
    return;
  }
  selectedEdgeId.value = null;
  edges.value.push(decorateEdge({
    ...connection,
    id: `${connection.source}-${connection.sourceHandle}-${connection.target}-${connection.targetHandle}-${Date.now()}`,
    type: 'default',
    data: { kind: connection.sourceHandle || connection.targetHandle || 'link' }
  }));
  applySemanticConnection(connection);
  syncEdgeSelection();
  syncInferredActionInputs();
}

function connectionCompatibility(connection = {}) {
  const source = nodes.value.find(item => item.id === connection.source);
  const target = nodes.value.find(item => item.id === connection.target);
  if (!source || !target) return { ok: true };
  const process = processDefinitionSnapshot();
  const sourcePort = resolveNodePort(process, source, connection.sourceHandle, 'output');
  const targetPort = resolveNodePort(process, target, connection.targetHandle, 'input');
  if (!sourcePort || !targetPort) return { ok: true };
  return {
    ...portSpecsCompatible(sourcePort, targetPort),
    source: sourcePort,
    target: targetPort
  };
}

function applySemanticConnection(connection = {}) {
  const source = nodes.value.find(item => item.id === connection.source);
  const target = nodes.value.find(item => item.id === connection.target);
  if (!source || !target) return;
  const action = target.type === 'action' ? draft.value?.data?.actions?.[target.data?.refId] : null;
  const entityProfile = target.type === 'entity' ? draft.value?.data?.entityProfiles?.[target.data?.refId] : null;

  if (source.type === 'statusDefinition') {
    const status = draft.value?.data?.statusDefinitions?.[source.data?.refId];
    if (!status) return;
    syncStatusDefinition(status);
    if (entityProfile) {
      applyStatusDefinitionToEntity(status, entityProfile);
      syncEntityProfileIo(entityProfile);
      syncNodeData();
      return;
    }
    if (!action) return;
    action.statusRef = status.id || source.data?.refId;
    action.status ||= {};
    action.status.to = status.statusId;
    action.access = normalizeDesignerAccess(action.access);
    action.access.statusTo = status.statusId;
    syncActionIo(action, target);
    return;
  }

  if (source.type === 'valueInput') {
    const input = draft.value?.data?.valueInputs?.[source.data?.refId];
    if (!input) return;
    syncValueInput(input);
    if (entityProfile) {
      applyValueInputToEntity(input, entityProfile);
      syncEntityProfileIo(entityProfile);
      syncNodeData();
      return;
    }
    if (!action) return;
    applyValueInputToAction(input, action, source.data?.refId, connection);
    syncActionIo(action, target);
    return;
  }

  if (action?.actionKind === 'updateEntity') {
    const relationKey = relationKeyFromHandle(connection.targetHandle);
    const entityType = actionEntityType(action) || inferIncomingEntityContract(target.id).entityType;
    const relation = declaredRelationsForEntity(entityType).find(item => item.key === relationKey);
    if (relation) {
      action.mutation ||= { fields: [] };
      const path = `relations.${relation.key}`;
      if (!action.mutation.fields.includes(path)) action.mutation.fields = [...action.mutation.fields, path];
      syncActionIo(action, target);
      return;
    }
  }

  if (source.type === 'entity' && action) {
    syncActionIo(action, target);
  }
}

function applyStatusDefinitionToEntity(status = {}, profile = {}) {
  profile.lifecycle = {
    mode: 'custom',
    workflow: workflowForEntity(profile)
  };
  const region = ensureLifecycleRegion(profile);
  region.states[status.statusId] = {
    ...(region.states[status.statusId] || {}),
    label: status.label || status.statusId,
    color: status.color || status.severity || 'info',
    severity: status.severity || status.color || 'info',
    icon: status.icon || 'pi pi-circle-fill',
    canUpdateMeta: true
  };
  if (!region.initial) region.initial = status.statusId;
}

function applyValueInputToEntity(input = {}, profile = {}) {
  const path = input.path || defaultPathForBlock(input.block);
  profile.fields ||= { read: [], write: [], private: [] };
  const target = input.block === 'attachments' ? 'private' : 'write';
  if (!profile.fields.read.includes(path)) profile.fields.read.push(path);
  if (!profile.fields[target].includes(path)) profile.fields[target].push(path);
}

function ensureLifecycleRegion(profile = {}) {
  const workflow = normalizeWorkflow(profile.lifecycle?.workflow || createCreatedWorkflow());
  profile.lifecycle ||= {};
  profile.lifecycle.workflow = workflow;
  const regionId = workflow.primaryRegion || 'main';
  workflow.regions[regionId] ||= { id: regionId, label: 'Lifecycle', initial: '', states: {}, transitions: [] };
  return workflow.regions[regionId];
}

function applyValueInputToAction(input = {}, action = {}, inputId = '', connection = {}) {
  const targetId = String(connection.targetHandle || '').replace(/^input:/, '').replace(/^data:/, '');
  const field = fieldContractFromValueInput(input, inputId);

  if (action.actionKind === 'updateEntity') {
    action.mutation ||= { fields: [] };
    if (!action.mutation.fields.includes(field.path)) action.mutation.fields = [...action.mutation.fields, field.path];
    upsertInputPolicyField(action, field);
    return;
  }

  if (action.actionKind === 'createEntity') {
    const targetField = findConstructionField(action, targetId);
    upsertInputPolicyField(action, fieldForTargetSocket(field, targetField, targetId));
    return;
  }

}

function findConstructionField(action = {}, targetId = '') {
  const inputs = [
    ...(action.construction?.inputs || []),
    ...(constructionContractForEntity(action.entityType).inputs || [])
  ];
  return inputs.find(input =>
    input.id === targetId ||
    input.path === targetId ||
    `data:${input.id}` === targetId ||
    `data:${input.path}` === targetId
  ) || null;
}

function fieldForTargetSocket(field = {}, targetField = null, targetId = '') {
  if (!targetField) return { ...field, id: targetId || field.id };
  return {
    ...field,
    ...targetField,
    id: targetField.id || targetId || field.id,
    label: targetField.label || field.label,
    path: targetField.path || field.path,
    type: targetField.type || field.type,
    prompt: false,
    required: Boolean(targetField.required && field.default === undefined),
    default: field.default,
    valueRef: field.valueRef
  };
}

function fieldContractFromValueInput(input = {}, inputId = '') {
  return {
    id: input.id || inputId || input.path,
    label: input.label || input.path,
    path: input.path,
    type: input.valueType || 'string',
    prompt: false,
    required: false,
    default: parseValueInput(input),
    valueRef: input.id || inputId || ''
  };
}

function upsertInputPolicyField(action = {}, field = {}) {
  action.inputPolicy ||= { prompt: true, fields: [] };
  const fields = action.inputPolicy.fields || [];
  const index = fields.findIndex(item => item.id === field.id || item.path === field.path);
  if (index >= 0) fields[index] = { ...fields[index], ...field };
  else fields.push(field);
  action.inputPolicy = {
    ...action.inputPolicy,
    prompt: fields.some(item => item.prompt !== false),
    fields: [...fields]
  };
}

function parseValueInput(input = {}) {
  if (input.valueType === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
  }
  if (input.valueType === 'object') return parseJson(input.value || '{}', {});
  return input.value ?? '';
}

function iconLabel(value = '') {
  return statusIconOptions.find(option => option.value === value)?.label || value || '';
}

function syncInferredActionInputs() {
  for (const node of nodes.value.filter(item => item.type === 'action')) {
    const action = draft.value?.data?.actions?.[node.data?.refId];
    if (!action || action.actionKind !== 'updateEntity') continue;
    const statusEdge = edges.value.find(edge => {
      if (edge.target !== node.id) return false;
      const source = nodes.value.find(item => item.id === edge.source);
      return source?.type === 'statusDefinition';
    });
    if (statusEdge) {
      const source = nodes.value.find(item => item.id === statusEdge.source);
      const status = draft.value?.data?.statusDefinitions?.[source?.data?.refId];
      if (status) {
        syncStatusDefinition(status);
        action.statusRef = status.id || source.data?.refId;
        action.status ||= {};
        action.status.to = status.statusId;
        action.access = normalizeDesignerAccess(action.access);
        action.access.statusTo = status.statusId;
      }
    } else if (action.statusRef) {
      delete action.statusRef;
      action.status ||= {};
      action.status.to = '';
      action.access = normalizeDesignerAccess(action.access);
      action.access.statusTo = '';
    }
    const inferred = inferIncomingEntityContract(node.id);
    const entityInput = action.inputs?.find(input => input.id === 'entity');
    if (entityInput && inferred.entityType) entityInput.entityType = inferred.entityType;
    if (!action.status?.from && inferred.status) {
      action.status ||= {};
      action.status.from = inferred.status;
    }
    const entityType = inferred.entityType || actionEntityType(action);
    for (const relation of declaredRelationsForEntity(entityType)) {
      const connected = edges.value.some(edge => edge.target === node.id && relationKeyFromHandle(edge.targetHandle) === relation.key);
      const path = `relations.${relation.key}`;
      action.mutation ||= { fields: [] };
      action.mutation.fields = connected
        ? [...new Set([...(action.mutation.fields || []), path])]
        : (action.mutation.fields || []).filter(field => field !== path);
    }
    syncActionIo(action, node);
  }
  syncNodeData();
}

function relationKeyFromHandle(handle = '') {
  const normalized = String(handle || '').replace(/^input:/, '');
  return normalized.startsWith('relation:') ? normalized.slice('relation:'.length) : '';
}

function inferIncomingEntityContract(nodeId) {
  const edge = edges.value.find(item => item.target === nodeId && String(item.targetHandle || '').startsWith('input'));
  if (!edge) return {};
  const source = nodes.value.find(item => item.id === edge.source);
  const sourceRecord = source?.data?.refId ? draft.value?.data?.[recordKeyForType(source.type)]?.[source.data.refId] : null;
  const sourceOutputs = sourceRecord?.outputs || [];
  const handleId = String(edge.sourceHandle || '');
  const match = sourceOutputs.find((output, index) => socketHandleIdForRecord('output', output, index, sourceOutputs) === handleId)
    || sourceOutputs.find(output => output.entityType);
  return {
    entityType: match?.entityType || sourceRecord?.entityType || '',
    status: typeof match?.status === 'string' ? match.status : '',
    access: sourceRecord?.access ? {
      level: normalizeDesignerAccess(sourceRecord.access).level,
      roleIds: [...normalizeDesignerAccess(sourceRecord.access).roleIds],
      grants: normalizeDesignerAccess(sourceRecord.access).grants.map(grant => ({ ...grant }))
    } : null
  };
}

function inferIncomingPortContract(nodeId) {
  const edge = edges.value.find(item => item.target === nodeId && String(item.targetHandle || '').startsWith('input'));
  if (!edge) return null;
  const source = nodes.value.find(item => item.id === edge.source);
  const sourceRecord = source?.data?.refId ? draft.value?.data?.[recordKeyForType(source.type)]?.[source.data.refId] : null;
  const sourceOutputs = sourceRecord?.outputs || [];
  const handleId = String(edge.sourceHandle || '');
  const match = sourceOutputs.find((output, index) => socketHandleIdForRecord('output', output, index, sourceOutputs) === handleId)
    || sourceOutputs.find(output => output.entityType || output.block);
  return match || null;
}

function socketHandleIdForRecord(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}

function actionRoleOptions() {
  return roleOptions.value;
}

function effectiveActionAccessLabels(action = {}, node = {}) {
  const entityType = actionEntityType(action) || inferIncomingEntityContract(node.id).entityType;
  if (!entityType) return [];
  const targetStatus = actionTargetStatus(action);
  const currentRoleIds = new Set(normalizeDesignerAccess(action.access).roleIds);
  const accessByRole = new Map();

  for (const profile of Object.values(draft.value?.data?.entityProfiles || {})) {
    if (profile.entityType !== entityType) continue;
    for (const level of ['read', 'write', 'admin']) {
      for (const roleId of profile.allowedRoles?.[level] || []) {
        addEffectiveRoleAccess(accessByRole, roleId, level, '');
      }
    }
  }

  for (const otherAction of Object.values(draft.value?.data?.actions || {})) {
    if ((otherAction.id || '') === (action.id || '')) continue;
    if (actionEntityType(otherAction) !== entityType) continue;
    const otherStatus = actionTargetStatus(otherAction);
    if (targetStatus && otherStatus && targetStatus !== otherStatus) continue;
    for (const grant of normalizeDesignerAccess(otherAction.access).grants) {
      addEffectiveRoleAccess(accessByRole, grant.roleId, normalizeAccessLevel(grant.level), otherStatus);
    }
  }

  return [...accessByRole.values()]
    .filter(item => !currentRoleIds.has(item.roleId))
    .map(item => [item.label, item.level].filter(Boolean).join(' · '));
}

function inheritedActionAccessLabels(action = {}, node = {}) {
  if (action.actionKind !== 'updateEntity') return [];
  const inherited = inferIncomingEntityContract(node.id).access;
  if (!inherited?.grants?.length) return [];
  return inherited.grants.map(grant => [
    roles.value[grant.roleId]?.label || grant.roleId,
    grant.level || 'write'
  ].join(' · '));
}

function addEffectiveRoleAccess(accessByRole, roleId, level, status) {
  const normalizedLevel = normalizeAccessLevel(level);
  const existing = accessByRole.get(roleId);
  if (!existing || accessLevelRank[normalizedLevel] > accessLevelRank[existing.level]) {
    accessByRole.set(roleId, {
      roleId,
      label: roles.value[roleId]?.label || roleId,
      level: normalizedLevel,
      status: status || existing?.status || ''
    });
  }
}

function actionAccessSummary(action = {}) {
  const entityType = actionEntityType(action);
  if (action.actionKind === 'updateEntity' && !entityType) return '';
  const status = actionTargetStatus(action);
  const subject = entityType || action.label || action.id || action.actionKind;
  return [
    [subject, normalizeAccessLevel(action.access?.level)].filter(Boolean).join(':'),
    status ? `when ${status}` : ''
  ].filter(Boolean).join(' ');
}

function actionEntityType(action = {}) {
  return action.entityType
    || action.outputs?.find(output => output.entityType)?.entityType
    || action.inputs?.find(input => input.entityType)?.entityType
    || '';
}

function actionTargetStatus(action = {}) {
  return action.access?.statusTo
    || action.status?.to
    || action.outputs?.find(output => typeof output.status === 'string')?.status
    || '';
}
</script>
