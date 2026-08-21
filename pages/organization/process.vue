<template>
  <StandardPage workspace>
    <DesignerSurface>
      <DesignerWorkspace
        ref="canvasFrame"
        layout="canvas"
        class="relative h-full min-h-0 overflow-hidden bg-process-canvas"
        @mousedown.capture="handleDesignerPointerDown"
        @focusin="handleDesignerFocus"
        @wheel.capture="handleDesignerWheel"
      >
      <ClientOnly>
        <VueFlow
          v-model:nodes="nodes"
          v-model:edges="edges"
          class="process-designer-canvas absolute inset-0 h-full w-full"
          :min-zoom="0.1"
          :max-zoom="4"
          :delete-key-code="null"
          :selection-key-code="true"
          multi-selection-key-code="Shift"
          :selection-mode="SelectionMode.Partial"
          :pan-on-drag="false"
          pan-activation-key-code="Space"
          :pan-on-scroll="true"
          :zoom-on-scroll="false"
          :zoom-on-pinch="true"
          :zoom-on-double-click="false"
          :default-edge-options="defaultEdgeOptions"
          @node-click="event => selectNode(event.node)"
          @edge-click="event => selectEdge(event.edge)"
          @pane-click="clearGraphSelection"
          @pane-context-menu="openPanePalette"
          @connect-start="beginSocketConnection"
          @connect-end="endSocketConnection"
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
        <template #fallback><div class="absolute inset-0" /></template>
      </ClientOnly>

      <div
        v-if="contextPalette.open"
        class="absolute z-30 flex max-h-80 w-72 flex-col gap-2 overflow-y-auto rounded-ui border border-content-border bg-content p-2 shadow-card"
        :style="{ left: `${contextPalette.x}px`, top: `${contextPalette.y}px` }"
        @mousedown.stop
        @click.stop
      >
        <div class="flex items-center gap-2">
          <InputText
            ref="contextPaletteSearch"
            v-model="contextPalette.query"
            size="small"
            class="min-w-0 flex-1"
            :placeholder="contextPalette.socket ? $t('processDesigner.compatibleOperations') : $t('processDesigner.addOperation')"
            @keydown.esc="closeContextPalette"
          />
          <Button icon="pi pi-times" text size="small" :aria-label="$t('processDesigner.closeOperationPalette')" @click="closeContextPalette" />
        </div>
        <div v-for="group in contextPaletteGroups" :key="group.id" class="flex flex-col gap-1">
          <span class="text-xs font-semibold text-muted-color">{{ paletteGroupLabel(group.id) }}</span>
          <Button
            v-for="item in group.items"
            :key="item.id"
            :icon="item.icon"
            :label="paletteLabel(item)"
            v-tooltip.right="paletteDescription(item)"
            size="small"
            text
            class="justify-start"
            @click="addContextNode(item)"
          />
        </div>
        <Message v-if="!contextPaletteGroups.length" severity="secondary" size="small">
          {{ $t('processDesigner.noCompatibleOperations') }}
        </Message>
      </div>

      <div v-if="!nodes.length" class="absolute inset-x-4 top-8 z-10 flex justify-center lg:left-[20rem] lg:right-[28rem]">
        <StateBlock :message="emptyCanvasMessage" />
      </div>

      <template v-if="paletteOpen" #palette>
        <div class="flex w-72 max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-ui border border-content-border bg-content p-3 shadow-card">
        <div class="flex items-center gap-1">
          <InputText v-model="paletteQuery" size="small" class="min-w-0 flex-1" :placeholder="$t('processDesigner.searchOperations')" />
        </div>
        <div v-for="group in paletteGroups" :key="group.id" class="flex flex-col gap-1.5">
          <span class="px-1 text-ui-caption font-semibold uppercase tracking-wide text-muted-color">{{ paletteGroupLabel(group.id) }}</span>
          <div class="grid grid-cols-2 gap-1.5">
            <Button
              v-for="item in group.items"
              :key="item.id"
              :icon="item.icon"
              :label="paletteLabel(item)"
              :aria-label="paletteLabel(item)"
              v-tooltip.right="paletteDescription(item)"
              size="small"
              text
              class="min-w-0 justify-start border border-transparent bg-subtle px-2 hover:border-content-border"
              @click="addNode(item)"
            />
          </div>
        </div>
        </div>
      </template>

      <template #dock>
        <MotionDock
          :items="designerDockItems"
          :aria-label="$t('processDesigner.title')"
          class-name="process-designer-dock"
        />
      </template>

      <Popover ref="processMenu" @hide="onDockPopoverHide('process')">
        <div
          class="flex min-w-72 flex-col gap-2"
          @mousedown.stop
          @click.stop
          @mouseenter="keepDockPopover('process')"
          @mouseleave="scheduleDockPopoverClose('process')"
          @focusin="keepDockPopover('process')"
        >
          <Select
            v-if="processOptions.length"
            :model-value="selectedProcessId"
            :options="processOptions"
            option-label="label"
            option-value="value"
            entity-type="processDefinition"
            class="w-full"
            size="small"
            :aria-label="$t('processDesigner.title')"
            @update:model-value="selectProcessDefinition"
            @show="pinDockPopover('process')"
            @hide="unpinDockPopover('process')"
          />
          <Button
            icon="pi pi-file-plus"
            :label="$t('processDesigner.newDraft')"
            size="small"
            severity="secondary"
            outlined
            :loading="creatingDraft"
            :disabled="creatingDraft || savingDraft || applyingProcess"
            @click="createDraftFromDock"
          />
        </div>
      </Popover>

      <Popover ref="canvasMenu" @hide="onDockPopoverHide('navigation')">
        <div
          class="grid grid-cols-5 gap-0.5"
          @mousedown.stop
          @click.stop
          @mouseenter="keepDockPopover('navigation')"
          @mouseleave="scheduleDockPopoverClose('navigation')"
          @focusin="keepDockPopover('navigation')"
        >
          <Button icon="pi pi-minus" text size="small" v-tooltip.top="$t('drawing.zoomOut')" :aria-label="$t('drawing.zoomOut')" @click="zoomCanvasOut" />
          <Button icon="pi pi-expand" text size="small" v-tooltip.top="$t('processDesigner.frameAll')" :aria-label="$t('processDesigner.frameAll')" @click="frameAllNodes" />
          <Button icon="pi pi-crosshairs" text size="small" v-tooltip.top="$t('processDesigner.frameSelection')" :aria-label="$t('processDesigner.frameSelection')" @click="frameSelectedNodes" />
          <Button icon="pi pi-plus" text size="small" v-tooltip.top="$t('drawing.zoomIn')" :aria-label="$t('drawing.zoomIn')" @click="zoomCanvasIn" />
          <Button icon="pi pi-refresh" text size="small" v-tooltip.top="$t('processDesigner.resetZoom')" :aria-label="$t('processDesigner.resetZoom')" @click="resetCanvasZoom" />
        </div>
      </Popover>

      <template v-if="inspectorOpen" #inspector>
        <aside class="flex w-[26rem] min-h-0 flex-col overflow-hidden rounded-ui border border-content-border bg-content shadow-card">
        <Tabs v-model:value="inspectTab" class="flex min-h-0 flex-1 flex-col">
          <TabList>
            <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
            <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
            <Tab value="screens">{{ $t('organization.screens') }}</Tab>
          </TabList>
          <TabPanels class="min-h-0 flex-1 overflow-y-auto">
            <TabPanel value="inspector">
              <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
                <div v-if="!['action', 'statusDefinition', 'processNode'].includes(selectedNode.type)" class="flex flex-col gap-1">
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
                  <div v-if="selectedAction.actionKind === 'createEntity' && (constructionModeOptions(selectedAction.entityType).length > 1 || selectedAction.entityType === 'artifact')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.constructionMode') }}</label>
                    <Select v-model="selectedAction.construction.mode" :options="constructionModeOptions(selectedAction.entityType)" option-label="label" option-value="value" @change="syncSelectedAction" />
                  </div>
                  <div v-if="selectedAction.actionKind === 'createEntity' && selectedAction.entityType === 'artifact'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.allowedArtifactCreation') }}</label>
                    <MultiSelect
                      :model-value="artifactCreationKinds(selectedAction)"
                      :options="artifactUploadKindOptions"
                      option-label="label"
                      option-value="value"
                      display="chip"
                      filter
                      :placeholder="$t('processDesigner.allUploadArtifactKinds')"
                      @update:model-value="value => updateArtifactCreationKinds(selectedAction, value)"
                    />
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
                  <div class="grid grid-cols-2 gap-2">
                    <div class="flex min-w-0 flex-col gap-1">
                      <label>{{ $t('processDesigner.severity') }}</label>
                      <Select
                        :model-value="selectedStatusDefinition.severity"
                        :options="statusSeverityOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => updateStatusDefinitionRecord(selectedStatusDefinition.id, { severity: value, color: value })"
                      />
                    </div>
                    <div class="flex min-w-0 flex-col gap-1">
                      <label>{{ $t('processDesigner.icon') }}</label>
                      <Select
                        :model-value="selectedStatusDefinition.icon"
                        :options="statusIconOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => updateStatusDefinitionRecord(selectedStatusDefinition.id, { icon: value })"
                      >
                        <template #option="{ option }">
                          <div class="flex items-center gap-2">
                            <i :class="option.value" aria-hidden="true"></i>
                            <span>{{ option.label }}</span>
                          </div>
                        </template>
                      </Select>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <Checkbox
                      :model-value="Boolean(selectedStatusDefinition.lifecycle?.description?.required)"
                      binary
                      input-id="selected-status-description"
                      @update:model-value="setSelectedStatusDescriptionRequired"
                    />
                    <label for="selected-status-description">{{ $t('processDesigner.requireDescription') }}</label>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.attachments') }}</label>
                      <Button icon="pi pi-plus" text size="small" :aria-label="$t('processDesigner.addAttachment')" @click="addSelectedStatusAttachment" />
                    </div>
                    <div v-for="entry in selectedStatusAttachmentEntries" :key="entry.key" class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] items-center gap-1">
                      <InputText :model-value="entry.key" size="small" @change="event => renameSelectedStatusLifecycleEntry('attachments', entry.key, event.target.value)" />
                      <Select
                        :model-value="entry.schema.kind"
                        :options="designer.attachmentKindOptions"
                        option-label="label"
                        option-value="value"
                        editable
                        size="small"
                        @update:model-value="value => updateSelectedStatusAttachment(entry.key, { kind: value })"
                      />
                      <Checkbox :model-value="Boolean(entry.schema.required)" binary @update:model-value="value => updateSelectedStatusAttachment(entry.key, { required: value })" />
                      <Button icon="pi pi-times" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeSelectedStatusAttachment(entry.key)" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.snapshots') }}</label>
                      <Button icon="pi pi-plus" text size="small" :aria-label="$t('processDesigner.addSnapshot')" @click="addSelectedStatusSnapshot" />
                    </div>
                    <div v-for="entry in selectedStatusSnapshotEntries" :key="entry.key" class="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-1">
                      <InputText :model-value="entry.key" size="small" @change="event => renameSelectedStatusLifecycleEntry('snapshots', entry.key, event.target.value)" />
                      <Select
                        :model-value="entry.schema.entityType"
                        :options="entityTypeOptions"
                        option-label="label"
                        option-value="value"
                        size="small"
                        @update:model-value="value => updateSelectedStatusSnapshot(entry.key, { entityType: value })"
                      />
                      <InputText
                        :model-value="entry.schema.lineageKey"
                        size="small"
                        :placeholder="$t('processDesigner.lineageKey')"
                        @update:model-value="value => updateSelectedStatusSnapshot(entry.key, { lineageKey: value })"
                      />
                      <Button icon="pi pi-times" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeSelectedStatusSnapshot(entry.key)" />
                    </div>
                  </div>
                  <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" outlined size="small" @click="removeStatusDefinition(selectedStatusDefinition.id)" />
                </template>

                <template v-else-if="selectedNode.type === 'valueInput'">
                  <Tag :value="processPortTypeLabel(selectedValueInput.outputs?.[0]?.kind || selectedValueInput.valueType)" severity="info" size="small" />
                </template>

                <template v-else-if="selectedNode.type === 'processNode'">
                  <div v-if="selectedProcessNode.kind && !selectedProcessNode.kind.startsWith('effect.') && !selectedProcessNode.kind.startsWith('control.') && !selectedProcessNode.kind.startsWith('source.')" class="flex flex-col gap-2">
                    <label>{{ $t('processDesigner.dataMatching') }}</label>
                    <Select v-model="selectedProcessNode.matching" :options="dataMatchingOptions" option-label="label" option-value="value" size="small" @change="syncNodeData" />
                    <div v-for="input in processNodeInputs(selectedProcessNode).filter(item => item.role === 'data')" :key="input.id" class="flex items-center gap-2 text-xs">
                      <span class="min-w-0 flex-1 truncate">{{ input.label }}</span>
                      <label class="flex items-center gap-1"><Checkbox :model-value="Boolean(selectedProcessNode.inputTransforms?.[input.id]?.simplify)" binary @update:model-value="value => updateInputTransform(selectedProcessNode, input.id, 'simplify', value)" />{{ $t('processDesigner.simplify') }}</label>
                      <label class="flex items-center gap-1"><Checkbox :model-value="Boolean(selectedProcessNode.inputTransforms?.[input.id]?.flatten)" binary @update:model-value="value => updateInputTransform(selectedProcessNode, input.id, 'flatten', value)" />{{ $t('processDesigner.flatten') }}</label>
                      <label class="flex items-center gap-1"><Checkbox :model-value="Boolean(selectedProcessNode.inputTransforms?.[input.id]?.graft)" binary @update:model-value="value => updateInputTransform(selectedProcessNode, input.id, 'graft', value)" />{{ $t('processDesigner.graft') }}</label>
                    </div>
                  </div>
                  <div v-if="selectedNodeSupportsPreview" class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.outputPreview') }}</label>
                      <Button icon="pi pi-refresh" :label="$t('processDesigner.refreshPreview')" size="small" text :loading="previewingData" @click="previewDataflow" />
                    </div>
                    <Message v-if="selectedNodePreview?.error" severity="error">{{ selectedNodePreview.error }}</Message>
                    <Message v-else-if="!selectedNodePreview" severity="secondary">{{ $t('processDesigner.previewHint') }}</Message>
                    <div v-else class="flex flex-col gap-2">
                      <section v-for="output in selectedNodePreviewOutputs" :key="output.id" class="rounded-ui border border-content-border bg-subtle p-2 text-xs">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <strong class="truncate">{{ output.label }}</strong>
                          <span class="text-muted">{{ $t('processDesigner.previewCounts', { branches: output.tree.branchCount, items: output.tree.itemCount }) }}</span>
                        </div>
                        <div v-for="branch in output.tree.branches" :key="branch.path.join(';')" class="mb-1 grid grid-cols-[auto_minmax(0,1fr)] gap-2 last:mb-0">
                          <code class="text-muted">{{ formatPreviewPath(branch.path) }}</code>
                          <code class="min-w-0 whitespace-pre-wrap break-all">{{ formatPreviewItems(branch.items) }}</code>
                        </div>
                        <div v-if="output.tree.truncated" class="mt-1 text-muted">{{ $t('processDesigner.previewTruncated') }}</div>
                      </section>
                    </div>
                  </div>
                  <div v-if="selectedProcessNode.kind === 'effect.runCommand'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.service') }}</label>
                    <Select v-model="selectedProcessNode.commandId" :options="commandOptions" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                  <div v-if="selectedProcessNode.kind === 'effect.createEntity' && (constructionModeOptions(selectedProcessNode.entityType).length > 1 || selectedProcessNode.entityType === 'artifact')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.constructionMode') }}</label>
                    <Select
                      :model-value="selectedProcessNode.construction.mode"
                      :options="constructionModeOptions(selectedProcessNode.entityType)"
                      option-label="label"
                      option-value="value"
                      @update:model-value="mode => updateProcessNodeConstructionMode(selectedProcessNode, mode)"
                    />
                  </div>
                  <div v-if="selectedProcessNode.kind === 'effect.createEntity' && selectedProcessNode.entityType === 'artifact'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.allowedArtifactCreation') }}</label>
                    <MultiSelect
                      :model-value="artifactCreationKinds(selectedProcessNode)"
                      :options="artifactUploadKindOptions"
                      option-label="label"
                      option-value="value"
                      display="chip"
                      filter
                      :placeholder="$t('processDesigner.allUploadArtifactKinds')"
                      @update:model-value="value => updateArtifactCreationKinds(selectedProcessNode, value)"
                    />
                  </div>
                  <div v-if="selectedProcessNode.kind === 'control.domainEventTrigger'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.event') }}</label>
                    <Select v-model="selectedProcessNode.eventId" :options="designer.eventOptions" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                  <div v-if="selectedProcessNode.kind === 'effect.generateAttachment'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.attachmentKind') }}</label>
                    <Select v-model="selectedProcessNode.attachmentKind" :options="designer.attachmentKindOptions" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                  <div v-if="selectedProcessNode.kind === 'read.related'" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.relation') }}</label>
                    <Select v-model="selectedProcessNode.relationKey" :options="relationOptionsForEntity(selectedProcessNode.entityType)" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                  <div v-if="processNodeHasSelectableFieldSet(selectedProcessNode)" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.fields') }}</label>
                    <MultiSelect
                      v-model="selectedProcessNode.fields"
                      :options="processNodeFieldOptions(selectedProcessNode)"
                      option-label="label"
                      option-value="value"
                      filter
                      @change="syncNodeData"
                    />
                  </div>
                  <div v-if="openBlockComposition(selectedProcessNode) && ['record.composeBlock', 'record.modifyBlock'].includes(selectedProcessNode.kind)" class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.blockEntries') }}</label>
                      <Button icon="pi pi-plus" text size="small" :aria-label="$t('common.add')" @click="addOpenBlockEntry(selectedProcessNode)" />
                    </div>
                    <div
                      v-for="(entry, index) in selectedProcessNode.entries || []"
                      :key="entry.id"
                      class="rounded-ui border border-content-border bg-content p-2"
                    >
                      <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                        <div class="grid min-w-0 gap-2">
                          <InputText
                            :model-value="entry.key"
                            size="small"
                            :placeholder="$t('processDesigner.entryKey')"
                            @update:model-value="value => updateOpenBlockEntry(selectedProcessNode, index, { key: value })"
                          />
                          <Select
                            v-if="openBlockComposition(selectedProcessNode).mode === 'attachments'"
                            :model-value="entry.attachmentKind"
                            :options="designer.attachmentKindOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            filter
                            @update:model-value="value => updateOpenBlockEntry(selectedProcessNode, index, { attachmentKind: value })"
                          />
                          <Select
                            v-else-if="openBlockComposition(selectedProcessNode).mode === 'relations'"
                            :model-value="entry.entityType"
                            :options="entityTypeOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            filter
                            @update:model-value="value => updateRelationEntryType(selectedProcessNode, index, value)"
                          />
                          <label
                            v-if="openBlockComposition(selectedProcessNode).mode === 'relations' && entry.entityType === 'artifact'"
                            class="flex flex-col gap-1"
                          >
                            <span class="text-xs text-muted-color">{{ $t('processDesigner.allowedArtifactCreation') }}</span>
                            <MultiSelect
                              :model-value="entry.attachmentKinds || []"
                              :options="artifactUploadKindOptions"
                              option-label="label"
                              option-value="value"
                              display="chip"
                              filter
                              :placeholder="$t('processDesigner.allUploadArtifactKinds')"
                              @update:model-value="value => updateOpenBlockEntry(selectedProcessNode, index, { attachmentKinds: value })"
                            />
                          </label>
                          <Select
                            v-else-if="openBlockComposition(selectedProcessNode).mode === 'entries'"
                            :model-value="entry.type?.base"
                            :options="processValueTypeOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            @update:model-value="value => updateOpenBlockEntryType(selectedProcessNode, index, value)"
                          />
                          <Select
                            v-if="openBlockComposition(selectedProcessNode).mode === 'entries' && entry.type?.base === 'entityRef'"
                            :model-value="entry.type?.entityType"
                            :options="entityTypeOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            filter
                            @update:model-value="value => updateOpenBlockEntryEntityType(selectedProcessNode, index, value)"
                          />
                        </div>
                        <Button icon="pi pi-trash" text severity="danger" size="small" :aria-label="$t('common.delete')" @click="removeOpenBlockEntry(selectedProcessNode, index)" />
                      </div>
                    </div>
                  </div>
                  <div v-if="selectedProcessNode.kind === 'record.getField' && openBlockComposition(selectedProcessNode)" class="flex flex-col gap-2">
                    <label>{{ $t('processDesigner.entryKey') }}</label>
                    <InputText :model-value="selectedProcessNode.entryKey" size="small" @update:model-value="updateOpenBlockReadKey" />
                    <Select
                      v-if="['ancestors', 'relations'].includes(openBlockComposition(selectedProcessNode).mode)"
                      :model-value="openBlockReadEntityType(selectedProcessNode)"
                      :options="entityTypeOptions"
                      option-label="label"
                      option-value="value"
                      size="small"
                      filter
                      @update:model-value="value => updateOpenBlockReadEntityType(value)"
                    />
                    <Select
                      v-if="openBlockComposition(selectedProcessNode).mode === 'entries'"
                      :model-value="selectedProcessNode.type?.base"
                      :options="processValueTypeOptions"
                      option-label="label"
                      option-value="value"
                      size="small"
                      @update:model-value="updateOpenBlockReadType"
                    />
                    <Select
                      v-if="openBlockComposition(selectedProcessNode).mode === 'entries' && selectedProcessNode.type?.base === 'entityRef'"
                      :model-value="selectedProcessNode.type?.entityType"
                      :options="entityTypeOptions"
                      option-label="label"
                      option-value="value"
                      size="small"
                      filter
                      @update:model-value="value => updateOpenBlockReadEntityType(value)"
                    />
                    <Select
                      v-if="openBlockComposition(selectedProcessNode).mode === 'attachments'"
                      :model-value="selectedProcessNode.type?.attachmentKind"
                      :options="designer.attachmentKindOptions"
                      option-label="label"
                      option-value="value"
                      size="small"
                      filter
                      @update:model-value="updateOpenBlockReadAttachmentKind"
                    />
                  </div>
                  <div v-if="selectedProcessNode.kind?.startsWith('effect.')" class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.roles') }}</label>
                      <Button
                        icon="pi pi-plus"
                        text
                        size="small"
                        :aria-label="$t('processDesigner.addRole')"
                        :disabled="!nextSelectedProcessNodeRoleId"
                        @click="addSelectedProcessNodeGrant"
                      />
                    </div>
                    <div
                      v-for="(grant, index) in selectedProcessNodeGrants"
                      :key="`${grant.roleId}-${index}`"
                      class="grid grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_auto] gap-2"
                    >
                      <Select
                        :model-value="grant.roleId"
                        :options="selectedProcessNodeRoleOptions(index)"
                        option-label="label"
                        option-value="value"
                        size="small"
                        @update:model-value="value => updateSelectedProcessNodeGrant(index, { roleId: value })"
                      />
                      <Select
                        :model-value="grant.level || 'write'"
                        :options="accessLevelOptions"
                        option-label="label"
                        option-value="value"
                        size="small"
                        @update:model-value="value => updateSelectedProcessNodeGrant(index, { level: value })"
                      />
                      <Button
                        icon="pi pi-trash"
                        text
                        severity="danger"
                        size="small"
                        :aria-label="$t('common.delete')"
                        @click="removeSelectedProcessNodeGrant(index)"
                      />
                    </div>
                  </div>
                </template>

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
                    <InputText v-model="selectedRoleRecord.label" @change="saveSelectedRole" />
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
                    <div v-for="(region, index) in selectedScreenRecord.regions" :key="region.id || index" class="grid grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2">
                      <Select v-model="region.slot" :options="screenSlotOptions" option-label="label" option-value="value" size="small" />
                      <Select v-model="region.sourceId" :options="selectedScreenSourceOptions" option-label="label" option-value="value" size="small" />
                      <Select v-model="region.surface" :options="screenSurfaceOptions" option-label="label" option-value="value" size="small" />
                      <MultiSelect v-model="region.actions" :options="screenActionOptions" option-label="label" option-value="value" display="chip" size="small" class="w-full" :aria-label="$t('common.actions.title')" />
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
      </template>

      <div v-if="validation" class="absolute bottom-16 left-3 z-10 max-w-xl">
        <div class="flex flex-col gap-2">
          <Message :severity="validation.ok ? 'success' : 'error'">
            {{ validation.ok ? (validation.message || $t('processDesigner.validationOk')) : validation.errors.join('; ') }}
          </Message>
          <Message v-for="warning in validation.warnings || []" :key="warning" severity="warn">{{ warning }}</Message>
        </div>
      </div>

      </DesignerWorkspace>
    </DesignerSurface>

  </StandardPage>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { SelectionMode, VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/EntityMultiSelect.vue';
import Panel from 'primevue/panel';
import Popover from 'primevue/popover';
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
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import {
  canvasToDefinition,
  compileProcessDefinition,
  createProcessDesignerContract,
  definitionToCanvas,
  formatProcessType,
  PROCESS_DATAFLOW_VERSION,
  processSocketsCompatible,
  processType,
  requiredEntityProfileTypes,
  resolveCatalogNodePorts
} from '~/packages/processes/src/index.js';
import { normalizeScreenContract, SCREEN_TEMPLATES, SCREEN_SOURCE_MODES, SCREEN_REGION_SLOTS, SCREEN_REGION_SURFACES } from '~/packages/processes/src/screen-contract.js';
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
import MotionDock from '~/components/shared/MotionDock.vue';
import { normalizeProcessDisplayName, processDisplayEntity } from '~/utils/processDesignerDisplay.js';
import { processSocketColor } from '~/utils/processDesignerSocketTone.js';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerPanels } from '~/composables/useProcessDesignerPanels.js';
import { useProcessDesignerConnectionInference } from '~/composables/useProcessDesignerConnectionInference.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerRoles } from '~/composables/useProcessDesignerRoles.js';
import { useProcessDesignerScreens } from '~/composables/useProcessDesignerScreens.js';
import { useProcessDesignerPalette } from '~/composables/useProcessDesignerPalette.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';

