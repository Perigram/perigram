<template>
  <StandardPage workspace>
    <DesignerSurface>
      <DesignerWorkspace
        ref="canvasFrame"
        :top-dock-items="documentDockItems"
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
          :pan-on-drag="touchPanDrag"
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
          <template #node-ctsType="props"><CtsTypeNode v-bind="props" /></template>
          <template #node-ctsClass="props"><ClassNode v-bind="props" /></template>
          <template #node-ctsField="props"><FieldNode v-bind="props" @rename="value => renameDeclarationNode(props, value)" /></template>
          <template #node-ctsState="props"><StateNode v-bind="props" @rename="value => renameDeclarationNode(props, value)" /></template>
          <template #node-processNode="props"><ProcessNode v-bind="props" /></template>
        </VueFlow>
        <template #fallback><div class="absolute inset-0" /></template>
      </ClientOnly>

      <div
        v-if="contextPalette.open"
        class="absolute z-30 flex max-h-80 w-72 flex-col gap-2 overflow-y-auto rounded-ui border border-content-border p-2 shadow-card"
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
          <span class="text-muted text-supporting">{{ paletteGroupLabel(group.id) }}</span>
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

      <div v-if="!nodes.length" class="absolute inset-x-4 top-8 z-10 flex justify-center">
        <StateBlock :message="emptyCanvasMessage" />
      </div>

      <template #palette>
        <div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3">
            <div class="flex items-center gap-1">
              <InputText v-model="paletteQuery" size="small" class="min-w-0 flex-1" :placeholder="$t('processDesigner.searchOperations')" />
              <Button icon="pi pi-database" size="small" text :aria-label="$t('typesPane.title')" v-tooltip.left="$t('typesPane.title')" @click="navigateTo('/organization/types')" />
            </div>
            <div v-for="group in paletteGroups" :key="group.id" class="flex flex-col gap-1.5">
              <span class="px-1 uppercase text-muted text-supporting">{{ paletteGroupLabel(group.id) }}</span>
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
                  @click="item.action ? item.action() : addNode(item)"
                />
              </div>
            </div>
          </div>
      </template>

      <template #dock>
        <MotionDock
          :items="canvasDockItems"
          :aria-label="$t('processDesigner.canvasNavigation')"
          class-name="process-designer-dock"
        />
      </template>

      <Popover ref="renameMenu">
        <div class="flex min-w-72 flex-col gap-2" @mousedown.stop @click.stop>
          <InputText
            v-model="renameDraftName"
            :placeholder="$t('processDesigner.title')"
            class="w-full"
            :aria-label="$t('common.rename')"
            @keydown.enter.prevent="applyDraftRename"
          />
          <Button
            icon="pi pi-check"
            :label="$t('common.save')"
            size="small"
            :loading="renamingDraft"
            :disabled="renamingDraft || !renameDraftName.trim()"
            @click="applyDraftRename"
          />
        </div>
      </Popover>


      <Popover ref="processMenu">
        <div class="flex min-w-72 flex-col gap-2" @mousedown.stop @click.stop>
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
            @update:model-value="value => { selectProcessDefinition(value); processMenu.hide(); }"
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

      <template #inspector>
        <div class="flex h-full min-h-0 flex-col">
          <Tabs v-model:value="inspectTab" class="flex min-h-0 flex-1 flex-col">
            <TabList>
              <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
              <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
              <Tab value="screens">{{ $t('organization.screens') }}</Tab>
            </TabList>
            <TabPanels class="min-h-0 flex-1 overflow-y-auto">
            <TabPanel value="inspector">
              <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
                <DeclarationInspector
                  v-if="declarationNodeTypes.includes(selectedNode.type)"
                  :node="selectedNode"
                  :type-id-valid="classTypeIdValid"
                  :diagnostics="classDeclarationDiagnostics"
                  :type-options="declarationTypeOptions"
                  :type-anchor-options="typeAnchorOptions"
                  :lifecycle="classLifecycle"
                  @sync="syncNodeData"
                  @update-name="value => updateClassName(selectedNode, value)"
                  @add-state="addClassState"
                  @update-state="updateClassState"
                  @remove-state="removeClassState"
                  @add-transition="addClassTransition"
                  @update-transition="updateClassTransitionIntent"
                  @remove-transition="removeClassTransition"
                />

                <ProcessNodeInspector
                  v-else-if="selectedNode.type === 'processNode'"
                  :record="selectedProcessNode"
                  :producer="selectedEntity"
                  :producer-available="selectedEntityAvailable"
                  :relation-options-for="relationOptionsForEntity"
                  :field-policy-options="producerFieldPolicyOptions"
                  :entity-type-options="entityTypeOptions"
                  :role-options="roleOptions"
                  :command-options="commandOptions"
                  :command-service="selectedCommandService"
                  :service-principal-options="servicePrincipalOptions"
                  :join-producer-options="joinProducerOptions"
                  :construction-modes="constructionModeOptions(nodeEntityType(selectedProcessNode))"
                  :artifact-kinds="artifactCreationKinds(selectedProcessNode)"
                  :artifact-kind-options="artifactUploadKindOptions"
                  :designer="designer"
                  :grants="selectedProcessNodeGrants"
                  :grant-role-ids="selectedProcessNodeGrantRoleIds"
                  :access-detail="selectedProcessNodeAccessDetail"
                  :effective-access="selectedProcessNodeEffectiveAccess"
                  :inputs="processNodeInputs(selectedProcessNode)"
                  :preview="{
                    supported: selectedNodeSupportsPreview,
                    running: previewingData,
                    state: selectedNodePreview,
                    outputs: selectedNodePreviewOutputs
                  }"
                  :format-preview-path="formatPreviewPath"
                  :format-preview-items="formatPreviewItems"
                  @sync="syncNodeData"
                  @update-grant-roles="updateSelectedProcessNodeGrantRoles"
                  @update-grant-level="({ index, level }) => updateSelectedProcessNodeGrantLevel(index, level)"
                  @update-join-entity="value => updateJoinEntityType(selectedProcessNode, value)"
                  @update-join-producer="value => updateJoinSelectedProducer(selectedProcessNode, value)"
                  @update-construction-mode="mode => updateProcessNodeConstructionMode(selectedProcessNode, mode)"
                  @update-artifact-kinds="value => { updateArtifactCreationKinds(selectedProcessNode, value); syncNodeData(); }"
                  @update-input-transform="({ inputId, transform, enabled }) => updateInputTransform(selectedProcessNode, inputId, transform, enabled)"
                  @run-preview="previewDataflow"
                  @create-command-service="createCommandServiceForSelectedNode"
                  @remove-command-service="removeSelectedCommandService"
                />
              </div>
              <DeclarationEdgeInspector
                v-else-if="selectedDeclarationEdge"
                :edge="selectedDeclarationEdge"
              />
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
                    <Tag v-for="item in selectedRoleAccessSummary" :key="item.key" :value="`${item.text} · ${item.contributor.label}`" size="small" />
                  </div>
                  <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" outlined size="small" @click="removeSelectedRole" />
                  <Button icon="pi pi-users" :label="$t('organization.openTeam')" severity="secondary" outlined size="small" @click="navigateTo('/organization/users')" />
                </div>

                <Panel v-if="socketList.length" :header="$t('processDesigner.sockets')" toggleable collapsed>
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-wrap gap-2">
                      <Tag
                        v-for="socket in socketList"
                        :key="socket.id"
                        :value="socket.label || socket.id"
                        :severity="selectedSocketId === socket.id ? 'success' : 'secondary'"
                        class="cursor-pointer"
                        @click="selectedSocketId = socket.id"
                      />
                    </div>
                    <div v-if="selectedSocketRecord" class="flex flex-col gap-3">
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.direction') }}</label>
                        <Select v-model="selectedSocketRecord.direction" :options="socketDirections" option-label="label" option-value="value" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.entityType') }}</label>
                        <Select v-model="selectedSocketRecord.entityType" :options="entityTypeOptions" option-label="label" option-value="value" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.projectedFields') }}</label>
                        <MultiSelect v-model="selectedSocketRecord.projection.fields" :options="fieldOptionsForSelectedSocket" option-label="label" option-value="value" display="chip" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.excludedFields') }}</label>
                        <MultiSelect v-model="selectedSocketRecord.projection.excludeFields" :options="fieldOptionsForSelectedSocket" option-label="label" option-value="value" display="chip" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.sendRoles') }}</label>
                        <MultiSelect v-model="selectedSocketRecord.access.sendRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.receiveRoles') }}</label>
                        <MultiSelect v-model="selectedSocketRecord.access.receiveRoles" :options="roleOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.receiverLifecycle') }}</label>
                        <Select v-model="selectedSocketRecord.receiverLifecycle.mode" :options="lifecycleModes" option-label="label" option-value="value" />
                      </div>
                      <Button icon="pi pi-trash" :label="$t('common.delete')" severity="danger" outlined size="small" @click="removeSelectedSocket" />
                    </div>
                    <Button icon="pi pi-plus" :label="$t('processDesigner.addSocket')" size="small" severity="secondary" outlined @click="addSocket" />
                  </div>
                </Panel>
              </div>
            </TabPanel>

            <TabPanel value="screens">
              <div class="flex flex-col gap-4">
                <Message v-if="compiledPreviewError" severity="error">{{ compiledPreviewError }}</Message>
                <div
                  v-for="screen in compiledScreenPreview"
                  :key="screen.id"
                  class="flex flex-col gap-2 rounded-ui border border-content-border p-3"
                >
                  <div class="flex items-center justify-between gap-2">
                    <span class="min-w-0 truncate text-label">{{ screen.label || screen.id }}</span>
                    <div class="flex shrink-0 items-center gap-1">
                      <Tag v-if="screen.typeId" :value="screen.typeId" severity="secondary" size="small" />
                      <Tag :value="screen.template" size="small" />
                    </div>
                  </div>
                  <GeneratedMappingScreen
                    :screen="screen"
                    :contract="compiledPreviewContract"
                    :bundle="compiledPreviewBundle"
                  />
                  <small class="truncate text-muted">{{ screen.route || screen.id }}</small>
                </div>
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
                    <div v-for="(source, index) in selectedScreenRecord.sources" :key="index" class="flex flex-col gap-2">
                      <div class="grid grid-cols-2 gap-2">
                        <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.sourceId') }}</label><InputText :model-value="source.id" size="small" @update:model-value="value => screenEditing.renameSource(selectedScreenRecord, source, value)" /></div>
                        <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.sourceLabel') }}</label><InputText v-model="source.label" size="small" /></div>
                        <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.entityType') }}</label><Select :model-value="source.entityType" :options="entityTypeOptions" option-label="label" option-value="value" size="small" @update:model-value="value => screenEditing.setSourceEntityType(selectedScreenRecord, source, value)" /></div>
                        <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.sourceMode') }}</label><Select :model-value="source.mode" :options="screenSourceModeOptions" option-label="label" option-value="value" size="small" @update:model-value="value => screenEditing.setSourceMode(selectedScreenRecord, source, value)" /></div>
                        <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.requiredFeature') }}</label><Select v-model="source.required.feature" :options="screenFeatureOptions" option-label="label" option-value="value" size="small" /></div>
                        <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.requiredLevel') }}</label><Select v-model="source.required.level" :options="accessLevelOptions" option-label="label" option-value="value" size="small" /></div>
                      </div>
                      <div v-if="source.mode === 'single'" class="flex flex-col gap-1">
                        <label>{{ $t('processDesigner.identifier') }}</label>
                        <InputText v-model="source.identifier" size="small" />
                      </div>
                      <div v-else class="flex flex-col gap-2">
                        <div class="flex items-center justify-between gap-2"><label>{{ $t('processDesigner.filters') }}</label><Button icon="pi pi-plus" :aria-label="$t('processDesigner.addFilter')" size="small" text @click="screenEditing.addScalar(source.filters, 'path', '')" /></div>
                        <div v-for="row in screenEditing.scalarRows(source.filters)" :key="row.key" class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                          <InputText :model-value="row.key" :aria-label="$t('processDesigner.key')" size="small" @change="event => screenEditing.renameScalar(source.filters, row.key, event.target.value)" />
                          <Select :model-value="row.type" :options="screenScalarTypeOptions" option-label="label" option-value="value" size="small" :aria-label="$t('processDesigner.valueType')" @update:model-value="value => screenEditing.setScalarType(source.filters, row.key, value)" />
                          <InputNumber v-if="row.type === 'number'" v-model="source.filters[row.key]" size="small" />
                          <Checkbox v-else-if="row.type === 'boolean'" v-model="source.filters[row.key]" binary :aria-label="$t('processDesigner.value')" />
                          <InputText v-else v-model="source.filters[row.key]" :aria-label="$t('processDesigner.value')" size="small" />
                          <Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="screenEditing.removeScalar(source.filters, row.key)" />
                        </div>
                        <div class="flex items-center justify-between gap-2"><label>{{ $t('processDesigner.lineageBindings') }}</label><Button icon="pi pi-plus" :aria-label="$t('processDesigner.addLineageBinding')" size="small" text @click="screenEditing.addLineageBinding(source)" /></div>
                        <div v-for="(binding, bindingIndex) in source.lineageBindings" :key="bindingIndex" class="grid grid-cols-2 gap-2">
                          <div v-for="field in screenLineageBindingFields" :key="field" class="flex flex-col gap-1"><label>{{ $t(`processDesigner.lineageBindingFields.${field}`) }}</label><InputText v-model="binding[field]" size="small" /></div>
                          <Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="screenEditing.removeLineageBinding(source, bindingIndex)" />
                        </div>
                      </div>
                      <div class="flex justify-end"><Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="removeSelectedScreenSource(index)" /></div>
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2">
                      <label>{{ $t('processDesigner.regions') }}</label>
                      <Button icon="pi pi-plus" :aria-label="$t('processDesigner.addRegion')" size="small" text @click="addSelectedScreenRegion" />
                    </div>
                    <div v-for="(region, index) in selectedScreenRecord.regions" :key="index" class="grid grid-cols-2 gap-2">
                      <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.regionId') }}</label><InputText v-model="region.id" size="small" /></div>
                      <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.regionLabel') }}</label><InputText v-model="region.label" size="small" /></div>
                      <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.regionSlot') }}</label><Select v-model="region.slot" :options="screenSlotOptions" option-label="label" option-value="value" size="small" /></div>
                      <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.regionSource') }}</label><Select v-model="region.sourceId" :options="selectedScreenSourceOptions" option-label="label" option-value="value" size="small" /></div>
                      <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.surface') }}</label><Select v-model="region.surface" :options="screenSurfaceOptions" option-label="label" option-value="value" size="small" /></div>
                      <div class="flex flex-col gap-1"><label>{{ $t('common.actions.title') }}</label><MultiSelect v-model="region.actions" :options="screenActionOptions" option-label="label" option-value="value" display="chip" size="small" class="w-full" /></div>
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
                  <Button icon="pi pi-filter" :label="$t('processDesigner.editGrantConditions')" severity="secondary" outlined size="small" @click="openGrantEditor('screen', 0, selectedScreenRecord.required.feature)" />
                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between gap-2"><label>{{ $t('processDesigner.bindings') }}</label><Button icon="pi pi-plus" :aria-label="$t('processDesigner.addBinding')" size="small" text @click="screenEditing.addScalar(selectedScreenRecord.bindings, 'binding')" /></div>
                    <div v-for="row in screenEditing.scalarRows(selectedScreenRecord.bindings)" :key="row.key" class="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                      <InputText :model-value="row.key" :aria-label="$t('processDesigner.key')" size="small" @change="event => screenEditing.renameScalar(selectedScreenRecord.bindings, row.key, event.target.value)" />
                      <Select :model-value="row.type" :options="screenBindingTypeOptions" option-label="label" option-value="value" size="small" :aria-label="$t('processDesigner.valueType')" @update:model-value="value => screenEditing.setScalarType(selectedScreenRecord.bindings, row.key, value)" />
                      <InputNumber v-if="row.type === 'number'" v-model="selectedScreenRecord.bindings[row.key]" size="small" />
                      <Checkbox v-else-if="row.type === 'boolean'" v-model="selectedScreenRecord.bindings[row.key]" binary :aria-label="$t('processDesigner.value')" />
                      <InputText v-else v-model="selectedScreenRecord.bindings[row.key]" :aria-label="$t('processDesigner.value')" size="small" />
                      <Button icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="screenEditing.removeScalar(selectedScreenRecord.bindings, row.key)" />
                    </div>
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
        </div>
      </template>

      <div v-if="validation" class="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
        <div class="pointer-events-auto flex max-w-xl flex-col gap-2">
          <Message :severity="validation.ok ? 'success' : 'error'">
            {{ validation.ok ? (validation.message || $t('processDesigner.validationOk')) : validation.errors.join('; ') }}
          </Message>
          <Message v-for="warning in validation.warnings || []" :key="warning" severity="warn">{{ warning }}</Message>
          <Message v-if="validationDiffLines.length" severity="info">
            <div class="flex flex-col gap-1">
              <span>{{ $t('processDesigner.applyDiffTitle') }}</span>
              <span v-for="line in validationDiffLines" :key="line">{{ line }}</span>
            </div>
          </Message>
        </div>
      </div>

      </DesignerWorkspace>
    </DesignerSurface>

    <StandardDialog v-model:visible="showGrantEditor" :header="$t('processDesigner.editGrantConditions')" size="xl">
      <PermissionEditor :permissions="grantEditorPermissions" :features="permissionFeatureOptions" @save="saveGrantEditor" />
    </StandardDialog>

    <ApplyMigrationDialog
      :visible="Boolean(pendingMigration)"
      :plan="pendingMigration"
      :loading="applyingProcess"
      @update:visible="value => { if (!value) cancelApplyMigration(); }"
      @confirm="confirmApplyMigration"
      @cancel="cancelApplyMigration"
    />


  </StandardPage>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SelectionMode, VueFlow } from '@vue-flow/core';
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
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import ApplyMigrationDialog from '~/components/process-designer/ApplyMigrationDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PermissionEditor from '~/components/PermissionEditor.vue';
import { projectUiAction } from '~/packages/processes/src/ui-contract-projection.js';
import { classLifecycleOf } from '~/packages/processes/src/designer.js';
import {
  canvasToDefinition,
  compileProcessDefinition,
  compileTreeDeclarations,
  DECLARATION_NODE_TYPES,
  declarationNodePorts,
  declarationWireLegality,
  definitionToCanvas,
  migrateProcessDefinition,
  processSocketsCompatible,
  PROCESS_DATAFLOW_VERSION
} from '~/packages/processes/src/index.js';
import { normalizeScreenContract, SCREEN_TEMPLATES, SCREEN_SOURCE_MODES, SCREEN_REGION_SLOTS, SCREEN_REGION_SURFACES, SCREEN_LINEAGE_BINDING_FIELDS } from '~/packages/processes/src/screen-contract.js';
import { cncDomain, cncPackContent } from '@cutkit/domain-cnc';
import { checkDeclarationsAgainstCts, compileClientBundle, projectDomainFromView, normalizeType } from '~/packages/cts/src/index.js';
import ProcessNode from '~/components/process-designer/ProcessNode.vue';
import CtsTypeNode from '~/components/process-designer/CtsTypeNode.vue';
import ClassNode from '~/components/type-designer/TypeNode.vue';
import FieldNode from '~/components/type-designer/FieldNode.vue';
import StateNode from '~/components/type-designer/StateNode.vue';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import ProcessNodeInspector from '~/components/process-designer/inspector/ProcessNodeInspector.vue';
import DeclarationInspector from '~/components/process-designer/inspector/DeclarationInspector.vue';
import DeclarationEdgeInspector from '~/components/process-designer/inspector/DeclarationEdgeInspector.vue';
import MotionDock from '~/components/shared/MotionDock.vue';
import { normalizeProcessDisplayName, processDisplayEntity } from '~/utils/processDesignerDisplay.js';
import { processSocketColor } from '~/utils/processDesignerSocketTone.js';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';
import { normalizeDesignerAccess } from '~/utils/processDesignerAccess.js';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerPanels } from '~/composables/useProcessDesignerPanels.js';
import { useProcessDesignerConnectionInference } from '~/composables/useProcessDesignerConnectionInference.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerRoles } from '~/composables/useProcessDesignerRoles.js';
import { useProcessDesignerScreens } from '~/composables/useProcessDesignerScreens.js';
import { useProcessDesignerPalette } from '~/composables/useProcessDesignerPalette.js';
import { useProcessDesignerInspector } from '~/composables/useProcessDesignerInspector.js';
import { useProcessDesignerNodeRecords } from '~/composables/useProcessDesignerNodeRecords.js';
import { useProcessDesignerNodeSync } from '~/composables/useProcessDesignerNodeSync.js';
import { useProcessDesignerTypes } from '~/composables/useProcessDesignerTypes.js';
import { useProcessDesignerCanvas } from '~/composables/useProcessDesignerCanvas.js';
import { useProcessDesignerContextPalette } from '~/composables/useProcessDesignerContextPalette.js';
import { useProcessDesignerApply } from '~/composables/useProcessDesignerApply.js';
import { useProcessDesignerPreview } from '~/composables/useProcessDesignerPreview.js';
import { useProcessDesignerGraphEditing } from '~/composables/useProcessDesignerGraphEditing.js';
import { useProcessDesignerLiveGraph } from '~/composables/useProcessDesignerLiveGraph.js';
import { deriveRoleAccessSummary, flattenRoleAccessSummary } from '~/shared/role-access-summary.js';

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
const creatingDraft = ref(false);
const savedDraftSignature = ref('');
const organizationRoles = ref({});
const compiledPreview = ref(null);
const compiledPreviewError = ref('');
const showGrantEditor = ref(false);
const grantEditorTarget = ref(null);
const paletteQuery = ref('');
const {
  inspectTab,
  processMenu,
  selectedPrincipalId,
  selectedRoleId,
  selectedScreenId
} = useProcessDesignerPanels();

