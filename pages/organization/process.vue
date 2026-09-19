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
                <template v-if="selectedNode.type === 'ctsClass'">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('typesPane.class') }}</label>
                      <Select
                        :model-value="selectedNode.data.class"
                        :options="declarableClassOptions"
                        option-label="label"
                        option-value="value"
                        @update:model-value="value => { selectedNode.data.class = value; }"
                      />
                    </div>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('typesPane.typeId') }}</label>
                      <InputText v-model="selectedNode.data.typeId" :invalid="!classTypeIdValid" />
                      <Message v-if="!classTypeIdValid" severity="error" size="small" :closable="false">
                        {{ $t('typesPane.typeIdHint') }}
                      </Message>
                    </div>
                    <Message
                      v-for="diagnostic in classDeclarationDiagnostics"
                      :key="diagnostic"
                      severity="error"
                      size="small"
                      :closable="false"
                    >{{ diagnostic }}</Message>
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('typesPane.payloadMime') }}</label>
                      <InputChips v-model="classPayloadMimeValues" :placeholder="'application/perigram+occs'" />
                    </div>
                    <div class="grid grid-cols-2 gap-2">
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('typesPane.maxSize') }}</label>
                        <InputNumber
                          :model-value="selectedNode.data.payload?.maxSize"
                          :placeholder="'5242880'"
                          :use-grouping="false"
                          @update:model-value="value => updateClassPayload({ maxSize: value ?? undefined })"
                        />
                      </div>
                      <div class="flex flex-col gap-1">
                        <label>{{ $t('typesPane.preview') }}</label>
                        <Select
                          :model-value="selectedNode.data.payload?.preview || 'attachment'"
                          :options="payloadPreviewOptions"
                          option-label="label"
                          option-value="value"
                          @update:model-value="value => updateClassPayload({ preview: value === 'attachment' ? undefined : value })"
                        />
                      </div>
                    </div>

                    <div class="flex flex-col gap-2">
                      <div class="flex items-center justify-between">
                        <label>{{ $t('typesPane.operators') }}</label>
                        <Button :label="$t('common.add')" icon="pi pi-plus" text size="small" @click="addClassOperator" />
                      </div>
                      <div v-for="(operator, index) of classOperators" :key="index" class="flex flex-col gap-2">
                        <div class="flex items-center gap-2">
                          <InputText
                            :model-value="operator.id"
                            size="small"
                            class="flex-1"
                            @update:model-value="value => updateClassOperator(index, { id: value })"
                          />
                          <Select
                            :model-value="operator.species"
                            :options="operatorSpeciesOptions"
                            option-label="label"
                            option-value="value"
                            size="small"
                            @update:model-value="value => updateClassOperator(index, { species: value })"
                          />
                          <Button icon="pi pi-times" text size="small" severity="danger" @click="removeClassOperator(index)" />
                        </div>
                        <details>
                          <summary class="cursor-pointer text-supporting text-muted">{{ $t('typesPane.signature') }}</summary>
                          <div class="mt-2 flex flex-col gap-2">
                            <div class="flex items-center gap-2">
                              <Checkbox :model-value="Boolean(operator.input)" :binary="true" @update:model-value="value => updateClassOperator(index, { input: value ? { base: 'record', fields: {} } : null })" />
                              <span>input</span>
                            </div>
                            <DescriptorEditor
                              v-if="operator.input"
                              :model-value="operator.input"
                              :type-options="declarationTypeOptions"
                              @update:model-value="value => updateClassOperator(index, { input: value })"
                            />
                            <div class="flex items-center gap-2">
                              <Checkbox :model-value="Boolean(operator.output)" :binary="true" @update:model-value="value => updateClassOperator(index, { output: value ? { base: 'string' } : null })" />
                              <span>output</span>
                            </div>
                            <DescriptorEditor
                              v-if="operator.output"
                              :model-value="operator.output"
                              :type-options="declarationTypeOptions"
                              @update:model-value="value => updateClassOperator(index, { output: value })"
                            />
                          </div>
                        </details>
                        <details>
                          <summary class="cursor-pointer text-supporting text-muted">{{ $t('typesPane.triggers') }} ({{ (operator.triggers || []).length }})</summary>
                          <div class="mt-2 flex flex-col gap-2">
                            <div v-for="(trigger, triggerIndex) of operator.triggers || []" :key="triggerIndex" class="flex items-center gap-2">
                              <Select
                                :model-value="trigger.event ? 'event' : 'schedule'"
                                :options="[{ label: 'event', value: 'event' }, { label: 'schedule', value: 'schedule' }]"
                                size="small"
                                @update:model-value="value => updateClassOperatorTrigger(index, triggerIndex, value === 'event' ? { event: '' } : { schedule: '' })"
                              />
                              <InputText
                                :model-value="trigger.event || trigger.schedule || ''"
                                size="small"
                                class="flex-1"
                                @update:model-value="value => updateClassOperatorTriggerValue(index, triggerIndex, value)"
                              />
                              <Button icon="pi pi-times" text size="small" severity="danger" @click="removeClassOperatorTrigger(index, triggerIndex)" />
                            </div>
                            <Button :label="$t('typesPane.addTrigger')" icon="pi pi-plus" text size="small" @click="updateClassOperator(index, { triggers: [...(operator.triggers || []), { event: '' }] })" />
                          </div>
                        </details>
                      </div>
                    </div>

                    <Message severity="info" :closable="false">{{ $t('processDesigner.classDeclaresHint') }}</Message>
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'ctsField'">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('typeCanvas.fieldName') }}</label>
                      <InputText v-model="selectedNode.data.name" @update:model-value="syncNodeData" />
                    </div>
                    <DescriptorEditor
                      :model-value="selectedNode.data.descriptor || { base: 'string' }"
                      :type-options="declarationTypeOptions"
                      @update:model-value="value => { selectedNode.data.descriptor = value; syncNodeData(); }"
                    />
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'ctsState'">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('typeCanvas.stateName') }}</label>
                      <InputText v-model="selectedNode.data.value" @update:model-value="syncNodeData" />
                    </div>
                    <div class="flex items-center gap-2">
                      <Checkbox v-model="selectedNode.data.initial" :binary="true" />
                      <label>{{ $t('typesPane.initial') }}</label>
                    </div>
                    <div class="flex items-center gap-2">
                      <Checkbox v-model="selectedNode.data.terminal" :binary="true" />
                      <label>{{ $t('typesPane.terminal') }}</label>
                    </div>
                  </div>
                </template>

                <template v-else-if="selectedNode.type === 'ctsType'">
                  <div class="flex flex-col gap-3">
                    <div class="flex flex-col gap-1">
                      <label>{{ $t('processDesigner.entityType') }}</label>
                      <Select
                        :model-value="selectedNode.data?.typeId || ''"
                        :options="typeAnchorOptions"
                        option-label="label"
                        option-value="value"
                        filter
                        @update:model-value="value => { selectedNode.data.typeId = value; syncNodeData(); }"
                      />
                    </div>
                    <Message severity="info" :closable="false">{{ $t('processDesigner.typeBindingHint') }}</Message>
                  </div>
                </template>


                <template v-else-if="selectedNode.type === 'processNode'">
                  <div v-if="isOpKind(selectedProcessNode, 'effect.')" class="flex flex-col gap-2">
                    <label>{{ $t('processDesigner.actionRoles') }}</label>
                    <MultiSelect
                      :model-value="selectedProcessNodeGrantRoleIds"
                      :options="roleOptions"
                      option-label="label"
                      option-value="value"
                      display="chip"
                      class="w-full"
                      @update:model-value="updateSelectedProcessNodeGrantRoles"
                    />
                    <div
                      v-for="(grant, index) in selectedProcessNodeGrants"
                      :key="grant.roleId"
                      class="flex items-center gap-2"
                    >
                      <span class="min-w-0 flex-1 truncate text-supporting">{{ roleOptions.find(option => option.value === grant.roleId)?.label || grant.roleId }}</span>
                      <Select
                        :model-value="grant.level || 'write'"
                        :options="accessLevelOptions"
                        option-label="label"
                        option-value="value"
                        class="w-28 shrink-0"
                        size="small"
                        @update:model-value="value => updateSelectedProcessNodeGrantLevel(index, value)"
                      />
                    </div>
                    <div v-if="selectedProcessNodeAccessDetail" class="text-supporting text-muted">{{ selectedProcessNodeAccessDetail }}</div>
                    <div v-if="selectedProcessNodeEffectiveAccess.length" class="flex flex-wrap gap-1">
                      <span
                        v-for="item in selectedProcessNodeEffectiveAccess"
                        :key="item.label"
                        class="max-w-full truncate rounded-ui border border-content-border px-1.5 py-0.5 text-supporting"
                        :class="item.inherited ? 'text-muted' : ''"
                      >{{ item.label }}</span>
                    </div>
                  </div>
                  <Panel v-if="selectedEntityAvailable" :header="$t('processDesigner.createdEntity')" class="mt-0">
                        <div class="flex flex-col gap-3">
                          <div class="flex min-w-0 items-center justify-between gap-2">
                            <div class="flex min-w-0 items-center gap-2">
                              <i :class="entityIconFor(selectedEntity.entityType)" />
                              <strong class="truncate">{{ entityTypeLabelFor(selectedEntity.entityType) }}</strong>
                            </div>
                            <Tag :value="$t('processDesigner.producerOutputTag')" severity="secondary" size="small" />
                          </div>
                          <code class="text-supporting text-muted break-all">{{ selectedEntity.producerOutputId }}</code>
                          <div class="flex flex-col gap-1">
                            <label>{{ $t('processDesigner.relations') }}</label>
                            <MultiSelect v-model="selectedEntity.relations" :options="relationOptionsForEntity(selectedEntity.entityType)" option-label="label" option-value="value" display="chip" class="w-full" @change="syncNodeData" />
                          </div>
                          <small class="text-muted">{{ $t('processDesigner.producerWorkflowHint') }}</small>
                        </div>
                  </Panel>
                  <div v-if="selectedProcessNode.kind && !isOpKind(selectedProcessNode, 'effect.') && !isOpKind(selectedProcessNode, 'control.') && !isOpKind(selectedProcessNode, 'source.')" class="flex flex-col gap-2">
                    <label>{{ $t('processDesigner.dataMatching') }}</label>
                    <Select v-model="selectedProcessNode.matching" :options="dataMatchingOptions" option-label="label" option-value="value" size="small" @change="syncNodeData" />
                    <div v-for="input in processNodeInputs(selectedProcessNode).filter(item => item.role === 'data')" :key="input.id" class="flex items-center gap-2 text-supporting">
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
                      <section v-for="output in selectedNodePreviewOutputs" :key="output.id" class="rounded-ui border border-content-border bg-subtle p-2 text-supporting">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <span class="flex min-w-0 items-baseline gap-2">
                            <strong class="truncate">{{ output.label }}</strong>
                            <span v-if="output.type" class="shrink-0 text-muted">{{ output.type }}</span>
                          </span>
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
                  <div v-if="isOpKind(selectedProcessNode, 'effect.runCommand')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.service') }}</label>
                    <Select v-model="selectedProcessNode.commandId" :options="commandOptions" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                  <Panel v-if="isOpKind(selectedProcessNode, 'effect.runCommand') && selectedProcessNode.commandId" :header="$t('processDesigner.commandService')" toggleable collapsed>
                    <div class="flex flex-col gap-3">
                      <Message v-if="!selectedCommandService" severity="secondary">{{ $t('processDesigner.commandServiceNone') }}</Message>
                      <div v-if="selectedCommandService" class="flex flex-col gap-3">
                        <div class="flex flex-col gap-1">
                          <label>{{ $t('processDesigner.runPrincipals') }}</label>
                          <MultiSelect v-model="selectedCommandService.access.runPrincipals" :options="servicePrincipalOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label>{{ $t('processDesigner.viewPrincipals') }}</label>
                          <MultiSelect v-model="selectedCommandService.access.viewPrincipals" :options="servicePrincipalOptions" option-label="label" option-value="value" display="chip" class="w-full" />
                        </div>
                        <div class="flex flex-col gap-1">
                          <label>{{ $t('processDesigner.serviceBillingMode') }}</label>
                          <Select v-model="selectedCommandService.billing.mode" :options="serviceBillingModeOptions" option-label="label" option-value="value" />
                        </div>
                        <div v-if="selectedCommandService.billing.mode === 'prepaidTokens'" class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div class="flex flex-col gap-1">
                            <label>{{ $t('processDesigner.serviceTokenCost') }}</label>
                            <InputNumber v-model="selectedCommandService.billing.tokenCost" :min="0" :max-fraction-digits="2" class="w-full" />
                          </div>
                          <div class="flex flex-col gap-1">
                            <label>{{ $t('processDesigner.serviceMeterKey') }}</label>
                            <InputText v-model="selectedCommandService.billing.meterKey" class="w-full" />
                          </div>
                        </div>
                      </div>
                      <Button
                        v-if="!selectedCommandService"
                        icon="pi pi-plus"
                        :label="$t('processDesigner.commandServiceCreate')"
                        size="small"
                        severity="secondary"
                        outlined
                        @click="createCommandServiceForSelectedNode"
                      />
                      <Button
                        v-else
                        icon="pi pi-trash"
                        :label="$t('common.delete')"
                        severity="danger"
                        outlined
                        size="small"
                        @click="removeSelectedCommandService"
                      />
                    </div>
                  </Panel>
                  <div v-if="isOpKind(selectedProcessNode, 'producer.join')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.entityType') }}</label>
                    <Select
                      :model-value="nodeEntityType(selectedProcessNode)"
                      :options="entityTypeOptions"
                      option-label="label"
                      option-value="value"
                      @update:model-value="value => updateJoinEntityType(selectedProcessNode, value)"
                    />
                    <label>{{ $t('processDesigner.joinResultProducer') }}</label>
                    <Select
                      :model-value="selectedProcessNode.selectedProducerOutputId"
                      :options="joinProducerOptions"
                      option-label="label"
                      option-value="value"
                      @update:model-value="value => updateJoinSelectedProducer(selectedProcessNode, value)"
                    />
                  </div>
                  <div v-if="isOpKind(selectedProcessNode, 'effect.createEntity') && (constructionModeOptions(nodeEntityType(selectedProcessNode)).length > 1 || nodeEntityType(selectedProcessNode) === 'artifact')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.constructionMode') }}</label>
                    <Select
                      :model-value="selectedProcessNode.construction.mode"
                      :options="constructionModeOptions(nodeEntityType(selectedProcessNode))"
                      option-label="label"
                      option-value="value"
                      @update:model-value="mode => updateProcessNodeConstructionMode(selectedProcessNode, mode)"
                    />
                  </div>
                  <div v-if="isOpKind(selectedProcessNode, 'effect.createEntity') && nodeEntityType(selectedProcessNode) === 'artifact'" class="flex flex-col gap-1">
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
                  <div v-if="isOpKind(selectedProcessNode, 'effect.generateAttachment')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.attachmentKind') }}</label>
                    <Select v-model="selectedProcessNode.attachmentKind" :options="designer.attachmentKindOptions" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                  <div v-if="isOpKind(selectedProcessNode, 'read.related')" class="flex flex-col gap-1">
                    <label>{{ $t('processDesigner.relation') }}</label>
                    <Select v-model="selectedProcessNode.relationKey" :options="relationOptionsForEntity(nodeEntityType(selectedProcessNode))" option-label="label" option-value="value" filter @change="syncNodeData" />
                  </div>
                </template>

              </div>
              <div v-else-if="selectedDeclarationEdge" class="flex min-w-0 flex-col gap-4">
                <template v-if="selectedDeclarationEdge.label === 'transition'">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('typesPane.intent') }}</label>
                    <InputText v-model="selectedDeclarationEdge.data.intent" :placeholder="'finish'" @update:model-value="selectedDeclarationEdge.label = selectedDeclarationEdge.data.intent || 'transition'" />
                  </div>
                  <Message severity="info" :closable="false">{{ $t('processDesigner.transitionEdgeHint') }}</Message>
                </template>
                <template v-else-if="selectedDeclarationEdge.label === 'children'">
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('typesPane.edgeKey') }}</label>
                    <InputText v-model="selectedDeclarationEdge.data.key" />
                  </div>
                  <div class="flex flex-col gap-1">
                    <label>{{ $t('typesPane.onRemove') }}</label>
                    <Select
                      v-model="selectedDeclarationEdge.data.onRemove"
                      :options="onRemoveOptions"
                      option-label="label"
                      option-value="value"
                    />
                  </div>
                </template>
                <Message v-else severity="secondary" :closable="false">{{ $t('processDesigner.declarationEdgeHint') }}</Message>
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


  </StandardPage>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { SelectionMode, VueFlow, useVueFlow } from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputChips from 'primevue/inputchips';
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
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import PermissionEditor from '~/components/PermissionEditor.vue';
import {
  canvasToDefinition,
  compileProcessDefinition,
  compileTreeDeclarations,
  createProcessDesignerContract,
  DECLARATION_NODE_TYPES,
  declarationNodePorts,
  declarationWireLegality,
  definitionToCanvas,
  formatProcessType,
  getProcessNodeDefinition,
  migrateProcessDefinition,
  operationKindOf,
  PROCESS_DATAFLOW_VERSION,
  processSocketsCompatible,
  processType,
  resolveCatalogNodePorts,
  syncProcessNodeProducerOutputs,
  typeCatalogPaletteGroups
} from '~/packages/processes/src/index.js';
import { normalizeScreenContract, SCREEN_TEMPLATES, SCREEN_SOURCE_MODES, SCREEN_REGION_SLOTS, SCREEN_REGION_SURFACES, SCREEN_LINEAGE_BINDING_FIELDS } from '~/packages/processes/src/screen-contract.js';
import { cncDomain, cncUiSurfaces, cncPackContent } from '@cutkit/domain-cnc';
import { createTypeRegistry, checkDeclarationsAgainstCts, projectDomainFromView, renderPolicyFor, frameworkTypes, DECLARABLE_CLASSES, ON_REMOVE, OPERATOR_SPECIES, typeIdOf, setTypeBinding, normalizeType } from '~/packages/cts/src/index.js';
import ProcessNode from '~/components/process-designer/ProcessNode.vue';
import CtsTypeNode from '~/components/process-designer/CtsTypeNode.vue';
import ClassNode from '~/components/type-designer/TypeNode.vue';
import FieldNode from '~/components/type-designer/FieldNode.vue';
import DescriptorEditor from '~/components/type-designer/DescriptorEditor.vue';
import StateNode from '~/components/type-designer/StateNode.vue';
import ProcessScreenPreview from '~/components/process-designer/ProcessScreenPreview.vue';
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
import {
  defaultProcessNodeOperation,
  humanizeNodeLabel,
  iconForProcessNode,
  useProcessDesignerNodeRecords
} from '~/composables/useProcessDesignerNodeRecords.js';
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
const applyingProcess = ref(false);
const savingDraft = ref(false);
const creatingDraft = ref(false);
const savedDraftSignature = ref('');
const organizationRoles = ref({});
const canvasFrame = ref(null);
const compiledPreview = ref(null);
const compiledPreviewError = ref('');
const showGrantEditor = ref(false);
const grantEditorTarget = ref(null);
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
  inspectTab,
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
  resolveOutputs: record => catalogPorts(record).outputs,
  portForHandle,
  syncProcessNode
});
// CTS declaration layer: the palette, entity/field/status option lists, and
// compilation all derive from one source — the organization's type registry
// view (system pack extracted from the domain content plus authored types,
// stored by the cts-types feature). Authoring a type happens in the types
// pane (pages/organization/types.vue); the canvas composes instances.
const ctsOrgTypes = ref([]);
let ctsRegistryCache = null;

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
let designerCapabilities = null;