const { t, te } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
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
const validation = ref(null);
const dataflowPreview = ref(null);
const previewingData = ref(false);
const applyingProcess = ref(false);
const savingDraft = ref(false);
const creatingDraft = ref(false);
const savedDraftSignature = ref('');
const organizationRoles = ref({});
const newStateId = ref('');
const canvasFrame = ref(null);
const compiledPreview = ref(null);
const compiledPreviewError = ref('');
const paletteQuery = ref('');
const contextPaletteSearch = ref(null);
const contextPalette = ref({
  open: false,
  x: 0,
  y: 0,
  graphPosition: { x: 0, y: 0 },
  query: '',
  socket: null
});
const canvasKeyboardActive = ref(false);
const { fitView, getViewport, setViewport, zoomIn, zoomOut, zoomTo } = useVueFlow();
const {
  canvasMenu,
  dockPopover,
  inspectTab,
  inspectorOpen,
  paletteOpen,
  pinnedDockPopover,
  processMenu,
  selectedPrincipalId,
  selectedRoleId,
  selectedScreenId
} = useProcessDesignerPanels();
const { compareProcessDefinitions, normalizeProcessList, pickInitialProcess } = useProcessDefinitionCatalog({ definitionToCanvas });
const persistence = useProcessDesignerPersistence();
const rolePersistence = useProcessDesignerRoles();
const {
  clearGraphSelection,
  reset: resetGraphSelection,
  selectEdge,
  selectedEdgeId,
  selectedNode,
  selectedNodeId,
  selectNode
} = useProcessDesignerSelection({
  nodes,
  edges,
  decorateEdge: value => decorateEdge(value),
  closePalette: () => closeContextPalette(),
  syncEdges: () => syncEdgeSelection()
});
const { inferGenericNodeTypeFromConnection } = useProcessDesignerConnectionInference({
  nodes,
  draft,
  resolveOutputs: record => resolveCatalogNodePorts(record, catalogContext(record)).outputs,
  portForHandle,
  syncProcessNode
});
const screenEditing = useProcessDesignerScreens({ draft, selectedScreenId, createScreen });

