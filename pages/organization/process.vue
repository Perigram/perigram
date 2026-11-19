<template>
  <StandardPage workspace>
    <div class="flex h-full min-h-0 flex-1 flex-col">
      <!-- The workspace header (SPEC §28.14): the loaded definition's
           identity and rename, the dirty-gated save, and the process
           lifecycle actions. File-level and lifecycle commands live here,
           never in the canvas dock. -->
      <SurfaceHeader :title="activeName" :on-rename="renameActiveDefinition">
        <template #cluster>
          <Button
            :label="t('processDesigner.newDraft')"
            icon="pi pi-file-plus"
            size="small"
            text
            severity="secondary"
            :disabled="creatingDraft || applyBusy"
            :loading="creatingDraft"
            @click="startNewDraft"
          />
          <Button
            v-if="isDirty"
            :label="t('common.save')"
            icon="pi pi-save"
            size="small"
            text
            severity="secondary"
            :disabled="applyBusy || creatingDraft"
            @click="saveDraftWithToast"
          />
          <Button
            :label="t('processDesigner.apply')"
            icon="pi pi-check"
            size="small"
            :disabled="!draft?._id || applyBusy || creatingDraft"
            :loading="applyState === 'applying'"
            @click="applyProcess"
          />
        </template>
      </SurfaceHeader>
      <GraphEditorSurface
        :session="processSession"
        :canvas-items="canvasDockItems"
      :palette-placeholder="$t('processDesigner.searchOperations')"
      :empty-message="emptyCanvasMessage"
      :validation-diff-lines="validationDiffLines"
      :node-drag-stop="onNodeDragStop"
      :canvas-nodes-change="onCanvasNodesChange"
    >
      <template #lane>
        <LaneBands
          :bands="laneBands"
          :left="laneExtent.left"
          :right="laneExtent.right"
        />
      </template>
      <template #inspector>
        <div class="flex h-full min-h-0 flex-col">
          <Tabs v-model:value="inspectTab" class="flex min-h-0 flex-1 flex-col">
            <TabList>
              <Tab value="inspector">{{ $t('processDesigner.inspector') }}</Tab>
              <Tab value="definitions">{{ $t('processDesigner.definitions') }}</Tab>
              <Tab value="roles">{{ $t('processDesigner.roles') }}</Tab>
              <Tab value="preview">{{ $t('processDesigner.previewTab') }}</Tab>
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
              <GraphInspector
                :selected-node="selectedNode"
                :selected-process-node="selectedProcessNode"
                :selected-entity="selectedEntity"
                :selected-entity-available="selectedEntityAvailable"
                :selected-declaration-edge="selectedDeclarationEdge"
                :declaration-node-types="declarationNodeTypes"
                :class-type-id-valid="classTypeIdValid"
                :class-declaration-diagnostics="classDeclarationDiagnostics"
                :declaration-type-options="declarationTypeOptions"
                :type-anchor-options="typeAnchorOptions"
                :class-identifier-field="classIdentifierField"
                :relation-options-for-entity="relationOptionsForEntity"
                :projection-options-for-entity="projectionOptionsForEntity"
                :type-id-options="typeIdOptions"
                :role-options="roleOptions"
                :command-options="commandOptions"
                :selected-command-service="selectedCommandService"
                :service-principal-options="servicePrincipalOptions"
                :transition-guard-field-options="transitionGuardFieldOptions"
                :record-state-policy-target="recordStatePolicyTarget"
                :record-state-field-policy-options="recordStateFieldPolicyOptions"
                :construction-modes="selectedNode?.type === 'processNode' ? constructionModeOptions(nodeTypeId(selectedProcessNode)) : []"
                :designer="designer"
                :grants="selectedProcessNodeGrants"
                :effective-access="selectedProcessNodeEffectiveAccess"
                :inputs="selectedNode?.type === 'processNode' ? processNodeInputs(selectedProcessNode) : []"
                :preview="{
                  supported: selectedNodeSupportsPreview,
                  running: channelPreviewRunning,
                  state: selectedChannelNode,
                  outputs: selectedNode?.type === 'processNode' ? selectedChannelOutputs : []
                }"
                :format-preview-path="formatPreviewPath"
                :format-preview-items="formatPreviewItems"
                @sync="syncNodeData"
                @update-name="value => updateClassName(selectedNode, value)"
                @update-identifier-field="value => setClassIdentifierField(selectedNode, value)"
                @update-grant-level="({ index, level }) => updateSelectedProcessNodeGrantLevel(index, level)"
                @update-construction-mode="mode => updateProcessNodeConstructionMode(selectedProcessNode, mode)"
                @create-command-service="createCommandServiceForSelectedNode"
                @remove-command-service="removeSelectedCommandService"
              />
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
              <GraphPreviewPanel
                :channels="servedPreviewChannels"
                :payload="channelPreviewPayload"
                :nodes="nodes"
                :running="channelPreviewRunning"
                :error="channelPreviewError"
                @refresh="runChannelPreview"
              />
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

    </GraphEditorSurface>
    </div>

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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
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
import StandardDialog from '~/components/shared/StandardDialog.vue';
import SurfaceHeader from '~/components/ui-mapping/SurfaceHeader.vue';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import ApplyMigrationDialog from '~/components/process-designer/ApplyMigrationDialog.vue';
import GraphEditorSurface from '~/components/process-designer/GraphEditorSurface.vue';
import GraphInspector from '~/components/process-designer/GraphInspector.vue';
import GraphPreviewPanel from '~/components/process-designer/GraphPreviewPanel.vue';
import TypeMigrationStepsDialog from '~/components/process-designer/TypeMigrationStepsDialog.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PermissionEditor from '~/components/PermissionEditor.vue';
import { projectUiAction } from '@perigram/processes/ui-contract-projection';
import {
  authoredProcessDataFromGraphDocument,
  canvasToDefinition,
  compileProcessDefinition,
  createProcessGraphDocument,
  definitionToCanvas,
  normalizeDesignerAccess,
  prepareAuthoredDefinition,
  PROCESS_DATAFLOW_VERSION
} from '@perigram/processes';
import { normalizeScreenContract, SCREEN_TEMPLATES, SCREEN_SOURCE_MODES, SCREEN_REGION_SLOTS, SCREEN_REGION_SURFACES, SCREEN_LINEAGE_BINDING_FIELDS } from '@perigram/processes/screen-contract';
import { checkDeclarationsAgainstCts, compileClientBundle } from '@perigram/cts';
import LaneBands from '~/components/process-designer/LaneBands.vue';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { normalizeProcessDisplayName, processDisplayEntity } from '~/utils/processDesignerDisplay.js';
import { arrangeProcessGraph, deriveLaneFacts, laneContainerLayout } from '~/utils/processDesignerArrangement.js';
import { declarationVocabulary } from '~/utils/processDesignerTypeMigrations.js';
import { useProcessDefinitionCatalog } from '~/composables/useProcessDefinitionCatalog.js';
import { useProcessDesignerPanels } from '~/composables/useProcessDesignerPanels.js';
import { useProcessDesignerPersistence } from '~/composables/useProcessDesignerPersistence.js';
import { useProcessDesignerRoles } from '~/composables/useProcessDesignerRoles.js';
import { useProcessDesignerScreens, withoutKeys } from '~/composables/useProcessDesignerScreens.js';
import { useProcessDesignerApply } from '~/composables/useProcessDesignerApply.js';
import { useProcessProfile } from '~/composables/useProcessProfile.js';
import { useGraphChannelPreview } from '~/composables/useGraphChannelPreview.js';
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