function resetCtsRegistry() {
  ctsRegistryCache = null;
  ctsDomainCache = null;
}

// One projection per registry generation: node syncing resolves ports
// against the same projected domain object instead of rebuilding it per
// node per pass.
let ctsDomainCache = null;
function ctsProjectedDomain() {
  if (!ctsDomainCache) {
    ctsDomainCache = projectDomainFromView(ctsRegistry(), activeOrganizationId(), cncDomain, {
      packServices: cncPackContent.services
    });
  }
  return ctsDomainCache;
}

// The registry view as the authoring catalog: class groups first (the
// palette IS the type system), labels/icons from render policy.
// The registry view as the authoring catalog, with constructibility: a
// type is drag-constructible only when it has a construction contract (org
// types synthesize one) — derived products (sheet designs, nesting runs)
// enter graphs as operator outputs, not constructs; framework/meta types
// (revisions, process definitions, machines) are configuration, never
// authorable instances. `via` carries the type's actual default
// constructor, not a blanket generic.
function ctsTypeView() {
  const domain = ctsProjectedDomain();
  return ctsRegistry().listTypes(activeOrganizationId())
    .filter(type => type.class !== 'party')
    .map(type => {
      const policy = renderPolicyFor(type);
      // Synthesized entities and construction are keyed by the type id —
      // the projection has no legacy casing variants.
      const construction = domain.construction?.[type.id] || null;
      const payload = type.payload?.mime ? ` · ${[].concat(type.payload.mime).join(', ')}` : '';
      const constructOperators = Object.values(type.operators || {})
        .filter(operator => operator.species === 'construct')
        .map(operator => operator.id);
      return {
        id: type.id,
        class: type.class,
        label: policy.label,
        icon: policy.icon,
        description: `${type.class} type${payload}`,
        constructible: Boolean(construction),
        via: construction?.defaultMode || (construction?.modes || [])[0] || 'genericCreate',
        constructOperators
      };
    });
}