const designer = reactive(createProcessDesignerContract(cncDomain));
const {
  ensureRecord,
  factoryForType,
  recordKeyForType,
  selectedRecord,
  selectedEntity,
  selectedAction,
  selectedService,
  selectedSocket,
  selectedStatusDefinition,
  selectedValueInput,
  selectedProcessNode
} = useProcessDesignerInspector({
  draft,
  selectedNode,
  factories: {
    entity: createEntityProfile,
    action: createAction,
    service: createService,
    socket: createSocket,
    statusDefinition: createStatusDefinition,
    valueInput: createValueInput,
    processNode: createProcessNode
  }
});
const {
  deleteGraphSelection,
  selectedGraphEdges,
  selectedGraphNodes
} = useProcessDesignerGraphEditing({
  draft,
  nodes,
  edges,
  selectedNode,
  selectedNodeId,
  selectedEdgeId,
  recordKeyForType,
  clearSemanticConnection,
  syncInferredActionInputs,
  onBlockedStatusNodes: () => toast.add({
    severity: 'warn',
    summary: t('processDesigner.statusInUse'),
    detail: t('processDesigner.statusInUseHelp'),
    life: 3000
  })
});
const managedProcessBlocks = new Set(['origin', 'status', 'provenance', 'summary']);
const { filteredGroups: paletteGroups, contextGroups: contextPaletteGroups } = useProcessDesignerPalette({
  groups: designer.paletteGroups,
  query: paletteQuery,
  context: contextPalette,
  searchText: paletteSearchText,
  isCompatible: contextItemCompatible
});
const actionKindOptions = [
  { label: t('processDesigner.paletteItems.create'), value: 'createEntity' },
  { label: t('processDesigner.paletteItems.modify'), value: 'updateEntity' },
  { label: t('processDesigner.paletteItems.service'), value: 'runCommand' },
  { label: t('processDesigner.paletteItems.send'), value: 'sendToOrganization' }
];
const genericActionLabels = new Set(['action', 'create', 'modify', 'status', 'service', 'send', 'update']);
const triggerModeOptions = [
  { label: 'Manual', value: 'manual' },
  { label: 'Automatic', value: 'event' }
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
const screenSurfaceOptions = SCREEN_REGION_SURFACES.map(value => ({ label: value, value }));
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
const processValueTypeOptions = ['string', 'number', 'integer', 'boolean', 'json', 'date', 'dateTime', 'duration', 'enum', 'entityRef', 'status'].map(value => ({ label: value, value }));
const dataMatchingOptions = ['longest', 'shortest', 'cross'].map(value => ({ label: t(`processDesigner.matching.${value}`), value }));
const processNodeOperations = {
  'value.math': ['add', 'subtract', 'multiply', 'divide', 'modulo', 'power', 'min', 'max', 'absolute', 'negate', 'round', 'floor', 'ceil', 'sqrt', 'clamp'],
  'value.string': ['concat', 'replace', 'substring', 'split', 'join', 'length', 'lower', 'upper', 'trim'],
  'value.logic': ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull', 'and', 'or', 'xor', 'nand', 'nor', 'xnor', 'not'],
  'value.dateTime': ['addDays', 'addHours', 'addMinutes', 'addMonths', 'addDuration', 'subtractDuration', 'differenceDays', 'differenceHours', 'differenceMinutes', 'startOfDay', 'endOfDay'],
  'predicate.field': ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith', 'isNull', 'isNotNull'],
  'predicate.logic': ['and', 'or', 'not'],
  'collection.sort': ['asc', 'desc'],
  'record.fieldChange': ['set', 'unset', 'append', 'remove']
};
const processNodeOperationLabels = {
  add: t('processDesigner.operationLabels.add'),
  subtract: t('processDesigner.operationLabels.subtract'),
  multiply: t('processDesigner.operationLabels.multiply'),
  divide: t('processDesigner.operationLabels.divide'),
  modulo: t('processDesigner.operationLabels.modulo'),
  power: t('processDesigner.operationLabels.power'),
  min: t('processDesigner.operationLabels.min'),
  max: t('processDesigner.operationLabels.max'),
  absolute: t('processDesigner.operationLabels.absolute'),
  negate: t('processDesigner.operationLabels.negate'),
  round: t('processDesigner.operationLabels.round'),
  floor: t('processDesigner.operationLabels.floor'),
  ceil: t('processDesigner.operationLabels.ceil'),
  sqrt: t('processDesigner.operationLabels.sqrt'),
  clamp: t('processDesigner.operationLabels.clamp'),
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
  substring: t('processDesigner.operationLabels.substring'),
  split: t('processDesigner.operationLabels.split'),
  join: t('processDesigner.operationLabels.join'),
  length: t('processDesigner.operationLabels.length'),
  eq: t('processDesigner.useEquals'),
  neq: t('processDesigner.useNotEquals'),
  gt: t('processDesigner.useGreaterThan'),
  gte: t('processDesigner.useGreaterOrEqual'),
  lt: t('processDesigner.useLessThan'),
  lte: t('processDesigner.useLessOrEqual'),
  contains: t('processDesigner.useContains'),
  startsWith: t('processDesigner.operationLabels.startsWith'),
  endsWith: t('processDesigner.operationLabels.endsWith'),
  isNull: t('processDesigner.operationLabels.isEmpty'),
  isNotNull: t('processDesigner.operationLabels.isNotEmpty'),
  exists: t('processDesigner.useExists'),
  and: t('processDesigner.useAllConditions'),
  or: t('processDesigner.useAnyCondition'),
  xor: t('processDesigner.useExclusiveCondition'),
  nand: t('processDesigner.operationLabels.nand'),
  nor: t('processDesigner.operationLabels.nor'),
  xnor: t('processDesigner.operationLabels.xnor'),
  not: t('processDesigner.useInvertCondition'),
  first: t('processDesigner.useFirstItem'),
  last: t('processDesigner.useLastItem'),
  index: t('processDesigner.useIndexedItem'),
  asc: t('processDesigner.operationLabels.ascending'),
  desc: t('processDesigner.operationLabels.descending'),
  set: t('processDesigner.operationLabels.set'),
  unset: t('processDesigner.operationLabels.clear'),
  append: t('processDesigner.operationLabels.append'),
  remove: t('processDesigner.operationLabels.remove'),
  addDays: t('processDesigner.operationLabels.addDays'),
  addHours: t('processDesigner.operationLabels.addHours'),
  addMinutes: t('processDesigner.operationLabels.addMinutes'),
  addMonths: t('processDesigner.operationLabels.addMonths'),
  addDuration: t('processDesigner.operationLabels.addDuration'),
  subtractDuration: t('processDesigner.operationLabels.subtractDuration'),
  differenceDays: t('processDesigner.operationLabels.differenceDays'),
  differenceHours: t('processDesigner.operationLabels.differenceHours'),
  differenceMinutes: t('processDesigner.operationLabels.differenceMinutes'),
  startOfDay: t('processDesigner.operationLabels.startOfDay'),
  endOfDay: t('processDesigner.operationLabels.endOfDay')
};
const relationMutationOptions = [
  { label: t('processDesigner.operationLabels.link'), value: 'append' },
  { label: t('processDesigner.operationLabels.unlink'), value: 'remove' },
  { label: t('processDesigner.operationLabels.replaceRelation'), value: 'replace' }
];
const artifactUploadKindOptions = computed(() => designer.attachmentKindOptions
  .filter(option => ['upload', 'capture', 'editor'].includes(option.creation?.mode)));
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
let dockPopoverCloseTimer = null;

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const isDirty = computed(() => Boolean(draft.value) && designerSignature() !== savedDraftSignature.value);
const designerDockItems = computed(() => [
  {
    icon: () => h('i', { class: 'pi pi-th-large', 'aria-hidden': 'true' }),
    label: t('processDesigner.palette'),
    onClick: () => { paletteOpen.value = !paletteOpen.value; },
    pressed: paletteOpen.value
  },
  {
    icon: () => h('i', { class: 'pi pi-sliders-h', 'aria-hidden': 'true' }),
    label: t('processDesigner.inspector'),
    onClick: () => { inspectorOpen.value = !inspectorOpen.value; },
    pressed: inspectorOpen.value
  },
  {
    icon: () => h('i', { class: savingDraft.value ? 'pi pi-spinner pi-spin' : 'pi pi-save', 'aria-hidden': 'true' }),
    label: t('common.save'),
    onClick: saveDraftFromDock,
    disabled: !draft.value || savingDraft.value || creatingDraft.value || applyingProcess.value,
    attention: isDirty.value
  },
  {
    icon: () => h('i', { class: applyingProcess.value ? 'pi pi-spinner pi-spin' : 'pi pi-check', 'aria-hidden': 'true' }),
    label: t('processDesigner.apply'),
    onClick: applyProcess,
    disabled: !draft.value?._id || isActiveProcess.value || applyingProcess.value || savingDraft.value || creatingDraft.value
  },
  {
    icon: () => h('i', { class: 'pi pi-arrows-alt', 'aria-hidden': 'true' }),
    label: t('processDesigner.canvasNavigation'),
    onClick: event => openDockPopover('navigation', event),
    onHoverStart: event => openDockPopover('navigation', event),
    onHoverEnd: () => scheduleDockPopoverClose('navigation'),
    onFocus: event => openDockPopover('navigation', event),
    onBlur: () => scheduleDockPopoverClose('navigation'),
    hasPopup: true
  },
  {
    icon: () => h('i', { class: 'pi pi-folder', 'aria-hidden': 'true' }),
    label: t('processDesigner.title'),
    onClick: event => openDockPopover('process', event),
    onHoverStart: event => openDockPopover('process', event),
    onHoverEnd: () => scheduleDockPopoverClose('process'),
    onFocus: event => openDockPopover('process', event),
    onBlur: () => scheduleDockPopoverClose('process'),
    hasPopup: true
  }
]);
const processOptions = computed(() => processDefinitions.value.map(process => ({
  label: [
    normalizeProcessDisplayName(process.identity?.name || process.identity?.uid || process._id),
    process.status?.state?.primary
  ].filter(Boolean).join(' · '),
  value: String(process._id),
  entity: processDisplayEntity(process)
})));
const emptyCanvasMessage = computed(() => {
  if (loadingProcess.value) return t('common.loading');
  if (processLoadError.value) return processLoadError.value;
  return t('processDesigner.noActiveDraft');
});
const selectedNodePreview = computed(() => selectedNode.value ? dataflowPreview.value?.nodes?.[selectedNode.value.id] || null : null);
const selectedNodeSupportsPreview = computed(() => {
  const kind = selectedProcessNode.value?.kind || '';
  return Boolean(kind && !kind.startsWith('effect.') && !kind.startsWith('control.'));
});
const selectedNodePreviewOutputs = computed(() => {
  const outputs = selectedNodePreview.value?.outputs || {};
  const ports = processNodeOutputs(selectedProcessNode.value || {});
  return Object.entries(outputs).map(([id, tree]) => ({
    id,
    label: ports.find(port => port.id === id)?.label || id,
    tree
  }));
});
const selectedStatusAttachmentEntries = computed(() => Object.entries(selectedStatusDefinition.value.lifecycle?.attachments || {})
  .map(([key, schema]) => ({ key, schema })));
const selectedStatusSnapshotEntries = computed(() => Object.entries(selectedStatusDefinition.value.lifecycle?.snapshots || {})
  .map(([key, schema]) => ({ key, schema })));
const statusDefinitionList = computed(() => Object.values(draft.value?.data?.statusDefinitions || {}));
const processStatusOptions = computed(() => statusDefinitionList.value
  .filter(status => status.statusId)
  .map(status => ({ label: status.label || status.statusId, value: status.statusId, refId: status.id })));
const selectedProcessNodeGrants = computed(() => selectedProcessNode.value.access?.grants || []);
const nextSelectedProcessNodeRoleId = computed(() => {
  const selected = new Set(selectedProcessNodeGrants.value.map(grant => grant.roleId));
  return roleOptions.value.find(option => !selected.has(option.value))?.value || '';
});
const selectedEntityFeature = computed(() => selectedEntity.value.entityType ? featureForEntityType(selectedEntity.value.entityType) : defaultFeature());

const roles = computed(() => organizationRoles.value);
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
  .filter(screen => screen && typeof screen === 'object' && !Array.isArray(screen))
  .map(screen => {
    const normalized = normalizeScreenContract(screen);
    return {
      ...normalized,
      roleLabels: (normalized.roleIds || []).map(roleId => roles.value[roleId]?.label || roleId),
      requiredLabel: normalized.required?.feature ? `${normalized.required.feature}:${normalized.required.level || 'read'}` : ''
    };
  })
  .sort((left, right) => String(left.label || left.id).localeCompare(String(right.label || right.id))));

watch(selectedScreenRecord, () => syncSelectedScreenUi(), { immediate: true });

let previewRecomputeTimer = null;
let previewRecomputeSequence = 0;
watch([draft, nodes, edges], () => schedulePreviewRecompute(), { deep: true });
watch(inspectTab, () => schedulePreviewRecompute());

function schedulePreviewRecompute() {
  if (previewRecomputeTimer) {
    clearTimeout(previewRecomputeTimer);
    previewRecomputeTimer = null;
  }
  if (inspectTab.value !== 'screens') {
    previewRecomputeSequence += 1;
    return;
  }
  previewRecomputeTimer = setTimeout(() => {
    previewRecomputeTimer = null;
    const sequence = ++previewRecomputeSequence;
    recomputeProcessPreview(() => sequence === previewRecomputeSequence);
  }, 120);
}

onMounted(() => {
  loadActiveOrCreateLocal();
  loadProcessCapabilities();
  window.addEventListener('keydown', handleCanvasKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCanvasKeydown);
  if (dockPopoverCloseTimer) clearTimeout(dockPopoverCloseTimer);
  if (previewRecomputeTimer) clearTimeout(previewRecomputeTimer);
});