const processDefinitions = ref([]);
const selectedProcessId = ref(null);
const loadingProcess = ref(false);
const processLoadError = ref('');
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

const draft = ref(null);

const processCanvasSource = data => (data?.format === 'perigram.graph'
  ? (authoredProcessDataFromGraphDocument(data) || data)
  : data || {});
const { compareProcessDefinitions, normalizeProcessList, pickInitialProcess } = useProcessDefinitionCatalog({
  definitionToCanvas: data => definitionToCanvas(processCanvasSource(data))
});
const persistence = useProcessDesignerPersistence();
const rolePersistence = useProcessDesignerRoles();

// Preview channels (SPEC §28): the whole-graph evaluation a channel tab
// consumes — the same preview seam the node inspector rides, with no
// target node (every node evaluates, effects suppressed). The result is
// the read-only payload handed to each channel mount and the per-node
// evaluation errors folded into the canvas fault states.
const {
  payload: channelPreviewPayload,
  running: channelPreviewRunning,
  error: channelPreviewError,
  run: runChannelPreview,
  schedule: scheduleChannelPreview
} = useGraphChannelPreview({
  persistence,
  serializeProcess: () => serializeProcess()
});

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

// The process profile layers CTS declarations, process records, lanes, roles,
// screens, and the apply ceremony onto the shared graph authoring core. The
// page composes that profile with the process-definition lifecycle.
const processSession = useProcessProfile({
  t,
  te,
  toast,
  draft,
  roles: () => organizationRoles.value,
  activeOrganizationId,
  persistence,
  graphEvaluation: channelPreviewPayload,
  seedPlacement: node => seedLaneFacts(node)
});
const {
  nodes,
  edges,
  validation,
  draftDataSignature,
  designerSignature,
  loadDocument,
  serializeProcess,
  serializeCanonicalGraph,
  loadCanonicalGraph,
  processDefinitionSnapshot,
  designer,
  ctsRegistry,
  ctsProjectedDomain,
  servedClientEngines,
  servedClientRuntimes,
  ctsTypeView,
  classNameMap,
  ctsOrgTypes,
  refreshTreeOverlay,
  loadOrgTypes,
  loadProcessCapabilities,
  persistTreeDeclarations,
  servedCommands,
  servedPreviewChannels,
  processNodeOperations,
  processNodeOperationLabels,
  defaultTypeId,
  isOpKind,
  nodeTypeId,
  setNodeTypeId,
  catalogPorts,
  catalogContext,
  portForHandle,
  socketPairCompatible,
  relationOptionsForEntity,
  projectionOptionsForEntity,
  constructionModeOptions,
  processNodeInputs,
  processNodeOutputs,
  processNodeOperationOptions,
  processWorkflowPaths,
  processTypeIdOptions,
  ensureRecord,
  factoryForType,
  recordKeyForType,
  enrichNodeData,
  syncNodeData,
  updateProcessNodeRecord,
  updateProcessNodeConstructionMode,
  stripRuntimeNodeData,
  stripRuntimeEdgeData,
  validProcessEdges,
  selectedNode,
  selectedNodeId,
  selectedEdgeId,
  selectedGraphNodes,
  selectedGraphEdges,
  selectNode,
  selectEdge,
  clearGraphSelection,
  resetGraphSelection,
  deleteGraphSelection,
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
  designerViewport,
  addNode,
  onConnect,
  connectionCompatibility,
  decorateEdge,
  decorateEdges,
  syncEdgeSelection,
  evaluateNow,
  applyGraphInterpretation,
  incomingEntityContract,
  isEffectNode,
  nodeOperationKind,
  suggestTreeTypeId,
  updateClassName,
  setClassIdentifierField,
  renameDeclarationNode,
  classIdentifierField,
  classTypeIdValid,
  classDeclarationDiagnostics,
  declarationPlaneSignature,
  declarationNodeTypes,
  selectedDeclarationEdge,
  contextPalette,
  openPanePalette,
  closeContextPalette,
  addContextNode,
  contextPaletteSearch,
  clonePalettePreset,
  clonePlainData,
  selectedEntity,
  selectedProcessNode,
  selectedEntityAvailable,
  servicePrincipals,
  servicePrincipalList,
  servicePrincipalOptions,
  typeIdOptions,
  optionalTypeIdOptions,
  roleOptions,
  commandOptions,
  commandForId,
  selectedCommandService,
  createCommandServiceForSelectedNode,
  removeSelectedCommandService,
  serviceList,
  socketList,
  selectedSocketId,
  selectedSocketRecord,
  addSocket,
  removeSelectedSocket,
  socketDirections,
  fieldOptionsForSelectedSocket,
  rowFieldIdOptions,
  transitionGuardFieldOptions,
  recordStatePolicyTarget,
  recordStateFieldPolicyOptions,
  selectedProcessNodeGrants,
  selectedProcessNodeEffectiveAccess,
  updateSelectedProcessNodeGrantLevel,
  validationDiffLines,
  selectedNodeSupportsPreview,
  selectedChannelNode,
  selectedChannelOutputs,
  formatPreviewPath,
  formatPreviewItems,
  nodeDiagnostics,
  focusValidationDiagnostic,
  focusFirstValidationDiagnostic
} = processSession;

