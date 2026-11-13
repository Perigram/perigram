<template>
  <StandardPage workspace>
    <DesignerSurface>
      <DesignerWorkspace
        ref="canvasFrame"
        :document-items="documentDockItems"
        :canvas-items="canvasDockItems"
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
          @node-drag-stop="onNodeDragStop"
          @nodes-change="onCanvasNodesChange"
        >
          <template #node-ctsType="props"><CtsTypeNode v-bind="props" /></template>
          <template #node-ctsClass="props"><ClassNode v-bind="props" /></template>
          <template #node-ctsField="props"><FieldNode v-bind="props" @rename="value => renameDeclarationNode(props, value)" /></template>
          <template #node-ctsState="props"><StateNode v-bind="props" @rename="value => renameDeclarationNode(props, value)" /></template>
          <template #node-processNode="props"><ProcessNode v-bind="props" /></template>
          <template #edge-selfloop="props"><SelfLoopEdge v-bind="props" /></template>
          <template #zoom-pane>
            <LaneBands
              :bands="laneBands"
              :left="laneExtent.left"
              :right="laneExtent.right"
            />
          </template>
        </VueFlow>
        <template #fallback><div class="absolute inset-0" /></template>
      </ClientOnly>

      <!-- Selection speed dial: the quiet-card policy keeps nodes free of
           per-node chrome, so selection actions float beside the last
           selected node instead. -->
      <SpeedDial
        v-if="selectionDialStyle"
        :model="selectionDialItems"
        direction="up-right"
        :style="selectionDialStyle"
        class="absolute z-30"
        button-icon="pi pi-ellipsis-v"
        :aria-label="$t('processDesigner.selectionActions')"
        :tooltip-options="{ event: 'hover', position: 'left' }"
      />

      <div
        v-if="contextPalette.open"
        class="absolute z-30 flex max-h-80 w-72 flex-col overflow-hidden rounded-ui bg-content shadow-card"
        :style="{ left: `${contextPalette.x}px`, top: `${contextPalette.y}px` }"
        @mousedown.stop
        @click.stop
      >
        <div class="flex shrink-0 items-center justify-end px-2 pt-2">
          <Button icon="pi pi-times" severity="secondary" text rounded size="small" :aria-label="$t('processDesigner.closeOperationPalette')" @click="closeContextPalette" />
        </div>
        <OperationPalette
          ref="contextPaletteSearch"
          :groups="contextPaletteChipGroups"
          :placeholder="contextPalette.socket ? $t('processDesigner.compatibleOperations') : $t('processDesigner.addOperation')"
          @pick="addContextNode"
          @close="closeContextPalette"
        />
        <Message v-if="!contextPaletteChipGroups.length" class="m-2 shrink-0" severity="secondary" size="small">
          {{ $t('processDesigner.noCompatibleOperations') }}
        </Message>
      </div>

      <div v-if="!nodes.length" class="absolute inset-x-4 top-8 z-10 flex justify-center">
        <StateBlock :message="emptyCanvasMessage" />
      </div>

      <template #palette>
        <OperationPalette
          :groups="paletteChipGroups"
          :placeholder="$t('processDesigner.searchOperations')"
          @pick="item => (item.action ? item.action() : addNode(item))"
        />
      </template>

      <template #inspector>
        <div class="flex h-full min-h-0 flex-col">
          <Tabs v-model:value="inspectTab" class="flex min-h-0 flex-1 flex-col">
            <TabList>
              <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
              <Tab value="definitions">{{ $t('processDesigner.definitions') }}</Tab>
              <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
              <Tab v-if="servedPreviewChannels.length" value="preview">{{ $t('processDesigner.previewTab') }}</Tab>
            </TabList>
            <TabPanels class="min-h-0 flex-1 overflow-y-auto">
            <TabPanel value="definitions">
              <Listbox
                :model-value="selectedProcessId"
                :options="processDefinitions"
                option-label="identity.name"
                option-value="_id"
                data-key="_id"
                :aria-label="$t('processDesigner.definitions')"
                @update:model-value="value => selectProcessDefinition(value)"
              >
                <template #option="{ option }">
                  <!-- Single root, single line: the option row matches the
                       chats-inbox anatomy; per-row detail (version history)
                       opens in the popover below, never inside the option. -->
                  <div class="flex w-full min-w-0 items-center gap-2">
                    <template v-if="renamingDefinitionId === String(option._id)">
                      <InputText
                        v-model="renamingDefinitionName"
                        class="min-w-0 flex-1"
                        size="small"
                        :aria-label="$t('common.rename')"
                        @click.stop
                        @keydown.enter.prevent.stop="applyDefinitionRename(option)"
                      />
                      <Button
                        icon="pi pi-check"
                        class="shrink-0"
                        size="small"
                        text
                        :loading="definitionBusyId === String(option._id)"
                        :disabled="!renamingDefinitionName.trim()"
                        @click.stop="applyDefinitionRename(option)"
                      />
                    </template>
                    <template v-else>
                      <span
                        class="min-w-0 flex-1 truncate"
                        :title="normalizeProcessDisplayName(option.identity?.name || option.identity?.uid || option._id)"
                      >{{ [normalizeProcessDisplayName(option.identity?.name || option.identity?.uid || option._id), option.states?.main === 'ACTIVE' ? $t('processDesigner.activeSet') : null].filter(Boolean).join(' · ') }}</span>
                      <ToggleSwitch
                        class="shrink-0"
                        :model-value="option.states?.main === 'ACTIVE'"
                        :loading="definitionBusyId === String(option._id)"
                        :aria-label="$t('processDesigner.activate')"
                        @update:model-value="value => toggleDefinitionActive(option, value)"
                        @click.stop
                      />
                      <Button
                        icon="pi pi-history"
                        class="shrink-0"
                        size="small"
                        text
                        :aria-label="$t('processDesigner.versions')"
                        @click.stop="event => openDefinitionHistory(event, option)"
                      />
                      <Button
                        icon="pi pi-ellipsis-v"
                        class="shrink-0"
                        size="small"
                        text
                        severity="secondary"
                        :aria-label="$t('processDesigner.definitionActions')"
                        aria-haspopup="true"
                        :aria-controls="`definition-menu-${option._id}`"
                        @click.stop="event => toggleDefinitionMenu(event, option)"
                      />
                      <Menu
                        :ref="instance => setDefinitionMenuRef(option._id, instance)"
                        :id="`definition-menu-${option._id}`"
                        :model="definitionMenuItems(option)"
                        popup
                      />
                    </template>
                  </div>
                </template>
              </Listbox>
              <Popover ref="historyPopoverRef">
                <div class="flex min-w-56 flex-col gap-1">
                  <div v-if="historyLoading" class="text-muted text-supporting">…</div>
                  <div
                    v-for="(entry, index) in definitionHistoryEntries"
                    v-else-if="definitionHistoryEntries.length"
                    :key="`${entry.at}-${index}`"
                    class="flex items-center gap-2 text-supporting"
                  >
                    <span class="min-w-0 flex-1 truncate">{{ formatHistoryEntry(entry) }}</span>
                    <Button
                      icon="pi pi-undo"
                      size="small"
                      text
                      :aria-label="$t('common.restore')"
                      :loading="definitionBusyId === historyDefinitionId"
                      @click="restoreDefinitionVersion(historyDefinition, entry)"
                    />
                  </div>
                  <div v-else class="text-muted text-supporting">—</div>
                </div>
              </Popover>
            </TabPanel>
            <TabPanel value="inspector">
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
                  @sync="syncNodeData"
                  @update-name="value => updateClassName(selectedNode, value)"
                  @update-identifier-field="value => setClassIdentifierField(selectedNode, value)"
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
                  :construction-modes="constructionModeOptions(nodeTypeId(selectedProcessNode))"
                  :designer="designer"
                  :grants="selectedProcessNodeGrants"
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
                  @update-grant-level="({ index, level }) => updateSelectedProcessNodeGrantLevel(index, level)"
                  @update-construction-mode="mode => updateProcessNodeConstructionMode(selectedProcessNode, mode)"
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
                  <!-- Rename/delete live behind the row menu (SPEC "Role
                       management"): destructive and identity actions are
                       never first-plane. -->
                  <div class="flex items-center gap-2">
                    <template v-if="renamingRoleId === selectedRoleId">
                      <InputText
                        v-model="renamingRoleLabel"
                        class="min-w-0 flex-1"
                        size="small"
                        :aria-label="$t('common.rename')"
                        @keydown.enter.prevent.stop="applyRoleRename"
                        @click.stop
                      />
                      <Button
                        icon="pi pi-check"
                        class="shrink-0"
                        size="small"
                        text
                        :disabled="!renamingRoleLabel.trim()"
                        @click="applyRoleRename"
                      />
                    </template>
                    <template v-else>
                      <strong class="min-w-0 flex-1 truncate text-label">{{ selectedRoleRecord.label || selectedRoleId }}</strong>
                      <Button
                        icon="pi pi-ellipsis-v"
                        class="shrink-0"
                        size="small"
                        text
                        severity="secondary"
                        :aria-label="$t('processDesigner.roleActions')"
                        aria-haspopup="true"
                        aria-controls="role-detail-menu"
                        @click="toggleRoleMenu"
                      />
                      <Menu ref="roleMenuRef" id="role-detail-menu" :model="roleMenuItems" popup />
                    </template>
                  </div>
                  <!-- Single-seat roles (organizations README): exactly one
                       member holds the role at a time — assigning someone
                       moves the seat. -->
                  <div class="flex items-center gap-2">
                    <ToggleSwitch
                      :model-value="Boolean(selectedRoleRecord.exclusive)"
                      input-id="role-exclusive"
                      :aria-label="$t('organization.singleSeat')"
                      @update:model-value="applyRoleExclusive"
                    />
                    <label for="role-exclusive" class="cursor-pointer text-body">{{ $t('organization.singleSeat') }}</label>
                  </div>
                  <!-- The agent-chat capability (organizations README):
                       members holding a role with it see the organization
                       AI and its chat surfaces. -->
                  <div class="flex items-center gap-2">
                    <ToggleSwitch
                      :model-value="Boolean(selectedRoleRecord.agentChat)"
                      input-id="role-agent-chat"
                      :aria-label="$t('organization.agentChat')"
                      @update:model-value="applyRoleAgentChat"
                    />
                    <label for="role-agent-chat" class="cursor-pointer text-body">{{ $t('organization.agentChat') }}</label>
                  </div>
                  <div v-if="selectedRoleAccessSummary.length" class="flex flex-wrap gap-1">
                    <Tag v-for="item in selectedRoleAccessSummary" :key="item.key" :value="`${item.text} · ${item.contributor.label}`" size="small" />
                  </div>
                  <Button icon="pi pi-users" :label="$t('organization.openTeam')" severity="secondary" text size="small" class="self-start" @click="openTeamManagement" />
                </div>

                <!-- Screens live with their role (SPEC "Role management"):
                     per-role compiled stations; the authored-station editor
                     only when the edited screen belongs to this role. -->
                <div v-if="selectedRoleId" class="flex flex-col gap-4">

                  <Message v-if="compiledPreviewError" severity="error">{{ compiledPreviewError }}</Message>
                  <div
                    v-for="screen in screensForSelectedRole"
                    :key="screen.id"
                    class="flex flex-col gap-2 rounded-ui bg-subtle p-3"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <span class="min-w-0 truncate text-label">{{ screen.label || screen.id }}</span>
                      <div class="flex shrink-0 items-center gap-1">
                        <Tag v-if="!isAuthoredStation(screen)" :value="$t('processDesigner.inferredStation')" severity="info" size="small" />
                        <Tag v-if="screen.typeId" :value="screen.typeId" severity="secondary" size="small" />
                        <Tag :value="screen.template" size="small" />
                        <Button
                          v-if="!isAuthoredStation(screen)"
                          icon="pi pi-pencil"
                          :label="$t('processDesigner.customizeStation')"
                          size="small"
                          text
                          @click="customizeStation(screen)"
                        />
                      </div>
                    </div>
                    <GeneratedMappingScreen
                      :screen="screen"
                      :contract="compiledPreviewContract"
                      :bundle="compiledPreviewBundle"
                    />
                    <small class="truncate text-muted">{{ screen.route || screen.id }}</small>
                  </div>
                  <!-- Zero stations (nothing inferred, nothing authored) is the
                       delta-only contract: stations exist only as inference
                       over role grants, so the tab explains where they come
                       from instead of rendering nothing. -->
                  <StateBlock
                    v-if="!screensForSelectedRole.length && !compiledPreviewError"
                    :message="$t('processDesigner.noCompiledScreens')"
                    :description="$t('processDesigner.noCompiledScreensHint')"
                  />
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
                  <div v-if="selectedScreenBelongsToRole" class="flex flex-col gap-3">
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
                        <label>{{ $t('processDesigner.typeId') }}</label>
                        <Select v-model="selectedScreenRecord.typeId" :options="optionalTypeIdOptions" option-label="label" option-value="value" @change="syncSelectedScreenUi" />
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
                          <div class="flex flex-col gap-1"><label>{{ $t('processDesigner.typeId') }}</label><Select :model-value="source.typeId" :options="typeIdOptions" option-label="label" option-value="value" size="small" @update:model-value="value => screenEditing.setSourceTypeId(selectedScreenRecord, source, value)" /></div>
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
                          <div v-for="row in screenEditing.scalarRows(source.filters)" :key="row.key" class="flex items-center gap-2">
                            <InputText class="min-w-0 flex-1" :model-value="row.key" :aria-label="$t('processDesigner.key')" size="small" @change="event => screenEditing.renameScalar(source.filters, row.key, event.target.value)" />
                            <Select class="min-w-0 flex-1" :model-value="row.type" :options="screenScalarTypeOptions" option-label="label" option-value="value" size="small" :aria-label="$t('processDesigner.valueType')" @update:model-value="value => screenEditing.setScalarType(source.filters, row.key, value)" />
                            <InputNumber v-if="row.type === 'number'" class="min-w-0 flex-1" v-model="source.filters[row.key]" size="small" />
                            <Checkbox v-else-if="row.type === 'boolean'" v-model="source.filters[row.key]" binary :aria-label="$t('processDesigner.value')" />
                            <InputText v-else class="min-w-0 flex-1" v-model="source.filters[row.key]" :aria-label="$t('processDesigner.value')" size="small" />
                            <Button class="shrink-0" icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="screenEditing.removeScalar(source.filters, row.key)" />
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
                      <div v-for="row in screenEditing.scalarRows(selectedScreenRecord.bindings)" :key="row.key" class="flex items-center gap-2">
                        <InputText class="min-w-0 flex-1" :model-value="row.key" :aria-label="$t('processDesigner.key')" size="small" @change="event => screenEditing.renameScalar(selectedScreenRecord.bindings, row.key, event.target.value)" />
                        <Select class="min-w-0 flex-1" :model-value="row.type" :options="screenBindingTypeOptions" option-label="label" option-value="value" size="small" :aria-label="$t('processDesigner.valueType')" @update:model-value="value => screenEditing.setScalarType(selectedScreenRecord.bindings, row.key, value)" />
                        <InputNumber v-if="row.type === 'number'" class="min-w-0 flex-1" v-model="selectedScreenRecord.bindings[row.key]" size="small" />
                        <Checkbox v-else-if="row.type === 'boolean'" v-model="selectedScreenRecord.bindings[row.key]" binary :aria-label="$t('processDesigner.value')" />
                        <InputText v-else class="min-w-0 flex-1" v-model="selectedScreenRecord.bindings[row.key]" :aria-label="$t('processDesigner.value')" size="small" />
                        <Button class="shrink-0" icon="pi pi-trash" severity="danger" text size="small" :aria-label="$t('common.delete')" @click="screenEditing.removeScalar(selectedScreenRecord.bindings, row.key)" />
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
                        <label>{{ $t('processDesigner.typeId') }}</label>
                        <Select v-model="selectedSocketRecord.typeId" :options="typeIdOptions" option-label="label" option-value="value" />
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

            <TabPanel value="preview">
              <div class="flex flex-col gap-3">
                <div class="flex items-center justify-between gap-2">
                  <span class="text-label">{{ $t('processDesigner.previewChannels') }}</span>
                  <Button
                    icon="pi pi-refresh"
                    size="small"
                    text
                    :loading="channelPreviewRunning"
                    :aria-label="$t('processDesigner.refreshPreview')"
                    @click="runChannelPreview"
                  />
                </div>
                <Message v-if="channelPreviewError" severity="error">{{ channelPreviewError }}</Message>
                <template v-if="servedPreviewChannels.length">
                  <section
                    v-for="channel in servedPreviewChannels"
                    :key="channel.id"
                    class="flex flex-col gap-2"
                  >
                    <span class="text-muted text-supporting">{{ channel.label }}</span>
                    <PreviewChannelMount :channel="channel" :payload="channelPreviewPayload" />
                  </section>
                </template>
                <StateBlock v-else :message="$t('processDesigner.noPreviewChannels')" />
              </div>
            </TabPanel>


          </TabPanels>
        </Tabs>

        <!-- Role delete confirmation: warns when the role carries load in
             any definition (lanes/grants/screens/actions). -->
        <StandardDialog v-model:visible="roleDeleteVisible" :header="$t('processDesigner.deleteRole')">
          <div class="flex flex-col gap-4">
            <Message v-if="roleDeleteUsage && roleDeleteUsage.names.length" severity="warn">
              {{ $t('processDesigner.roleInUseBy', { count: roleDeleteUsage.names.length, names: roleDeleteUsage.names.join(', ') }) }}
            </Message>
            <span class="text-body">{{ $t('processDesigner.deleteRoleConfirm', { name: selectedRoleRecord?.label || selectedRoleId }) }}</span>
            <div class="flex justify-end gap-2">
              <Button :label="$t('common.cancel')" text @click="roleDeleteVisible = false" />
              <Button :label="$t('common.delete')" severity="danger" outlined :loading="roleDeleteBusy" @click="deleteRoleConfirmed" />
            </div>
          </div>
        </StandardDialog>
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
      :visible="applyState === 'migration-required'"
      :plan="applyState === 'migration-required' ? applyDetail : null"
      :mappings="draft?.data?.migrations?.statuses || null"
      :loading="applyState === 'applying'"
      @update:visible="value => { if (!value) cancelApplyMigration(); }"
      @confirm="confirmApplyMigration"
      @cancel="cancelApplyMigration"
    />

    <TypeMigrationStepsDialog
      :visible="applyState === 'type-migration-required'"
      :failures="applyState === 'type-migration-required' ? applyDetail : null"
      :vocabulary="typeMigrationVocabulary"
      :loading="applyState === 'applying'"
      @update:visible="value => { if (!value) cancelTypeMigration(); }"
      @confirm="confirmTypeMigration"
      @cancel="cancelTypeMigration"
    />



  </StandardPage>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { SelectionMode, VueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import SpeedDial from 'primevue/speeddial';
import ToggleSwitch from 'primevue/toggleswitch';
import Menu from 'primevue/menu';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Listbox from 'primevue/listbox';
import Popover from 'primevue/popover';
import Message from 'primevue/message';
import MultiSelect from '~/components/shared/InstanceMultiSelect.vue';
import Panel from 'primevue/panel';
import Select from '~/components/shared/InstanceSelect.vue';
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
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import ApplyMigrationDialog from '~/components/process-designer/ApplyMigrationDialog.vue';
import OperationPalette from '~/components/process-designer/OperationPalette.vue';
import PreviewChannelMount from '~/components/process-designer/PreviewChannelMount.vue';
import TypeMigrationStepsDialog from '~/components/process-designer/TypeMigrationStepsDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PermissionEditor from '~/components/PermissionEditor.vue';
import { projectUiAction } from '~/packages/processes/src/ui-contract-projection.js';
import {
  EFFECT_SPECIES_KINDS,
  applyFieldDisplayRole,
  authoredSocketDefault,
  canvasToDefinition,
  compileProcessDefinition,
  compileTreeDeclarations,
  DECLARATION_NODE_TYPES,
  declarationNodePorts,
  declarationWireLegality,
  definitionToCanvas,
  isProcessDataHandle,
  normalizeDesignerAccess,
  childrenWireLegality,
  parseProcessSocketHandleId,
  prepareAuthoredDefinition,
  processSocketsCompatible,
  PROCESS_DATAFLOW_VERSION
} from '~/packages/processes/src/index.js';
import { normalizeScreenContract, SCREEN_TEMPLATES, SCREEN_SOURCE_MODES, SCREEN_REGION_SLOTS, SCREEN_REGION_SURFACES, SCREEN_LINEAGE_BINDING_FIELDS } from '~/packages/processes/src/screen-contract.js';
import { checkDeclarationsAgainstCts, classMayDeclareChildren, compileClientBundle, operationKindOf, projectDomainFromView, normalizeType } from '~/packages/cts/src/index.js';
import ProcessNode from '~/components/process-designer/ProcessNode.vue';
import CtsTypeNode from '~/components/process-designer/CtsTypeNode.vue';
import SelfLoopEdge from '~/components/process-designer/SelfLoopEdge.vue';
import LaneBands from '~/components/process-designer/LaneBands.vue';
import ClassNode from '~/components/type-designer/TypeNode.vue';
import FieldNode from '~/components/type-designer/FieldNode.vue';
import StateNode from '~/components/type-designer/StateNode.vue';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import ProcessNodeInspector from '~/components/process-designer/inspector/ProcessNodeInspector.vue';
import DeclarationInspector from '~/components/process-designer/inspector/DeclarationInspector.vue';
import DeclarationEdgeInspector from '~/components/process-designer/inspector/DeclarationEdgeInspector.vue';
import { normalizeProcessDisplayName, processDisplayEntity } from '~/utils/processDesignerDisplay.js';
import { createPaletteText } from '~/utils/processDesignerPaletteText.js';
import { signalForPaletteGroup } from '~/utils/processDesignerSignals.js';
import { generateTypeId, mintId } from '~/utils/processDesignerIdentity.js';
import { commandInputs, commandOutputs } from '~/utils/processDesignerCommandPorts.js';
import { createService, createSocket } from '~/utils/processDesignerDefinitionRecords.js';
import { arrangeProcessGraph, deriveLaneFacts, laneContainerLayout } from '~/utils/processDesignerArrangement.js';
import { isSecondaryPopulationKind } from '~/utils/processDesignerPopulation.js';
import { declarationVocabulary } from '~/utils/processDesignerTypeMigrations.js';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerSelection } from '~/composables/useProcessDesignerSelection.js';
import { useProcessDesignerPanels } from '~/composables/useProcessDesignerPanels.js';
import { useProcessDesignerConnectionInference } from '~/composables/useProcessDesignerConnectionInference.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerRoles } from '~/composables/useProcessDesignerRoles.js';
import { useProcessDesignerScreens, withoutKeys } from '~/composables/useProcessDesignerScreens.js';
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

// Cross-surface navigation stays inside the home workspace: the team
// page opens as a pane tab on desktop, routes on mobile.
function openTeamManagement() {
  openWorkspacePageFromChrome({ pageId: 'organizationTeam', route: '/organization/users' });
}

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
const {
  inspectTab,
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

const { paletteLabel, paletteDescription, paletteGroupLabel } = createPaletteText({ t, te });

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
  classNameMap,
  ctsOrgTypes,
  refreshTreeOverlay,
  loadOrgTypes,
  loadProcessCapabilities,
  persistTreeDeclarations,
  servedCommands,
  servedPreviewChannels
} = useProcessDesignerTypes({
  nodes,
  edges,
  t,
  toast,
  activeOrganizationId,
  records: () => draft.value?.data?.processNodes || {},
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
  isOpKind,
  nodeTypeId,
  setNodeTypeId,
  catalogPorts,
  catalogContext,
  portForHandle,
  socketPairCompatible,
  opKind,
  relationOptionsForEntity,
  projectionOptionsForEntity,
  constructionModeOptions,
  processNodeInputs,
  processNodeOutputs,
  processNodeOperationOptions,
  processWorkflowPaths,
  processTypeIdOptions,
  processNodeSummary,
  processNodeDisplayLabel,
  processNodeDescription,
  connectedProcessInputIds,
  syncEffectTriggerMode,
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
  createProcessNode,
  defaultTypeId
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
  frameNodeIds,
  zoomCanvasIn,
  zoomCanvasOut,
  resetCanvasZoom,
  fitInitialCanvas,
  snapshotViewport,
  designerViewport
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
  dataflowPreview,
  previewingData,
  validationDiffLines,
  selectedNodePreview,
  selectedNodeSupportsPreview,
  selectedNodePreviewOutputs,
  previewDataflow,
  formatPreviewPath,
  formatPreviewItems,
  nodeDiagnostics,
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
  selectEdge,
  frameNodeIds
});

// Preview channels (SPEC §28): the whole-graph evaluation a channel tab
// consumes — the same preview seam the node inspector rides, with no
// target node (every node evaluates, effects suppressed). The result is
// the read-only payload handed to each channel mount.
const channelPreviewPayload = ref(null);
const channelPreviewRunning = ref(false);
const channelPreviewError = ref('');
async function runChannelPreview() {
  if (!servedPreviewChannels.value.length) return;
  channelPreviewRunning.value = true;
  channelPreviewError.value = '';
  try {
    channelPreviewPayload.value = await persistence.previewDraft(serializeProcess(), undefined);
  } catch (error) {
    channelPreviewError.value = error?.data?.message || error.message;
  } finally {
    channelPreviewRunning.value = false;
  }
}

const {
  applyState,
  applyDetail,
  saveDraft,
  saveDraftFromDock,
  applyProcess,
  confirmApplyMigration,
  cancelApplyMigration,
  confirmTypeMigration,
  cancelTypeMigration
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
  syncNow: () => syncNodeData(),
  nodes
});