async function loadActiveOrCreateLocal() {
  loadingProcess.value = true;
  processLoadError.value = '';
  try {
    const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
    const { active, definitions, roles: loadedRoles } = await persistence.loadWorkspace(organizationId);
    organizationRoles.value = loadedRoles || {};
    processDefinitions.value = normalizeProcessList(active, definitions);
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

async function loadProcessCapabilities() {
  try {
    const response = await $fetch('/api/admin/domain');
    const capabilities = response?.processCapabilities || null;
    if (!capabilities) return;
    const refreshed = createProcessDesignerContract(cncDomain, capabilities);
    designer.createEntityOptions = refreshed.createEntityOptions;
    designer.createModes = refreshed.createModes;
    designer.listableEntityOptions = refreshed.listableEntityOptions;
    designer.readableEntityOptions = refreshed.readableEntityOptions;
  } catch {
    // keep the domain-derived options when the projection cannot be loaded
  }
}

async function loadOrganizationRoles() {
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  organizationRoles.value = organizationId
    ? await rolePersistence.list(organizationId)
    : {};
  selectedRoleId.value = organizationRoles.value[selectedRoleId.value]
    ? selectedRoleId.value
    : Object.keys(organizationRoles.value)[0] || null;
}

function selectProcessDefinition(processId) {
  selectedProcessId.value = processId === null || processId === undefined ? null : String(processId);
  const selected = processDefinitions.value.find(process => String(process._id) === selectedProcessId.value);
  if (!selected) return;
  setDraft(selected);
  closeDockPopover('process');
}

function upsertProcessDefinition(process) {
  if (!process?._id) return;
  const next = processDefinitions.value.filter(item => String(item._id) !== String(process._id));
  next.push(process);
  processDefinitions.value = next.sort(compareProcessDefinitions);
}

async function createDraft({ copyActive = false, empty = false } = {}) {
  const sourceId = copyActive ? draft.value?._id || null : null;
  const name = copyActive && activeName.value ? `${normalizeProcessDisplayName(activeName.value)} draft` : 'Organization process';
  const data = empty
    ? canvasToDefinition(
      { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { dataflowVersion: PROCESS_DATAFLOW_VERSION }
    )
    : serializeProcess();
  const created = await persistence.createDraft({ name, data, sourceProcessDefinitionId: sourceId });
  upsertProcessDefinition(created);
  setDraft(created);
  return created;
}

async function createDraftFromDock() {
  if (creatingDraft.value) return;
  creatingDraft.value = true;
  try {
    await createDraft({ empty: true });
    closeDockPopover('process');
    toast.add({ severity: 'success', summary: t('processDesigner.newDraft'), life: 2400 });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('processDesigner.newDraft'),
      detail: error?.data?.message || error?.message,
      life: 5000
    });
  } finally {
    creatingDraft.value = false;
  }
}

async function saveDraft() {
  savingDraft.value = true;
  try {
    syncNodeData();
    if (!draft.value?._id || isActiveProcess.value) return await createDraft({ copyActive: isActiveProcess.value });
    const updated = await persistence.saveDraft(draft.value._id, serializeProcess());
    upsertProcessDefinition(updated);
    setDraft(updated);
    return updated;
  } finally {
    savingDraft.value = false;
  }
}

async function saveDraftFromDock() {
  if (savingDraft.value) return;
  const createsDraft = !draft.value?._id || isActiveProcess.value;
  try {
    await saveDraft();
    toast.add({
      severity: 'success',
      summary: createsDraft ? t('processDesigner.newDraft') : t('processDesigner.saved'),
      life: 2400
    });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.save'),
      detail: error?.data?.message || error?.message,
      life: 5000
    });
  }
}

async function previewDataflow() {
  if (!draft.value || !selectedNodeSupportsPreview.value) return;
  previewingData.value = true;
  try {
    const definition = serializeProcess();
    dataflowPreview.value = await persistence.previewDraft(definition, selectedNodeId.value);
  } catch (error) {
    dataflowPreview.value = { nodes: { [selectedNodeId.value]: { error: error?.data?.message || error.message } } };
  } finally {
    previewingData.value = false;
  }
}

function formatPreviewPath(path = []) {
  return `{${path.join(';')}}`;
}

function formatPreviewItems(items = []) {
  return items.map(item => typeof item === 'string' ? JSON.stringify(item) : JSON.stringify(item)).join(', ');
}

async function activateDraft() {
  await saveDraft();
  const result = await persistence.validateDraft(draft.value._id);
  validation.value = result;
  if (!result.ok) throw new Error(result.errors?.[0] || t('processDesigner.validationFailed'));
  const activated = await persistence.activateDraft(draft.value._id);
  upsertProcessDefinition(activated);
  setDraft(activated);
  return activated;
}

async function applyProcess() {
  if (!draft.value?._id || isActiveProcess.value || applyingProcess.value) return;
  applyingProcess.value = true;
  try {
    const activated = await activateDraft();
    validation.value = {
      ok: true,
      errors: [],
      warnings: activated?.data?.compiled?.warnings || [],
      message: t('processDesigner.applySuccess')
    };
    toast.add({ severity: 'success', summary: t('processDesigner.applySuccess'), life: 3000 });
  } catch (error) {
    const message = error?.data?.message || error?.message || t('processDesigner.validationFailed');
    validation.value = {
      ok: false,
      errors: [message],
      warnings: []
    };
    toast.add({ severity: 'error', summary: t('processDesigner.apply'), detail: message, life: 5000 });
  } finally {
    applyingProcess.value = false;
  }
}

function popoverFor(panel) {
  return panel === 'process' ? processMenu.value : canvasMenu.value;
}

function openDockPopover(panel, event) {
  const previousPanel = dockPopover.value;
  keepDockPopover(panel);
  if (previousPanel && previousPanel !== panel) popoverFor(previousPanel)?.hide?.();
  dockPopover.value = panel;
  popoverFor(panel)?.show?.(event);
}

function keepDockPopover(panel) {
  if (dockPopoverCloseTimer) {
    clearTimeout(dockPopoverCloseTimer);
    dockPopoverCloseTimer = null;
  }
  dockPopover.value = panel;
}

function pinDockPopover(panel) {
  keepDockPopover(panel);
  pinnedDockPopover.value = panel;
}

function unpinDockPopover(panel) {
  if (pinnedDockPopover.value === panel) pinnedDockPopover.value = null;
  scheduleDockPopoverClose(panel);
}

function scheduleDockPopoverClose(panel) {
  if (pinnedDockPopover.value === panel) return;
  if (dockPopoverCloseTimer) clearTimeout(dockPopoverCloseTimer);
  dockPopoverCloseTimer = setTimeout(() => {
    if (dockPopover.value === panel) closeDockPopover(panel);
    dockPopoverCloseTimer = null;
  }, 160);
}

function closeDockPopover(panel = null) {
  if (dockPopoverCloseTimer) {
    clearTimeout(dockPopoverCloseTimer);
    dockPopoverCloseTimer = null;
  }
  if (panel && dockPopover.value !== panel) return;
  if (!panel || pinnedDockPopover.value === panel) pinnedDockPopover.value = null;
  const activePanel = panel || dockPopover.value;
  dockPopover.value = null;
  if (activePanel) popoverFor(activePanel)?.hide?.();
}

function onDockPopoverHide(panel) {
  if (dockPopover.value === panel) dockPopover.value = null;
  if (pinnedDockPopover.value === panel) pinnedDockPopover.value = null;
}

function setDraft(value) {
  value = clonePlainData(value || {});
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
  resetGraphSelection();
  nodes.value = canvas.nodes.map(enrichNodeData);
  edges.value = decorateEdges(canvas.edges);
  selectedRoleId.value = Object.keys(organizationRoles.value)[0] || null;
  selectedPrincipalId.value = Object.keys(value?.data?.servicePrincipals || {})[0] || null;
  selectedScreenId.value = Object.keys(value?.data?.screens || {})[0] || null;
  savedDraftSignature.value = designerSignature();
  nextTick(() => {
    if (nodes.value.length) {
      fitView({ padding: 0.16, duration: 0, maxZoom: 1 });
      return;
    }
    setViewport(canvas.viewport || { x: 0, y: 0, zoom: 1 }, { duration: 0 });
  });
  recomputeProcessPreview();
}

function designerSignature() {
  return JSON.stringify({
    data: draft.value?.data || null,
    nodes: nodes.value.map(node => ({ id: node.id, type: node.type, position: node.position, data: { refId: node.data?.refId } })),
    edges: edges.value.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
      role: edge.role
    }))
  });
}

function addNode(item, position = nextNodePosition()) {
  const type = typeof item === 'string' ? item : item.type;
  const actionKind = typeof item === 'object' ? item.actionKind : null;
  const socketDirection = typeof item === 'object' ? item.direction : null;
  const processNodeKind = typeof item === 'object' ? item.kind : null;
  const valueStructure = typeof item === 'object' ? item.structure : null;
  const id = `${type}_${Date.now()}`;
  const refId = id;
  const node = {
    id,
    type,
    position,
    selected: true,
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
    Object.assign(record, clonePalettePreset(item.preset));
    syncProcessNode(record);
  }
  if (type === 'valueInput' && valueStructure) {
    Object.assign(record, createValueInput(refId, valueStructure));
  }
  nodes.value = [...nodes.value.map(item => ({ ...item, selected: false })), enrichNodeData(node)];
  edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
  selectedNodeId.value = id;
  selectedEdgeId.value = null;
  syncEdgeSelection();
  return node;
}

function handleDesignerPointerDown(event) {
  canvasKeyboardActive.value = Boolean(event.target?.closest?.('.vue-flow'));
  if (!event.target?.closest?.('.process-designer-dock')) closeDockPopover();
}

function handleDesignerFocus(event) {
  canvasKeyboardActive.value = Boolean(event.target?.closest?.('.vue-flow'));
}

function handleDesignerWheel(event) {
  if (!event.ctrlKey || !event.target?.closest?.('.vue-flow')) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  canvasKeyboardActive.value = true;
  const viewport = getViewport?.() || { x: 0, y: 0, zoom: 1 };
  const rect = canvasFrame.value?.getBoundingClientRect?.();
  const previousZoom = Number(viewport.zoom) || 1;
  const nextZoom = Math.min(4, Math.max(0.1, previousZoom * Math.exp(-Number(event.deltaY || 0) * 0.002)));
  const pointerX = Number(event.clientX || 0) - Number(rect?.left || 0);
  const pointerY = Number(event.clientY || 0) - Number(rect?.top || 0);
  const graphX = (pointerX - Number(viewport.x || 0)) / previousZoom;
  const graphY = (pointerY - Number(viewport.y || 0)) / previousZoom;
  setViewport({
    x: pointerX - graphX * nextZoom,
    y: pointerY - graphY * nextZoom,
    zoom: nextZoom
  }, { duration: 0 });
}

function openPanePalette(event) {
  event?.preventDefault?.();
  openContextPalette(event, null);
}

function beginSocketConnection(connection = {}) {
  closeContextPalette();
  contextPalette.value.socket = {
    nodeId: connection.nodeId,
    handleId: connection.handleId,
    handleType: connection.handleType
  };
}

function endSocketConnection(event) {
  const socket = contextPalette.value.socket;
  if (!socket) return;
  const target = event?.target;
  const endedOnPane = target?.classList?.contains('vue-flow__pane')
    || target?.classList?.contains('vue-flow__transformationpane');
  if (endedOnPane) openContextPalette(event, socket);
  else contextPalette.value.socket = null;
}

function openContextPalette(event, socket) {
  const rect = canvasFrame.value?.getBoundingClientRect?.();
  const point = clientPoint(event);
  const x = Math.max(8, Math.min((rect?.width || 1200) - 304, point.x - (rect?.left || 0)));
  const y = Math.max(8, Math.min((rect?.height || 720) - 336, point.y - (rect?.top || 0)));
  contextPalette.value = {
    open: true,
    x,
    y,
    graphPosition: clientToGraphPosition(point),
    query: '',
    socket
  };
  nextTick(() => {
    const element = contextPaletteSearch.value?.$el;
    (element?.querySelector?.('input') || element)?.focus?.();
  });
}

function closeContextPalette() {
  contextPalette.value = {
    open: false,
    x: 0,
    y: 0,
    graphPosition: { x: 0, y: 0 },
    query: '',
    socket: null
  };
}

function clientPoint(event = {}) {
  const touch = event.changedTouches?.[0] || event.touches?.[0];
  return {
    x: Number(touch?.clientX ?? event.clientX ?? 0),
    y: Number(touch?.clientY ?? event.clientY ?? 0)
  };
}

function clientToGraphPosition(point) {
  const viewport = getViewport?.() || { x: 0, y: 0, zoom: 1 };
  const rect = canvasFrame.value?.getBoundingClientRect?.();
  const zoom = Number(viewport.zoom) || 1;
  return {
    x: Math.round((point.x - (rect?.left || 0) - Number(viewport.x || 0)) / zoom),
    y: Math.round((point.y - (rect?.top || 0) - Number(viewport.y || 0)) / zoom)
  };
}

function contextItemCompatible(item) {
  const socket = contextPalette.value.socket;
  if (!socket) return true;
  if (item.type !== 'processNode') return false;
  const existingNode = nodes.value.find(node => node.id === socket.nodeId);
  const existingRecord = draft.value?.data?.processNodes?.[existingNode?.data?.refId];
  if (!existingRecord) return false;
  const candidate = createProcessNode('__candidate__', item.kind);
  Object.assign(candidate, clonePalettePreset(item.preset));
  syncProcessNode(candidate);
  const existingPorts = resolveCatalogNodePorts(existingRecord, catalogContext(existingRecord));
  const candidatePorts = resolveCatalogNodePorts(candidate, catalogContext(candidate));
  if (socket.handleType === 'source') {
    const output = portForHandle(existingPorts.outputs, socket.handleId, 'output');
    return candidatePorts.inputs.some(input => socketPairCompatible(output, input));
  }
  const input = portForHandle(existingPorts.inputs, socket.handleId, 'input');
  return candidatePorts.outputs.some(output => socketPairCompatible(output, input));
}

function socketPairCompatible(source, target) {
  if (!source || !target) return false;
  const result = processSocketsCompatible(source, target);
  return result.ok;
}

function addContextNode(item) {
  const socket = contextPalette.value.socket;
  const position = contextPalette.value.graphPosition;
  const node = addNode(item, position);
  if (!socket || !node) {
    closeContextPalette();
    return;
  }
  const candidate = draft.value?.data?.processNodes?.[node.data?.refId];
  const candidatePorts = resolveCatalogNodePorts(candidate, catalogContext(candidate));
  const existingNode = nodes.value.find(value => value.id === socket.nodeId);
  const existingRecord = draft.value?.data?.processNodes?.[existingNode?.data?.refId];
  const existingPorts = resolveCatalogNodePorts(existingRecord, catalogContext(existingRecord));
  if (socket.handleType === 'source') {
    const output = portForHandle(existingPorts.outputs, socket.handleId, 'output');
    const input = candidatePorts.inputs.find(port => socketPairCompatible(output, port));
    if (input) onConnect({
      source: socket.nodeId,
      sourceHandle: socket.handleId,
      target: node.id,
      targetHandle: `${input.role}:${input.id}`
    });
  } else {
    const input = portForHandle(existingPorts.inputs, socket.handleId, 'input');
    const output = candidatePorts.outputs.find(port => socketPairCompatible(port, input));
    if (output) onConnect({
      source: node.id,
      sourceHandle: `${output.role}:${output.id}`,
      target: socket.nodeId,
      targetHandle: socket.handleId
    });
  }
  closeContextPalette();
}