const { compareProcessDefinitions, normalizeProcessList, pickInitialProcess } = useProcessDefinitionCatalog({ definitionToCanvas });
const persistence = useProcessDesignerPersistence();
const rolePersistence = useProcessDesignerRoles();

// The active organization for the registry view: the draft's lineage when a
// process is loaded, otherwise the authenticated organization — tree
// authoring must resolve the org view even before any draft exists.
function activeOrganizationId() {
  return draft.value?.lineage?.organizationId
    || authStore.organizationData?._id
    || authStore.userData?.organizationId
    || authStore.memberships?.[0]?.organizationId
    || null;
}

const { paletteLabel, paletteDescription, paletteGroupLabel, paletteSearchText } = createPaletteText({ t, te });

// CTS declaration layer: the palette, entity/field/status option lists, and
// compilation all derive from one source — the organization's type registry
// view. The types composable owns the registry generation, the projected
// designer contract, and the live tree overlay; every refresh below flows
// through it.
const {
  designer,
  ctsRegistry,
  ctsProjectedDomain,
  ctsTypeView,
  refreshTreeOverlay,
  loadOrgTypes,
  loadProcessCapabilities,
  persistTreeDeclarations
} = useProcessDesignerTypes({
  nodes,
  edges,
  t,
  toast,
  activeOrganizationId,
  baseDomain: cncDomain,
  packContent: cncPackContent,
  syncNow: () => syncNodeData()
});