const applyBusy = computed(() => applyState.value === 'saving' || applyState.value === 'applying');

// Authored vocabulary for the type-migration step dialog: class names,
// field labels (tree first, stored descriptors for removed fields), and
// the tree's current state values as rename targets.
const typeMigrationVocabulary = ref([]);

const screenEditing = useProcessDesignerScreens({ draft, selectedScreenId, normalizeScreenContract, defaultTypeId, featureForTypeId });

const {
  contextPalette,
  openPanePalette,
  closeContextPalette,
  contextItemCompatible,
  addContextNode,
  contextPaletteSearch
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
  // A getter, not the array: capability and type-catalog loads replace
  // designer.paletteGroups after mount, and the palette must follow without
  // a remount (the async-loaded case the composable resolves reactively).
  groups: () => designer.paletteGroups,
  context: contextPalette,
  isCompatible: contextItemCompatible
});

// Palette groups for the chip palettes: localized group labels and
// per-item labels (the filter matches them), descriptions for the chip
// tooltip, and the shared category signal (the chip dot reads it).
const toPaletteGroups = groups => (groups || []).map(group => ({
  id: group.id,
  label: paletteGroupLabel(group.id),
  items: group.items.map(item => ({
    ...item,
    label: paletteLabel(item),
    description: paletteDescription(item),
    signal: signalForPaletteGroup(group.id)
  }))
})).filter(group => group.items.length);
const paletteChipGroups = computed(() => toPaletteGroups(paletteGroups.value));
const contextPaletteChipGroups = computed(() => toPaletteGroups(contextPaletteGroups.value));
const lifecycleModes = computed(() => [
  { label: t('processDesigner.lifecycleModeDefaultCreated'), value: 'defaultCreated' },
  { label: t('processDesigner.lifecycleModeDomainDefault'), value: 'domainDefault' },
  { label: t('processDesigner.lifecycleModeCustom'), value: 'custom' }
]);
const socketDirections = [
  { label: t('processDesigner.socketDirection.outbound'), value: 'outbound' },
  { label: t('processDesigner.socketDirection.inbound'), value: 'inbound' }
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
  { label: t('processDesigner.screenPlacements.hub'), value: 'hub' },
  { label: t('processDesigner.screenPlacements.detail'), value: 'detail' },
  { label: t('processDesigner.screenPlacements.hidden'), value: 'hidden' }
];
const accessLevelOptions = [
  { label: t('processDesigner.accessRead'), value: 'read' },
  { label: t('processDesigner.accessWrite'), value: 'write' },
  { label: t('processDesigner.accessAdmin'), value: 'admin' }
];
// Wire geometry is chrome: bezier everywhere (the V1 smoothstep cut was
// reverted by owner direction). Declaration-wire matching and connection
// inference key on role/label/endpoints, never geometry.
const defaultEdgeOptions = {
  type: 'default'
};

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.states?.main === 'ACTIVE');
const isDirty = computed(() => Boolean(draft.value) && designerSignature() !== savedDraftSignature.value);
const documentDockItems = computed(() => [
  {
    icon: 'pi pi-file-plus',
    label: t('processDesigner.newDraft'),
    onClick: createDraftFromDock,
    disabled: creatingDraft.value || applyBusy.value,
    loading: creatingDraft.value
  },
  { separator: true },
  {
    icon: 'pi pi-save',
    label: t('common.save'),
    onClick: saveDraftFromDock,
    disabled: !draft.value || applyBusy.value || creatingDraft.value,
    attention: isDirty.value
  },
  {
    icon: 'pi pi-check',
    label: t('processDesigner.apply'),
    onClick: applyProcess,
    disabled: !draft.value?._id || applyBusy.value || creatingDraft.value,
    loading: applyState.value === 'applying'
  }
]);
// Lanes — the authorization surface, canonical in
// components/process-designer README "Lanes". ONLY effects participate
// (they alone carry access): one lane per role in fixed order plus an
// implicit unlabeled lane, hairline separators spanning the nodes'
// horizontal domain. Lanes are containers for everything dropped into
// them; effects' lane IS their grant (drop assigns the role, implicit
// lane clears grants).
const secondaryHidden = ref(false);
const LANE_MIN_HEIGHT = 150;
// lg operation card width (DesignerNodeCard `w-72`) — the extent fallback.
const LANE_NODE_FALLBACK_WIDTH = 288;
// The lane container pass's band geometry (contract: README "Lanes") —
// bands hug their members, stacked in role order. Null before the first
// projection; the minimum-height stack below is the pre-projection paint.
const arrangedBands = ref(null);