const {
  applyState,
  applyDetail,
  saveDraft,
  saveDraftWithToast,
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
  serializeProcess: () => serializeCanonicalGraph(),
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

const lifecycleModes = computed(() => [
  { label: t('processDesigner.lifecycleModeDefaultCreated'), value: 'defaultCreated' },
  { label: t('processDesigner.lifecycleModeDomainDefault'), value: 'domainDefault' },
  { label: t('processDesigner.lifecycleModeCustom'), value: 'custom' }
]);
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
// Lanes — the authorization surface, canonical in
// components/process-designer README "Lanes". ONLY effects participate
// (they alone carry access): one lane per role in fixed order plus an
// implicit unlabeled lane, hairline separators spanning the nodes'
// horizontal domain. Lanes are containers for everything dropped into
// them; effects' lane IS their grant (drop assigns the role, implicit
// lane clears grants).
const LANE_MIN_HEIGHT = 150;
// lg operation card width (DesignerNodeCard `w-72`) — the extent fallback.
const LANE_NODE_FALLBACK_WIDTH = 288;
// The lane container pass's band geometry (contract: README "Lanes") —
// bands hug their members, stacked in role order. Null before the first
// projection; the minimum-height stack below is the pre-projection paint.
const arrangedBands = ref(null);

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

const canvasDockItems = computed(() => [
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
  return draft.value
    ? t('processDesigner.emptyGraph')
    : t('processDesigner.noActiveDraft');
});
const roles = computed(() => organizationRoles.value);
const screens = computed(() => draft.value?.data?.screens || {});
const roleList = computed(() => Object.values(roles.value));
const screenList = computed(() => Object.values(screens.value));
const selectedRoleRecord = computed(() => selectedRoleId.value ? roles.value[selectedRoleId.value] : null);
const selectedScreenRecord = computed(() => selectedScreenId.value ? screens.value[selectedScreenId.value] : null);
const declarationTypeOptions = computed(() => [
  ...new Set([
    ...ctsTypeView().map(entry => entry.id),
    ...nodes.value.filter(node => node.type === 'ctsClass' && node.data?.typeId).map(node => node.data.typeId)
  ])
]);
watch([declarationPlaneSignature, ctsOrgTypes], () => {
  typeMigrationVocabulary.value = declarationVocabulary(
    nodes.value,
    edges.value,
    ctsOrgTypes.value
  );
}, { immediate: true });

const typeAnchorOptions = computed(() => ctsTypeView().map(entry => ({
  label: `${entry.label} · ${entry.class}`,
  value: entry.id
})));
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
// Preview recompute follows the authoring signature — the content the
// compiler reads — so a drag never queues a compile.
const previewAuthoringSignature = computed(() => JSON.stringify({
  data: draftDataSignature.value,
  nodes: nodes.value.map(node => [node.id, node.type, node.data]),
  edges: edges.value.map(edge => [edge.id, edge.source, edge.target, edge.sourceHandle, edge.targetHandle, edge.role, edge.label])
}));
watch(previewAuthoringSignature, () => { schedulePreviewRecompute(); scheduleChannelPreview(['inspector', 'preview'].includes(inspectTab.value)); });
watch(inspectTab, () => { schedulePreviewRecompute(); scheduleChannelPreview(['inspector', 'preview'].includes(inspectTab.value)); });

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
    ? createProcessGraphDocument(canvasToDefinition(
      { nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } },
      { dataflowVersion: PROCESS_DATAFLOW_VERSION }
    ))
    : serializeCanonicalGraph();
  const created = await persistence.createDraft({ name, data, sourceProcessDefinitionId: sourceId });
  upsertProcessDefinition(created);
  setDraft(created);
  return created;
}