// The sync pass is late-bound below (it reads option lists this section has
// not created yet): node records own factory shapes, the sync composable
// owns record derivation, and each receives the other through a wrapper.
let syncProcessNodeImpl = () => {};
const nodeRecords = useProcessDesignerNodeRecords({
  designer,
  translate: key => t(key),
  syncProcessNode: node => syncProcessNodeImpl(node)
});
const {
  artifactUploadKindOptions,
  isOpKind,
  nodeEntityType,
  setNodeEntityType,
  sameTypeId,
  catalogPorts,
  catalogContext,
  portForHandle,
  socketPairCompatible,
  opKind,
  relationOptionsForEntity,
  constructionModeOptions,
  artifactCreationKinds,
  updateArtifactCreationKinds,
  commandInputs,
  commandOutputs,
  processNodeInputs,
  processNodeOutputs,
  processNodeOperationOptions,
  processNodeFieldOptions,
  processStatusOptionsFor,
  processEntityTypeOptions,
  processNodeSummary,
  processNodeDisplayLabel,
  processNodeDescription,
  connectedProcessInputIds,
  syncProcessNode
} = useProcessDesignerNodeSync({
  designer,
  t,
  te,
  draft,
  edges,
  nodeRecords,
  projectedDomain: ctsProjectedDomain,
  paletteLabel,
  paletteDescription
});
syncProcessNodeImpl = syncProcessNode;

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
  resolveOutputs: record => catalogPorts(record).outputs,
  portForHandle,
  syncProcessNode
});

const {
  processNodeOperations,
  processNodeOperationLabels,
  createService,
  createSocket,
  createProcessNode,
  defaultEntityType
} = nodeRecords;

const {
  ensureRecord,
  factoryForType,
  recordKeyForType,
  selectedEntity,
  selectedProcessNode
} = useProcessDesignerInspector({
  draft,
  selectedNode,
  factories: {
    processNode: createProcessNode,
    ctsClass: id => ({ id, kind: 'class', typeId: '', class: 'file', payload: null, operators: [] }),
    ctsField: id => ({ id, kind: 'field', typeId: null, name: '', descriptor: { base: 'string' } }),
    ctsState: id => ({ id, kind: 'state', typeId: null, value: '', initial: false, terminal: false }),
    ctsType: id => ({ id, kind: 'type', typeId: '' })
  }
});

const {
  dataflowPreview,
  previewingData,
  validationDiffLines,
  selectedNodePreview,
  selectedNodeSupportsPreview,
  selectedNodePreviewOutputs,
  previewDataflow,
  formatPreviewPath,
  formatPreviewItems,
  focusValidationDiagnostic,
  focusFirstValidationDiagnostic
} = useProcessDesignerPreview({
  t,
  validation,
  selectedNode,
  selectedNodeId,
  selectedProcessNode,
  processNodeOutputs,
  persistence,
  serializeProcess: () => serializeProcess(),
  nodes,
  edges,
  selectNode,
  selectEdge
});

const {
  savingDraft,
  applyingProcess,
  pendingMigration,
  saveDraft,
  saveDraftFromDock,
  applyProcess,
  confirmApplyMigration,
  cancelApplyMigration
} = useProcessDesignerApply({
  persistence,
  t,
  toast,
  draft,
  validation,
  isActiveProcess: () => isActiveProcess.value,
  serializeProcess: () => serializeProcess(),
  createDraft: options => createDraft(options),
  persistTreeDeclarations,
  focusFirstValidationDiagnostic,
  upsertProcessDefinition,
  setDraft: value => setDraft(value),
  syncNow: () => syncNodeData()
});

const screenEditing = useProcessDesignerScreens({ draft, selectedScreenId, createScreen, normalizeScreenContract, defaultEntityType, featureForEntityType });

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
  onGraphChange: () => syncNodeData()
});

const {
  canvasFrame,
  touchPanDrag,
  handleDesignerPointerDown,
  handleDesignerFocus,
  handleDesignerWheel,
  beginSocketConnection,
  endSocketConnection,
  clientPoint,
  clientToGraphPosition,
  nextNodePosition,
  frameAllNodes,
  frameSelectedNodes,
  zoomCanvasIn,
  zoomCanvasOut,
  resetCanvasZoom,
  fitInitialCanvas,
  snapshotViewport
} = useProcessDesignerCanvas({
  nodes,
  edges,
  draft,
  selectedNodeId,
  selectedEdgeId,
  selectedGraphNodes,
  selectedGraphEdges,
  deleteGraphSelection,
  clearGraphSelection,
  decorateEdge: value => decorateEdge(value)
});

const {
  contextPalette,
  openPanePalette,
  closeContextPalette,
  contextItemCompatible,
  addContextNode
} = useProcessDesignerContextPalette({
  nodes,
  draft,
  canvasFrame,
  clientPoint,
  clientToGraphPosition,
  catalogPorts,
  portForHandle,
  socketPairCompatible,
  createProcessNode,
  clonePalettePreset,
  syncProcessNode,
  addNode,
  onConnect: connection => onConnect(connection)
});