function isEffectNode(node) {
  const record = draft.value?.data?.processNodes?.[node.data?.refId];
  return Boolean(record) && EFFECT_SPECIES_KINDS.has(String(operationKindOf(record) || ''));
}

function nodeOperationKind(node) {
  const record = draft.value?.data?.processNodes?.[node.data?.refId];
  return record ? operationKindOf(record) : '';
}

// The visibility grouping (node UI contract "Lanes"): effects and state
// declarations are primary; classes, fields, type references, non-effect
// process nodes, and the remove operation (presentation-secondary — the
// one predicate in utils/processDesignerPopulation.js) are secondary and
// hide in the clean view.
function isSecondaryNode(node) {
  if (DECLARATION_NODE_TYPES.includes(node.type)) return node.type !== 'ctsState';
  return node.type === 'processNode'
    && (!isEffectNode(node) || isSecondaryPopulationKind(nodeOperationKind(node)));
}

function effectPrimaryRoleId(node) {
  const record = draft.value?.data?.processNodes?.[node.data?.refId];
  return record?.access?.grants?.[0]?.roleId || null;
}

// Role bands in the role list's fixed order, plus the implicit grantless
// lane — always present — that catches everything dropped below them.
const laneBandIds = computed(() => [
  ...Object.keys(organizationRoles.value).map(roleId => `role:${roleId}`),
  'unassigned'
]);

// Lane membership is an authored fact: effects by grant record (the lane
// IS the assignment), every other node by the lane it was dropped into
// (`data.lane`). A stale lane id (its role left the list) resolves to no
// membership — the node stays free until dropped into a lane again.
function laneMembershipOf(node) {
  if (node.type === 'processNode' && isEffectNode(node)) {
    const roleId = effectPrimaryRoleId(node);
    return roleId && laneBandIds.value.includes(`role:${roleId}`) ? `role:${roleId}` : 'unassigned';
  }
  const lane = node.data?.lane;
  return lane && laneBandIds.value.includes(lane) ? lane : null;
}

// The container projection (node UI contract "Lanes"): node y is authored
// RELATIVE to its lane; bands hug their content and stack in role order,
// and members ride their band. Writes only derived absolutes and the
// normalized offsets — authored offsets are never invented.
function projectLanes() {
  const { bands, laneY, positions } = laneContainerLayout({
    nodes: nodes.value,
    bandIds: laneBandIds.value,
    membershipOf: laneMembershipOf,
    laneYOf: node => node.data?.laneY
  });
  arrangedBands.value = bands;
  nodes.value = nodes.value.map(node => {
    const y = positions.get(node.id);
    if (y === undefined) return node; // laneless or strayed: renders where it is
    return { ...node, position: { ...node.position, y }, data: { ...node.data, laneY: laneY.get(node.id) } };
  });
}

// Project whenever membership shape changes — roles, node population,
// grants, drops. Positions and offset VALUES are excluded, so the pass
// never re-triggers itself.
const laneSignature = computed(() => JSON.stringify({
  roles: Object.keys(organizationRoles.value),
  shape: nodes.value.map(node => [node.id, laneMembershipOf(node), Number.isFinite(node.data?.laneY) ? 1 : 0])
}));
watch(laneSignature, () => projectLanes());