async function startNewDraft() {
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

async function renameActiveDefinition(name) {
  const trimmed = String(name || '').trim();
  const id = String(draft.value?._id || '');
  if (!trimmed || !id || trimmed === activeName.value) return;
  try {
    const updated = await persistence.renameDraft(id, trimmed);
    upsertProcessDefinition(updated);
    if (String(draft.value?._id) === id) setDraft(updated);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.rename'), detail: error?.data?.message || error?.message || '', life: 4000 });
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
      const freshData = fresh?.data?.format === 'perigram.graph'
        ? authoredProcessDataFromGraphDocument(fresh.data)
        : fresh?.data;
      if (JSON.stringify(freshData ?? null) === reconciledDataSignature) return;
      upsertProcessDefinition(fresh);
      setDraft(fresh);
    })
    .catch(() => {});
}

function setDraft(value) {
  const data = value?.data?.format === 'perigram.graph'
    ? {
        ...(authoredProcessDataFromGraphDocument(value.data) || {}),
        ...Object.fromEntries(['migrations', 'history', 'activated'].filter(key => value.data[key] !== undefined).map(key => [key, value.data[key]]))
      }
    : value?.data;
  const view = value?.data?.format === 'perigram.graph' ? { ...value, data } : value;
  loadDocument(view, {
    seedNodes: seeded => deriveLaneFacts({
      nodes: seeded,
      bandIds: laneBandIds.value,
      membershipOf: laneMembershipOf
    }),
    onLoaded: () => {
      selectedProcessId.value = draft.value?._id ? String(draft.value._id) : null;
      selectedRoleId.value = Object.keys(organizationRoles.value)[0] || null;
      selectedPrincipalId.value = Object.keys(draft.value?.data?.servicePrincipals || {})[0] || null;
      selectedScreenId.value = Object.keys(draft.value?.data?.screens || {})[0] || null;
      laneProjectionBaselined.value = false;
      projectLanes();
      savedDraftSignature.value = designerSignature();
      reconciledDataSignature = draftDataSignature.value;
      recomputeProcessPreview();
    }
  });
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
</script>