const { filteredGroups: paletteGroups, contextGroups: contextPaletteGroups } = useProcessDesignerPalette({
  groups: designer.paletteGroups,
  query: paletteQuery,
  context: contextPalette,
  searchText: paletteSearchText,
  isCompatible: contextItemCompatible
});
const triggerModeOptions = computed(() => [
  { label: t('processDesigner.manualTrigger'), value: 'manual' },
  { label: t('processDesigner.automaticTrigger'), value: 'event' }
]);
const lifecycleModes = computed(() => [
  { label: t('processDesigner.lifecycleModeDefaultCreated'), value: 'defaultCreated' },
  { label: t('processDesigner.lifecycleModeDomainDefault'), value: 'domainDefault' },
  { label: t('processDesigner.lifecycleModeCustom'), value: 'custom' }
]);
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
const screenLineageBindingFields = SCREEN_LINEAGE_BINDING_FIELDS;
const screenScalarTypeOptions = ['string', 'number', 'boolean', 'assignment'].map(value => ({ label: t(`processDesigner.scalarTypes.${value}`), value }));
const screenBindingTypeOptions = screenScalarTypeOptions;
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
const defaultEdgeOptions = { type: 'default' };

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const isDirty = computed(() => Boolean(draft.value) && designerSignature() !== savedDraftSignature.value);
const documentDockItems = computed(() => [
  {
    icon: () => h('i', { class: 'pi pi-folder-open', 'aria-hidden': 'true' }),
    label: t('common.open'),
    onClick: event => processMenu.value?.toggle(event),
    hasPopup: true
  },

  {
    icon: () => h('i', { class: renamingDraft.value ? 'pi pi-spinner pi-spin' : 'pi pi-pencil', 'aria-hidden': 'true' }),
    label: t('common.rename'),
    onClick: event => openRenamePopover(event),
    disabled: !draft.value?._id || isActiveProcess.value,
    hasPopup: true
  },
  { separator: true },
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
  }
]);