// One joint: rebuild the designer option lists from the registry view.
// The services group and editor registry come from the mounted pack's
// operator registrations (SPEC §8/§21).
// The type catalog lives inside the Types group (SPEC §20/§21 L2):
// declaration authoring first, then one bound construct per
// constructible registry type plus one variant per declared construct
// operator.
function paletteWithTypeCatalog(contract) {
  const catalogItems = typeCatalogPaletteGroups(ctsTypeView())[0]?.items || [];
  return contract.paletteGroups.map(group => (
    group.id === 'types' ? { ...group, items: [...group.items, ...catalogItems] } : group
  ));
}

function refreshDesignerFromTypes() {
  const refreshed = createProcessDesignerContract(ctsProjectedDomain(), designerCapabilities, {
    editors: cncPackContent.editors
  });
  Object.assign(designer, refreshed);
  designer.paletteGroups = paletteWithTypeCatalog(refreshed);
}

const designerContract = createProcessDesignerContract(ctsProjectedDomain(), null, {
  editors: cncPackContent.editors
});
const designer = reactive({
  ...designerContract,
  paletteGroups: paletteWithTypeCatalog(designerContract)
});

// Graph protocol v5: canvas records speak the type system (cts.* species
// kinds, `type` ids, row paths). Kind matching and port resolution route
// through the canonical operation-kind mapping — one seam, no duplicated
// vocabulary; v4 records are identity through it.
const opKind = node => operationKindOf(node || {});
function isOpKind(node, kindOrPrefix) {
  const kind = opKind(node);
  return kindOrPrefix.endsWith('.') ? kind.startsWith(kindOrPrefix) : kind === kindOrPrefix;
}
// The record vocabulary seam (typeIdOf/setTypeBinding from @perigram/cts):
// v5 species records bind types through `typeId`, v4 records through
// `entityType`. No local re-derivation of the branch.
const nodeEntityType = node => typeIdOf(node || {});
function setNodeEntityType(node, entityType) {
  setTypeBinding(node, entityType);
}
function catalogPorts(record) {
  // v5 cts records go to the catalog RAW: the cts() ports wrapper resolves
  // the operation twin itself and owns the persistent type binding pin + the
  // declaration-only construct contract (no block substrate). Pre-resving
  // here would bypass it.
  return resolveCatalogNodePorts(record, catalogContext(record));
}