function handleCanvasKeydown(event) {
  if (!canvasKeyboardActive.value || isTextEditingTarget(event.target)) return;
  if (['Delete', 'Backspace'].includes(event.key)) {
    if (!selectedGraphNodes().length && !selectedGraphEdges().length) return;
    event.preventDefault();
    deleteGraphSelection();
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    frameAllNodes();
    return;
  }
  if (event.code === 'NumpadDecimal') {
    event.preventDefault();
    frameSelectedNodes();
    return;
  }
  if (event.key.toLowerCase() === 'a' && event.altKey) {
    event.preventDefault();
    clearGraphSelection();
    return;
  }
  if (event.key.toLowerCase() === 'a' && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    nodes.value = nodes.value.map(node => ({ ...node, selected: true }));
    edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
    selectedNodeId.value = nodes.value[0]?.id || null;
    selectedEdgeId.value = null;
    return;
  }
  if (event.key === 'Escape') clearGraphSelection();
}

function isTextEditingTarget(target) {
  const tagName = target?.tagName?.toLowerCase();
  return target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName);
}

function decorateEdges(items = []) {
  return items.map(edge => decorateEdge(edge));
}

function decorateEdge(edge = {}) {
  const selected = edge.selected === true || edge.id === selectedEdgeId.value;
  const type = edge.type === 'smoothstep' || edge.type === 'step' ? 'default' : (edge.type || 'default');
  const sourcePort = sourcePortForEdge(edge);
  return {
    ...edge,
    type,
    animated: selected,
    style: {
      stroke: selected ? 'var(--p-primary-color)' : processSocketColor(sourcePort),
      strokeWidth: selected ? 3 : 1.5
    }
  };
}

function sourcePortForEdge(edge = {}) {
  const source = nodes.value.find(node => node.id === edge.source);
  if (!source) return {};
  if (source.type === 'statusDefinition') return { type: processType('status') };
  if (source.type === 'processNode') {
    const record = draft.value?.data?.processNodes?.[source.data?.refId];
    if (!record) return {};
    return portForHandle(
      resolveCatalogNodePorts(record, catalogContext(record)).outputs,
      edge.sourceHandle,
      'output'
    ) || {};
  }
  return portForHandle(source.data?.outputSpecs || [], edge.sourceHandle, 'output')
    || source.data?.outputSpecs?.[0]
    || {};
}

function activeViewportCenter() {
  const viewport = getViewport?.() || draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 };
  const zoom = Number(viewport.zoom) || 1;
  const rect = canvasFrame.value?.getBoundingClientRect?.();
  const width = rect?.width || 1200;
  const height = rect?.height || 720;
  const visibleLeft = 304;
  const visibleRight = 432;
  const visibleCenter = visibleLeft + Math.max(0, width - visibleLeft - visibleRight) / 2;
  return {
    x: Math.round((visibleCenter - Number(viewport.x || 0)) / zoom - 128),
    y: Math.round((height / 2 - Number(viewport.y || 0)) / zoom - 80)
  };
}

function nextNodePosition() {
  const origin = activeViewportCenter();
  const occupied = nodes.value.map(node => node.position || {});
  const columns = [0, 320, -320, 640, -640];
  for (let row = 0; row < 20; row += 1) {
    for (const column of columns) {
      const candidate = {
        x: Math.round(origin.x + column),
        y: Math.round(origin.y + row * 180)
      };
      const overlaps = occupied.some(position => (
        Math.abs(Number(position.x || 0) - candidate.x) < 300
        && Math.abs(Number(position.y || 0) - candidate.y) < 150
      ));
      if (!overlaps) return candidate;
    }
  }
  return { x: Math.round(origin.x), y: Math.round(origin.y + occupied.length * 180) };
}

function frameAllNodes() {
  if (!nodes.value.length) return;
  fitView({ padding: 0.16, duration: 180 });
}

function frameSelectedNodes() {
  const ids = selectedGraphNodes().map(node => node.id);
  if (!ids.length) return frameAllNodes();
  fitView({ nodes: ids, padding: 0.3, duration: 180 });
}

function zoomCanvasIn() {
  zoomIn({ duration: 120 });
}

function zoomCanvasOut() {
  zoomOut({ duration: 120 });
}

function resetCanvasZoom() {
  zoomTo(1, { duration: 160 });
}

function syncEdgeSelection() {
  edges.value = decorateEdges(edges.value);
}

function serializeProcess() {
  const originalData = draft.value?.data;
  draft.value.data = JSON.parse(JSON.stringify(originalData || {}));
  try {
    syncNodeData();
    return processDefinitionSnapshot();
  } finally {
    draft.value.data = originalData;
  }
}

function processDefinitionSnapshot() {
  const viewport = getViewport?.() || draft.value?.data?.graph?.viewport || { x: 0, y: 0, zoom: 1 };
  return {
    ...canvasToDefinition(
      { nodes: nodes.value.map(stripRuntimeNodeData), edges: validProcessEdges().map(stripRuntimeEdgeData), viewport },
      draft.value?.data || {}
    ),
    dataflowVersion: PROCESS_DATAFLOW_VERSION
  };
}

function recomputeProcessPreview(shouldApply = () => true) {
  if (inspectTab.value !== 'screens') return;
  if (!draft.value?.data) {
    compiledPreview.value = null;
    compiledPreviewError.value = '';
    return;
  }
  if (!shouldApply()) return;
  try {
    compiledPreview.value = compileProcessDefinition(processDefinitionSnapshot(), cncDomain, { roles: organizationRoles.value });
    compiledPreviewError.value = '';
  } catch (error) {
    compiledPreview.value = null;
    compiledPreviewError.value = error.message || String(error);
  }
}

function syncNodeData() {
  dataflowPreview.value = null;
  syncOpenBlockEntryContracts();
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
    node.data.valueInputRecord = node.type === 'valueInput' ? record : null;
    node.data.onValueInputUpdate = node.type === 'valueInput' ? updates => updateValueInputRecord(record.id || node.data.refId, updates) : null;
    node.data.processNodeRecord = node.type === 'processNode' ? record : null;
    node.data.onProcessNodeUpdate = node.type === 'processNode' ? updates => updateProcessNodeRecord(record.id || node.data.refId, updates) : null;
    node.data.statusDefinitionRecord = node.type === 'statusDefinition' ? record : null;
    node.data.onStatusDefinitionUpdate = node.type === 'statusDefinition' ? updates => updateStatusDefinitionRecord(record.id || node.data.refId, updates) : null;
    node.data.onStatusDefinitionDelete = node.type === 'statusDefinition' ? () => removeStatusDefinition(record.id || node.data.refId) : null;
    node.data.processValueTypeOptions = ['valueInput', 'processNode'].includes(node.type) ? processValueTypeOptions : [];
    node.data.processEntityTypeOptions = node.type === 'processNode' ? processEntityTypeOptions(record) : [];
    node.data.processOperationOptions = node.type === 'processNode' ? processNodeOperationOptions(record) : [];
    node.data.processFieldOptions = node.type === 'processNode' ? processNodeFieldOptions(record) : [];
    node.data.processBlockOptions = node.type === 'processNode' ? processNodeBlockOptions(record) : [];
    node.data.processRelationOptions = node.type === 'processNode' ? relationOptionsForEntity(record.entityType) : [];
    node.data.processEventOptions = node.type === 'processNode' ? designer.eventOptions : [];
    node.data.processStatusOptions = node.type === 'processNode' ? processStatusOptions.value : [];
    node.data.processTriggerModeOptions = node.type === 'processNode' ? localizedTriggerModeOptions() : [];
    node.data.processRoleOptions = node.type === 'processNode' ? roleOptions.value : [];
    node.data.processAccessLevelOptions = node.type === 'processNode' ? accessLevelOptions : [];
    node.data.processConnectedInputIds = node.type === 'processNode' ? connectedProcessInputIds(node, record) : [];
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
    node.data.structure = record.structure;
    node.data.value = record.value;
    node.data.block = record.block;
    node.data.path = record.path;
    node.data.kind = record.kind;
    node.data.kindLabel = node.type === 'processNode' ? processNodeDisplayLabel(record) : record.kind;
    node.data.summary = processNodeSummary(record);
    node.data.purpose = node.type === 'processNode' ? processNodeDescription(record) : '';
  }
}

function syncOpenBlockEntryContracts() {
  const recordsByGraphId = new Map(nodes.value
    .filter(node => node.type === 'processNode' && node.data?.refId)
    .map(node => [node.id, draft.value?.data?.processNodes?.[node.data.refId]]));
  for (const edge of edges.value) {
    const target = recordsByGraphId.get(edge.target);
    const entryId = String(edge.targetHandle || '').replace(/^(?:input|data):entry:/, '');
    if (!target || !entryId || target.compositionMode !== 'ancestors') continue;
    const entry = target.entries?.find(item => item.id === entryId);
    const source = recordsByGraphId.get(edge.source);
    if (!entry || !source) continue;
    const sourcePort = portForHandle(resolveCatalogNodePorts(source, catalogContext(source)).outputs, edge.sourceHandle, 'output');
    const entityType = sourcePort?.type?.entityType || sourcePort?.type?.itemType?.entityType || source.entityType || '';
    if (!entityType) continue;
    entry.entityType = entityType;
  }
}

function createServicePrincipal(id) {
  return { id, label: id };
}

function paletteLabel(item) {
  if (item.labelKey && te(item.labelKey)) return t(item.labelKey);
  const key = `processDesigner.paletteItems.${item.label}`;
  return te(key) ? t(key) : humanizeNodeLabel(item.label);
}

function paletteDescription(item) {
  const key = `processDesigner.paletteDescriptions.${item.description || item.label}`;
  return te(key) ? t(key) : paletteLabel(item);
}

function paletteSearchText(item) {
  return [item.kind, paletteLabel(item), paletteDescription(item)].join(' ').toLowerCase();
}

function clonePalettePreset(preset = {}) {
  return clonePlainData(preset);
}

function clonePlainData(value = {}) {
  return JSON.parse(JSON.stringify(value || {}));
}

function paletteGroupLabel(id) {
  const key = `processDesigner.paletteGroups.${id}`;
  return te(key) ? t(key) : humanizeNodeLabel(id);
}

function humanizeNodeLabel(value = '') {
  return String(value)
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .replace(/^./, letter => letter.toUpperCase());
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

function removeStatusDefinition(id) {
  if (!id) return;
  const used = Object.values(draft.value.data.processNodes || {})
    .some(node => node.statusRef === id);
  if (used) {
    toast.add({
      severity: 'warn',
      summary: t('processDesigner.statusInUse'),
      detail: t('processDesigner.statusInUseHelp'),
      life: 3000
    });
    return;
  }
  delete draft.value.data.statusDefinitions[id];
  const removedNodeIds = new Set(nodes.value
    .filter(node => node.type === 'statusDefinition' && node.data?.refId === id)
    .map(node => node.id));
  nodes.value = nodes.value.filter(node => !removedNodeIds.has(node.id));
  edges.value = edges.value.filter(edge => !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target));
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  syncNodeData();
}

function createValueInput(id, structure = 'item') {
  return {
    id,
    label: t(`processDesigner.paletteItems.${structure === 'list' ? 'literalList' : 'literal'}`),
    valueType: 'string',
    structure,
    value: structure === 'list' ? '[]' : ''
  };
}