const canvasDockItems = computed(() => [
  {
    icon: () => h('i', { class: 'pi pi-search-minus', 'aria-hidden': 'true' }),
    label: t('drawing.zoomOut'),
    onClick: zoomCanvasOut
  },
  {
    icon: () => h('i', { class: 'pi pi-search-plus', 'aria-hidden': 'true' }),
    label: t('drawing.zoomIn'),
    onClick: zoomCanvasIn
  },
  {
    icon: () => h('i', { class: 'pi pi-expand', 'aria-hidden': 'true' }),
    label: t('processDesigner.frameAll'),
    onClick: frameAllNodes
  },
  {
    icon: () => h('i', { class: 'pi pi-crosshairs', 'aria-hidden': 'true' }),
    label: t('processDesigner.frameSelection'),
    onClick: frameSelectedNodes
  },
  {
    icon: () => h('i', { class: 'pi pi-refresh', 'aria-hidden': 'true' }),
    label: t('processDesigner.resetZoom'),
    onClick: resetCanvasZoom
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
const roles = computed(() => organizationRoles.value);
const servicePrincipals = computed(() => draft.value?.data?.servicePrincipals || {});
const screens = computed(() => draft.value?.data?.screens || {});
const roleList = computed(() => Object.values(roles.value));
const servicePrincipalList = computed(() => Object.values(servicePrincipals.value));
const screenList = computed(() => Object.values(screens.value));
const selectedRoleRecord = computed(() => selectedRoleId.value ? roles.value[selectedRoleId.value] : null);
const selectedScreenRecord = computed(() => selectedScreenId.value ? screens.value[selectedScreenId.value] : null);
const roleOptions = computed(() => roleList.value.map(role => ({ label: role.label || role.id, value: role.id })));
const servicePrincipalOptions = computed(() => servicePrincipalList.value.map(principal => ({ label: principal.label || principal.id, value: principal.id })));
const entityTypeOptions = computed(() => designer.entityOptions);
const joinProducerOptions = computed(() => {
  const node = selectedProcessNode.value;
  if (!isOpKind(node, 'producer.join')) return [];
  const producerOutputs = draft.value?.data?.producerOutputs || {};
  const options = [];
  for (const edge of edges.value || []) {
    if (String(edge.target) !== String(selectedNodeId.value)) continue;
    const sourceNode = (nodes.value || []).find(item => String(item.id) === String(edge.source));
    const record = draft.value?.data?.processNodes?.[String(sourceNode?.data?.refId || sourceNode?.id)];
    if (!record) continue;
    if (isOpKind(record, 'producer.join')) {
      if (record.selectedProducerOutputId && producerOutputs[record.selectedProducerOutputId]) {
        options.push(producerOutputs[record.selectedProducerOutputId]);
      }
      continue;
    }
    for (const output of Object.values(producerOutputs)) {
      if (output.nodeId === record.id && sameTypeId(output.type || output.entityType, nodeEntityType(node))) options.push(output);
    }
  }
  return [...new Map(options.filter(Boolean).map(output => [output.producerOutputId, output])).values()]
    .map(output => ({ label: `${output.producerOutputId} (${output.entityType})`, value: output.producerOutputId }));
});
function updateJoinEntityType(node, entityType) {
  setNodeEntityType(node, entityType);
  node.selectedProducerOutputId = '';
  syncNodeData();
}
function updateJoinSelectedProducer(node, selectedProducerOutputId) {
  node.selectedProducerOutputId = selectedProducerOutputId;
  syncNodeData();
}
const declarationTypeOptions = computed(() => [
  ...new Set([
    ...ctsTypeView().map(entry => entry.id),
    ...nodes.value.filter(node => node.type === 'ctsClass' && node.data?.typeId).map(node => node.data.typeId)
  ])
]);
// The registry accepts kebab ids only; anything else silently drops the
// declaration from the overlay (defineType throws), which reads on the
// canvas as "sockets stopped regenerating". Validity is authored live.
const classTypeIdValid = computed(() => /^[a-z][a-z0-9-]*$/.test(selectedNode.value?.type === 'ctsClass' ? selectedNode.value.data?.typeId || '' : 'x'));
// Declaration diagnostics against the registry's own normalizer: what
// SAVE/APPLY would reject is visible while authoring, not after.
const classDeclarationDiagnostics = computed(() => {
  const classes = nodes.value.filter(node => node.type === 'ctsClass');
  if (!classes.length) return [];
  const { declarations, diagnostics } = compileTreeDeclarations(nodes.value, edges.value);
  for (const declaration of declarations) {
    try {
      normalizeType({ ...declaration, scope: 'org', organizationId: activeOrganizationId() });
    } catch (error) {
      diagnostics.push(`${declaration.id || '(unnamed type)'}: ${error.message}`);
    }
  }
  return diagnostics;
});
const declarationNodeTypes = DECLARATION_NODE_TYPES;
const selectedDeclarationEdge = computed(() => edges.value.find(edge => edge.id === selectedEdgeId.value && edge.role === 'type') || null);

// Lifecycle of the selected class, derived from the declaration tree. The
// class inspector's panel edits write the SAME ctsState nodes and
// state-to-state transition wires the canvas renders — one data model, two
// views.
const classLifecycle = computed(() => (
  selectedNode.value?.type === 'ctsClass'
    ? classLifecycleOf(nodes.value, edges.value, selectedNode.value.id)
    : { states: [], transitions: [] }
));
function addClassState(value) {
  const classNode = selectedNode.value;
  if (!classNode || classNode.type !== 'ctsClass') return;
  const stateNode = addNode({ type: 'ctsState', preset: {} }, {
    x: Math.round((classNode.position?.x || 0) + 40),
    y: Math.round((classNode.position?.y || 0) + 150 + classLifecycle.value.states.length * 24)
  });
  const node = nodes.value.find(candidate => candidate.id === stateNode.id);
  if (!node) return;
  const trimmed = String(value || '').trim();
  if (trimmed) node.data.value = trimmed;
  edges.value.push(decorateEdge({
    id: `declares:${stateNode.id}-${classNode.id}`,
    source: stateNode.id,
    target: classNode.id,
    sourceHandle: 'output:state',
    targetHandle: 'input:declare',
    type: 'default',
    role: 'type',
    label: 'state'
  }));
  syncNodeData();
}
function updateClassState({ nodeId, changes = {} }) {
  const node = nodes.value.find(candidate => candidate.id === nodeId);
  if (!node || node.type !== 'ctsState') return;
  Object.assign(node.data, changes);
  syncNodeData();
}
function removeClassState(nodeId) {
  edges.value = edges.value.filter(edge => edge.source !== nodeId && edge.target !== nodeId);
  nodes.value = nodes.value.filter(node => node.id !== nodeId);
  if (selectedNodeId.value === nodeId) selectedNodeId.value = null;
  syncNodeData();
}
function addClassTransition({ fromNodeId, toNodeId, intent = '' }) {
  if (!fromNodeId || !toNodeId) return;
  edges.value.push(decorateEdge({
    id: `transition:${fromNodeId}-${toNodeId}-${Date.now()}`,
    source: fromNodeId,
    target: toNodeId,
    type: 'default',
    role: 'type',
    label: intent || 'transition',
    data: { intent }
  }));
  syncNodeData();
}
function updateClassTransitionIntent({ edgeId, intent }) {
  const edge = edges.value.find(candidate => candidate.id === edgeId);
  if (!edge) return;
  edge.data = { ...(edge.data || {}), intent: String(intent || '') };
  edge.label = String(intent || '') || 'transition';
  syncNodeData();
}
function removeClassTransition(edgeId) {
  edges.value = edges.value.filter(edge => edge.id !== edgeId);
  syncNodeData();
}

const typeAnchorOptions = computed(() => ctsTypeView().map(entry => ({
  label: `${entry.label} · ${entry.class}`,
  value: entry.id
})));
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
const screenFeatureOptions = computed(() => (designer.domain.entities || []).map(entity => ({
  label: entity.label || entity.type,
  value: featureForEntityType(entity.type)
})));
const permissionFeatureOptions = computed(() => screenFeatureOptions.value.map(option => ({
  key: option.value,
  label: option.label,
  actions: ['view', 'create', 'update', 'delete', 'run', 'send', 'approve', 'reject', 'fulfill']
})));
const fieldOptionsForSelectedSocket = computed(() => designer.fieldsForEntity(selectedSocketRecord.value?.entityType));
const serviceList = computed(() => Object.values(draft.value?.data?.services || {}));
const socketList = computed(() => Object.values(draft.value?.data?.sockets || {}));
const selectedSocketId = ref('');
const selectedSocketRecord = computed(() => draft.value?.data?.sockets?.[selectedSocketId.value] || socketList.value[0] || null);
const selectedEntityAvailable = computed(() => Boolean(selectedEntity.value?.producerOutputId));
const producerFieldPolicyOptions = computed(() => {
  const typeId = nodeEntityType(selectedProcessNode.value) || selectedEntity.value?.entityType || '';
  if (!typeId) return [];
  return designer.fieldsForEntity(typeId).map(field => ({ label: field.i18n ? t(field.i18n) : (field.label || field.value), value: field.value }));
});
function commandForId(commandId) {
  return cncDomain.commands?.[commandId] || null;
}

const selectedCommandService = computed(() => {
  const node = selectedProcessNode.value;
  if (!isOpKind(node, 'effect.runCommand') || !node.commandId) return null;
  return serviceList.value.find(service => service.commandId === node.commandId) || null;
});
function createCommandServiceForSelectedNode() {
  const node = selectedProcessNode.value;
  if (!isOpKind(node, 'effect.runCommand') || !node.commandId) return;
  const id = `service_${Date.now()}`;
  const record = createService(id);
  record.commandId = node.commandId;
  const command = commandForId(node.commandId);
  record.label = command?.label || node.commandId;
  record.serviceType = command?.service || '';
  record.inputs = commandInputs(command);
  record.outputs = commandOutputs(command);
  draft.value.data.services ||= {};
  draft.value.data.services[id] = record;
  syncNodeData();
}
function removeSelectedCommandService() {
  const record = selectedCommandService.value;
  if (!record) return;
  delete draft.value.data.services[record.id];
  syncNodeData();
}
function addSocket() {
  const id = `socket_${Date.now()}`;
  draft.value.data.sockets ||= {};
  draft.value.data.sockets[id] = createSocket(id);
  selectedSocketId.value = id;
}
function removeSelectedSocket() {
  if (!selectedSocketRecord.value) return;
  delete draft.value.data.sockets[selectedSocketRecord.value.id];
  selectedSocketId.value = '';
}
const ACCESS_LEVEL_ORDER = { read: 0, write: 1, admin: 2 };
const selectedProcessNodeAccessDetail = computed(() => {
  const node = selectedProcessNode.value;
  if (!node?.kind || !['effect.changeStatus', 'effect.archiveEntity', 'effect.updateEntity'].includes(opKind(node))) return '';
  const incoming = node.id ? inferIncomingEntityContract(node.id) : {};
  const from = incoming.status || '';
  const to = node.status?.to || '';
  if (!from && !to) return '';
  return [from || '?', to || '?'].join(' -> ');
});
const selectedProcessNodeEffectiveAccess = computed(() => {
  const node = selectedProcessNode.value;
  const entityType = nodeEntityType(node) || node?.targetEntityType || '';
  if (!isOpKind(node, 'effect.') || !entityType) return [];
  const byRole = new Map();
  const record = (roleId, level, inherited) => {
    const current = byRole.get(roleId);
    if (current && ACCESS_LEVEL_ORDER[current.level] >= ACCESS_LEVEL_ORDER[level]) return;
    byRole.set(roleId, { roleId, level, inherited });
  };
  for (const grant of node.access?.grants || []) {
    if (grant.roleId) record(grant.roleId, grant.level || node.access?.level || 'write', false);
  }
  for (const output of Object.values(draft.value?.data?.producerOutputs || {})) {
    if (output.entityType !== entityType) continue;
    for (const level of ['read', 'write', 'admin']) {
      for (const roleId of output.allowedRoles?.[level] || []) record(roleId, level, true);
    }
  }
  return [...byRole.values()]
    .map(item => ({
      label: `${roles.value[item.roleId]?.label || item.roleId}: ${item.level}${item.inherited ? ' (from entity access)' : ''}`,
      inherited: item.inherited
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
});
const selectedProcessNodeGrants = computed(() => (selectedProcessNode.value?.access?.grants || []).filter(grant => grant.roleId));
const selectedProcessNodeGrantRoleIds = computed(() => [
  ...new Set((selectedProcessNodeGrants.value || []).map(grant => grant.roleId).filter(Boolean))
]);
function updateSelectedProcessNodeGrantRoles(roleIds = []) {
  const node = selectedProcessNode.value;
  if (!node) return;
  const current = node.access?.grants || [];
  const kept = current.filter(grant => roleIds.includes(grant.roleId));
  const added = roleIds
    .filter(roleId => !kept.some(grant => grant.roleId === roleId))
    .map(roleId => ({ roleId, level: isOpKind(node, 'effect.deleteEntity') ? 'admin' : 'write' }));
  node.access = { ...(node.access || {}), grants: [...kept, ...added] };
  syncNodeData();
}
function updateSelectedProcessNodeGrantLevel(index, level) {
  const node = selectedProcessNode.value;
  if (!node) return;
  const grants = [...(node.access?.grants || [])];
  if (grants[index]) grants[index] = { ...grants[index], level: level || 'write' };
  node.access = { ...(node.access || {}), grants };
  syncNodeData();
}
const selectedRoleAccessSummary = computed(() => selectedRoleId.value
  ? flattenRoleAccessSummary(deriveRoleAccessSummary({ process: draft.value, roleIds: [selectedRoleId.value] }))
  : []);
const grantEditorPermissions = computed(() => {
  const target = grantEditorTarget.value;
  if (!target?.feature) return {};
  const grant = grantForEditorTarget(target);
  return { [target.feature]: [withoutKeys(grant || { level: 'read' }, ['roleId', 'feature'])] };
});
const compiledScreenPreview = computed(() => Object.values(compiledPreview.value?.screens || {})
  .filter(screen => screen && typeof screen === 'object' && !Array.isArray(screen))
  .sort((left, right) => String(left.label || left.id).localeCompare(String(right.label || right.id))));
// The generator consumes projected action records: the execution contract
// (`compiled.actions`) projects once for presentation.
const compiledPreviewContract = computed(() => ({
  actions: Object.fromEntries(Object.values(compiledPreview.value?.actions || {})
    .map(action => [action.id, projectUiAction(action)])
    .filter(([, projected]) => projected))
}));
const compiledPreviewBundle = computed(() => compiledPreview.value?.bundle || { types: [] });

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

// The live evaluation loop (Blender-style): any authoring change — a
// rename, a wire, an inspector edit, a descriptor change — re-interprets
// declaration wires and re-syncs every dependent surface. Connect
// handlers call evaluateNow() for instant feedback; everything else is
// the watcher's job. Instantiated after every composable and option list
// the sync pass reads: the watcher runs its first pass immediately, and
// those bindings must not be in their temporal dead zone.
// Consumer species (mutate/transition/remove) carry no Type pin — plugging
// a typed entity stream into one adapts it to that type through the
// resolver below.
const liveGraph = useProcessDesignerLiveGraph({
  nodes,
  edges,
  draft,
  apply: applyGraphInterpretation,
  resolveEntityBinding: resolveEntityInputType,
  // The registry view owns the rest of the known vocabulary; tree classes
  // are known through the canvas itself inside interpretation.
  knownTypeIds: () => ctsTypeView().map(entry => entry.id)
});
const { evaluateNow } = liveGraph;

// The entity-input source type of one record: the entity-bearing output
// port of whatever feeds its `entity` input, resolved through the same
// catalog the sockets render from.
function resolveEntityInputType(recordId) {
  const graphNode = nodes.value.find(node => node.type === 'processNode' && node.data?.refId === recordId);
  if (!graphNode) return '';
  const edge = edges.value.find(item => (
    item.target === graphNode.id
    && String(item.targetHandle || '').replace(/^(?:input|data):/, '') === 'entity'
  ));
  if (!edge) return '';
  const source = nodes.value.find(node => node.id === edge.source);
  if (!source) return '';
  const sourceRecord = source.data?.refId
    ? draft.value?.data?.processNodes?.[source.data.refId]
    : null;
  if (sourceRecord) {
    const port = portForHandle(catalogPorts(sourceRecord).outputs, edge.sourceHandle, 'output');
    const entityType = port?.type?.entityType || port?.type?.itemType?.entityType;
    if (entityType) return entityType;
    return nodeEntityType(sourceRecord) || '';
  }
  return source.data?.entityType || '';
}

function applyGraphInterpretation(mutations) {
  for (const mutation of mutations) {
    if (mutation.scope === 'node') {
      const node = nodes.value.find(candidate => candidate.id === mutation.nodeId);
      if (node) node.data[mutation.key] = mutation.value;
      continue;
    }
    const record = draft.value?.data?.processNodes?.[mutation.recordId];
    if (record) setNodeEntityType(record, mutation.value);
  }
  syncNodeData();
  // No live edge pruning here: sockets legitimately vanish and return
  // during transient authoring (an unset ref mid-gesture, a rename), and
  // deleting the wire destroys the author's wiring when the socket comes
  // back. Serialization owns stale-edge filtering (`validProcessEdges`), so
  // a genuinely removed socket drops its edge at save — never before.
}

onMounted(() => {
  loadActiveOrCreateLocal();
  loadProcessCapabilities();
  loadOrgTypes();
});
onBeforeUnmount(() => {
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
      if (!initial.data) {
        try {
          const full = await persistence.loadById(initial._id);
          upsertProcessDefinition(full);
          setDraft(full);
          return;
        } catch (error) {
          processLoadError.value = error?.data?.message || error?.message || t('processDesigner.noActiveDraft');
          return;
        }
      }
      setDraft(initial);
      return;
    }
    processLoadError.value = t('processDesigner.noActiveDraft');
  } finally {
    loadingProcess.value = false;
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

async function selectProcessDefinition(processId) {
  selectedProcessId.value = processId === null || processId === undefined ? null : String(processId);
  const selected = processDefinitions.value.find(process => String(process._id) === selectedProcessId.value);
  if (!selected) return;
  closeProcessMenu();
  // List entries are summaries; load the full record before editing.
  if (!selected.data) {
    try {
      const full = await persistence.loadById(selectedProcessId.value);
      upsertProcessDefinition(full);
      setDraft(full);
      return;
    } catch (error) {
      toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error?.message, life: 5000 });
      return;
    }
  }
  setDraft(selected);
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
    closeProcessMenu();
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

const renameMenu = ref(null);
const renameDraftName = ref('');
const renamingDraft = ref(false);

function openRenamePopover(event) {
  renameDraftName.value = draft.value?.identity?.name || '';
  renameMenu.value?.toggle(event);
}

async function applyDraftRename() {
  const name = renameDraftName.value.trim();
  if (!name || !draft.value?._id || renamingDraft.value) return;
  renamingDraft.value = true;
  try {
    const updated = await persistence.renameDraft(draft.value._id, name);
    upsertProcessDefinition(updated);
    setDraft(updated);
    renameMenu.value?.hide();
    toast.add({ severity: 'success', summary: t('common.rename'), life: 2000 });
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: t('common.rename'),
      detail: error?.data?.message || error?.message || '',
      life: 4000
    });
  } finally {
    renamingDraft.value = false;
  }
}

function closeProcessMenu() {
  processMenu.value?.hide?.();
}

function setDraft(value) {
  value = clonePlainData(value || {});
  draft.value = value;
  selectedProcessId.value = value?._id ? String(value._id) : null;
  let canvas;
  try {
    const { definition: migrated } = migrateProcessDefinition(value?.data || {}, ctsProjectedDomain());
    canvas = definitionToCanvas(migrated);
    validation.value = null;
  } catch (error) {
    canvas = { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } };
    validation.value = { ok: false, errors: [error.message], warnings: [] };
  }
  resetGraphSelection();
  liveGraph.reset();
  nodes.value = canvas.nodes.map(enrichNodeData);
  edges.value = decorateEdges(canvas.edges);
  selectedRoleId.value = Object.keys(organizationRoles.value)[0] || null;
  selectedPrincipalId.value = Object.keys(value?.data?.servicePrincipals || {})[0] || null;
  selectedScreenId.value = Object.keys(value?.data?.screens || {})[0] || null;
  savedDraftSignature.value = designerSignature();
  nextTick(fitInitialCanvas);
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

// A fresh declaration in the tree gets a suggested kebab id unique among
// registry types and in-tree declarations.
function suggestTreeTypeId() {
  const taken = new Set([...ctsTypeView().map(entry => entry.id), ...nodes.value.filter(node => node.type === 'ctsClass').map(node => node.data.typeId)]);
  let index = 1;
  while (taken.has(`type-${index}`)) index += 1;
  return `type-${index}`;
}

// A name authors identity; the registry id is derived from it. The id only
// becomes hand-authored when the author edits it directly — until then,
// renaming re-derives the id (deduped against registry + tree).
function slugifyTypeName(name = '') {
  const slug = String(name)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^([0-9])/, 't-$1');
  return slug;
}

function derivedTypeId(name = '', currentId = '') {
  const slug = slugifyTypeName(name);
  if (!slug) return currentId;
  if (slug === currentId) return currentId;
  const taken = new Set([
    ...ctsTypeView().map(entry => entry.id),
    ...nodes.value.filter(node => node.type === 'ctsClass').map(node => node.data.typeId)
  ]);
  taken.delete(currentId);
  if (!taken.has(slug)) return slug;
  let index = 2;
  while (taken.has(`${slug}-${index}`)) index += 1;
  return `${slug}-${index}`;
}

function updateClassName(node, name) {
  if (!node || node.type !== 'ctsClass') return;
  node.data.name = String(name || '');
  node.data.typeId = derivedTypeId(node.data.name, node.data.typeId);
  syncNodeData();
}

function renameDeclarationNode(props, value) {
  const node = nodes.value.find(candidate => candidate.id === props.id);
  if (!node) return;
  if (node.type === 'ctsField') node.data.name = String(value || '').trim();
  if (node.type === 'ctsState') node.data.value = String(value || '').trim();
  // No manual propagation here: the live-graph watcher re-interprets the
  // declaration wires, refreshes class counts and the tree overlay, and
  // re-syncs dependent ports in the same tick.
}

function addNode(item, position = nextNodePosition()) {
  const type = typeof item === 'string' ? item : item.type;
  const processNodeKind = typeof item === 'object' ? item.kind : null;
  const id = `${type}_${Date.now()}`;
  const refId = id;
  const node = {
    id,
    type,
    position,
    selected: true,
    data: { refId, label: refId }
  };
  if (DECLARATION_NODE_TYPES.includes(type)) {
    // Declaration-plane canvas nodes own `ctsTypes` records — they ARE the
    // type vocabulary, composed in the same tree (SPEC §20/§21), persisted
    // with the draft and compiled to the registry at activation.
    const classOf = typeof item === 'object' ? item.preset?.classOf : null;
    const typeNode = {
      id,
      type,
      position,
      selected: true,
      data: {
        refId: id,
        ...(type === 'ctsClass'
          ? { typeId: suggestTreeTypeId(), name: '', class: classOf || 'file', scope: 'tree', label: '', payload: null, fields: 0, states: 0 }
          : type === 'ctsType'
            ? { typeId: '', label: '' }
            : type === 'ctsField'
              ? { typeId: null, name: '', descriptor: { base: 'string' } }
              : { typeId: null, value: '', initial: false, terminal: false })
      }
    };
    // enrich BEFORE pushing: the typed port specs must exist the instant
    // the node lands, or the wire compatibility gate rejects the first
    // gesture onto it (enrich also mints and syncs the ctsTypes record)
    const enrichedNode = enrichNodeData(typeNode);
    nodes.value = [...nodes.value.map(item => ({ ...item, selected: false })), enrichedNode];
    selectedNodeId.value = id;
    selectedEdgeId.value = null;
    return enrichedNode;
  }
  const record = ensureRecord(recordKeyForType(type), { data: { refId }, type }, factoryForType(type));
  if (type === 'processNode' && processNodeKind) {
    Object.assign(record, createProcessNode(refId, processNodeKind));
    Object.assign(record, clonePalettePreset(item.preset));
    syncProcessNode(record);
  }
  nodes.value = [...nodes.value.map(item => ({ ...item, selected: false })), enrichNodeData(node)];
  edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
  selectedNodeId.value = id;
  selectedEdgeId.value = null;
  syncEdgeSelection();
  return node;
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
      strokeWidth: selected ? 3 : 2
    }
  };
}

function sourcePortForEdge(edge = {}) {
  const source = nodes.value.find(node => node.id === edge.source);
  if (!source) return {};
  if (edge.role === 'type') return { type: { base: 'json' } };
  if (source.type === 'processNode') {
    const record = draft.value?.data?.processNodes?.[source.data?.refId];
    if (!record) return {};
    return portForHandle(catalogPorts(record).outputs, edge.sourceHandle, 'output') || {};
  }
  // Declaration nodes carry their typed specs from declarationNodePorts.
  return portForHandle(source.data?.outputSpecs || [], edge.sourceHandle, 'output') || {};
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
  return {
    ...canvasToDefinition(
      { nodes: nodes.value.map(stripRuntimeNodeData), edges: validProcessEdges().map(stripRuntimeEdgeData), viewport: snapshotViewport() },
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
  const declarationErrors = checkDeclarationsAgainstCts(
    processDefinitionSnapshot(),
    ctsRegistry(),
    activeOrganizationId()
  );
  if (declarationErrors.length) {
    compiledPreview.value = null;
    compiledPreviewError.value = `CTS declarations: ${declarationErrors.slice(0, 5).join('; ')}`;
    return;
  }
  try {
    const compiled = compileProcessDefinition(
      processDefinitionSnapshot(),
      projectDomainFromView(ctsRegistry(), activeOrganizationId(), cncDomain),
      { roles: organizationRoles.value }
    );
    compiled.bundle = compileClientBundle(ctsRegistry(), activeOrganizationId());
    compiledPreview.value = compiled;
    compiledPreviewError.value = '';
  } catch (error) {
    compiledPreview.value = null;
    compiledPreviewError.value = error.message || String(error);
  }
}

function syncNodeData() {
  dataflowPreview.value = null;
  // live tree first: ports, palette, and options below resolve against the
  // overlay registry, so field/state wiring is visible immediately
  refreshTreeOverlay();
  for (const node of nodes.value) {
    if (!node.data?.refId) continue;
    // One malformed record must not freeze the sync for every other node:
    // a thrown error here would kill the live-evaluation pass midway and
    // read on the canvas as "sockets stopped updating".
    try {
      enrichNodeData(node);
    } catch (error) {
      console.error(`[process-designer] sync failed for ${node.type} ${node.id}`, error);
    }
  }
}

// The one node-data enrichment pass: mutates and returns the canvas node
// with everything its card and the inspector read — record sync, derived
// labels, port specs, and option lists. Both initial projection
// (setDraft/addNode) and every live sync go through here, so a node's
// rendered state has exactly one derivation.
function enrichNodeData(node) {
  const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
  const isProcessNode = node.type === 'processNode';
  if (isProcessNode) syncProcessNode(record);
  if (DECLARATION_NODE_TYPES.includes(node.type)) syncDeclarationRecord(record, node);

  const data = node.data || (node.data = {});
  Object.assign(data, {
    // Declaration node labels derive from the declaration itself; a
    // renamed class card shows the current name, not the drop-time one.
    label: declarationNodeLabel(node, record),
    entityType: nodeEntityType(record),
    commandId: record.commandId,
    processNodeRecord: isProcessNode ? record : null,
    onProcessNodeUpdate: isProcessNode ? updates => updateProcessNodeRecord(record.id || data.refId, updates) : null,
    processEntityTypeOptions: isProcessNode ? processEntityTypeOptions(record) : [],
    processOperationOptions: isProcessNode ? processNodeOperationOptions(record) : [],
    processFieldOptions: isProcessNode ? processNodeFieldOptions(record) : [],
    processStatusOptions: isProcessNode ? processStatusOptionsFor(record) : [],
    processTriggerModeOptions: isProcessNode ? triggerModeOptions.value : [],
    processConnectedInputIds: isProcessNode ? connectedProcessInputIds(node, record) : [],
    kindLabel: isProcessNode ? processNodeDisplayLabel(record) : record.kind,
    summary: processNodeSummary(record),
    purpose: isProcessNode ? processNodeDescription(record) : ''
  });

  if (DECLARATION_NODE_TYPES.includes(node.type)) {
    // Declaration nodes derive their typed specs from the declaration
    // itself (declarationNodePorts / the registry entry), never from record
    // inputs/outputs.
    const ports = declarationNodePorts(node, ctsTypeView()) || {};
    data.inputSpecs = ports.inputSpecs || [];
    data.outputSpecs = ports.outputSpecs || [];
    if (node.type === 'ctsClass') {
      data.version = 1;
      data.scope = 'org';
    }
    if (node.type === 'ctsType') {
      const entry = ctsTypeView().find(candidate => candidate.id === data.typeId);
      data.type = entry || null;
      data.label = entry?.label || data.typeId || 'type';
    }
  } else {
    data.inputSpecs = record.inputs || [];
    data.outputSpecs = record.outputs || [];
  }
  return node;
}

function declarationNodeLabel(node, record) {
  if (node.type === 'ctsClass') return node.data?.name || node.data?.typeId || '';
  if (node.type === 'ctsField') return node.data?.name || '';
  if (node.type === 'ctsState') return node.data?.value || '';
  if (node.type === 'ctsType') return node.data?.typeId || 'type';
  return record.label || record.entityType || record.commandId || node.data?.label || '';
}

function clonePalettePreset(preset = {}) {
  return clonePlainData(preset);
}

function clonePlainData(value = {}) {
  return JSON.parse(JSON.stringify(value || {}));
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
      label: '',
      entityType,
      mode: 'list',
      required: { feature, level: 'read' },
      filters: {},
      lineageBindings: []
    }],
    regions: [{
      id: 'main',
      label: '',
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
  screenEditing.sync(selectedScreenRecord.value);
}

function addSelectedScreenSource() {
  screenEditing.addSource(selectedScreenRecord.value);
}

function removeSelectedScreenSource(index) {
  screenEditing.removeSource(selectedScreenRecord.value, index);
}

function addSelectedScreenRegion() {
  screenEditing.addRegion(selectedScreenRecord.value);
}

function removeSelectedScreenRegion(index) {
  screenEditing.removeRegion(selectedScreenRecord.value, index);
}

function featureForEntityType(entityType) {
  const entity = (designer.domain.entities || []).find(item => item.type === entityType);
  return entity?.collection || `${entityType}s`;
}

// Declaration authoring state persists in `ctsTypes` records with the
// draft (SPEC §20/§21 one tree): saving keeps the nodes, activation
// compiles them into registry declarations.
function syncDeclarationRecord(record = {}, node = {}) {
  record.kind = { ctsClass: 'class', ctsField: 'field', ctsState: 'state', ctsType: 'type' }[node.type] || record.kind;
  if (node.type === 'ctsClass') {
    record.typeId = node.data.typeId || '';
    record.name = node.data.name || '';
    record.class = node.data.class || 'file';
    record.payload = node.data.payload || null;
    record.operators = Array.isArray(node.data.operators) ? node.data.operators : [];
  }
  if (node.type === 'ctsField') {
    record.typeId = node.data.typeId || null;
    record.name = node.data.name || '';
    record.descriptor = { ...(node.data.descriptor || { base: 'string' }) };
  }
  if (node.type === 'ctsState') {
    record.typeId = node.data.typeId || null;
    record.value = node.data.value || '';
    record.initial = node.data.initial === true;
    record.terminal = node.data.terminal === true;
  }
  if (node.type === 'ctsType') record.typeId = node.data?.typeId || '';
}

function updateProcessNodeRecord(nodeId, updates = {}) {
  const node = draft.value?.data?.processNodes?.[nodeId];
  if (!node) return;
  if (updates.entityType && updates.entityType !== nodeEntityType(node)) {
    node.path = '';
    node.relationKey = '';
  }
  // Inspector updates arrive in working keys; they land on the record in the
  // record's own vocabulary.
  const { entityType, ...rest } = updates;
  Object.assign(node, rest);
  if (entityType !== undefined) setNodeEntityType(node, entityType);
  if (updates.trigger?.mode === 'manual') {
    const graphNodeId = nodes.value.find(item => item.type === 'processNode' && item.data?.refId === nodeId)?.id;
    edges.value = edges.value.filter(edge => !(
      edge.target === graphNodeId
      && String(edge.targetHandle || '').startsWith('control:')
    ));
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

function updateInputTransform(node, inputId, transform, enabled) {
  node.inputTransforms ||= {};
  node.inputTransforms[inputId] = { ...(node.inputTransforms[inputId] || {}), [transform]: Boolean(enabled) };
  if (!Object.values(node.inputTransforms[inputId]).some(Boolean)) delete node.inputTransforms[inputId];
  syncNodeData();
}

// Keys enrichNodeData derives each pass: transient view state, never
// persisted with the draft.
const RUNTIME_NODE_DATA_KEYS = [
  'label',
  'entityType',
  'commandId',
  'type',
  'version',
  'scope',
  'fields',
  'states',
  'processNodeRecord',
  'onProcessNodeUpdate',
  'processEntityTypeOptions',
  'processOperationOptions',
  'processFieldOptions',
  'processStatusOptions',
  'processTriggerModeOptions',
  'processConnectedInputIds',
  'kindLabel',
  'summary',
  'purpose',
  'inputSpecs',
  'outputSpecs'
];

function stripRuntimeNodeData(node) {
  const runtimeFreeNode = { ...node };
  delete runtimeFreeNode.selected;
  delete runtimeFreeNode.dragging;
  delete runtimeFreeNode.resizing;
  const data = { ...(node.data || {}) };
  for (const key of RUNTIME_NODE_DATA_KEYS) {
    delete data[key];
  }
  return { ...runtimeFreeNode, data };
}

function stripRuntimeEdgeData(edge) {
  const { animated, style, selected, ...rest } = edge;
  return rest;
}

function openGrantEditor(kind, index, feature) {
  if (!feature) return;
  grantEditorTarget.value = { kind, index, feature };
  showGrantEditor.value = true;
}

function grantForEditorTarget(target = {}) {
  if (target.kind === 'screen') return selectedScreenRecord.value?.required;
  return null;
}

function saveGrantEditor(permissions = {}) {
  const target = grantEditorTarget.value;
  if (!target) return;
  const grant = permissionGrants(permissions).find(item => item.feature === target.feature);
  if (!grant) return;
  const previous = grantForEditorTarget(target) || {};
  const next = { ...withoutKeys(grant, ['feature']), ...(previous.roleId ? { roleId: previous.roleId } : {}) };
  if (target.kind === 'screen' && selectedScreenRecord.value) selectedScreenRecord.value.required = { feature: target.feature, ...next };
  showGrantEditor.value = false;
}

function permissionGrants(permissions = {}) {
  return Object.entries(permissions).flatMap(([feature, value]) => {
    if (!value || value === 'none') return [];
    const grants = Array.isArray(value) ? value : [value];
    return grants.filter(grant => grant && grant.level && grant.level !== 'none').map(grant => ({ feature, ...grant }));
  });
}

function withoutKeys(value = {}, keys = []) {
  return Object.fromEntries(Object.entries(value || {}).filter(([key]) => !keys.includes(key)));
}

// One wire per single-value socket: a second connection into an input
// that does not declare `multiple` is rejected on the gesture, not at save
// time — the canvas never shows a wire the serializer would have to drop.
function singleWireViolation(connection = {}) {
  const target = nodes.value.find(node => node.id === connection.target);
  if (!target || target.type !== 'processNode') return null;
  if (String(connection.targetHandle || '').startsWith('control:')) return null;
  const record = draft.value?.data?.processNodes?.[target.data?.refId];
  if (!record) return null;
  const input = portForHandle(catalogPorts(record).inputs, connection.targetHandle, 'input');
  if (!input || input.multiple === true) return null;
  const occupied = edges.value.some(edge => (
    edge.target === connection.target
    && String(edge.targetHandle || '') === String(connection.targetHandle || '')
  ));
  return occupied ? input : null;
}

function onConnect(connection) {
  contextPalette.value.socket = null;
  syncNodeData();
  const occupiedInput = singleWireViolation(connection);
  if (occupiedInput) {
    toast.add({
      severity: 'warn',
      summary: t('processDesigner.incompatiblePorts'),
      detail: t('processDesigner.socketSingleWire', { socket: occupiedInput.label || occupiedInput.id }),
      life: 3000
    });
    return;
  }
  const processNodeSnapshot = clonePlainData(draft.value?.data?.processNodes || {});
  inferGenericNodeTypeFromConnection(connection);
  const compatibility = connectionCompatibility(connection);
  if (!compatibility.ok) {
    draft.value.data.processNodes = processNodeSnapshot;
    syncNodeData();
    toast.add({
      severity: 'warn',
      summary: t('processDesigner.incompatiblePorts'),
      detail: compatibility.reason
        ? `${t('processDesigner.incompatiblePortsDetail', {
          source: compatibility.source?.label || compatibility.source?.id || t('processDesigner.source'),
          target: compatibility.target?.label || compatibility.target?.id || t('processDesigner.target')
        })} — ${compatibility.reason}`
        : t('processDesigner.incompatiblePortsDetail', {
          source: compatibility.source?.label || compatibility.source?.id || t('processDesigner.source'),
          target: compatibility.target?.label || compatibility.target?.id || t('processDesigner.target')
        }),
      life: 3000
    });
    return;
  }
  // declaration wires carry their side effects through live interpretation
  // (applyGraphInterpretation): they persist as role:'type' edges — the
  // vocabulary compileTreeDeclarations and interpretDeclarationEdges read —
  // never as generic data edges. Binding follows the wire for as long as it
  // exists; renaming the source re-binds every wired descendant.
  const sourceNode = nodes.value.find(node => node.id === connection.source);
  const targetNode = nodes.value.find(node => node.id === connection.target);
  const targetNodeRecord = draft.value?.data?.processNodes?.[targetNode?.data?.refId];
  const legality = declarationWireLegality({
    sourceType: sourceNode?.type,
    targetType: targetNode?.type,
    targetRecord: targetNodeRecord
  });
  if (legality) {
    // one binding wire per record: a new bind replaces the previous one
    if (legality === 'binds') {
      edges.value = edges.value.filter(edge => !(
        edge.role === 'type' && edge.label === 'type' && edge.target === targetNode.id
      ));
    }
    const declarationEdge = {
      ...connection,
      type: 'default',
      role: 'type',
      label: legality === 'declares' ? (sourceNode.type === 'ctsField' ? 'field' : 'state')
        : legality === 'binds' ? 'type'
          : legality === 'targets' ? 'ref-target'
            : legality
    };
    if (legality === 'declares') declarationEdge.id = `declares:${sourceNode.id}-${targetNode.id}`;
    if (legality === 'children') {
      declarationEdge.id = `children:${sourceNode.id}-${targetNode.id}`;
      declarationEdge.data = { key: `${targetNode.data.typeId}s`, onRemove: 'restrict' };
    }
    if (legality === 'transition') {
      declarationEdge.id = `transition:${sourceNode.id}-${targetNode.id}-${Date.now()}`;
      declarationEdge.data = { intent: '' };
    }
    if (legality === 'binds') declarationEdge.id = `${sourceNode.id}-type-${targetNode.id}-${Date.now()}`;
    if (legality === 'targets') declarationEdge.id = `ref-target:${sourceNode.id}-${targetNode.id}-${Date.now()}`;
    // Deterministic declares/children ids: the same declaration wire twice
    // is a no-op, not a duplicate edge.
    if (edges.value.some(edge => edge.id === declarationEdge.id)) return;
    selectedEdgeId.value = null;
    edges.value.push(decorateEdge(declarationEdge));
    syncEdgeSelection();
    evaluateNow();
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
  syncEdgeSelection();
}

function connectionCompatibility(connection = {}) {
  const source = nodes.value.find(item => item.id === connection.source);
  const target = nodes.value.find(item => item.id === connection.target);
  if (!source || !target) return { ok: true };
  const sourceRecord = draft.value?.data?.processNodes?.[source.data?.refId];
  const targetRecord = draft.value?.data?.processNodes?.[target.data?.refId];
  if (!sourceRecord || !targetRecord) {
    // Declaration wires are legal only between declaration partners
    // (declarationWireLegality): field/state -> class declares;
    // class/reference -> cts.* species record binds. A declaration node is
    // never a value source and no data node can feed a class declare
    // input, so the generic spec path never applies to them.
    if (DECLARATION_NODE_TYPES.includes(source.type) || DECLARATION_NODE_TYPES.includes(target.type)) {
      const legality = declarationWireLegality({
        sourceType: source.type,
        targetType: target.type,
        targetRecord
      });
      if (legality === 'declares') {
        const sourcePort = (source.data?.outputSpecs || [])[0];
        const targetPort = (target.data?.inputSpecs || [])[0];
        if (!sourcePort || !targetPort) {
          return { ok: false, reason: 'Declarations wire Field/State nodes into a Class declare input' };
        }
        return {
          ...processSocketsCompatible(sourcePort, targetPort),
          source: sourcePort,
          target: targetPort
        };
      }
      if (legality === 'binds') {
        const sourcePort = (source.data?.outputSpecs || [])[0];
        if (!sourcePort) {
          return { ok: false, reason: source.type === 'ctsClass' ? 'Name the class before binding its type' : 'The type node has no selected type' };
        }
        // The binding wire lands on the persistent Type pin (origin
        // species: construct/read). It typechecks against the source
        // alone — the pin accepts any declared type.
        const inputs = catalogPorts(targetRecord).inputs;
        const pin = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.id === 'type');
        if (!pin || pin.id !== 'type') {
          return { ok: false, reason: 'Type bindings wire into the Type pin' };
        }
        return {
          ...processSocketsCompatible(sourcePort, pin),
          source: sourcePort,
          target: pin
        };
      }
      if (legality === 'children') {
        return source.data?.typeId && target.data?.typeId
          ? { ok: true }
          : { ok: false, reason: 'Both classes need a type id before declaring children' };
      }
      if (legality === 'transition') {
        return source.data?.typeId && source.data.typeId === target.data?.typeId
          ? { ok: true }
          : { ok: false, reason: 'Transitions connect states of one declared type' };
      }
      if (legality === 'targets') {
        // ref fields receive their accepted target types as wired inputs
        if (target.data?.descriptor?.base !== 'ref') {
          return { ok: false, reason: 'Set the field type to ref before wiring targets' };
        }
        return source.data?.typeId
          ? { ok: true }
          : { ok: false, reason: 'Name the class before wiring it as a ref target' };
      }
      return {
        ok: false,
        reason: (source.type === 'ctsClass' || source.type === 'ctsType') && targetRecord
          ? 'Only construct and read carry a Type pin — mutates adapt to their entity stream'
          : 'Only current operation nodes can be connected'
      };
    }
    return { ok: false, reason: 'Only current operation nodes can be connected' };
  }
  const sourcePort = portForHandle(catalogPorts(sourceRecord).outputs, connection.sourceHandle, 'output');
  const targetPort = portForHandle(catalogPorts(targetRecord).inputs, connection.targetHandle, 'input');
  if (!sourcePort || !targetPort) return { ok: true };
  return {
    ...processSocketsCompatible(sourcePort, targetPort),
    source: sourcePort,
    target: targetPort
  };
}

// The incoming entity window of one record, resolved through the catalog
// (the same ports the node cards render), not by sniffing stored record
// shapes.
function inferIncomingEntityContract(nodeId) {
  const graphNode = nodes.value.find(node => node.type === 'processNode' && node.data?.refId === nodeId);
  if (!graphNode) return {};
  const edge = edges.value.find(item => item.target === graphNode.id && String(item.targetHandle || '').startsWith('input'));
  if (!edge) return {};
  const source = nodes.value.find(item => item.id === edge.source);
  const sourceRecord = source?.data?.refId ? draft.value?.data?.processNodes?.[source.data.refId] : null;
  if (!sourceRecord) return {};
  const sourcePorts = catalogPorts(sourceRecord).outputs;
  const port = portForHandle(sourcePorts, edge.sourceHandle, 'output')
    || sourcePorts.find(candidate => candidate.type?.entityType || candidate.type?.itemType?.entityType)
    || null;
  const entityType = port?.type?.entityType || port?.type?.itemType?.entityType || nodeEntityType(sourceRecord) || '';
  return {
    entityType,
    status: typeof port?.status === 'string' ? port.status : (sourceRecord.status?.to || ''),
    access: sourceRecord.access ? normalizeDesignerAccess(sourceRecord.access) : null
  };
}

</script>