// The seated top of a band: the smallest non-negative member offset
// (0 for an empty band). New facts never enter above it, so adds and
// drops never disturb seated cards.
function laneSeatedMinimum(bandId) {
  let min = Infinity;
  for (const node of nodes.value) {
    if (laneMembershipOf(node) !== bandId) continue;
    const offset = node.data?.laneY;
    if (Number.isFinite(offset) && offset >= 0) min = Math.min(min, offset);
  }
  return Number.isFinite(min) ? min : 0;
}

// A freshly added node joins the lane under its placement point (README
// "Canvas behavior"): non-effects take that lane as their home; an
// effect's lane is the grant-derived one, so a grantless effect created
// above the implicit lane stays free-floating until dropped.
function seedLaneFacts(node) {
  const bands = laneModel.value.bands;
  const centerY = node.position.y + 70;
  const band = bands.find(candidate => centerY >= candidate.top && centerY < candidate.top + candidate.height);
  if (!band) return node;
  const seat = Math.max(Math.max(0, Math.round(node.position.y - band.top)), laneSeatedMinimum(band.id));
  if (node.type === 'processNode' && isEffectNode(node)) {
    if (laneMembershipOf(node) !== band.id) return node;
    return { ...node, data: { ...(node.data || {}), laneY: seat } };
  }
  return { ...node, data: { ...(node.data || {}), lane: band.id, laneY: seat } };
}

// Band paint model: the projection owns geometry; labels come from the
// role list, and grant-derived effect membership feeds Tidy.
const laneModel = computed(() => {
  const roleIds = Object.keys(organizationRoles.value);
  const byPrimary = new Map(roleIds.map(roleId => [roleId, []]));
  const unassigned = [];
  for (const node of nodes.value) {
    if (node.type !== 'processNode' || !isEffectNode(node)) continue;
    const roleId = effectPrimaryRoleId(node);
    if (roleId && byPrimary.has(roleId)) byPrimary.get(roleId).push(node.id);
    else unassigned.push(node.id);
  }
  const bands = laneBandIds.value.map((id, index) => {
    const arrangedBand = arrangedBands.value?.find(band => band.id === id);
    const label = id === 'unassigned' ? '' : organizationRoles.value[id.slice('role:'.length)]?.label || '';
    return {
      id,
      kind: 'role',
      label,
      top: arrangedBand?.top ?? index * LANE_MIN_HEIGHT,
      height: arrangedBand?.height ?? LANE_MIN_HEIGHT
    };
  });
  const last = bands[bands.length - 1];
  return { bands, byPrimary, unassigned, totalHeight: last ? last.top + last.height : 0 };
});

const laneBands = computed(() => laneModel.value.bands);

// Bands span the nodes' horizontal domain — from the leftmost node's
// column to the rightmost node's right edge.
const laneExtent = computed(() => {
  const extents = nodes.value
    .map(node => ({ left: node.position?.x, right: (node.position?.x || 0) + (node.dimensions?.width || LANE_NODE_FALLBACK_WIDTH) }))
    .filter(item => Number.isFinite(item.left));
  if (!extents.length) return { left: 0, right: 2400 };
  const pad = 24;
  return {
    left: Math.min(...extents.map(item => item.left)) - pad,
    right: Math.max(...extents.map(item => item.right)) + pad
  };
});

// Placement writes membership (node UI contract "Lanes"): a drop into a
// lane is accepted by it — for effects acceptance IS the grant write
// (role lane assigns the role, implicit lane clears grants), for every
// other node the lane becomes its persisted home. The card's vertical
// coordinate becomes its offset inside the accepting lane, so it lands
// exactly where it fell. A drop into no lane (above the stack) leaves
// the node free-floating.
function onNodeDragStop({ node, nodes: draggedNodes } = {}) {
  const moved = (draggedNodes?.length ? draggedNodes : [node]).filter(Boolean);
  if (!moved.length) return;
  // Band membership reads the node's CENTER: position is the top-left
  // corner, so a node grabbed high lands its corner in the band above
  // the one the author dropped it in.
  const bands = laneModel.value.bands;
  const bandOf = candidate => {
    const centerY = candidate.position.y + (candidate.dimensions?.height || 140) / 2;
    return bands.find(band => (
      band.kind === 'role' && centerY >= band.top && centerY < band.top + band.height
    ));
  };
  const primary = node || moved[0];
  const band = bandOf(primary);
  if (band && primary.type === 'processNode' && isEffectNode(primary)) {
    const roleId = band.id === 'unassigned' ? null : band.id.slice('role:'.length);
    const record = draft.value?.data?.processNodes?.[primary.data?.refId];
    const previous = record?.access?.grants || [];
    if (record && (previous[0]?.roleId || null) !== roleId) {
      const level = (roleId && previous.find(grant => grant.roleId === roleId)?.level) || record.access?.level || 'write';
      record.access = normalizeDesignerAccess(
        roleId ? { level, grants: [{ roleId, level }] } : { level: 'write', grants: [] }
      );
      syncNodeData();
    }
  }
  for (const candidate of moved) {
    const candidateBand = candidate === primary ? band : bandOf(candidate);
    if (candidateBand && !(candidate.type === 'processNode' && isEffectNode(candidate))) {
      candidate.data = { ...(candidate.data || {}), lane: candidateBand.id };
    }
    // The offset fact: relative to the band the node now belongs to.
    // Authored offsets are never negative — a card the author dropped
    // across a lane's top edge seats inside the accepting band — and
    // never above the band's seated top, so seated cards never move.
    const membership = laneMembershipOf(candidate);
    const membershipTop = membership && bands.find(entry => entry.id === membership)?.top;
    const data = { ...(candidate.data || {}) };
    if (Number.isFinite(membershipTop)) {
      data.laneY = Math.max(
        Math.max(0, Math.round(candidate.position.y - membershipTop)),
        ...(membership ? [laneSeatedMinimum(membership)] : [])
      );
    } else {
      delete data.lane;
      delete data.laneY;
    }
    candidate.data = data;
  }
  projectLanes();
}

// The secondary toggle hides the secondary group (nodes and their wires)
// without deleting anything; `hidden` is runtime state and is stripped
// before serialization.
function syncSecondaryHidden() {
  nodes.value = nodes.value.map(node => (
    isSecondaryNode(node) ? { ...node, hidden: secondaryHidden.value } : { ...node, hidden: false }
  ));
}

function toggleSecondaryHidden() {
  secondaryHidden.value = !secondaryHidden.value;
  syncSecondaryHidden();
}

// Tidy (node UI contract "Auto-arrangement"): the pure layered pass run
// destructively — it writes positions and the content-hugging band
// geometry only, so lane grants and every authored record survive it
// unchanged.
function tidyCanvas() {
  const { bands, byPrimary, unassigned } = laneModel.value;
  const bandOfNodeId = new Map();
  for (const [roleId, memberIds] of byPrimary) {
    const band = bands.find(candidate => candidate.id === `role:${roleId}`);
    if (band) for (const id of memberIds) bandOfNodeId.set(id, band);
  }
  const unassignedBand = bands.find(candidate => candidate.id === 'unassigned');
  if (unassignedBand) for (const id of unassigned) bandOfNodeId.set(id, unassignedBand);
  const effectIds = new Set(nodes.value
    .filter(node => node.type === 'processNode' && isEffectNode(node))
    .map(node => node.id));
  const { positions, bands: geometry } = arrangeProcessGraph({
    nodes: nodes.value,
    edges: edges.value,
    effectIds,
    bands,
    bandOfNodeId
  });
  if (!positions.size) return;
  // Tidy rewrites offsets inside the same lanes (node UI contract
  // "Lanes"): memberships and grants are untouched — each card's lane
  // fact and offset derive from where Tidy seated it.
  nodes.value = nodes.value.map(node => {
    const position = positions.get(node.id);
    if (!position) return node;
    const band = geometry.find(candidate => position.y >= candidate.top && position.y < candidate.top + candidate.height);
    const data = { ...(node.data || {}) };
    if (band) {
      if (!(node.type === 'processNode' && isEffectNode(node))) data.lane = band.id;
      data.laneY = Math.round(position.y - band.top);
    }
    return { ...node, position: { ...position }, data };
  });
  projectLanes();
  frameAllNodes();
}

// Selection speed dial: delete and frame float beside the last selected
// node while a node selection exists; edge selections keep keyboard
// delete (an edge has no anchor box to sit beside).
const selectionDialItems = computed(() => [
  {
    icon: 'pi pi-crosshairs',
    label: t('processDesigner.frameSelection'),
    command: () => frameSelectedNodes()
  },
  {
    icon: 'pi pi-trash',
    label: t('common.delete'),
    command: () => deleteGraphSelection()
  }
]);
const selectionDialStyle = computed(() => {
  const selected = selectedGraphNodes();
  const node = (selected.length ? selected[selected.length - 1] : null)
    || (selectedNodeId.value ? nodes.value.find(candidate => candidate.id === selectedNodeId.value) : null);
  if (!node?.position) return null;
  const viewport = designerViewport?.value || { x: 0, y: 0, zoom: 1 };
  const zoom = Number(viewport.zoom) || 1;
  const anchorX = Number(node.position.x || 0) * zoom + Number(viewport.x || 0)
    + Number(node.dimensions?.width || 180) * zoom;
  const anchorY = Number(node.position.y || 0) * zoom + Number(viewport.y || 0)
    + Number(node.dimensions?.height || 60) * zoom;
  return { left: `${Math.round(anchorX + 8)}px`, top: `${Math.round(anchorY - 8)}px` };
});