function createProcessNode(id, kind = 'source.literalItem') {
  const entityKind = processNodeRequiresEntitySelection(kind);
  const fieldKind = ['record.getField', 'record.fieldChange', 'predicate.field'].includes(kind);
  const node = {
    id,
    label: kind,
    kind,
    entityType: entityKind ? defaultEntityType() : '',
    path: '',
    type: processType(kind === 'source.currentTime' ? 'dateTime' : 'json'),
    operation: defaultProcessNodeOperation(kind),
    value: kind === 'source.literalList' ? [] : kind === 'source.literalTree' ? { branches: [] } : null,
    fields: [],
    cases: [],
    icon: iconForProcessNode(kind),
    inputs: [],
    outputs: []
  };
  if (kind === 'effect.createEntity') {
    node.entityType = designer.createEntityOptions[0]?.value || '';
  }
  if (kind === 'effect.changeStatus') node.entityType = designer.changeStatusOptions[0]?.value || '';
  if (kind === 'effect.archiveEntity') node.entityType = designer.archivableEntityOptions[0]?.value || '';
  if (kind === 'effect.deleteEntity') node.entityType = designer.deleteEntityOptions[0]?.value || '';
  if (kind.startsWith('effect.')) {
    node.trigger = { mode: 'manual' };
    node.access = { level: kind === 'effect.deleteEntity' ? 'admin' : 'write', grants: [] };
    node.entryTriggerId = id;
  }
  if (kind === 'source.literalList') node.access = 'list';
  if (kind === 'source.literalTree') node.access = 'tree';
  if (fieldKind) {
    const fields = kind === 'record.getField' ? designer.fieldsForBlock() : designer.fieldsForEntity(node.entityType);
    node.path = fields
      .find(field => field[kind === 'record.fieldChange' ? 'writable' : 'readable'] !== false)?.value || '';
  }
  if (['effect.createEntity', 'effect.runProducer'].includes(kind)) node.status = { to: initialStatusForEntity(node.entityType) };
  if (kind === 'record.deconstruct') {
    node.blocks = designer.blocksForEntity(node.entityType).map(block => block.id);
  }
  if (['record.getBlock', 'record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(kind)) {
    const access = kind === 'record.composeBlock' ? 'constructible'
      : kind === 'record.modifyBlock' ? 'writable'
        : 'readable';
    const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(kind);
    const availableFields = (structural ? designer.fieldsForBlock() : designer.fieldsForEntity(node.entityType))
      .filter(field => field[access] !== false);
    node.block = availableFields[0]?.block || designer.blocksForEntity(node.entityType)[0]?.id || designer.blocks[0]?.id || '';
    if (kind === 'record.getField') {
      node.path = availableFields.find(field => field.block === node.block)?.value || '';
    }
    if (['record.composeBlock', 'record.modifyBlock'].includes(kind)) {
      node.fields = availableFields.filter(field => field.block === node.block).slice(0, 1).map(field => field.value);
    }
  }
  if (kind === 'read.related') {
    node.relationKey = relationOptionsForEntity(node.entityType)[0]?.value || '';
  }
  if (kind === 'effect.runCommand') node.commandId = designer.commandOptions[0]?.value || '';
  if (kind === 'effect.generateAttachment') node.attachmentKind = designer.attachmentKindOptions[0]?.value || '';
  if (kind === 'control.domainEventTrigger') node.eventId = designer.eventOptions[0]?.value || '';
  syncProcessNode(node);
  return node;
}

async function addRole() {
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  try {
    const role = await rolePersistence.create(organizationId, `Role ${Object.keys(organizationRoles.value).length + 1}`);
    organizationRoles.value = { ...organizationRoles.value, [role.id]: role };
    selectedRoleId.value = role.id;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  }
}

async function saveSelectedRole() {
  if (!selectedRoleRecord.value) return;
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  try {
    const role = await rolePersistence.update(organizationId, selectedRoleId.value, selectedRoleRecord.value.label);
    organizationRoles.value = { ...organizationRoles.value, [role.id]: role };
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
    await loadOrganizationRoles();
  }
}

async function removeSelectedRole() {
  if (!selectedRoleId.value) return;
  const removedRoleId = selectedRoleId.value;
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  try {
    await rolePersistence.remove(organizationId, removedRoleId);
    const next = { ...organizationRoles.value };
    delete next[removedRoleId];
    organizationRoles.value = next;
    selectedRoleId.value = Object.keys(next)[0] || null;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
  }
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
  screenEditing.add();
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
  screenEditing.removeSelected();
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
      screenRegion.actions ||= [];
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
      actions: []
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
    actions: []
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
  ensureRequiredEntityProfiles(selectedAction.value, selectedNode.value);
  syncNodeData();
}

function ensureRequiredEntityProfiles(action = {}, anchorNode = null) {
  const requiredTypes = requiredEntityProfileTypes({ actions: { [action.id || 'action']: action } }, cncDomain);
  const existingTypes = new Set(Object.values(draft.value?.data?.entityProfiles || {}).map(profile => profile.entityType));
  const missingTypes = requiredTypes.filter(entityType => !existingTypes.has(entityType));
  if (!missingTypes.length) return;

  draft.value.data.entityProfiles ||= {};
  const anchor = anchorNode?.position || { x: 0, y: 0 };
  const grants = normalizeDesignerAccess(action.access).grants;
  missingTypes.forEach((entityType, index) => {
    const id = uniqueEntityProfileId(entityType);
    const profile = createEntityProfileForType(id, entityType, grants);
    draft.value.data.entityProfiles[id] = profile;
    nodes.value.push(enrichNodeData({
      id,
      type: 'entity',
      position: { x: anchor.x + 360, y: anchor.y + index * 160 },
      data: { refId: id, label: profile.label, entityType }
    }));
  });
}

function uniqueEntityProfileId(entityType) {
  const base = `entity_${entityType}`;
  if (!draft.value?.data?.entityProfiles?.[base] && !nodes.value.some(node => node.id === base)) return base;
  return `${base}_${Date.now()}`;
}

function createEntityProfileForType(id, entityType, grants = []) {
  const profile = createEntityProfile(id);
  profile.entityType = entityType;
  profile.label = entityTypeOptions.value.find(option => option.value === entityType)?.label || entityType;
  profile.lifecycle = cncDomain.workflows?.[entityType]
    ? { mode: 'domainDefault', workflow: null }
    : { mode: 'defaultCreated', workflow: createCreatedWorkflow() };
  profile.relations = relationOptionsForEntity(entityType).map(option => option.value);
  profile.allowedRoles = { read: [], write: [], admin: [] };
  for (const grant of grants) {
    if (profile.allowedRoles[grant.level] && !profile.allowedRoles[grant.level].includes(grant.roleId)) {
      profile.allowedRoles[grant.level].push(grant.roleId);
    }
  }
  syncEntityProfileIo(profile);
  return profile;
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
  const promptFields = constructionInputs.filter(input => input.prompt);
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
  return designer.createModes(entityType).map(value => ({ label: value, value }));
}

function constructionInputsForMode(contract = {}, mode = '') {
  return contract.modeInputs?.[mode] || contract.inputs || [];
}

function artifactCreationKinds(record = {}) {
  const creator = (record.construction?.inputs || []).find(input => input.creator?.entityType === 'artifact')?.creator;
  if (creator?.attachmentKinds === 'userCreatable' || !Array.isArray(creator?.attachmentKinds)) {
    return artifactUploadKindOptions.value.map(option => option.value);
  }
  return creator.attachmentKinds.map(kind => typeof kind === 'string' ? kind : kind.kind).filter(Boolean);
}

function updateArtifactCreationKinds(record = {}, kinds = []) {
  record.construction ||= {};
  const contractInput = constructionInputsForMode(constructionContractForEntity(record.entityType), record.construction.mode)
    .find(input => input.creator?.entityType === 'artifact');
  if (!contractInput) return;
  const index = (record.construction.inputs || []).findIndex(input => input.id === contractInput.id);
  const attachmentKinds = (kinds || []).map(kind => {
    const definition = designer.attachmentKindOptions.find(option => option.value === kind);
    return { kind, creation: definition?.creation || { mode: 'workflow' } };
  });
  const input = {
    ...(index >= 0 ? record.construction.inputs[index] : contractInput),
    creator: { ...contractInput.creator, attachmentKinds }
  };
  if (index >= 0) record.construction.inputs[index] = input;
  else record.construction.inputs = [...(record.construction.inputs || []), input];
  syncNodeData();
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
  return designer.construction(entityType) || {};
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

function pruneStatusLifecycle(status = {}) {
  const lifecycle = status.lifecycle;
  if (!lifecycle) return;
  if (!lifecycle.description?.required) delete lifecycle.description;
  if (!lifecycle.attachments || Object.keys(lifecycle.attachments).length === 0) delete lifecycle.attachments;
  if (!lifecycle.snapshots || Object.keys(lifecycle.snapshots).length === 0) delete lifecycle.snapshots;
  if (Object.keys(lifecycle).length === 0) delete status.lifecycle;
}

function syncValueInput(input = {}) {
  input.valueType ||= 'string';
  input.structure = input.structure === 'list' ? 'list' : 'item';
  input.label ||= input.id;
  input.icon ||= 'pi pi-circle-fill';
  input.value ??= '';
  input.outputs = [{
    id: 'value',
    label: input.label || input.id,
    kind: input.structure === 'list' ? `${input.valueType}_list` : input.valueType
  }];
}

function syncProcessNode(node = {}) {
  node.kind ||= 'source.literalItem';
  if (['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(node.kind)) {
    delete node.entityType;
    delete node.fieldSchema;
    delete node.fieldSchemas;
  }
  if (node.type?.base === 'block') delete node.type.entityType;
  if (node.kind === 'collection.sort') {
    node.direction = ['asc', 'desc'].includes(node.direction) ? node.direction : 'asc';
    delete node.operation;
  } else {
    node.operation ||= defaultProcessNodeOperation(node.kind);
  }
  node.type = node.type?.base ? processType(node.type.base, node.type) : processType('json');
  node.access = node.kind === 'source.literalList' ? 'list' : node.kind === 'source.literalTree' ? 'tree' : (node.access || 'item');
  node.matching = ['longest', 'shortest', 'cross'].includes(node.matching) ? node.matching : 'longest';
  node.inputTransforms ||= {};
  node.icon = iconForProcessNode(node.kind);
  const referencedStatus = node.statusRef
    ? draft.value?.data?.statusDefinitions?.[node.statusRef]
    : null;
  if (referencedStatus?.statusId) {
    node.inputDefaults ||= {};
    node.inputDefaults['status.state.primary'] = { branches: [{ path: [], items: [referencedStatus.statusId] }] };
    node.status ||= {};
    node.status.to = referencedStatus.statusId;
  }
  if (node.kind === 'source.literalItem' && node.type?.base === 'entityRef') {
    node.entityType ||= defaultEntityType();
    node.type.entityType = node.entityType;
    if (node.value?.id) node.value = { ...node.value, type: node.entityType };
  }
  delete node.retry;
  if (node.kind.startsWith('effect.')) {
    node.trigger ||= { mode: 'manual' };
    if (!['manual', 'event'].includes(node.trigger.mode)) node.trigger.mode = 'event';
    node.access = normalizeDesignerAccess(node.access);
    node.entryTriggerId = node.id;
  }
  if (['effect.createEntity', 'effect.runProducer'].includes(node.kind)) syncProcessNodeConstruction(node);
  if (['effect.createEntity', 'effect.runProducer'].includes(node.kind)) {
    node.status ||= {};
    node.status.to ||= initialStatusForEntity(node.entityType);
  }
  if (processNodeUsesPath(node)) {
    const access = node.kind === 'record.fieldChange' ? 'writable' : 'readable';
    const composition = node.kind === 'record.getField' ? openBlockComposition(node) : null;
    if (composition) {
      node.compositionMode = composition.mode;
      node.compositionValueBase = composition.valueBase;
      const inferredKey = String(node.path || '').replace(`${node.block}.`, '').replace(node.block, '');
      if (!node.entryKey && inferredKey) node.entryKey = inferredKey;
      if (!node.entryKey && !['ancestors', 'relations'].includes(composition.mode)) node.entryKey = 'value';
      node.path = node.entryKey ? `${node.block}.${node.entryKey}` : '';
      if (composition.mode === 'ancestors') {
        node.type = processType('entityRef', { entityType: openBlockReadEntityType(node) || defaultEntityType() });
      } else if (composition.mode === 'relations') {
        const entityType = openBlockReadEntityType(node) || defaultEntityType();
        node.type = processType('entityRef', { entityType });
      } else if (composition.mode === 'attachments') {
        node.type = processType('attachmentRef', {
          attachmentKind: node.type?.attachmentKind || designer.attachmentKindOptions[0]?.value || ''
        });
      } else {
        node.type = node.type?.base && node.type.base !== 'block' ? node.type : processType(composition.valueBase || 'json');
      }
    } else {
      delete node.compositionMode;
      delete node.compositionValueBase;
      const available = (node.kind === 'record.getField' ? designer.fieldsForBlock(node.block) : designer.fieldsForEntity(node.entityType))
        .filter(field => field[access] !== false)
        .filter(field => !node.block || field.block === node.block);
      if (!available.some(field => field.value === node.path)) node.path = available[0]?.value || '';
      delete node.entryKey;
    }
  } else {
    node.path = '';
  }
  delete node.fieldSchema;
  if (processNodeUsesBlock(node)) {
    const blocks = processNodeBlockOptions(node);
    if (!blocks.some(block => block.value === node.block)) node.block = blocks[0]?.value || '';
    if (node.kind === 'record.getField') {
      const composition = openBlockComposition(node);
      if (composition) {
        if (!node.entryKey && !['ancestors', 'relations'].includes(composition.mode)) node.entryKey = 'value';
        node.path = node.entryKey ? `${node.block}.${node.entryKey}` : '';
      } else {
        const fields = designer.fieldsForBlock(node.block);
        if (!fields.some(field => field.value === node.path)) node.path = fields[0]?.value || '';
      }
    }
  }
  if (node.kind === 'read.related') {
    const relations = relationOptionsForEntity(node.entityType);
    if (!relations.some(relation => relation.value === node.relationKey)) node.relationKey = relations[0]?.value || '';
  }
  if (node.kind === 'record.deconstruct') {
    node.blocks = designer.blocksForEntity(node.entityType).map(block => block.id);
    node.fields = [];
  }
  if (['record.composeBlock', 'record.modifyBlock'].includes(node.kind)) {
    delete node.entityType;
    const composition = openBlockComposition(node);
    if (composition) {
      node.compositionMode = composition.mode;
      node.compositionValueBase = composition.valueBase;
      if (!Array.isArray(node.entries)) node.entries = [createOpenBlockEntry(node)];
      if (composition.mode === 'relations') node.entries = node.entries.map(({ cardinality, operation, ...entry }) => entry);
      node.fields = [];
    } else {
      delete node.compositionMode;
      delete node.compositionValueBase;
      delete node.entries;
      const access = node.kind === 'record.composeBlock' ? 'constructible' : 'writable';
      const available = designer.fieldsForBlock(node.block).filter(field => field[access] !== false);
      const inBlock = available.filter(field => field.block === node.block);
      node.fields = (node.fields || []).filter(path => inBlock.some(field => field.value === path));
      if (!node.fields.length && inBlock[0]) node.fields = [inBlock[0].value];
    }
    delete node.fieldSchemas;
  }
  if (['effect.createEntity', 'effect.updateEntity'].includes(node.kind)) {
    node.blocks = node.kind === 'effect.createEntity'
      ? constructibleEntityBlocks(node.entityType)
      : writableEntityBlocks(node.entityType);
    node.fields = [];
  }
  if (['predicate.field', 'value.compare'].includes(node.kind)) {
    const allowed = processNodeOperationOptions(node).map(option => option.value);
    if (!allowed.includes(node.operation)) node.operation = allowed[0] || 'eq';
  }
  node.label = node.kind;
  node.inputs = processNodeInputs(node);
  node.outputs = processNodeOutputs(node);
  node.inputDefaults ||= {};
  const inputIds = new Set(node.inputs.map(input => input.id));
  for (const inputId of Object.keys(node.inputDefaults)) {
    if (!inputIds.has(inputId)) delete node.inputDefaults[inputId];
  }
}

function syncProcessNodeConstruction(node = {}) {
  const contract = constructionContractForEntity(node.entityType);
  const modes = contract.modes?.length ? contract.modes : ['genericCreate'];
  node.construction ||= {};
  if (!modes.includes(node.construction.mode)) {
    node.construction.mode = contract.defaultMode && modes.includes(contract.defaultMode)
      ? contract.defaultMode
      : modes[0];
  }
  node.construction.inputs = constructionInputsForMode(contract, node.construction.mode)
    .map(input => ({ ...input }));
}

function applyInferredProcessNodeInputs(record = {}) {
  if (record?.kind) syncProcessNode(record);
}

function defaultProcessNodeValueType(kind = '', operation = '') {
  if (kind === 'compare') return ['gt', 'gte', 'lt', 'lte'].includes(operation) ? 'number' : 'string';
  return 'string';
}

function defaultProcessNodeOperation(kind = '') {
  return (processNodeOperations[kind] || [''])[0] || '';
}

function processNodeOperationOptions(kind = '') {
  const record = typeof kind === 'object' ? kind : { kind };
  const operations = processNodeOperations[record.kind] || [];
  return operations.map(value => ({ label: processNodeOperationLabels[value] || value, value }));
}

function processNodeFieldOptions(node = {}) {
  const fieldSetKind = ['record.composeBlock', 'record.modifyBlock'].includes(node.kind);
  if (!processNodeUsesPath(node) && !fieldSetKind) return [];
  if (openBlockComposition(node)) return [];
  const access = node.kind === 'record.composeBlock' ? 'constructible'
    : ['record.fieldChange', 'record.modifyBlock'].includes(node.kind) ? 'writable'
      : 'readable';
  const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(node.kind);
  return (structural ? designer.fieldsForBlock(node.block) : designer.fieldsForEntity(node.entityType))
    .filter(field => field[access] !== false)
    .filter(field => !node.block || field.block === node.block)
    .map(field => ({
      label: field.i18n ? `${t(field.i18n)} · ${field.value}` : field.label,
      value: field.value,
      type: field.type
    }));
}

function processNodeHasSelectableFieldSet(node = {}) {
  if (!['record.composeBlock', 'record.modifyBlock'].includes(node.kind)) return false;
  if (openBlockComposition(node)) return false;
  const options = processNodeFieldOptions(node);
  return !(options.length === 1 && options[0].value === node.block);
}

function processNodeBlockOptions(node = {}) {
  if (!processNodeUsesBlock(node)) return [];
  if (['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(node.kind)) {
    const available = new Set(designer.fieldsForBlock().map(field => field.block));
    return designer.blocks
      .filter(block => available.has(block.id))
      .filter(block => node.kind === 'record.getField' || !managedProcessBlocks.has(block.id))
      .map(block => ({ label: block.label, value: block.id }));
  }
  const access = node.kind === 'record.composeBlock' ? 'constructible'
    : node.kind === 'record.modifyBlock' ? 'writable'
      : 'readable';
  const available = new Set(designer.fieldsForEntity(node.entityType)
    .filter(field => field[access] !== false)
    .map(field => field.block));
  return designer.blocksForEntity(node.entityType)
    .filter(block => node.kind === 'record.getBlock' || available.has(block.id))
    .map(block => ({ label: block.label, value: block.id }));
}

function processNodeUsesBlock(node = {}) {
  return ['record.getBlock', 'record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(node.kind);
}

function processNodeUsesPath(node = {}) {
  return ['record.getField', 'record.fieldChange', 'predicate.field'].includes(node.kind);
}

function processNodeInputs(node = {}) {
  return resolveCatalogNodePorts(node, catalogContext(node)).inputs
    .map(port => ({ ...port, label: processPortLabel(node, port) }));
}

function processNodeOutputs(node = {}) {
  return resolveCatalogNodePorts(node, catalogContext(node)).outputs
    .map(port => ({ ...port, label: processPortLabel(node, port) }));
}

function catalogContext(node = {}) {
  const structural = ['record.getField', 'record.composeBlock', 'record.modifyBlock'].includes(node.kind);
  return {
    fieldSchema: structural
      ? designer.fieldsForBlock(node.block).find(field => field.value === node.path) || null
      : designer.fieldsForEntity(node.entityType).find(field => field.value === node.path) || null,
    fieldSchemas: structural ? designer.fieldsForBlock(node.block) : designer.fieldsForEntity(node.entityType),
    blockComposition: openBlockComposition(node),
    command: designer.domain.commands?.[node.commandId] || null
  };
}

function processNodeRequiresEntitySelection(kind = '') {
  if (['record.getField', 'record.composeBlock', 'record.modifyBlock', 'record.construct', 'effect.runCommand'].includes(kind)) return false;
  return ['record.', 'predicate.', 'read.', 'effect.'].some(prefix => kind.startsWith(prefix))
    || kind === 'control.entityChangedTrigger';
}

function connectedProcessInputIds(graphNode = {}, record = {}) {
  const inputs = resolveCatalogNodePorts(record, catalogContext(record)).inputs;
  return edges.value
    .filter(edge => edge.target === graphNode.id)
    .map(edge => {
      const handle = String(edge.targetHandle || '');
      if ((!handle || handle === 'input') && inputs.length === 1) return inputs[0].id;
      return handle.replace(/^(input|data|control):/, '');
    })
    .filter(Boolean);
}

function processNodeSummary(node = {}) {
  const fields = (node.fields || []).length
    ? `${node.fields.slice(0, 2).join(', ')}${node.fields.length > 2 ? ` +${node.fields.length - 2}` : ''}`
    : '';
  const showsType = node.kind?.startsWith('source.')
    || node.kind?.startsWith('value.')
    || node.kind?.startsWith('collection.')
    || node.kind?.startsWith('tree.');
  return [
    node.entityType,
    node.eventId,
    node.path || fields,
    node.block,
    showsType && node.type ? formatProcessType(node.type) : '',
    node.kind === 'collection.sort' ? node.direction : node.operation
  ].filter(Boolean).join(' · ');
}

function constructibleEntityBlocks(entityType = '') {
  const fieldBlocks = designer.fieldsForEntity(entityType)
    .filter(field => field.constructible !== false)
    .map(field => field.block)
    .filter(block => block && !managedProcessBlocks.has(block));
  const openBlocks = designer.blocksForEntity(entityType)
    .map(block => block.id)
    .filter(block => designer.blockComposition(block) && !managedProcessBlocks.has(block));
  return [...new Set([...fieldBlocks, ...openBlocks])];
}

function writableEntityBlocks(entityType = '') {
  return [...new Set(designer.fieldsForEntity(entityType)
    .filter(field => field.writable !== false)
    .map(field => field.block)
    .filter(block => block && !['origin', 'status', 'provenance', 'summary'].includes(block)))];
}

function processEntityTypeOptions(node = {}) {
  const kind = node.kind || '';
  if (kind === 'effect.createEntity' || kind === 'effect.runProducer') return designer.createEntityOptions;
  if (kind === 'effect.updateEntity') return designer.updateEntityOptions;
  if (kind === 'effect.changeStatus') return designer.changeStatusOptions;
  if (kind === 'effect.archiveEntity') return designer.archivableEntityOptions;
  if (kind === 'effect.deleteEntity') return designer.deleteEntityOptions;
  if (kind === 'read.queryEntities' || kind === 'read.children') return designer.listableEntityOptions;
  if (kind.startsWith('read.')) return designer.readableEntityOptions;
  return entityTypeOptions.value;
}

function processPortTypeLabel(type = 'data') {
  if (type?.base) return formatProcessType(type);
  return String(type || 'data');
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
  if (node.label && node.label !== node.kind) return node.label;
  if (['value.cast', 'value.parse', 'value.convertUnit', 'value.toEntityRef', 'value.toJson'].includes(node.kind)) {
    return t('processDesigner.automaticConversion', { type: node.type ? formatProcessType(node.type) : '' });
  }
  const item = designer.paletteGroups.flatMap(group => group.items).find(candidate => candidate.kind === node.kind);
  return item ? paletteLabel(item) : humanizeNodeLabel(node.kind || '');
}

function processNodeDescription(node = {}) {
  const items = designer.paletteGroups.flatMap(group => group.items);
  const item = items.find(candidate => paletteLabel(candidate) === node.label)
    || items.find(candidate => candidate.kind === node.kind);
  return item ? paletteDescription(item) : '';
}

function processSocketLabel(value = '') {
  const normalized = String(value).replace(/\s+/g, '');
  const key = `processDesigner.socketLabels.${normalized}`;
  return te(key) ? t(key) : humanizeNodeLabel(value);
}

function processPortLabel(node = {}, port = {}) {
  const field = designer.fieldsForEntity(node.entityType).find(candidate => candidate.value === port.id);
  if (field) return field.i18n ? t(field.i18n) : field.label;
  if (port.role === 'data' && port.id === 'start') return t('processDesigner.socketLabels.startPosition');
  return processSocketLabel(port.label || port.id);
}

function iconForProcessNode(kind = '') {
  if (kind.startsWith('source.')) return 'pi pi-circle-fill';
  if (kind.startsWith('value.')) return 'pi pi-sliders-h';
  if (kind.startsWith('collection.') || kind.startsWith('tree.')) return 'pi pi-list';
  if (kind.startsWith('record.')) return 'pi pi-box';
  if (kind.startsWith('predicate.')) return 'pi pi-filter';
  if (kind.startsWith('read.')) return 'pi pi-database';
  if (kind.startsWith('effect.')) return 'pi pi-bolt';
  return 'pi pi-directions';
}

function fieldLabel(entityType = '', path = '') {
  return fieldOptions(entityType).find(option => option.value === path)?.label || path || t('processDesigner.field');
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
      event: t('processDesigner.automaticTrigger')
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
      valueInputRecord: node.type === 'valueInput' ? record : null,
      onValueInputUpdate: node.type === 'valueInput' ? updates => updateValueInputRecord(record.id || node.data?.refId, updates) : null,
      processNodeRecord: node.type === 'processNode' ? record : null,
      onProcessNodeUpdate: node.type === 'processNode' ? updates => updateProcessNodeRecord(record.id || node.data?.refId, updates) : null,
      statusDefinitionRecord: node.type === 'statusDefinition' ? record : null,
      onStatusDefinitionUpdate: node.type === 'statusDefinition' ? updates => updateStatusDefinitionRecord(record.id || node.data?.refId, updates) : null,
      onStatusDefinitionDelete: node.type === 'statusDefinition' ? () => removeStatusDefinition(record.id || node.data?.refId) : null,
      processValueTypeOptions: ['valueInput', 'processNode'].includes(node.type) ? processValueTypeOptions : [],
      processEntityTypeOptions: node.type === 'processNode' ? processEntityTypeOptions(record) : [],
      processOperationOptions: node.type === 'processNode' ? processNodeOperationOptions(record) : [],
      processFieldOptions: node.type === 'processNode' ? processNodeFieldOptions(record) : [],
      processBlockOptions: node.type === 'processNode' ? processNodeBlockOptions(record) : [],
      processRelationOptions: node.type === 'processNode' ? relationOptionsForEntity(record.entityType) : [],
      processEventOptions: node.type === 'processNode' ? designer.eventOptions : [],
      processStatusOptions: node.type === 'processNode' ? processStatusOptions.value : [],
      processTriggerModeOptions: node.type === 'processNode' ? localizedTriggerModeOptions() : [],
      processRoleOptions: node.type === 'processNode' ? roleOptions.value : [],
      processAccessLevelOptions: node.type === 'processNode' ? accessLevelOptions : [],
      processConnectedInputIds: node.type === 'processNode' ? connectedProcessInputIds(node, record) : [],
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
      summary: processNodeSummary(record),
      purpose: node.type === 'processNode' ? processNodeDescription(record) : ''
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

function updateValueInputRecord(inputId, updates = {}) {
  const input = draft.value?.data?.valueInputs?.[inputId];
  if (!input) return;
  Object.assign(input, updates);
  syncValueInput(input);
  syncNodeData();
}

function updateStatusDefinitionRecord(statusId, updates = {}) {
  const status = draft.value?.data?.statusDefinitions?.[statusId];
  if (!status) return;
  Object.assign(status, updates);
  syncStatusDefinition(status);
  syncNodeData();
}

function mutateSelectedStatusLifecycle(mutator) {
  if (!selectedStatusDefinition.value?.id) return;
  const lifecycle = structuredClone(selectedStatusDefinition.value.lifecycle || {});
  mutator(lifecycle);
  if (!lifecycle.description?.required) delete lifecycle.description;
  if (!Object.keys(lifecycle.attachments || {}).length) delete lifecycle.attachments;
  if (!Object.keys(lifecycle.snapshots || {}).length) delete lifecycle.snapshots;
  updateStatusDefinitionRecord(selectedStatusDefinition.value.id, {
    lifecycle: Object.keys(lifecycle).length ? lifecycle : undefined
  });
}

function setSelectedStatusDescriptionRequired(required) {
  mutateSelectedStatusLifecycle(lifecycle => {
    if (required) lifecycle.description = { required: true };
    else delete lifecycle.description;
  });
}

function addSelectedStatusAttachment() {
  mutateSelectedStatusLifecycle(lifecycle => {
    lifecycle.attachments ||= {};
    const key = uniqueStatusLifecycleKey('proof', lifecycle.attachments);
    lifecycle.attachments[key] = { kind: 'photo', required: true };
  });
}

function updateSelectedStatusAttachment(key, updates) {
  mutateSelectedStatusLifecycle(lifecycle => Object.assign(lifecycle.attachments[key], updates));
}

function removeSelectedStatusAttachment(key) {
  mutateSelectedStatusLifecycle(lifecycle => delete lifecycle.attachments?.[key]);
}

function addSelectedStatusSnapshot() {
  mutateSelectedStatusLifecycle(lifecycle => {
    lifecycle.snapshots ||= {};
    const key = uniqueStatusLifecycleKey('snapshot', lifecycle.snapshots);
    lifecycle.snapshots[key] = {
      entityType: entityTypeOptions.value[0]?.value || '',
      lineageKey: '',
      required: true
    };
  });
}

function updateSelectedStatusSnapshot(key, updates) {
  mutateSelectedStatusLifecycle(lifecycle => Object.assign(lifecycle.snapshots[key], updates));
}

function removeSelectedStatusSnapshot(key) {
  mutateSelectedStatusLifecycle(lifecycle => delete lifecycle.snapshots?.[key]);
}

function renameSelectedStatusLifecycleEntry(section, previous, value) {
  const next = String(value || '').trim();
  if (!next || next === previous || selectedStatusDefinition.value.lifecycle?.[section]?.[next]) return;
  mutateSelectedStatusLifecycle(lifecycle => {
    lifecycle[section][next] = lifecycle[section][previous];
    delete lifecycle[section][previous];
  });
}

function uniqueStatusLifecycleKey(prefix, entries) {
  let index = 1;
  while (entries[`${prefix}${index}`]) index += 1;
  return `${prefix}${index}`;
}

function updateProcessNodeRecord(nodeId, updates = {}) {
  const node = draft.value?.data?.processNodes?.[nodeId];
  if (!node) return;
  if (updates.entityType && updates.entityType !== node.entityType) {
    node.block = '';
    node.path = '';
    node.relationKey = '';
  }
  if (updates.block && updates.block !== node.block) {
    node.path = '';
    node.entryKey = '';
    delete node.relationCardinality;
    delete node.entries;
    delete node.compositionMode;
    delete node.compositionValueBase;
  }
  Object.assign(node, updates);
  if (updates.trigger?.mode === 'manual') {
    const graphNodeId = nodes.value.find(item => item.type === 'processNode' && item.data?.refId === nodeId)?.id;
    edges.value = edges.value.filter(edge => !(
      edge.target === graphNodeId
      && String(edge.targetHandle || '').startsWith('control:')
    ));
  }
  if (updates.mode) node.operation = updates.mode;
  if (updates.operation && node.kind === 'compare') {
    if (['gt', 'gte', 'lt', 'lte'].includes(updates.operation)) node.valueType = 'number';
    if (updates.operation === 'contains') node.valueType = 'string';
  }
  syncProcessNode(node);
  pruneMissingProcessNodeInputEdges(nodeId, node);
  syncNodeData();
}

function updateProcessNodeConstructionMode(node = {}, mode = '') {
  if (!node?.id || !mode || node.construction?.mode === mode) return;
  updateProcessNodeRecord(node.id, {
    construction: { ...(node.construction || {}), mode }
  });
}

function pruneMissingProcessNodeInputEdges(nodeId, node = {}) {
  const graphNodeId = nodes.value.find(item => item.type === 'processNode' && item.data?.refId === nodeId)?.id;
  if (!graphNodeId) return;
  const inputIds = new Set(processNodeInputs(node).map(input => input.id));
  edges.value = edges.value.filter(edge => (
    edge.target !== graphNodeId
    || !/^(?:input|data):/.test(String(edge.targetHandle || ''))
    || inputIds.has(String(edge.targetHandle).replace(/^(?:input|data):/, ''))
  ));
}

function validProcessEdges() {
  const processNodesByGraphId = new Map(nodes.value
    .filter(node => node.type === 'processNode' && node.data?.refId)
    .map(node => [node.id, draft.value?.data?.processNodes?.[node.data.refId]]));
  return edges.value.filter(edge => {
    const node = processNodesByGraphId.get(edge.target);
    if (!node || !/^(?:input|data):/.test(String(edge.targetHandle || ''))) return true;
    const inputId = String(edge.targetHandle).replace(/^(?:input|data):/, '');
    return processNodeInputs(node).some(input => input.id === inputId);
  });
}

function openBlockComposition(node = {}) {
  return node.block ? designer.blockComposition(node.block) : null;
}

function createOpenBlockEntry(node = {}) {
  const composition = openBlockComposition(node);
  const usedKeys = new Set((node.entries || []).map(entry => entry.key).filter(Boolean));
  const uniqueKey = prefix => {
    let key = prefix;
    let index = 2;
    while (usedKeys.has(key)) key = `${prefix}${index++}`;
    return key;
  };
  const entry = { id: `entry_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` };
  if (composition?.mode === 'ancestors') {
    Object.assign(entry, { key: '', entityType: '' });
  }
  if (composition?.mode === 'relations') {
    Object.assign(entry, {
      key: '',
      entityType: '',
      attachmentKinds: []
    });
  }
  if (composition?.mode === 'attachments') Object.assign(entry, {
    key: uniqueKey('primary'),
    attachmentKind: designer.attachmentKindOptions[0]?.value || ''
  });
  if (composition?.mode === 'entries') Object.assign(entry, { key: uniqueKey('value'), type: processType('string') });
  return entry;
}

function addOpenBlockEntry(node = {}) {
  node.entries ||= [];
  node.entries.push(createOpenBlockEntry(node));
  syncNodeData();
}

function updateOpenBlockEntry(node, index, updates) {
  if (!node?.entries?.[index]) return;
  node.entries[index] = { ...node.entries[index], ...updates };
  syncNodeData();
}

function updateInputTransform(node, inputId, transform, enabled) {
  node.inputTransforms ||= {};
  node.inputTransforms[inputId] = { ...(node.inputTransforms[inputId] || {}), [transform]: Boolean(enabled) };
  if (!Object.values(node.inputTransforms[inputId]).some(Boolean)) delete node.inputTransforms[inputId];
  syncNodeData();
}

function updateOpenBlockEntryType(node, index, base) {
  updateOpenBlockEntry(node, index, { type: processType(base) });
}

function updateOpenBlockEntryEntityType(node, index, entityType) {
  updateOpenBlockEntry(node, index, { type: processType('entityRef', { entityType }) });
}

function updateRelationEntryType(node, index, entityType) {
  const entry = node?.entries?.[index];
  if (!entry) return;
  updateOpenBlockEntry(node, index, {
    entityType,
    key: entityType || entry.key,
    ...(entityType === 'artifact' ? {} : { attachmentKinds: [] })
  });
  syncProcessNode(node);
  syncNodeData();
}

function removeOpenBlockEntry(node, index) {
  const entry = node?.entries?.[index];
  if (!entry) return;
  const graphNodeId = nodes.value.find(item => item.type === 'processNode' && item.data?.refId === node.id)?.id;
  edges.value = edges.value.filter(edge => !(
    edge.target === graphNodeId
    && String(edge.targetHandle || '').replace(/^(input|data):/, '') === `entry:${entry.id}`
  ));
  delete node.inputDefaults?.[`entry:${entry.id}`];
  node.entries.splice(index, 1);
  syncNodeData();
}

function updateOpenBlockReadKey(value) {
  const node = selectedProcessNode.value;
  if (!node) return;
  node.entryKey = String(value || '');
  node.path = node.entryKey ? `${node.block}.${node.entryKey}` : '';
  syncNodeData();
}

function openBlockReadEntityType(node = {}) {
  return node.type?.base === 'array' ? node.type.itemType?.entityType || '' : node.type?.entityType || '';
}

function updateOpenBlockReadType(base) {
  const node = selectedProcessNode.value;
  if (!node) return;
  node.type = processType(base);
  syncNodeData();
}

function updateOpenBlockReadEntityType(entityType) {
  const node = selectedProcessNode.value;
  if (!node) return;
  node.type = processType('entityRef', { entityType });
  syncNodeData();
}

function updateOpenBlockReadAttachmentKind(attachmentKind) {
  const node = selectedProcessNode.value;
  if (!node) return;
  node.type = processType('attachmentRef', { attachmentKind });
  syncNodeData();
}

function setSelectedProcessNodeGrants(grants) {
  if (!selectedProcessNode.value?.id) return;
  updateProcessNodeRecord(selectedProcessNode.value.id, {
    access: {
      ...(selectedProcessNode.value.access || {}),
      grants
    }
  });
}

function addSelectedProcessNodeGrant() {
  if (!nextSelectedProcessNodeRoleId.value) return;
  setSelectedProcessNodeGrants([
    ...selectedProcessNodeGrants.value,
    { roleId: nextSelectedProcessNodeRoleId.value, level: 'write' }
  ]);
}

function selectedProcessNodeRoleOptions(index) {
  const usedByOthers = new Set(selectedProcessNodeGrants.value
    .filter((_, grantIndex) => grantIndex !== index)
    .map(grant => grant.roleId));
  return roleOptions.value.filter(option => !usedByOthers.has(option.value));
}

function updateSelectedProcessNodeGrant(index, updates) {
  setSelectedProcessNodeGrants(selectedProcessNodeGrants.value.map((grant, grantIndex) => (
    grantIndex === index ? { ...grant, ...updates } : grant
  )));
}

function removeSelectedProcessNodeGrant(index) {
  setSelectedProcessNodeGrants(selectedProcessNodeGrants.value.filter((_, grantIndex) => grantIndex !== index));
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
  const runtimeFreeNode = { ...node };
  delete runtimeFreeNode.selected;
  delete runtimeFreeNode.dragging;
  delete runtimeFreeNode.resizing;
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
    'onActionResetAccess',
    'valueInputRecord',
    'onValueInputUpdate',
    'processNodeRecord',
    'onProcessNodeUpdate',
    'statusDefinitionRecord',
    'onStatusDefinitionUpdate',
    'onStatusDefinitionDelete',
    'statusSeverityOptions',
    'statusIconOptions',
    'attachmentKindOptions',
    'evidenceLabel',
    'processValueTypeOptions',
    'processEntityTypeOptions',
    'processOperationOptions',
    'processFieldOptions',
    'processBlockOptions',
    'processRelationOptions',
    'processEventOptions',
    'processStatusOptions',
    'processTriggerModeOptions',
    'processRoleOptions',
    'processAccessLevelOptions',
    'processConnectedInputIds'
  ]) {
    delete data[key];
  }
  return { ...runtimeFreeNode, data };
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

function fieldPathAllowed(entityType = '', path = '', access = 'read') {
  const policy = designer.fieldPolicy(entityType);
  const allowed = [
    ...(policy[access] || []),
    ...(access === 'write' ? (policy.admin || []) : [])
  ];
  return allowed.some(pattern => (
    pattern === path
    || pattern === '*'
    || (pattern.endsWith('.*') && path.startsWith(pattern.slice(0, -1)))
  ));
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
  ensureRequiredEntityProfiles({
    id: selectedService.value.id,
    actionKind: 'runCommand',
    commandId: selectedService.value.commandId,
    access: { grants: [] }
  }, selectedNode.value);
  syncNodeData();
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
  contextPalette.value.socket = null;
  syncNodeData();
  const processNodeSnapshot = clonePlainData(draft.value?.data?.processNodes || {});
  inferGenericNodeTypeFromConnection(connection);
  const compatibility = connectionCompatibility(connection);
  if (!compatibility.ok) {
    draft.value.data.processNodes = processNodeSnapshot;
    syncNodeData();
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
    role: compatibility.source?.role === 'data' ? 'data' : 'control',
    data: { kind: compatibility.source?.role || 'data' }
  }));
  applySemanticConnection(connection);
  syncEdgeSelection();
  syncInferredActionInputs();
}

function connectionCompatibility(connection = {}) {
  const source = nodes.value.find(item => item.id === connection.source);
  const target = nodes.value.find(item => item.id === connection.target);
  if (!source || !target) return { ok: true };
  const sourceRecord = draft.value?.data?.processNodes?.[source.data?.refId];
  const targetRecord = draft.value?.data?.processNodes?.[target.data?.refId];
  if (source.type === 'statusDefinition' && targetRecord) {
    const targetPort = portForHandle(resolveCatalogNodePorts(targetRecord, catalogContext(targetRecord)).inputs, connection.targetHandle, 'input');
    if (!targetPort) return { ok: false };
    const sourcePort = {
      id: 'status',
      label: draft.value?.data?.statusDefinitions?.[source.data?.refId]?.label || t('processDesigner.socketLabels.status'),
      role: 'data',
      type: processType('status')
    };
    return {
      ...processSocketsCompatible(sourcePort, targetPort),
      source: sourcePort,
      target: targetPort
    };
  }
  if (!sourceRecord || !targetRecord) return { ok: false, reason: 'Only current operation nodes can be connected' };
  const sourcePort = portForHandle(resolveCatalogNodePorts(sourceRecord, catalogContext(sourceRecord)).outputs, connection.sourceHandle, 'output');
  const targetPort = portForHandle(resolveCatalogNodePorts(targetRecord, catalogContext(targetRecord)).inputs, connection.targetHandle, 'input');
  if (!sourcePort || !targetPort) return { ok: true };
  return {
    ...processSocketsCompatible(sourcePort, targetPort),
    source: sourcePort,
    target: targetPort
  };
}

function portForHandle(ports, handle, direction) {
  const clean = String(handle || '').replace(/^(input|output|data|control|success|failure):/, '');
  if ((!clean || clean === direction) && ports.length === 1) return ports[0];
  return ports.find(port => port.id === clean) || null;
}

function applySemanticConnection(connection = {}) {
  const source = nodes.value.find(item => item.id === connection.source);
  const target = nodes.value.find(item => item.id === connection.target);
  if (!source || !target) return;
  const action = target.type === 'action' ? draft.value?.data?.actions?.[target.data?.refId] : null;
  const entityProfile = target.type === 'entity' ? draft.value?.data?.entityProfiles?.[target.data?.refId] : null;
  const processNode = target.type === 'processNode' ? draft.value?.data?.processNodes?.[target.data?.refId] : null;

  if (source.type === 'statusDefinition') {
    const status = draft.value?.data?.statusDefinitions?.[source.data?.refId];
    if (!status) return;
    syncStatusDefinition(status);
    if (processNode) {
      const targetInput = String(connection.targetHandle || '').replace(/^(input|data):/, '');
      if (targetInput !== 'status.state.primary') return;
      processNode.statusRef = status.id || source.data?.refId;
      processNode.inputDefaults ||= {};
      processNode.inputDefaults[targetInput] = { branches: [{ path: [], items: [status.statusId] }] };
      processNode.status = { ...(processNode.status || {}), to: status.statusId };
      syncProcessNode(processNode);
      return;
    }
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

function clearSemanticConnection(edge = {}) {
  const source = nodes.value.find(item => item.id === edge.source);
  const target = nodes.value.find(item => item.id === edge.target);
  if (source?.type !== 'statusDefinition' || target?.type !== 'processNode') return;
  const targetInput = String(edge.targetHandle || '').replace(/^(input|data):/, '');
  if (targetInput !== 'status.state.primary') return;
  const processNode = draft.value?.data?.processNodes?.[target.data?.refId];
  const status = draft.value?.data?.statusDefinitions?.[source.data?.refId];
  if (!processNode || processNode.statusRef !== (status?.id || source.data?.refId)) return;
  delete processNode.statusRef;
  if (processNode.inputDefaults) delete processNode.inputDefaults[targetInput];
  if (processNode.status?.to === status?.statusId) delete processNode.status.to;
  syncProcessNode(processNode);
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
  const targetInput = (action.inputs || []).find(item => item.id === targetId || item.dataPath === targetId);
  const targetPath = targetInput?.dataPath || targetInput?.path || targetId.replace(/^field:/, '');
  const field = fieldContractFromValueInput(input, inputId, targetPath);

  if (action.actionKind === 'updateEntity') {
    if (!targetPath || targetPath === 'field') return;
    action.mutation ||= { fields: [] };
    if (!action.mutation.fields.includes(targetPath)) action.mutation.fields = [...action.mutation.fields, targetPath];
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
    required: false,
    default: field.default,
    valueRef: field.valueRef
  };
}

function fieldContractFromValueInput(input = {}, inputId = '', path = '') {
  return {
    id: input.id || inputId,
    label: input.label || input.id || inputId,
    path,
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
  if (input.structure === 'list') return parseJson(input.value || '[]', []);
  if (input.valueType === 'number') {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : null;
  }
  if (input.valueType === 'json') return parseJson(input.value || '{}', {});
  if (input.valueType === 'boolean') return input.value === true || input.value === 'true';
  return input.value ?? '';
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

function inferIncomingPortContract(nodeId, inputId = '') {
  const targetNode = nodes.value.find(item => item.id === nodeId);
  const targetRecord = targetNode?.data?.refId
    ? draft.value?.data?.[recordKeyForType(targetNode.type)]?.[targetNode.data.refId]
    : null;
  const singleInput = targetRecord ? resolveProcessNodePorts(targetRecord).inputs.length === 1 : false;
  const edge = edges.value.find(item => {
    if (item.target !== nodeId || !String(item.targetHandle || '').startsWith('input')) return false;
    if (!inputId) return true;
    const handle = String(item.targetHandle || '');
    if (handle === 'input' && singleInput) return true;
    return handle.replace(/^input:/, '') === inputId;
  });
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