// A fresh declaration in the tree gets a suggested kebab id unique among
// registry types and in-tree declarations.
function suggestTreeTypeId() {
  const taken = new Set([...ctsTypeView().map(entry => entry.id), ...nodes.value.filter(node => node.type === 'ctsClass').map(node => node.data.typeId)]);
  let index = 1;
  while (taken.has(`type-${index}`)) index += 1;
  return `type-${index}`;
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

const sameTypeId = (a, b) => String(a || '').replace(/_/g, '-') === String(b || '').replace(/_/g, '-');
function setNodeBlocks(node, blocks) {
  if (v5Record(node)) node.slots = blocks;
  else node.blocks = blocks;
}
function v5Record(node = {}) {
  if (String(node?.kind || '').startsWith('cts.')) return true;
  if (node?.kind) return false;
  return (draft.value?.data?.graphProtocol || draft.value?.graphProtocol) === 5;
}

let treeOverlaySignature = '';

// The tree is LIVE authoring state, not a draft-to-apply detour: in-tree
// declarations overlay the registry view immediately, so a construct bound
// to a class node gains its field sockets the moment a Field node wires
// in — no apply round trip. APPLY persists the same declarations.
function treeOverlayDeclarations() {
  if (!nodes.value?.some(node => node.type === 'ctsClass')) return [];
  const { declarations } = compileTreeDeclarations(nodes.value, edges.value);
  return declarations;
}

function refreshTreeOverlay() {
  const signature = JSON.stringify(treeOverlayDeclarations());
  if (signature === treeOverlaySignature) return;
  treeOverlaySignature = signature;
  resetCtsRegistry();
  refreshDesignerFromTypes();
}

function ctsRegistry() {
  if (ctsRegistryCache) return ctsRegistryCache;
  const registry = createTypeRegistry({ id: 'designer-cts' });
  // System types: framework party declarations plus mounted pack types
  // (SPEC §21). No converted legacy entity tables.
  for (const declaration of [...frameworkTypes, ...cncPackContent.types]) {
    registry.defineType(declaration);
  }
  for (const declaration of ctsOrgTypes.value) {
    registry.defineType(declaration);
  }
  // Live tree declarations overlay the posted org types (same ids update
  // in place; invalid ones are skipped — save/apply surfaces them).
  for (const declaration of treeOverlayDeclarations()) {
    try {
      registry.defineType({ ...declaration, scope: 'org', organizationId: activeOrganizationId() });
    } catch {
      // invalid tree state: the declaration diagnostics own the report
    }
  }
  ctsRegistryCache = registry;
  return registry;
}


const {
  processNodeOperations,
  processNodeOperationLabels,
  createService,
  createSocket,
  createProcessNode,
  defaultEntityType
} = useProcessDesignerNodeRecords({
  designer,
  translate: key => t(key),
  syncProcessNode
});

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
  formatPreviewItem,
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
const managedProcessBlocks = new Set(['origin', 'status', 'provenance', 'summary']);

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
const serviceBillingModeOptions = [
  { label: t('processDesigner.serviceBillingNone'), value: 'none' },
  { label: t('processDesigner.serviceBillingPrepaidTokens'), value: 'prepaidTokens' }
];
const lifecycleModes = computed(() => [
  { label: t('processDesigner.lifecycleModeDefaultCreated'), value: 'defaultCreated' },
  { label: t('processDesigner.lifecycleModeDomainDefault'), value: 'domainDefault' },
  { label: t('processDesigner.lifecycleModeCustom'), value: 'custom' }
]);
function entityTypeLabelFor(entityType) {
  return entityTypeOptions.value.find(option => option.value === entityType)?.label || entityType || '';
}
function entityIconFor(entityType) {
  return cncUiSurfaces.find(surface => surface.entityType === entityType)?.icon || 'pi pi-box';
}
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
const dataMatchingOptions = ['longest', 'shortest', 'cross'].map(value => ({ label: t(`processDesigner.matching.${value}`), value }));
const artifactUploadKindOptions = computed(() => designer.attachmentKindOptions
  .filter(option => ['upload', 'capture', 'editor'].includes(option.creation?.mode)));
const accessLevelRank = { read: 1, write: 2, admin: 3 };
const defaultEdgeOptions = { type: 'default' };

const activeName = computed(() => draft.value?.identity?.name || '');
const isActiveProcess = computed(() => draft.value?.status?.state?.primary === 'ACTIVE');
const isDirty = computed(() => Boolean(draft.value) && designerSignature() !== savedDraftSignature.value);
const dockSeparator = { separator: true };
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
const selectedPrincipalRecord = computed(() => selectedPrincipalId.value ? servicePrincipals.value[selectedPrincipalId.value] : null);
const selectedScreenRecord = computed(() => selectedScreenId.value ? screens.value[selectedScreenId.value] : null);
const selectedScreenSource = computed(() => ensureSelectedScreenSource());
const selectedScreenRegion = computed(() => ensureSelectedScreenRegion());
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
const declarableClassOptions = DECLARABLE_CLASSES.map(classOf => ({ label: classOf, value: classOf }));
const declarationNodeTypes = DECLARATION_NODE_TYPES;
const onRemoveOptions = ON_REMOVE.map(value => ({ label: value, value }));
const selectedDeclarationEdge = computed(() => edges.value.find(edge => edge.id === selectedEdgeId.value && edge.role === 'type') || null);
const classPayloadMimeValues = computed({
  get: () => {
    const node = selectedNode.value;
    return node?.data?.payload ? [].concat(node.data.payload.mime || []) : [];
  },
  set: values => updateClassPayload({ mime: values })
});
function updateClassPayload(changes) {
  const node = selectedNode.value;
  if (!node || node.type !== 'ctsClass') return;
  const next = { ...(node.data.payload || {}), ...changes };
  node.data.payload = next.mime?.length ? next : null;
  syncNodeData();
}
const classOperators = computed(() => (selectedNode.value?.type === 'ctsClass' ? selectedNode.value.data.operators || [] : []));
const operatorSpeciesOptions = OPERATOR_SPECIES.map(species => ({ label: species, value: species }));
function addClassOperator() {
  const node = selectedNode.value;
  if (!node || node.type !== 'ctsClass') return;
  node.data.operators ||= [];
  let index = node.data.operators.length + 1;
  const taken = new Set(node.data.operators.map(operator => operator.id));
  while (taken.has(`${node.data.typeId || 'op'}-${index}`)) index += 1;
  node.data.operators.push({ id: `${node.data.typeId || 'op'}-${index}`, species: 'construct', input: null, output: null, triggers: [] });
  syncNodeData();
}
function updateClassOperator(index, changes) {
  const node = selectedNode.value;
  if (!node) return;
  node.data.operators[index] = { ...node.data.operators[index], ...changes };
  syncNodeData();
}
function removeClassOperator(index) {
  const node = selectedNode.value;
  if (!node) return;
  node.data.operators.splice(index, 1);
  syncNodeData();
}
function updateClassOperatorTrigger(operatorIndex, triggerIndex, trigger) {
  const node = selectedNode.value;
  if (!node) return;
  const triggers = [...(node.data.operators[operatorIndex].triggers || [])];
  triggers[triggerIndex] = trigger;
  updateClassOperator(operatorIndex, { triggers });
}
function updateClassOperatorTriggerValue(operatorIndex, triggerIndex, value) {
  const trigger = (selectedNode.value?.data?.operators?.[operatorIndex]?.triggers || [])[triggerIndex] || {};
  updateClassOperatorTrigger(operatorIndex, triggerIndex, trigger.event !== undefined ? { event: value } : { schedule: value });
}
function removeClassOperatorTrigger(operatorIndex, triggerIndex) {
  const node = selectedNode.value;
  if (!node) return;
  const triggers = [...(node.data.operators[operatorIndex].triggers || [])];
  triggers.splice(triggerIndex, 1);
  updateClassOperator(operatorIndex, { triggers });
}
const payloadPreviewOptions = [
  { label: 'attachment', value: 'attachment' },
  { label: 'none', value: 'none' }
];
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
const fieldOptionsForSelectedSocket = computed(() => fieldOptions(selectedSocketRecord.value?.entityType));
const serviceList = computed(() => Object.values(draft.value?.data?.services || {}));
const socketList = computed(() => Object.values(draft.value?.data?.sockets || {}));
const selectedSocketId = ref('');
const selectedSocketRecord = computed(() => draft.value?.data?.sockets?.[selectedSocketId.value] || socketList.value[0] || null);
const selectedEntityAvailable = computed(() => Boolean(selectedEntity.value?.producerOutputId));
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
  const command = cncDomain.commands?.[node.commandId];
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
const selectedRoleGrantPermissions = computed(() => Object.fromEntries((draft.value?.data?.roleGrants?.[selectedRoleId.value] || [])
  .reduce((entries, grant) => {
    if (!entries.has(grant.feature)) entries.set(grant.feature, []);
    entries.get(grant.feature).push(withoutKeys(grant, ['feature']));
    return entries;
  }, new Map())));
const grantEditorPermissions = computed(() => {
  const target = grantEditorTarget.value;
  if (!target?.feature) return {};
  const grant = grantForEditorTarget(target);
  return { [target.feature]: [withoutKeys(grant || { level: 'read' }, ['roleId', 'feature'])] };
});
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

// Touch hosts have no pan-activation key: one-finger pane drag pans while
// nodes stay draggable; mouse hosts keep the Space-activated precision pan.
const touchPanDrag = ref(false);
let touchPointerQuery = null;

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
  resolveEntityBinding: resolveEntityInputType
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
  $fetch('/api/admin/cts/types')
    .then(response => {
      // The registry seeds system types from the converted domain pack; only
      // the org's stored declarations may overlay (defining a bundle-shaped
      // system record over the pack would drift the client view from the
      // server registry).
      ctsOrgTypes.value = (response.types || []).filter(type => type.scope === 'org');
      resetCtsRegistry();
      refreshDesignerFromTypes();
    })
    .catch(() => { /* the designer keeps compiling without the type store */ });
  window.addEventListener('keydown', handleCanvasKeydown);
  touchPointerQuery = window.matchMedia?.('(pointer: coarse)') || null;
  touchPanDrag.value = Boolean(touchPointerQuery?.matches);
  touchPointerQuery?.addEventListener?.('change', syncTouchPanDrag);
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleCanvasKeydown);
  if (previewRecomputeTimer) clearTimeout(previewRecomputeTimer);
  touchPointerQuery?.removeEventListener?.('change', syncTouchPanDrag);
  touchPointerQuery = null;
});