const canvasDockItems = computed(() => [
  {
    icon: 'pi pi-eye-slash',
    label: t('processDesigner.hideSecondary'),
    pressed: secondaryHidden.value,
    onClick: toggleSecondaryHidden
  },
  {
    icon: 'pi pi-objects-column',
    label: t('processDesigner.tidy'),
    onClick: tidyCanvas
  },
  { separator: true },
  {
    icon: 'pi pi-search-minus',
    label: t('drawing.zoomOut'),
    onClick: zoomCanvasOut
  },
  {
    icon: 'pi pi-search-plus',
    label: t('drawing.zoomIn'),
    onClick: zoomCanvasIn
  },
  {
    icon: 'pi pi-expand',
    label: t('processDesigner.frameAll'),
    onClick: frameAllNodes
  },
  {
    icon: 'pi pi-crosshairs',
    label: t('processDesigner.frameSelection'),
    onClick: frameSelectedNodes
  },
  {
    icon: 'pi pi-refresh',
    label: t('processDesigner.resetZoom'),
    onClick: resetCanvasZoom
  }
]);
const processOptions = computed(() => processDefinitions.value.map(process => ({
  label: [
    normalizeProcessDisplayName(process.identity?.name || process.identity?.uid || process._id),
    process.states?.main
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
const typeIdOptions = computed(() => {
  const icons = new Map(ctsTypeView().map(entry => [entry.id, entry.icon]));
  return designer.entityOptions.map(option => ({ ...option, icon: icons.get(option.value) || null }));
});
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
// SAVE/APPLY would reject is visible while authoring, not after. The
// compile is gated on the declaration plane's authoring signature, so
// position drags and selection churn never recompile it.
const declarationPlaneSignature = computed(() => JSON.stringify({
  cards: nodes.value.filter(node => node.type !== 'processNode').map(node => [node.id, node.type, node.data]),
  wires: edges.value.filter(edge => edge.role === 'type').map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.label]),
  records: draft.value?.data?.processNodes ?? null
}));
const classDeclarationDiagnostics = ref([]);
watch(declarationPlaneSignature, () => {
  if (!nodes.value.some(node => node.type === 'ctsClass')) {
    classDeclarationDiagnostics.value = [];
    return;
  }
  const { declarations, diagnostics } = compileTreeDeclarations(
    nodes.value,
    edges.value,
    draft.value?.data?.processNodes || {}
  );
  for (const declaration of declarations) {
    try {
      normalizeType({ ...declaration, scope: 'org', organizationId: activeOrganizationId() });
    } catch (error) {
      diagnostics.push(`${declaration.id || '(unnamed type)'}: ${error.message}`);
    }
  }
  classDeclarationDiagnostics.value = diagnostics;
}, { immediate: true });
watch([declarationPlaneSignature, ctsOrgTypes], () => {
  typeMigrationVocabulary.value = declarationVocabulary(
    nodes.value,
    edges.value,
    ctsOrgTypes.value
  );
}, { immediate: true });
// Node-scoped diagnostics re-stamp on every validation arrival: the
// anchored diagnostics of the fresh result land on the faulted cards
// through the one enrichment pass (SPEC §28).
watch(nodeDiagnostics, () => {
  for (const node of nodes.value) enrichNodeData(node);
});
const declarationNodeTypes = DECLARATION_NODE_TYPES;
const selectedDeclarationEdge = computed(() => edges.value.find(edge => edge.id === selectedEdgeId.value && edge.role === 'type') || null);

const typeAnchorOptions = computed(() => ctsTypeView().map(entry => ({
  label: `${entry.label} · ${entry.class}`,
  value: entry.id
})));
const optionalTypeIdOptions = computed(() => [{ label: t('processDesigner.noneOption'), value: '' }, ...typeIdOptions.value]);
const commandOptions = computed(() => designer.commandOptions);
const screenActionOptions = computed(() => Object.values(draft.value?.data?.actions || {}).map(action => ({
  label: action.label || action.id,
  value: action.id
})));
const selectedScreenSourceOptions = computed(() => (selectedScreenRecord.value?.sources || []).map(source => ({
  label: source.id || source.typeId,
  value: source.id
})));
const screenFeatureOptions = computed(() => (designer.domain.entities || []).map(entity => ({
  label: entity.label || entity.type,
  value: featureForTypeId(entity.type)
})));
const permissionFeatureOptions = computed(() => screenFeatureOptions.value.map(option => ({
  key: option.value,
  label: option.label,
  actions: ['view', 'create', 'update', 'delete', 'run', 'send', 'approve', 'reject', 'fulfill']
})));
const fieldOptionsForSelectedSocket = computed(() => designer.fieldsForEntity(selectedSocketRecord.value?.typeId));
const serviceList = computed(() => Object.values(draft.value?.data?.services || {}));
const socketList = computed(() => Object.values(draft.value?.data?.sockets || {}));
const selectedSocketId = ref('');
const selectedSocketRecord = computed(() => draft.value?.data?.sockets?.[selectedSocketId.value] || socketList.value[0] || null);
const selectedEntityAvailable = computed(() => Boolean(selectedEntity.value?.producerOutputId));
// Row-relative row-field ids (SPEC §7/§20): projected schema paths carry
// the `fields.`/`data.`/`specs.` block prefix; guard paths, field-policy
// lists, and the enforcement seams address the bare row id.
function rowFieldIdOptions(typeId, { topLevelOnly = false } = {}) {
  const seen = new Set();
  const options = [];
  for (const field of designer.fieldsForEntity(typeId)) {
    if (!['fields', 'data', 'specs'].includes(field.block)) continue;
    const stripped = String(field.value || '').replace(/^(fields|data|specs)\./, '');
    const id = topLevelOnly ? stripped.split('.')[0] : stripped;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    options.push({ label: field.i18n ? t(field.i18n) : (field.label && field.label !== field.value ? field.label : id), value: id });
  }
  return options;
}
const transitionGuardFieldOptions = computed(() => {
  const record = selectedProcessNode.value;
  if (record?.kind !== 'cts.transition') return [];
  return rowFieldIdOptions(nodeTypeId(record));
});
// The state-policy facet authors on the typed operation (SPEC §7): the
// transition's target state, the construct's initial state. The socket
// default arrives as a data-tree packet in live records; the authored
// value is the target.
const recordStatePolicyTarget = computed(() => {
  const record = selectedProcessNode.value;
  if (!['cts.transition', 'cts.construct'].includes(record?.kind)) return '';
  if (!nodeTypeId(record)) return '';
  const raw = record.kind === 'cts.transition'
    ? (record.state?.to ?? authoredSocketDefault(record.inputDefaults?.state))
    : authoredSocketDefault(record.inputDefaults?.state);
  const value = authoredSocketDefault(raw);
  return typeof value === 'string' ? value : '';
});
const recordStateFieldPolicyOptions = computed(() => {
  if (!recordStatePolicyTarget.value) return [];
  const record = selectedProcessNode.value;
  return rowFieldIdOptions(nodeTypeId(record), { topLevelOnly: true });
});
// The class inspector's identifier dropdown (SPEC §4): options are the
// sibling field nodes of the selected class; '' leaves the flag unowned
// and the declaration carries the compile error until a field is picked.
const classIdentifierField = computed(() => {
  const node = selectedNode.value;
  if (node?.type !== 'ctsClass') return { options: [], value: '' };
  const siblings = nodes.value.filter(candidate => candidate.type === 'ctsField'
    && (candidate.data?.typeId ?? null) === (node.data?.typeId ?? null));
  if (!siblings.length) return { options: [], value: '' };
  const holder = siblings.find(candidate => candidate.data?.descriptor?.identifier === true);
  return {
    options: [
      { label: t('processDesigner.unset'), value: '' },
      ...siblings.map(candidate => ({ label: candidate.data?.name || candidate.id, value: candidate.id }))
    ],
    value: holder?.id || ''
  };
});
function commandForId(commandId) {
  return servedCommands.value.find(command => command?.id === commandId) || null;
}

const selectedCommandService = computed(() => {
  const node = selectedProcessNode.value;
  if (!isOpKind(node, 'cts.command') || !node.commandId) return null;
  return serviceList.value.find(service => service.commandId === node.commandId) || null;
});
function createCommandServiceForSelectedNode() {
  const node = selectedProcessNode.value;
  if (!isOpKind(node, 'cts.command') || !node.commandId) return;
  const id = mintId('service');
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
  const id = mintId('socket');
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
const selectedProcessNodeEffectiveAccess = computed(() => {
  const node = selectedProcessNode.value;
  const typeId = nodeTypeId(node) || node?.targetTypeId || '';
  if (!EFFECT_SPECIES_KINDS.has(opKind(node)) || !typeId) return [];
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
    if (output.typeId !== typeId) continue;
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
// Screens render per role under the Roles tab (SPEC "Role management"):
// a compiled station belongs to a role through its roleIds; unscoped
// stations render under every role rather than being orphaned.
const screensForSelectedRole = computed(() => compiledScreenPreview.value.filter(screen => {
  const roleIds = screen.roleIds;
  return !Array.isArray(roleIds) || !roleIds.length || roleIds.includes(selectedRoleId.value);
}));

const selectedScreenBelongsToRole = computed(() => {
  const record = selectedScreenRecord.value;
  if (!record || !selectedRoleId.value) return false;
  const roleIds = record.roleIds;
  return !Array.isArray(roleIds) || !roleIds.length || roleIds.includes(selectedRoleId.value);
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
const draftDataSignature = computed(() => JSON.stringify(draft.value?.data ?? null));
// Preview recompute follows the authoring signature — the content the
// compiler reads — so a drag never queues a compile.
const previewAuthoringSignature = computed(() => JSON.stringify({
  data: draftDataSignature.value,
  nodes: nodes.value.map(node => [node.id, node.type, node.data]),
  edges: edges.value.map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.role, edge.label])
}));
watch(previewAuthoringSignature, () => schedulePreviewRecompute());
watch(inspectTab, () => schedulePreviewRecompute());

function schedulePreviewRecompute() {
  if (previewRecomputeTimer) {
    clearTimeout(previewRecomputeTimer);
    previewRecomputeTimer = null;
  }
  if (inspectTab.value !== 'roles') {
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

// The incoming entity window of one record — the entity-bearing output
// port of whatever feeds its `entity` input, resolved through the same
// catalog ports the node cards render (never by sniffing stored record
// shapes). One resolver feeds both consumers: the live-graph entity
// binding (type only) and the inspector's access-detail window (type,
// status, access).
function incomingEntityContract(recordId) {
  const graphNode = nodes.value.find(node => node.type === 'processNode' && node.data?.refId === recordId);
  if (!graphNode) return {};
  const edge = edges.value.find(item => (
    item.target === graphNode.id
    && String(item.targetHandle || '').replace(/^(?:input|data):/, '') === 'entity'
  ));
  if (!edge) return {};
  const source = nodes.value.find(node => node.id === edge.source);
  if (!source) return {};
  const sourceRecord = source.data?.refId
    ? draft.value?.data?.processNodes?.[source.data.refId]
    : null;
  const sourcePorts = sourceRecord ? catalogPorts(sourceRecord).outputs : [];
  const port = sourceRecord
    ? (portForHandle(sourcePorts, edge.sourceHandle, 'output')
      || sourcePorts.find(candidate => candidate.type?.typeId || candidate.type?.itemType?.typeId)
      || null)
    : null;
  const typeId = port?.type?.typeId || port?.type?.itemType?.typeId
    || (sourceRecord ? nodeTypeId(sourceRecord) : '')
    || source.data?.typeId
    || '';
  return {
    typeId,
    status: typeof port?.status === 'string' ? port.status : (sourceRecord?.state?.to || sourceRecord?.status?.to || ''),
    access: sourceRecord?.access ? normalizeDesignerAccess(sourceRecord.access) : null
  };
}

function resolveEntityInputType(recordId) {
  return incomingEntityContract(recordId).typeId || '';
}

function applyGraphInterpretation(mutations) {
  for (const mutation of mutations) {
    if (mutation.scope === 'node') {
      const node = nodes.value.find(candidate => candidate.id === mutation.nodeId);
      if (node) node.data[mutation.key] = mutation.value;
      continue;
    }
    const record = draft.value?.data?.processNodes?.[mutation.recordId];
    if (!record) continue;
    if (mutation.key === 'typeId') {
      setNodeTypeId(record, mutation.value);
      continue;
    }
    if (mutation.key === 'path') {
      record.path = mutation.value;
      continue;
    }
    if (mutation.key.startsWith('inputDefaults.')) {
      const inputId = mutation.key.slice('inputDefaults.'.length);
      record.inputDefaults = { ...(record.inputDefaults || {}), [inputId]: mutation.value };
      continue;
    }
    if (mutation.key.startsWith('state.')) {
      record.state = { ...(record.state || {}), [mutation.key.slice('state.'.length)]: mutation.value };
    }
    // Unknown record keys are ignored: interpretation is the only mutation
    // source, and a silent fallback reinterpreting them as typeId writes
    // corrupted records (the recursive-update loop).
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
  window.addEventListener('focus', reconcileOutOfBandDraft);
  reconcilePollTimer = setInterval(reconcileOutOfBandDraft, RECONCILE_POLL_MS);
});
onBeforeUnmount(() => {
  if (previewRecomputeTimer) clearTimeout(previewRecomputeTimer);
  window.removeEventListener('focus', reconcileOutOfBandDraft);
  if (reconcilePollTimer) clearInterval(reconcilePollTimer);
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

async function createDraft({ empty = false } = {}) {
  const name = 'Organization process';
  const sourceId = null;
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

// Definitions pane (node UI contract "definitions management"): inline
// rename per definition row.
const renamingDefinitionId = ref(null);
const renamingDefinitionName = ref('');
const definitionBusyId = ref(null);

// The row's ellipsis menu: versions, rename, delete live there — the row
// itself carries only the name and the activation switch.
const definitionMenus = new Map();

function setDefinitionMenuRef(id, instance) {
  if (instance) definitionMenus.set(String(id), instance);
  else definitionMenus.delete(String(id));
}

function toggleDefinitionMenu(event, process) {
  definitionMenus.get(String(process._id))?.toggle(event);
}

function definitionMenuItems(process) {
  return [
    {
      label: t('common.rename'),
      icon: 'pi pi-pencil',
      command: () => startDefinitionRename(process)
    },
    {
      label: t('common.delete'),
      icon: 'pi pi-trash',
      command: () => removeDefinition(process)
    }
  ];
}

function startDefinitionRename(process) {
  renamingDefinitionId.value = String(process._id);
  renamingDefinitionName.value = process.identity?.name || '';
}

async function applyDefinitionRename(process) {
  const name = renamingDefinitionName.value.trim();
  const id = String(process._id);
  if (!name || definitionBusyId.value) return;
  definitionBusyId.value = id;
  try {
    const updated = await persistence.renameDraft(id, name);
    upsertProcessDefinition(updated);
    if (String(draft.value?._id) === id) setDraft(updated);
    renamingDefinitionId.value = null;
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.rename'), detail: error?.data?.message || error?.message || '', life: 4000 });
  } finally {
    definitionBusyId.value = null;
  }
}

// The activation switch IS the state: on = member of the additive active
// set (process-definitions README "Activation").
// Version history: the versions button opens the shared popover anchored
// at that row; entries load once per open (list entries are summaries) and
// restore rewrites the definition's data — an edit like any other, live
// through activation.
const historyPopoverRef = ref(null);
const historyDefinitionId = ref(null);
const definitionHistoryEntries = ref([]);
const historyLoading = ref(false);

const historyDefinition = computed(() => processDefinitions.value.find(
  process => String(process._id) === historyDefinitionId.value
));

function openDefinitionHistory(event, process) {
  historyDefinitionId.value = String(process._id);
  historyPopoverRef.value?.toggle(event);
  loadDefinitionHistory(String(process._id));
}

async function loadDefinitionHistory(id) {
  historyDefinitionId.value = id;
  historyLoading.value = true;
  try {
    const cached = processDefinitions.value.find(process => String(process._id) === id);
    const full = cached?.data ? cached : await persistence.loadById(id);
    upsertProcessDefinition(full);
    definitionHistoryEntries.value = [...(full.data?.history || [])].reverse();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('processDesigner.versions'), detail: error?.data?.message || error?.message || '', life: 4000 });
    historyDefinitionId.value = null;
  } finally {
    historyLoading.value = false;
  }
}

function formatHistoryEntry(entry) {
  return entry.at ? new Date(entry.at).toLocaleString() : '';
}

async function restoreDefinitionVersion(process, entry) {
  const id = String(process._id);
  if (definitionBusyId.value || !entry?.data) return;
  definitionBusyId.value = id;
  try {
    const updated = await persistence.saveDraft(id, { ...entry.data, history: undefined, activated: undefined });
    upsertProcessDefinition(updated);
    if (String(draft.value?._id) === id) setDraft(updated);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.restore'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    definitionBusyId.value = null;
  }
}

async function toggleDefinitionActive(process, active) {
  const id = String(process._id);
  if (definitionBusyId.value) return;
  definitionBusyId.value = id;
  try {
    const updated = await persistence.request(active
      ? `/api/process-definitions/${id}/activate`
      : `/api/process-definitions/${id}/deactivate`, { method: 'POST' });
    upsertProcessDefinition(updated);
    if (String(draft.value?._id) === id) setDraft(updated);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('processDesigner.activate'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    definitionBusyId.value = null;
  }
}

async function removeDefinition(process) {
  const id = String(process._id);
  if (definitionBusyId.value) return;
  definitionBusyId.value = id;
  try {
    await persistence.request(`/api/process-definitions/${id}`, { method: 'DELETE' });
    dropRemovedDefinition(id);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.delete'), detail: error?.data?.message || error?.message || '', life: 5000 });
  } finally {
    definitionBusyId.value = null;
  }
}

function dropRemovedDefinition(id) {
  processDefinitions.value = processDefinitions.value
    .filter(item => String(item._id) !== id)
    .sort(compareProcessDefinitions);
  if (String(draft.value?._id) === id) {
    const fallback = processDefinitions.value[0];
    if (fallback) void selectProcessDefinition(fallback._id);
    else setDraft(null);
  }
}

// Settled load baseline flag: the first post-measure reprojection (see
// onCanvasNodesChange) is a correction, not authoring.
const laneProjectionBaselined = ref(true);

// Out-of-band draft reconciliation (SPEC §1: an edit landing beside an
// open canvas reconciles through the shared definition draft): the read
// API carries no version stamp, so the designer re-fetches its document
// on window focus and on a slow poll, comparing the draft data signature
// against the settled baseline. A dirty canvas reconciles nothing — its
// own save is the next write (last-writer-wins, like the canvas itself).
const RECONCILE_POLL_MS = 30000;
let reconciledDataSignature = '';
let reconcilePollTimer = null;

function reconcileOutOfBandDraft() {
  if (!draft.value?._id) return;
  if (isDirty.value || applyBusy.value || creatingDraft.value || loadingProcess.value) return;
  persistence.loadById(String(draft.value._id))
    .then(fresh => {
      if (!fresh?._id || String(fresh._id) !== String(draft.value?._id)) return;
      if (JSON.stringify(fresh.data ?? null) === reconciledDataSignature) return;
      upsertProcessDefinition(fresh);
      setDraft(fresh);
    })
    .catch(() => {});
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
  liveGraph.reset();
  // Drafts authored before lane containers carry no lane facts: derive
  // them once from the stored absolute positions (README "Lanes"), then
  // project the container layout — lane-relative offsets reproduce the
  // authored arrangement.
  nodes.value = deriveLaneFacts({
    nodes: canvas.nodes.map(enrichNodeData),
    bandIds: laneBandIds.value,
    membershipOf: laneMembershipOf
  });
  edges.value = decorateEdges(canvas.edges);
  selectedRoleId.value = Object.keys(organizationRoles.value)[0] || null;
  selectedPrincipalId.value = Object.keys(value?.data?.servicePrincipals || {})[0] || null;
  selectedScreenId.value = Object.keys(value?.data?.screens || {})[0] || null;
  laneProjectionBaselined.value = false;
  projectLanes();
  savedDraftSignature.value = designerSignature();
  reconciledDataSignature = draftDataSignature.value;
  nextTick(fitInitialCanvas);
  recomputeProcessPreview();
}

// The first measured card dimensions arrive after mount and correct the
// hug heights (fallback card heights are estimates): one debounced
// reprojection re-seats the bands. It is a load-time correction, not
// authoring — the dirty baseline is re-taken with it, exactly once.
let laneReprojectTimer = null;
function onCanvasNodesChange(changes = []) {
  if (!changes.some(change => change.type === 'dimensions' && !change.resizing)) return;
  if (laneReprojectTimer) clearTimeout(laneReprojectTimer);
  laneReprojectTimer = setTimeout(() => {
    laneReprojectTimer = null;
    projectLanes();
    if (!laneProjectionBaselined.value) {
      laneProjectionBaselined.value = true;
      savedDraftSignature.value = designerSignature();
    }
  }, 200);
}

function designerSignature() {
  return JSON.stringify({
    data: draftDataSignature.value,
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
// Fresh classes get an opaque random id at creation; it never changes
// after that (rename is a label change only).
function suggestTreeTypeId() {
  const taken = new Set([...ctsTypeView().map(entry => entry.id), ...nodes.value.filter(node => node.type === 'ctsClass').map(node => node.data.typeId)]);
  let id = generateTypeId();
  while (taken.has(id)) id = generateTypeId();
  return id;
}

// A name authors identity; the registry id is derived from it. The id only
// becomes hand-authored when the author edits it directly — until then,
// renaming re-derives the id (deduped against registry + tree).
function updateClassName(node, name) {
  if (!node || node.type !== 'ctsClass') return;
  node.data.name = String(name || '');
  syncNodeData();
}

// The class dropdown drives the single-holder move (SPEC §4): a
// field pick flags that field and clears its siblings; the empty pick
// leaves the identifier unowned.
function setClassIdentifierField(classNode, fieldNodeId) {
  if (!classNode || classNode.type !== 'ctsClass') return;
  if (fieldNodeId) {
    applyFieldDisplayRole(nodes.value, fieldNodeId, 'identifier', true);
  } else {
    const typeId = classNode.data?.typeId ?? null;
    const holder = nodes.value.find(candidate => candidate.type === 'ctsField'
      && (candidate.data?.typeId ?? null) === typeId
      && candidate.data?.descriptor?.identifier === true);
    if (holder) applyFieldDisplayRole(nodes.value, holder.id, 'identifier', false);
  }
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
  const id = mintId(type);
  const refId = id;
  const node = {
    id,
    type,
    position,
    selected: true,
    data: { refId, label: refId }
  };
  // The loop item authors the loop PAIR: the closer is loop vocabulary,
  // not an independent authoring choice, so it lands beside its loop.
  const pairedKind = processNodeKind === 'control.forEach' ? 'control.forEachEnd' : null;
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
      // A secondary declaration authored while the secondary group is
      // hidden stays hidden (runtime state, stripped before
      // serialization); states are primary and never seed hidden.
      ...(secondaryHidden.value && type !== 'ctsState' ? { hidden: true } : {}),
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
    const enrichedNode = enrichNodeData(seedLaneFacts(typeNode));
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
  let pairedNode = null;
  if (type === 'processNode' && pairedKind) {
    const pairedId = mintId('processNode');
    pairedNode = {
      id: pairedId,
      type,
      position: { x: position.x + 60, y: position.y + 220 },
      selected: false,
      data: { refId: pairedId, label: pairedId }
    };
    const pairedRecord = ensureRecord(recordKeyForType(type), { data: { refId: pairedId }, type }, factoryForType(type));
    Object.assign(pairedRecord, createProcessNode(pairedId, pairedKind));
    syncProcessNode(pairedRecord);
    if (secondaryHidden.value && isSecondaryNode(pairedNode)) pairedNode.hidden = true;
  }
  // A secondary node (reads, values, control — and the remove operation)
  // authored while the secondary group is hidden stays hidden with its
  // group.
  if (secondaryHidden.value && isSecondaryNode(node)) {
    node.hidden = true;
  }
  nodes.value = [
    ...nodes.value.map(item => ({ ...item, selected: false })),
    enrichNodeData(seedLaneFacts(node)),
    ...(pairedNode ? [enrichNodeData(seedLaneFacts(pairedNode))] : [])
  ];
  edges.value = edges.value.map(edge => decorateEdge({ ...edge, selected: false }));
  selectedNodeId.value = id;
  selectedEdgeId.value = null;
  syncEdgeSelection();
  return node;
}

function decorateEdges(items = []) {
  return items.map(edge => decorateEdge(edge));
}

// Wire styling encodes WHAT TRAVELS (node UI contract in
// solid = instances (the entity
// spine between operations), dashed = values, dotted = events — the one
// wire family allowed color, the primary accent. Declaration bindings
// keep the demuted structure dashed family as the second association
// layer. No markers anywhere: direction reads from the left-to-right
// handle canon.
const WIRE_STYLES = {
  event: { stroke: 'var(--p-primary-color)', strokeWidth: 2.5, strokeDasharray: '1 5', strokeLinecap: 'round' },
  instance: { stroke: 'var(--p-text-color)', strokeWidth: 2 },
  value: { stroke: 'var(--p-text-muted-color)', strokeWidth: 1.5, strokeDasharray: '5 4' },
  type: { stroke: 'var(--ck-signal-structure-muted)', strokeWidth: 1.5, strokeDasharray: '4 3' }
};

// An edge's cargo layer: events (control role), declaration bindings
// (type role), or the data role split by what its SOURCE socket
// transports — entity bases are instances, everything else is a value.
function edgeLayer(edge = {}) {
  if (edge.role === 'control') return 'event';
  if (edge.role === 'type') return 'type';
  const source = nodes.value.find(node => node.id === edge.source);
  const handle = edge.sourceHandle || '';
  const specId = handle.includes(':') ? handle.slice(handle.indexOf(':') + 1) : handle;
  const spec = [...(source?.data?.outputSpecs || []), ...(source?.data?.inputSpecs || [])]
    .find(candidate => candidate.id === specId);
  const base = spec?.type?.base || spec?.base || '';
  return base === 'entity' || base === 'entityRef' ? 'instance' : 'value';
}

function decorateEdge(edge = {}) {
  const selected = edge.selected === true || edge.id === selectedEdgeId.value;
  const layer = WIRE_STYLES[edgeLayer(edge)] || WIRE_STYLES.value;
  const decorated = {
    ...edge,
    // A wire leaving and re-entering one node (a class declaring itself
    // as its own children target — recursive containment, SPEC §6) draws
    // as a hoop over the card: the default bezier degenerates there into
    // a line through the node.
    type: edge.source === edge.target ? 'selfloop' : 'default',
    animated: selected,
    style: {
      stroke: selected ? 'var(--p-primary-color)' : layer.stroke,
      strokeWidth: selected ? 3 : layer.strokeWidth,
      ...(layer.strokeDasharray ? { strokeDasharray: layer.strokeDasharray } : {}),
      ...(layer.strokeLinecap ? { strokeLinecap: layer.strokeLinecap } : {})
    }
  };
  // No wire renders markers — and control edges persisted by earlier
  // stylings carry markerEnd inside the stored graph, so it is dropped
  // here rather than spread back into the live edge.
  delete decorated.markerEnd;
  return decorated;
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
  if (inspectTab.value !== 'roles') return;
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
    // Preview parity with server acceptance: an authored v5 snapshot must
    // lower through prepareAuthoredDefinition before compiling — a raw
    // compile silently ignores cts.* species records, so the preview would
    // show an empty contract (no actions, no grants, no inferred screens)
    // for graphs the server compiles fine.
    const projectedDomain = ctsProjectedDomain();
    const { definition: lowered, errors: acceptErrors } = prepareAuthoredDefinition(processDefinitionSnapshot(), projectedDomain);
    if (acceptErrors.length) {
      compiledPreview.value = null;
      compiledPreviewError.value = acceptErrors.join('; ');
      return;
    }
    const compiled = compileProcessDefinition(lowered, projectedDomain, { roles: organizationRoles.value });
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
  // A wire's cargo derives from its source socket, so rebinding a source
  // (rename, type change, declaration re-wire) restyles its edges in the
  // same pass — instance/value/event never drifts stale on the canvas.
  edges.value = decorateEdges(edges.value);
}

// The one node-data enrichment pass: mutates and returns the canvas node
// with everything its card and the inspector read — record sync, derived
// labels, port specs, and option lists. Both initial projection
// (setDraft/addNode) and every live sync go through here, so a node's
// rendered state has exactly one derivation.
//
// DERIVED_NODE_DATA_KEYS is the single list this function and
// stripRuntimeNodeData work from: enrich may only write derived values
// under these keys, and strip removes exactly these keys (minus the
// declaration-authored carve-out inside strip) so derived state never
// persists. Add a derived key here and to the list in the same change.
// Retired derivations (e.g. `processFieldOptions`) stay listed so copies
// persisted by older drafts are still stripped at save.
const DERIVED_NODE_DATA_KEYS = [
  'label',
  'typeId',
  'commandId',
  'type',
  'version',
  'scope',
  'fields',
  'states',
  'processNodeRecord',
  'onProcessNodeUpdate',
  'processTypeIdOptions',
  'processOperationOptions',
  'processFieldOptions',
  'processStatusOptions',
  'processConnectedInputIds',
  'kindLabel',
  'diagnostics',
  'summary',
  'purpose',
  'inputSpecs',
  'outputSpecs',
  'fieldTypeLabelFor'
];

function enrichNodeData(node) {
  const record = ensureRecord(recordKeyForType(node.type), node, factoryForType(node.type));
  const isProcessNode = node.type === 'processNode';
  if (isProcessNode) {
    syncEffectTriggerMode(node, record);
    syncProcessNode(record);
  }
  if (DECLARATION_NODE_TYPES.includes(node.type)) syncDeclarationRecord(record, node);

  const data = node.data || (node.data = {});
  Object.assign(data, {
    // Declaration node labels derive from the declaration itself; a
    // renamed class card shows the current name, not the drop-time one.
    label: declarationNodeLabel(node, record),
    typeId: nodeTypeId(record),
    commandId: record.commandId,
    processNodeRecord: isProcessNode ? record : null,
    onProcessNodeUpdate: isProcessNode ? updates => updateProcessNodeRecord(record.id || data.refId, updates) : null,
    processTypeIdOptions: isProcessNode ? processTypeIdOptions(record) : [],
    processOperationOptions: isProcessNode ? processNodeOperationOptions(record) : [],
    processStatusOptions: isProcessNode ? processWorkflowPaths(record) : [],
    processConnectedInputIds: isProcessNode ? connectedProcessInputIds(node, record) : [],
    kindLabel: isProcessNode ? processNodeDisplayLabel(record) : record.kind,
    summary: processNodeSummary(record),
    purpose: isProcessNode ? processNodeDescription(record) : '',
    diagnostics: nodeDiagnostics ? nodeDiagnostics(node.id) : null
  });

  if (DECLARATION_NODE_TYPES.includes(node.type)) {
    // Declaration nodes derive their typed specs from the declaration
    // itself (declarationNodePorts / the registry entry), never from record
    // inputs/outputs.
    const ports = declarationNodePorts(node, ctsTypeView()) || {};
    data.inputSpecs = ports.inputSpecs || [];
    data.outputSpecs = ports.outputSpecs || [];
    if (node.type === 'ctsField') {
      // Ref cards render accepted type LABELS (SPEC §4): the resolver
      // covers tree class names first, the registry view's labels second.
      const labels = classNameMap();
      data.fieldTypeLabelFor = id => labels.get(id) || id;
    }
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
  return record.label || record.typeId || record.commandId || node.data?.label || '';
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
    const role = await rolePersistence.update(organizationId, selectedRoleId.value, {
      label: selectedRoleRecord.value.label,
      ...(selectedRoleRecord.value.exclusive ? { exclusive: true } : {})
    });
    organizationRoles.value = { ...organizationRoles.value, [role.id]: role };
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
    await loadOrganizationRoles();
  }
}

// Single-seat toggle (organizations README): turning it on is refused with
// the holder list while more than one member holds the role — unassign
// down to one (or zero) first. Assigning a held seat moves it.
async function applyRoleExclusive(exclusive) {
  if (!selectedRoleRecord.value) return;
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  try {
    const role = await rolePersistence.update(organizationId, selectedRoleId.value, {
      label: selectedRoleRecord.value.label,
      exclusive: Boolean(exclusive)
    });
    organizationRoles.value = { ...organizationRoles.value, [role.id]: role };
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
    await loadOrganizationRoles();
  }
}

// Agent-chat capability (organizations README): the roles whose holders
// see the organization AI. Flipping it moves the whole role's members.
async function applyRoleAgentChat(agentChat) {
  if (!selectedRoleRecord.value) return;
  const organizationId = authStore.organizationData?._id || authStore.userData?.organizationId || authStore.memberships?.[0]?.organizationId;
  try {
    const role = await rolePersistence.update(organizationId, selectedRoleId.value, {
      label: selectedRoleRecord.value.label,
      agentChat: Boolean(agentChat)
    });
    organizationRoles.value = { ...organizationRoles.value, [role.id]: role };
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 5000 });
    await loadOrganizationRoles();
  }
}

// Role detail menu + inline rename (SPEC "Role management"): identity and
// destructive actions are menu items, never first-plane controls.
const roleMenuRef = ref(null);
const renamingRoleId = ref(null);
const renamingRoleLabel = ref('');

function toggleRoleMenu(event) {
  roleMenuRef.value?.toggle(event);
}

const roleMenuItems = computed(() => [
  {
    label: t('common.rename'),
    icon: 'pi pi-pencil',
    command: () => startRoleRename()
  },
  {
    label: t('common.delete'),
    icon: 'pi pi-trash',
    command: () => confirmRoleDelete()
  }
]);

function startRoleRename() {
  if (!selectedRoleRecord.value) return;
  renamingRoleId.value = selectedRoleId.value;
  renamingRoleLabel.value = selectedRoleRecord.value.label || '';
}

async function applyRoleRename() {
  const label = renamingRoleLabel.value.trim();
  if (!label || !selectedRoleRecord.value || renamingRoleId.value !== selectedRoleId.value) return;
  selectedRoleRecord.value.label = label;
  renamingRoleId.value = null;
  await saveSelectedRole();
}

// Delete confirmation with a usage warning: a role that carries load in
// ANY definition (lanes/grants/screens/actions) says so before it goes.
const roleDeleteVisible = ref(false);
const roleDeleteBusy = ref(false);
const roleDeleteUsage = ref(null);

async function confirmRoleDelete() {
  if (!selectedRoleId.value) return;
  const roleId = selectedRoleId.value;
  const names = [];
  for (const definition of processDefinitions.value) {
    try {
      const full = definition.data ? definition : await persistence.loadById(String(definition._id));
      const summary = deriveRoleAccessSummary({ process: full, roleIds: [roleId] });
      const used = summary.profiles.length || summary.screens.length || summary.actions.length || summary.transitions.length;
      if (used) names.push(normalizeProcessDisplayName(full.identity?.name || full.identity?.uid || full._id));
    } catch {
      // A definition that cannot be read does not block the delete; it
      // just cannot vouch for the role being unused.
    }
  }
  roleDeleteUsage.value = { names };
  roleDeleteVisible.value = true;
}

async function deleteRoleConfirmed() {
  roleDeleteBusy.value = true;
  try {
    await removeSelectedRole();
    roleDeleteVisible.value = false;
  } finally {
    roleDeleteBusy.value = false;
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

// A compiled station is authored iff its id keys the draft's screens map;
// everything else is inference-owned (read-only presentation + Customize).
function isAuthoredStation(screen) {
  return Boolean(screen?.id) && Object.hasOwn(screens.value, screen.id);
}

function customizeStation(screen) {
  // The editor lives under the owning role now: customize selects that
  // role first so the station's editor is on screen.
  const ownerRole = Array.isArray(screen.roleIds) && screen.roleIds.length ? screen.roleIds[0] : null;
  if (ownerRole && roles.value[ownerRole]) selectedRoleId.value = ownerRole;
  screenEditing.customize(screen);
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

function featureForTypeId(typeId) {
  const entity = (designer.domain.entities || []).find(item => item.type === typeId);
  return entity?.collection || `${typeId}s`;
}

// Declaration authoring state persists in `ctsTypes` records with the
// draft (SPEC §20/§21 one tree): saving keeps the nodes, activation
// compiles them into registry declarations.
function syncDeclarationRecord(record = {}, node = {}) {
  record.kind = { ctsClass: 'class', ctsField: 'field', ctsState: 'state', ctsType: 'type' }[node.type] || record.kind;
  if (node.type === 'ctsClass') {
    record.typeId = node.data.typeId || '';
    record.name = node.data.name || '';
    record.glyph = node.data.glyph || null;
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
  }
  if (node.type === 'ctsType') record.typeId = node.data?.typeId || '';
}

function updateProcessNodeRecord(nodeId, updates = {}) {
  const node = draft.value?.data?.processNodes?.[nodeId];
  if (!node) return;
  if (updates.typeId && updates.typeId !== nodeTypeId(node)) {
    node.path = '';
    node.relationKey = '';
  }
  // Inspector updates arrive in working keys; they land on the record in the
  // record's own vocabulary.
  const { typeId, ...rest } = updates;
  Object.assign(node, rest);
  if (typeId !== undefined) setNodeTypeId(node, typeId);
  syncProcessNode(node);
  pruneMissingProcessNodeInputEdges(nodeId, node);
  syncNodeData();
}

function updateProcessNodeConstructionMode(node = {}, mode = '') {
  if (!node?.id || !mode || node.construction?.mode === mode) return;
  // `construction.mode` is the one authored spelling; the v4 executable
  // contract derives its `via` at the lowering seam.
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
    || !isProcessDataHandle(edge.targetHandle)
    || inputIds.has(parseProcessSocketHandleId(edge.targetHandle))
  ));
}

function validProcessEdges() {
  const processNodesByGraphId = new Map(nodes.value
    .filter(node => node.type === 'processNode' && node.data?.refId)
    .map(node => [node.id, draft.value?.data?.processNodes?.[node.data.refId]]));
  return edges.value.filter(edge => {
    const node = processNodesByGraphId.get(edge.target);
    if (!node || !isProcessDataHandle(edge.targetHandle)) return true;
    return processNodeInputs(node).some(input => input.id === parseProcessSocketHandleId(edge.targetHandle));
  });
}

function stripRuntimeNodeData(node) {
  const runtimeFreeNode = { ...node };
  delete runtimeFreeNode.selected;
  delete runtimeFreeNode.dragging;
  delete runtimeFreeNode.resizing;
  // The lanes view's definitions toggle is runtime presentation state —
  // it never persists into the draft graph.
  delete runtimeFreeNode.hidden;
  const data = { ...(node.data || {}) };
  // Declaration nodes carry authored state in keys the derived list also
  // uses for process nodes (typeId/version/scope/fields/states). Stripping
  // them here erased the class/type binding at save: canvasToDefinition
  // rebuilt the ctsTypes records from the stripped node data, nulled the
  // binding, and the live interpretation unbound every construct wired to
  // the class (ports collapsed, wires dropped). For declaration nodes
  // these keys ARE the authoring state and must persist.
  const authoredDeclarationKeys = DECLARATION_NODE_TYPES.includes(node.type)
    ? new Set(['typeId', 'version', 'scope', 'fields', 'states'])
    : null;
  for (const key of DERIVED_NODE_DATA_KEYS) {
    if (authoredDeclarationKeys?.has(key)) continue;
    delete data[key];
  }
  return { ...runtimeFreeNode, data };
}

function stripRuntimeEdgeData(edge) {
  const { animated, style, selected, markerEnd, pathOptions, ...rest } = edge;
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
  // Children wires are drawn child-first: the edge leaves the child's
  // output:type and enters the parent's input:declare, exactly as drawn —
  // the compatibility gate already refused an illegal direction.
  const childrenPair = ['ctsClass', 'ctsType'].includes(sourceNode?.type) && targetNode?.type === 'ctsClass';
  if (childrenPair && childrenWireLegality({ target: { type: targetNode.type, class: targetNode.data?.class } })) {
    const declarationEdge = {
      id: `children:${sourceNode.id}-${targetNode.id}`,
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: 'output:type',
      targetHandle: 'input:declare',
      type: 'default',
      role: 'type',
      label: 'children',
      data: { key: `${sourceNode.data.typeId}s`, onRemove: 'restrict' }
    };
    if (edges.value.some(edge => edge.id === declarationEdge.id)) return;
    selectedEdgeId.value = null;
    edges.value.push(decorateEdge(declarationEdge));
    syncEdgeSelection();
    evaluateNow();
    return;
  }
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
            : legality === 'entry' ? 'entry'
              : legality
    };
    if (legality === 'declares') declarationEdge.id = `declares:${sourceNode.id}-${targetNode.id}`;
    if (legality === 'nested') declarationEdge.id = mintId('nested');
    if (legality === 'binds') declarationEdge.id = mintId('bind');
    if (legality === 'entry') declarationEdge.id = mintId('entry');
    if (legality === 'targets') declarationEdge.id = mintId('ref-target');
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
    id: mintId('edge'),
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
          return { ok: false, reason: t('processDesigner.connectReasons.declareSocket') };
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
          return { ok: false, reason: source.type === 'ctsClass' ? t('processDesigner.connectReasons.nameClassBeforeBinding') : t('processDesigner.connectReasons.typeNodeNoType') };
        }
        // The binding wire lands on the persistent Type pin (origin
        // species: construct/read). It typechecks against the source
        // alone — the pin accepts any declared type.
        const inputs = catalogPorts(targetRecord).inputs;
        const pin = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.id === 'type');
        if (!pin || pin.id !== 'type') {
          return { ok: false, reason: t('processDesigner.connectReasons.typePinOnly') };
        }
        return {
          ...processSocketsCompatible(sourcePort, pin),
          source: sourcePort,
          target: pin
        };
      }
      if (legality === 'children') {
        // Drawn child-first (SPEC §5): the target must be a class that
        // can parent; the wire lands exactly as drawn.
        if (!childrenWireLegality({ target: { type: target.type, class: target.data?.class } })) {
          const className = String(target.data?.name || target.data?.typeId || '').trim() || t('processDesigner.connectReasons.theClass');
          return {
            ok: false,
            reason: t('processDesigner.connectReasons.childrenContainment', { name: className, kind: target.data.class })
          };
        }
        return source.data?.typeId && target.data?.typeId
          ? { ok: true }
          : { ok: false, reason: t('processDesigner.connectReasons.childrenNeedTypeIds') };
      }
      if (legality === 'nested') {
        // Nesting is wiring (SPEC §7): a state into a state input. The
        // type scope is authored data that may arrive later (declare
        // wire, inspector) — it is never a precondition for nesting.
        if (source.id === target.id) {
          return { ok: false, reason: t('processDesigner.connectReasons.stateNestSelf') };
        }
        const parentOf = new Map(edges.value
          .filter(edge => edge.role === 'type' && edge.label === 'nested')
          .map(edge => [edge.source, edge.target]));
        parentOf.set(source.id, target.id);
        const seen = new Set();
        let cursor = source.id;
        while (cursor && parentOf.has(cursor)) {
          if (seen.has(cursor)) {
            return { ok: false, reason: t('processDesigner.connectReasons.stateParentCycle') };
          }
          seen.add(cursor);
          cursor = parentOf.get(cursor);
        }
        return { ok: true };
      }
      if (legality === 'entry') {
        // The state wire lands on a status-typed input of the target
        // record (construct creation state, transition target).
        const targetRecord2 = draft.value?.data?.processNodes?.[target.data?.refId];
        if (!targetRecord2) return { ok: false, reason: t('processDesigner.connectReasons.stateWiresLandOnProcessNodes') };
        const inputs = catalogPorts(targetRecord2).inputs;
        const input = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.type?.base === 'status');
        if (!input || input.type?.base !== 'status') {
          return { ok: false, reason: t('processDesigner.connectReasons.stateWiresLandOnStatusInputs') };
        }
        return { ok: true };
      }
      if (legality === 'field') {
        // The field wire lands on the getField's field input (SPEC §20
        // socket algebra); any other target handle is refused.
        const targetRecord2 = draft.value?.data?.processNodes?.[target.data?.refId];
        if (!targetRecord2) return { ok: false, reason: t('processDesigner.connectReasons.fieldWiresLandOnProcessNodes') };
        const inputs = catalogPorts(targetRecord2).inputs;
        const input = portForHandle(inputs, connection.targetHandle, 'input') || inputs.find(port => port.id === 'field');
        if (!input || input.id !== 'field') {
          return { ok: false, reason: t('processDesigner.connectReasons.fieldWiresLandOnFieldInput') };
        }
        return { ok: true };
      }
      if (legality === 'targets') {
        // ref fields receive their accepted target types as wired inputs
        if (target.data?.descriptor?.base !== 'ref') {
          return { ok: false, reason: t('processDesigner.connectReasons.refBaseRequired') };
        }
        return source.data?.typeId
          ? { ok: true }
          : { ok: false, reason: t('processDesigner.connectReasons.nameClassBeforeRefTarget') };
      }
      // A type-reference card is a child end only (SPEC §5): the children
      // wire leaves the card's output into the class's declare input.
      if (source.type === 'ctsClass' && target.type === 'ctsType') {
        return { ok: false, reason: t('processDesigner.connectReasons.typeCardNeverParents') };
      }
      return {
        ok: false,
        reason: (source.type === 'ctsClass' || source.type === 'ctsType') && targetRecord
          ? t('processDesigner.connectReasons.typePinOriginOnly')
          : t('processDesigner.connectReasons.onlyCurrentNodes')
      };
    }
    return { ok: false, reason: t('processDesigner.connectReasons.onlyCurrentNodes') };
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


</script>