function syncTouchPanDrag() {
  touchPanDrag.value = Boolean(touchPointerQuery?.matches);
}

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

async function loadProcessCapabilities() {
  try {
    const response = await $fetch('/api/admin/domain');
    const capabilities = response?.processCapabilities || null;
    if (!capabilities) return;
    designerCapabilities = capabilities;
    refreshDesignerFromTypes();
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

// Declarations authored in the tree compile into registry types before the
// process saves (SPEC §20/§21: one tree, declarations are nodes). The pure
// compile lives in @cutkit/processes (compileTreeDeclarations): fields,
// states, transitions with intents, children edges with onRemove. Valid
// declarations post to the registry; named diagnostics surface as errors
// without blocking — activation still fails closed through
// checkDeclarationsAgainstCts and the registry compile. After the registry
// refresh, canvas nodes re-sync so constructs bound to just-authored types
// immediately gain their typed row-field sockets. This runs on APPLY, not
// on save: saving persists the tree with the draft; applying compiles it.
async function persistTreeDeclarations() {
  const hasClasses = nodes.value.some(node => node.type === 'ctsClass');
  if (!hasClasses) return;
  const { declarations, diagnostics } = compileTreeDeclarations(nodes.value, edges.value);
  if (diagnostics.length) {
    toast.add({ severity: 'error', summary: t('processDesigner.declarationErrors'), detail: diagnostics.join('; '), life: 8000 });
  }
  const failures = [];
  for (const declaration of declarations) {
    try {
      await $fetch('/api/admin/cts/types', { method: 'POST', body: declaration });
    } catch (error) {
      failures.push(`${declaration.id}: ${error?.data?.message || error?.message}`);
    }
  }
  if (failures.length) {
    // A declaration that cannot land in the registry is a broken apply:
    // stop here with the real cause instead of letting validation report
    // downstream phantoms ("unknown type ...").
    for (const failure of failures) {
      toast.add({ severity: 'error', summary: t('processDesigner.declarationErrors'), detail: failure, life: 10000 });
    }
    return { failures };
  }
  ctsOrgTypes.value = (await $fetch('/api/admin/cts/types')).types.filter(type => type.scope === 'org');
  resetCtsRegistry();
  refreshDesignerFromTypes();
  syncNodeData();
  return { failures: [] };
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


async function activateDraft() {
  await saveDraft();
  // Apply compiles the app: tree declarations land in the registry first,
  // so validation and activation see the types the graph references. A
  // failed declaration post aborts the apply with its real cause.
  const posted = await persistTreeDeclarations();
  if (posted.failures.length) return;
  const result = await persistence.validateDraft(draft.value._id);
  validation.value = result;
  if (!result.ok) {
    focusFirstValidationDiagnostic(result);
    const failure = new Error(result.errors?.[0] || t('processDesigner.validationFailed'));
    failure.data = result;
    throw failure;
  }
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
      warnings: [],
      ...(error?.data?.diagnostics ? { diagnostics: error.data.diagnostics } : {})
    };
    focusFirstValidationDiagnostic(validation.value);
    toast.add({ severity: 'error', summary: t('processDesigner.apply'), detail: message, life: 5000 });
  } finally {
    applyingProcess.value = false;
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
          ? { typeId: suggestTreeTypeId(), class: classOf || 'file', scope: 'tree', label: '', payload: null, fields: 0, states: 0 }
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

function handleDesignerPointerDown(event) {
  canvasKeyboardActive.value = Boolean(event.target?.closest?.('.vue-flow'));
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
  const existingPorts = catalogPorts(existingRecord);
  const candidatePorts = catalogPorts(candidate);
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
  const candidatePorts = catalogPorts(candidate);
  const existingNode = nodes.value.find(value => value.id === socket.nodeId);
  const existingRecord = draft.value?.data?.processNodes?.[existingNode?.data?.refId];
  const existingPorts = catalogPorts(existingRecord);
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
    return portForHandle(
      catalogPorts(record).outputs,
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
    compiledPreview.value = compileProcessDefinition(
      processDefinitionSnapshot(),
      projectDomainFromView(ctsRegistry(), activeOrganizationId(), cncDomain),
      { roles: organizationRoles.value }
    );
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
  if (node.type === 'processNode') {
    applyInferredProcessNodeInputs(record, node);
    syncProcessNode(record);
  }
  if (DECLARATION_NODE_TYPES.includes(node.type)) syncDeclarationRecord(record, node);

  const isProcessNode = node.type === 'processNode';
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
  if (node.type === 'ctsClass') return node.data?.typeId || '';
  if (node.type === 'ctsField') return node.data?.name || '';
  if (node.type === 'ctsState') return node.data?.value || '';
  if (node.type === 'ctsType') return node.data?.typeId || 'type';
  return nodeDisplayLabel(record, node);
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

function ensureSelectedScreenSource() {
  return selectedScreenRecord.value ? screenEditing.ensureSource(selectedScreenRecord.value) : {};
}

function ensureSelectedScreenRegion() {
  return selectedScreenRecord.value ? screenEditing.ensureRegion(selectedScreenRecord.value) : {};
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


function constructionContractForEntity(entityType) {
  return designer.construction(entityType) || {};
}

function syncProcessNode(node = {}) {
  node.kind ||= 'source.literalItem';
  const op = opKind(node);
  if (node.kind === 'cts.field') {
    delete node.entityType;
    delete node.fieldSchema;
    delete node.fieldSchemas;
  }
  if (op === 'collection.sort') {
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
  if (op === 'source.literalItem' && node.type?.base === 'entityRef') {
    node.entityType ||= defaultEntityType();
    node.type.entityType = node.entityType;
    if (node.value?.id) node.value = { ...node.value, type: node.entityType };
  }
  delete node.retry;
  if (op.startsWith('effect.')) {
    node.trigger ||= { mode: 'manual' };
    if (!['manual', 'event'].includes(node.trigger.mode)) node.trigger.mode = 'event';
    node.access = normalizeDesignerAccess(node.access);
    node.entryTriggerId = node.id;
  }
  if (['effect.createEntity', 'effect.runProducer'].includes(op)) {
    syncProcessNodeConstruction(node);
    node.status ||= {};
    node.status.to ||= initialStatusForEntity(nodeEntityType(node));
  }
  if (node.kind === 'cts.field') {
    // The projection gate: an unbound record offers only its entity input;
    // a bound one defaults its path to the type's first readable field.
    const bound = nodeEntityType(node);
    const available = bound
      ? designer.fieldsForEntity(bound).filter(field => field.readable !== false)
      : [];
    if (!available.some(field => field.value === node.path)) node.path = available[0]?.value || '';
  } else {
    node.path = '';
  }
  delete node.fieldSchema;
  if (isOpKind(node, 'read.related')) {
    const relations = relationOptionsForEntity(nodeEntityType(node));
    if (!relations.some(relation => relation.value === node.relationKey)) node.relationKey = relations[0]?.value || '';
  }
  if (op === 'effect.createEntity') {
    setNodeBlocks(node, constructibleEntityBlocks(nodeEntityType(node)));
    node.fields = [];
  }
  node.label = node.kind;
  node.inputs = processNodeInputs(node);
  node.outputs = processNodeOutputs(node);
  syncProcessNodeProducerOutputs(draft.value.data, node);
  node.inputDefaults ||= {};
  const inputIds = new Set(node.inputs.map(input => input.id));
  for (const inputId of Object.keys(node.inputDefaults)) {
    if (!inputIds.has(inputId)) delete node.inputDefaults[inputId];
  }
}

function syncProcessNodeConstruction(node = {}) {
  const contract = constructionContractForEntity(nodeEntityType(node));
  const modes = contract.modes?.length ? contract.modes : ['genericCreate'];
  node.construction ||= {};
  // a v5 record via field (palette preset or binding) names the authored mode
  if (!node.construction.mode && node.via && modes.includes(node.via)) {
    node.construction.mode = node.via;
  }
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


function processNodeOperationOptions(kind = '') {
  const record = typeof kind === 'object' ? kind : { kind };
  // v5 species records have no operation switch: the species IS the
  // operation (SPEC §20 vocabulary).
  if (String(record.kind || '').startsWith('cts.')) return [];
  const operations = processNodeOperations[record.kind] || [];
  return operations.map(value => ({ label: processNodeOperationLabels[value] || value, value }));
}

// The field projection's path choices: the bound type's readable fields.
// Unbound, a cts.field offers no paths (only its entity input).
function processNodeFieldOptions(node = {}) {
  if (node.kind !== 'cts.field') return [];
  const bound = nodeEntityType(node);
  if (!bound) return [];
  return designer.fieldsForEntity(bound)
    .filter(field => field.readable !== false)
    .map(field => ({
      label: field.i18n ? `${t(field.i18n)} · ${field.value}` : field.label,
      value: field.value,
      type: field.type
    }));
}

// Status fallback choices for an effect's typed status input: the bound
// type's declared top-level states (the domain lifecycle the compiler and
// the status engine resolve against).
function processStatusOptionsFor(node = {}) {
  const entityType = nodeEntityType(node);
  if (!entityType) return [];
  const workflow = designer.domain.workflows?.[entityType];
  const region = workflow?.regions?.[workflow.primaryRegion] || Object.values(workflow?.regions || {})[0];
  if (!region) return [];
  return Object.entries(region.states || {})
    .filter(([key]) => !key.includes('.'))
    .map(([key, state]) => ({ label: state.label || key, value: key }));
}

function processNodeInputs(node = {}) {
  return catalogPorts(node).inputs
    .map(port => ({ ...port, label: processPortLabel(node, port) }));
}

function processNodeOutputs(node = {}) {
  return catalogPorts(node).outputs
    .map(port => ({ ...port, label: processPortLabel(node, port) }));
}

function catalogContext(node = {}) {
  // cts.field resolves its field against the bound type; everything else
  // resolves entity fields by its own binding when present.
  const bound = nodeEntityType(node);
  const fields = node.kind === 'cts.field' || bound
    ? designer.fieldsForEntity(bound)
    : [];
  return {
    fieldSchema: fields.find(field => field.value === node.path) || null,
    fieldSchemas: fields,
    command: designer.domain.commands?.[node.commandId] || null,
    domain: ctsProjectedDomain()
  };
}

function connectedProcessInputIds(graphNode = {}, record = {}) {
  const inputs = catalogPorts(record).inputs;
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
  const showsType = node.kind?.startsWith('source.')
    || node.kind?.startsWith('value.')
    || node.kind?.startsWith('collection.')
    || node.kind?.startsWith('tree.');
  return [
    nodeEntityType(node),
    node.path,
    showsType && node.type ? formatProcessType(node.type) : '',
    isOpKind(node, 'collection.sort') ? node.direction : node.operation
  ].filter(Boolean).join(' · ');
}

// The construct's accepted canonical blocks (record data consumed by
// compilation; the cts construct surface itself exposes row-field sockets).
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

function processEntityTypeOptions(node = {}) {
  const kind = opKind(node);
  if (kind === 'effect.createEntity' || kind === 'effect.runProducer') return designer.createEntityOptions;
  if (kind === 'effect.updateEntity') return designer.updateEntityOptions;
  if (kind === 'effect.changeStatus') return designer.changeStatusOptions;
  if (kind === 'effect.archiveEntity') return designer.archivableEntityOptions;
  if (kind === 'effect.deleteEntity') return designer.deleteEntityOptions;
  if (kind === 'read.queryEntities' || kind === 'read.children') return designer.listableEntityOptions;
  if (kind.startsWith('read.')) return designer.readableEntityOptions;
  return entityTypeOptions.value;
}

function relationOptionsForEntity(entityType = '') {
  return (designer.domain.relations || [])
    .filter(relation => relation.ownerType === entityType)
    .map(relation => ({
      label: `${relation.key} · ${relation.targetType} · ${relation.cardinality}`,
      value: relation.key
    }));
}

function relationForNode(node = {}) {
  return (designer.domain.relations || []).find(relation => (
    sameTypeId(relation.ownerType, nodeEntityType(node)) && relation.key === node.relationKey
  ));
}

function declaredRelationsForProfile(profile = {}) {
  const keys = new Set(profile.relations || []);
  return (designer.domain.relations || []).filter(relation => relation.ownerType === profile.entityType && keys.has(relation.key));
}

function declaredRelationsForEntity(entityType = '') {
  const keys = new Set(Object.values(draft.value?.data?.producerOutputs || {})
    .filter(output => output.entityType === entityType)
    .flatMap(output => output.relations || []));
  if (!keys.size) return [];
  return (designer.domain.relations || []).filter(relation => relation.ownerType === entityType && keys.has(relation.key));
}

function processNodeDisplayLabel(node = {}) {
  if (node.label && node.label !== node.kind) return node.label;
  if (['value.cast', 'value.parse', 'value.convertUnit', 'value.toEntityRef', 'value.toJson'].includes(node.kind)) {
    return t('processDesigner.automaticConversion', { type: node.type ? formatProcessType(node.type) : '' });
  }
  // The bound type decides the catalog item: a bare species record must
  // not borrow the first catalog entry's label (the type catalog leads
  // the palette, so items[0] is always a pre-bound variant).
  const boundType = node.typeId || node.entityType || '';
  const items = designer.paletteGroups.flatMap(group => group.items)
    .filter(candidate => candidate.kind === node.kind)
    .filter(candidate => !candidate.preset?.typeId || candidate.preset.typeId === boundType);
  const item = items.find(candidate => candidate.preset?.select && candidate.preset.select === node.select)
    || items[0];
  if (item) return paletteLabel(item);
  // Catalog-only kinds (migrated block composition) label from the catalog
  // definition, not the raw kind string.
  const definition = getProcessNodeDefinition(node.kind);
  return definition ? humanizeNodeLabel(definition.label || node.kind) : humanizeNodeLabel(node.kind || '');
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


function initialStatusForEntity(entityType) {
  const workflow = designer.domain.workflows?.[entityType];
  if (!workflow) return '';
  const region = workflow.regions?.[workflow.primaryRegion] || Object.values(workflow.regions || {})[0];
  return region?.initial || '';
}


function nodeDisplayLabel(record = {}, node = {}) {
  return record.label || record.entityType || record.commandId || node.data?.label || '';
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

function normalizeAccessLevel(level) {
  return ['read', 'write', 'admin'].includes(level) ? level : 'write';
}

function normalizeDesignerAccess(access = {}) {
  const level = normalizeAccessLevel(access?.level);
  const grants = Array.isArray(access?.grants)
    ? access.grants
        .filter(grant => grant?.roleId)
        .map(grant => ({ ...grant, roleId: grant.roleId, level: normalizeAccessLevel(grant.level || level) }))
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

// Declaration authoring state persists in `ctsTypes` records with the
// draft (SPEC §20/§21 one tree): saving keeps the nodes, activation
// compiles them into registry declarations.
function syncDeclarationRecord(record = {}, node = {}) {
  record.kind = { ctsClass: 'class', ctsField: 'field', ctsState: 'state', ctsType: 'type' }[node.type] || record.kind;
  if (node.type === 'ctsClass') {
    record.typeId = node.data.typeId || '';
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

function setSelectedProcessNodeGrants(grants) {
  if (!selectedProcessNode.value?.id) return;
  updateProcessNodeRecord(selectedProcessNode.value.id, {
    access: {
      ...(selectedProcessNode.value.access || {}),
      grants
    }
  });
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

function fieldOptions(entityType) {
  return designer.fieldsForEntity(entityType);
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
        targetRecord: targetRecord
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
        const inputs = resolveCatalogNodePorts(targetRecord, catalogContext(targetRecord)).inputs;
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
    // other record-owning canvas nodes (value inputs, entity profiles,
    // sockets, status definitions into records) participate through their
    // typed specs
    const sourceSpecs = source.data?.outputSpecs || [];
    const targetSpecs = target.data?.inputSpecs || [];
    if (sourceSpecs.length && targetSpecs.length) {
      const sourcePort = portForHandle(sourceSpecs, connection.sourceHandle, 'output') || sourceSpecs[0];
      const targetPort = portForHandle(targetSpecs, connection.targetHandle, 'input') || targetSpecs[0];
      return {
        ...processSocketsCompatible(sourcePort, targetPort),
        source: sourcePort,
        target: targetPort
      };
    }
    return { ok: false, reason: 'Only current operation nodes can be connected' };
  }
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

function socketHandleIdForRecord(kind, item, index, items) {
  if (items.length === 1) return kind;
  return `${kind}:${item.id || index}`;
}


</script>
