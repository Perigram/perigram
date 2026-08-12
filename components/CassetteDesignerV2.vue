<template>
  <DesignerSurface
    class="relative gap-3"
    @keydown.esc.capture="handleDesignerEscape"
  >
    <div
      v-if="showOnboardingRail"
      class="absolute z-[140] w-80 rounded-ui border border-content-border bg-content p-3 [box-shadow:var(--ck-shadow-overlay)]"
      :class="onboardingCalloutClass"
    >
      <span
        class="absolute h-3 w-3 rotate-45 border border-content-border bg-content"
        :class="onboardingChevronClass"
        aria-hidden="true"
      />
      <div class="relative flex min-w-0 flex-col gap-2">
        <div class="flex min-w-0 items-start justify-between gap-2">
          <div class="flex min-w-0 flex-col">
            <strong>{{ $t(activeOnboardingStep.titleKey) }}</strong>
            <small class="text-muted-color">{{ $t(activeOnboardingStep.bodyKey) }}</small>
          </div>
          <Button icon="pi pi-times" severity="secondary" text rounded size="small" :aria-label="$t('common.close')" @click="dismissOnboarding" />
        </div>
        <div class="flex items-center justify-between gap-2">
          <Tag :value="`${onboardingIndex + 1}/${onboardingSteps.length}`" severity="secondary" size="small" />
          <div class="flex items-center gap-1">
            <Button icon="pi pi-angle-left" severity="secondary" text rounded size="small" :disabled="onboardingIndex === 0" :aria-label="$t('common.back')" @click="previousOnboardingStep" />
            <Button icon="pi pi-angle-right" severity="secondary" text rounded size="small" :disabled="onboardingIndex >= onboardingSteps.length - 1" :aria-label="$t('common.next')" @click="nextOnboardingStep" />
          </div>
        </div>
      </div>
    </div>

    <DesignerWorkspace layout="lanes" class="min-h-0 flex-1">
      <template #toolbar>
        <header
          class="flex min-w-0 flex-wrap items-center gap-2 border-b border-content-border bg-chrome px-2 py-1 text-[var(--ck-chrome-foreground)]"
          data-cassette-designer-toolbar
        >
          <InputText
            v-model="cassetteNameDraft"
            :placeholder="$t('cassette.name')"
            class="min-w-48 flex-1"
          />
          <Tag :value="documentProfileLabel" severity="secondary" size="small" />
          <Tag :value="documentUnits" severity="secondary" size="small" />
          <Tag
            :value="$t(isModified ? 'cassette.v2.unsaved' : 'cassette.v2.saved')"
            :severity="isModified ? 'warn' : 'secondary'"
            size="small"
            data-cassette-designer-save-state
          />
          <Select
            :model-value="null"
            :options="templateOptions"
            option-label="label"
            option-value="value"
            entity-type="cassette"
            :placeholder="$t('cassette.v2.loadTemplate')"
            class="min-w-44"
            @update:model-value="value => emit('load-template', value)"
          />
          <div class="flex items-center gap-1">
            <Button
              :label="$t('common.save')"
              icon="pi pi-save"
              size="small"
              :loading="savingTemplate"
              :disabled="savingTemplate || (selectedTemplateIsPersisted && !isModified)"
              @click="saveTemplate"
            />
            <Button
              icon="pi pi-copy"
              severity="secondary"
              text
              rounded
              size="small"
              :loading="savingTemplate"
              :disabled="savingTemplate"
              :aria-label="$t('common.saveAs')"
              v-tooltip.bottom="$t('common.saveAs')"
              @click="saveTemplate({ saveAs: true })"
            />
            <Button
              icon="pi pi-refresh"
              severity="secondary"
              text
              rounded
              size="small"
              :aria-label="$t('common.reset')"
              v-tooltip.bottom="$t('common.reset')"
              @click="requestResetTree"
            />
          </div>
        </header>
      </template>
      <template #palette>
      <aside class="order-3 flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-ui border border-content-border bg-content p-3 lg:col-span-2 xl:order-1 xl:col-span-1">

      <Message v-if="sessionDraftAvailable" severity="info" size="small" :closable="false">
        <div class="flex flex-col gap-2">
          <span>{{ $t('cassette.v2.autosaveDraftAvailable') }}</span>
          <div class="flex flex-wrap gap-1">
            <Button :label="$t('cassette.v2.recoverDraft')" size="small" @click="recoverSessionDraft" />
            <Button :label="$t('cassette.v2.discardDraft')" severity="secondary" text size="small" @click="discardSessionDraft" />
          </div>
        </div>
      </Message>

      <Tabs v-model:value="activeSideTab" class="min-w-0" data-cassette-designer-settings-tabs>
        <TabList>
          <Tab v-for="tab in sideTabs" :key="tab.value" :value="tab.value">
            <i :class="tab.icon" aria-hidden="true" />
            <span>{{ $t(tab.labelKey) }}</span>
          </Tab>
        </TabList>
      </Tabs>

      <div v-if="activeSideTab === 'parameters'" class="flex min-h-0 min-w-0 flex-col gap-3 overflow-auto">
        <div class="flex items-center justify-between gap-2">
          <strong>{{ $t('cassette.v2.globalParameters') }}</strong>
          <Button
            icon="pi pi-plus"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="$t('common.add')"
            v-tooltip.top="$t('common.add')"
            @click="addGlobalParameter"
          />
        </div>
        <div class="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-1">
          <div v-for="parameter in globalParameterEntries" :key="parameter.key" class="flex min-w-0 flex-col gap-1">
            <div class="flex items-center justify-between gap-2">
              <label class="font-mono">{{ parameter.key }}</label>
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :aria-label="$t('common.delete')"
                :disabled="usedParameterNames.has(parameter.key)"
                v-tooltip.top="$t('common.delete')"
                @click="deleteGlobalParameter(parameter.key)"
              />
            </div>
            <CassetteExpressionEditor
              :model-value="parameter.value"
              :parameters="expressionParametersForGlobal(parameter.key)"
              :parameter-names="expressionParameterNamesForGlobal(parameter.key)"
              @update:model-value="value => updateGlobalParameter(parameter.key, value)"
            />
          </div>
        </div>
      </div>

      <div v-else-if="activeSideTab === 'layers'" class="flex min-h-0 flex-col gap-3">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <i class="pi pi-list text-muted-color" aria-hidden="true" />
            <strong class="truncate">{{ $t('common.layers') }}</strong>
            <Tag :value="visibleLayerSummary" severity="secondary" size="small" />
          </div>
          <div class="flex items-center gap-1">
            <Button
              icon="pi pi-eye"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="$t('drawing.showAllLayers')"
              :disabled="allLayersVisible"
              v-tooltip.top="$t('drawing.showAllLayers')"
              @click="showAllLayers"
            />
            <Button
              icon="pi pi-eye-slash"
              text
              rounded
              size="small"
              severity="secondary"
              :aria-label="$t('drawing.hideAllLayers')"
              :disabled="visibleLayerNames.length === 0"
              v-tooltip.top="$t('drawing.hideAllLayers')"
              @click="hideAllLayers"
            />
          </div>
        </div>

        <ScrollPanel class="min-h-0 flex-1 rounded-ui border border-content-border">
          <div class="flex flex-col">
            <div
              v-for="row in layerRows"
              :key="row.key"
              class="flex items-start gap-3 border-b border-content-border px-3 py-3 last:border-b-0"
            >
              <Checkbox
                :model-value="visibleLayerNames"
                :value="row.layer.name"
                :inputId="layerInputId(row.layer)"
                size="small"
                class="mt-1"
                @update:model-value="updateVisibleLayerNames"
              />
              <div class="flex min-w-0 flex-1 flex-col gap-2">
                <label :for="layerInputId(row.layer)" class="min-w-0">
                  <IdentityBlock :entity="row.sourceEntity" variant="compact" :fields="row.layer.standardCode ? ['slug'] : []" />
                </label>
                <LayerStandardCard v-if="row.standard" :standard="row.standard" variant="inline" />
                <PenTemplateCard v-if="row.pen" :pen="row.pen" variant="inline" />
              </div>
            </div>
          </div>
        </ScrollPanel>
      </div>

      <div v-else class="flex min-h-0 flex-col gap-2">
        <Textarea :model-value="occsJson" readonly rows="22" class="min-h-0 w-full flex-1 font-mono text-xs" />
      </div>
      </aside>
      </template>

      <section ref="editorSurfaceRef" class="relative order-1 min-h-0 min-w-0 overflow-hidden xl:order-2">
      <DrawingCanvas
        :source="drawingCanvasSource"
        source-type="geometry-preview"
        mode="designer"
        :visible-layer-names="visibleLayerNames"
        :selected-designer-face-id="selectedDesignerFaceId"
        :designer-selectable-workpiece-ids="designerSelectableWorkpieceIds"
        :show-designer-workpiece-context="showDesignerWorkpieceContext"
        @ready="handleDrawingReady"
        @layer-toggle="updateVisibleLayerNames"
        @designer-action="handleDesignerAction"
        @designer-face-select="handleDesignerFaceSelect"
        @designer-fold-select="handleDesignerFoldSelect"
        @designer-face-command="handleDesignerFaceCommand"
        @designer-point-edit="handleDesignerPointEdit"
        @designer-section-edit="handleDesignerSectionEdit"
        @designer-fold-angle-edit="handleDesignerFoldAngleEdit"
      />
      <div class="absolute left-3 top-3 z-[80] flex gap-1 rounded-ui border border-content-border bg-content p-1 [box-shadow:var(--ck-shadow-overlay)]">
        <Button
          icon="pi pi-undo"
          severity="secondary"
          text
          rounded
          size="small"
          :disabled="!canUndo"
          :aria-label="$t('common.undo')"
          v-tooltip.bottom="$t('common.undo')"
          @click="undoDesignerChange"
        />
        <Button
          icon="pi pi-replay"
          severity="secondary"
          text
          rounded
          size="small"
          :disabled="!canRedo"
          :aria-label="$t('common.redo')"
          v-tooltip.bottom="$t('common.redo')"
          @click="redoDesignerChange"
        />
      </div>
      <div
        v-if="inlineEditor"
        class="absolute z-[120] min-w-64 rounded-ui border border-content-border bg-content p-2 [box-shadow:var(--ck-shadow-overlay)]"
        :style="{ left: `${inlineEditor.x}px`, top: `${inlineEditor.y}px` }"
        tabindex="-1"
        @keydown.enter.stop.prevent="closeInlineEditor"
        @keydown.esc.stop.prevent="closeInlineEditor"
      >
        <div v-if="inlineEditor.type === 'faceActions'" class="flex flex-col gap-2">
          <div class="flex cursor-move items-center gap-1" @mousedown.prevent="startInlineEditorDrag">
            <Select
              :model-value="inlineEditorFaceRole"
              :options="faceRoleOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.faceRole')"
              @mousedown.stop
              @update:model-value="value => updateFaceRole(inlineEditor.nodeId, value)"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              size="small"
              :aria-label="$t('common.close')"
              @mousedown.stop
              @click="closeInlineEditor"
            />
          </div>
          <Button
            v-if="inlineEditorNode?.parentId"
            icon="pi pi-trash"
            :label="$t('cassette.v2.deleteFace')"
            severity="danger"
            size="small"
            @click="deleteFaceNode(inlineEditor.nodeId)"
          />
        </div>
        <div v-else-if="inlineEditor.type === 'attachment' && inlineEditorRelation" class="flex w-96 flex-col gap-2">
          <div class="flex cursor-move items-center gap-1" @mousedown.prevent="startInlineEditorDrag">
            <Select
              :model-value="inlineEditorRelation.targetFaceId"
              :options="targetFaceOptions"
              option-label="label"
              option-value="value"
              class="min-w-0 flex-1"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.targetFace')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.targetFace')"
              @mousedown.stop
              @update:model-value="value => updateInlineAttachmentRelation({ targetFaceId: value })"
            />
            <Select
              :model-value="inlineEditorRelation.sourceFaceId"
              :options="sourceFaceOptions"
              option-label="label"
              option-value="value"
              class="min-w-0 flex-1"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.sourceFace')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.sourceFace')"
              @mousedown.stop
              @update:model-value="value => updateInlineAttachmentRelation({ sourceFaceId: value })"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              size="small"
              :aria-label="$t('common.close')"
              @mousedown.stop
              @click="closeInlineEditor"
            />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <Select
              :model-value="inlineEditorRelation.targetSnap"
              :options="snapOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.targetSnap')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.targetSnap')"
              @update:model-value="value => updateInlineAttachmentRelation({ targetSnap: value })"
            />
            <Select
              :model-value="inlineEditorRelation.sourceSnap"
              :options="snapOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.sourceSnap')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.sourceSnap')"
              @update:model-value="value => updateInlineAttachmentRelation({ sourceSnap: value })"
            />
            <label class="flex min-w-0 flex-col gap-1 text-xs text-muted-color" v-tooltip.top="$t('cassette.v2.attachmentFields.edgeMargin')">
              <span class="truncate">{{ $t('cassette.v2.attachmentFields.edgeMargin') }}</span>
              <CassetteExpressionEditor
                :model-value="inlineEditorRelation.offsetX"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                @update:model-value="value => updateInlineAttachmentRelation({ offsetX: value })"
              />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-xs text-muted-color" v-tooltip.top="$t('cassette.v2.attachmentFields.normalOffset')">
              <span class="truncate">{{ $t('cassette.v2.attachmentFields.normalOffset') }}</span>
              <CassetteExpressionEditor
                :model-value="inlineEditorRelation.offsetY"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                @update:model-value="value => updateInlineAttachmentRelation({ offsetY: value })"
              />
            </label>
            <label class="flex min-w-0 flex-col gap-1 text-xs text-muted-color" v-tooltip.top="$t('cassette.v2.attachmentFields.rotation')">
              <span class="truncate">{{ $t('cassette.v2.attachmentFields.rotation') }}</span>
              <CassetteExpressionEditor
                :model-value="inlineEditorRelation.rotation"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                @update:model-value="value => updateInlineAttachmentRelation({ rotation: value })"
              />
            </label>
            <Select
              :model-value="inlineEditorRelation.targetSide"
              :options="sideOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.side')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.side')"
              @update:model-value="value => updateInlineAttachmentRelation({ targetSide: value })"
            />
            <Select
              :model-value="inlineEditorRelation.placementMode"
              :options="placementModeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.placementMode')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.placementMode')"
              @update:model-value="value => updateInlineAttachmentRelation({ placementMode: value })"
            />
            <Select
              v-if="inlineEditorRelation.placementMode === 'edgeArray'"
              :model-value="inlineEditorRelation.arrayEdge"
              :options="edgeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.arrayEdge')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.arrayEdge')"
              @update:model-value="value => updateInlineAttachmentRelation({ placementMode: 'edgeArray', arrayEdge: value })"
            />
            <Select
              v-if="inlineEditorRelation.placementMode === 'edgeArray'"
              :model-value="inlineEditorRelation.arrayMode"
              :options="arrayModeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.arrayMode')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.arrayMode')"
              @update:model-value="value => updateInlineAttachmentRelation({ placementMode: 'edgeArray', arrayMode: value })"
            />
            <label
              v-if="inlineEditorRelation.placementMode === 'edgeArray'"
              class="flex min-w-0 flex-col gap-1 text-xs text-muted-color"
              v-tooltip.top="arrayValueLabel(inlineEditorRelation)"
            >
              <span class="truncate">{{ arrayValueLabel(inlineEditorRelation) }}</span>
              <CassetteExpressionEditor
                :model-value="arrayValue(inlineEditorRelation)"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                @update:model-value="value => updateInlineAttachmentRelation(arrayValuePatch(inlineEditorRelation, value))"
              />
            </label>
            <div class="flex min-w-0 gap-1">
              <Button
                icon="pi pi-arrows-h"
                :severity="inlineEditorRelation.mirrorX ? 'primary' : 'secondary'"
                size="small"
                class="min-w-0 flex-1"
                :label="$t('cassette.v2.attachmentFields.mirrorX')"
                :aria-label="$t('cassette.v2.attachmentFields.mirrorX')"
                v-tooltip.top="$t('cassette.v2.attachmentFields.mirrorX')"
                @click="updateInlineAttachmentRelation({ mirrorX: !inlineEditorRelation.mirrorX })"
              />
              <Button
                icon="pi pi-arrows-v"
                :severity="inlineEditorRelation.mirrorY ? 'primary' : 'secondary'"
                size="small"
                class="min-w-0 flex-1"
                :label="$t('cassette.v2.attachmentFields.mirrorY')"
                :aria-label="$t('cassette.v2.attachmentFields.mirrorY')"
                v-tooltip.top="$t('cassette.v2.attachmentFields.mirrorY')"
                @click="updateInlineAttachmentRelation({ mirrorY: !inlineEditorRelation.mirrorY })"
              />
            </div>
            <Select
              :model-value="inlineEditorRelation.type"
              :options="jointTypeOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.jointType')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.jointType')"
              @update:model-value="value => updateInlineAttachmentRelation({ type: value })"
            />
            <Button
              icon="pi pi-map-marker"
              :severity="inlineEditorRelation.driver ? 'primary' : 'secondary'"
              size="small"
              :aria-label="$t('cassette.v2.attachmentFields.driver')"
              v-tooltip.top="$t('cassette.v2.attachmentFields.driver')"
              @click="updateInlineAttachmentRelation({ driver: true })"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              size="small"
              :aria-label="$t('cassette.v2.removeAttachment')"
              v-tooltip.top="$t('cassette.v2.removeAttachment')"
              @click="deleteInlineAttachmentRelation"
            />
          </div>
        </div>
        <div v-else-if="inlineEditor.type === 'faceParameter' && inlineEditorAnchorKey" class="flex min-w-64 flex-col gap-2">
          <div class="flex cursor-move items-start gap-1" @mousedown.prevent="startInlineEditorDrag">
            <CassetteExpressionEditor
              class="min-w-0 flex-1"
              :model-value="inlineEditor.value"
              :parameters="inlineEditorParameters"
              :parameter-names="globalParameterNames"
              :context-tokens="inlineEditorContextTokens"
              @mousedown.stop
              @update:model-value="updateInlineEditorValue"
            />
            <Button
              icon="pi pi-times"
              severity="secondary"
              text
              rounded
              size="small"
              :aria-label="$t('common.close')"
              @mousedown.stop
              @click="closeInlineEditor"
            />
          </div>
          <Select
            :model-value="inlineEditorAnchorValue"
            :options="anchorOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            size="small"
            :aria-label="$t(`cassette.v2.fields.${inlineEditorAnchorKey}`)"
            v-tooltip.top="$t(`cassette.v2.fields.${inlineEditorAnchorKey}`)"
            @update:model-value="value => updateFaceParameter(inlineEditor.nodeId, inlineEditorAnchorKey, value)"
          />
        </div>
        <div v-else class="flex min-w-64 cursor-move items-start gap-1" @mousedown.prevent="startInlineEditorDrag">
          <CassetteExpressionEditor
            class="min-w-0 flex-1"
            :model-value="inlineEditor.value"
            :parameters="inlineEditorParameters"
            :parameter-names="globalParameterNames"
            :context-tokens="inlineEditorContextTokens"
            @mousedown.stop
            @update:model-value="updateInlineEditorValue"
          />
          <Button
            icon="pi pi-times"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="$t('common.close')"
            @mousedown.stop
            @click="closeInlineEditor"
          />
        </div>
      </div>
      </section>

      <template #inspector>
      <aside class="order-2 flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden xl:order-3">
        <div class="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-ui border border-content-border bg-content p-3">
          <div class="flex items-center justify-between gap-2">
            <strong class="truncate">{{ $t('cassette.v2.workpieces') }}</strong>
            <div class="flex items-center gap-1">
              <Tag :value="assemblySummary" severity="secondary" size="small" />
              <Button
                icon="pi pi-sliders-v"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('cassette.v2.addProfile')"
                v-tooltip.top="$t('cassette.v2.addProfile')"
                @click="openProfileDialog()"
              />
              <Button
                icon="pi pi-bolt"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('cassette.v2.addHardware')"
                v-tooltip.top="$t('cassette.v2.addHardware')"
                @click="addHardwareToSelectedWorkpiece"
              />
            </div>
          </div>
          <ScrollPanel class="min-h-0 flex-1 rounded-ui border border-content-border">
            <div class="flex flex-col">
              <div
                v-for="row in workpieceRows"
                :key="row.id"
                class="border-b border-content-border p-2 last:border-b-0"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-2 rounded-ui border border-transparent px-2 py-1 text-left"
                    :class="row.id === selectedWorkpieceId ? 'border-primary bg-subtle' : ''"
                    @click="handleWorkpieceGraphNodeSelect(row.id)"
                  >
                    <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="workpieceAccentStyle(row.id)" aria-hidden="true" />
                    <span class="truncate">{{ row.label }}</span>
                    <Tag :value="row.type" severity="secondary" size="small" />
                    <Tag v-if="row.role" :value="row.role" severity="secondary" size="small" />
                    <Tag v-if="row.parentCount > 1" :value="`×${row.parentCount}`" severity="secondary" size="small" />
                  </button>
                  <Button
                    icon="pi pi-plus"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('cassette.v2.addRelatedWorkpiece')"
                    v-tooltip.top="$t('cassette.v2.addRelatedWorkpiece')"
                    @click="addWorkpieceFrom(row.id)"
                  />
                  <Button
                    icon="pi pi-link"
                    :severity="row.id === pendingAttachmentSourceId ? 'primary' : 'secondary'"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('cassette.v2.addAttachment')"
                    v-tooltip.top="$t('cassette.v2.addAttachment')"
                    @click="startAttachmentConnect(row.id)"
                  />
                  <Button
                    v-if="row.isProfile"
                    icon="pi pi-pencil"
                    severity="secondary"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('cassette.v2.editProfile')"
                    v-tooltip.top="$t('cassette.v2.editProfile')"
                    @click="openProfileDialog(row.id)"
                  />
                  <Button
                    v-if="row.id !== workpieces[0]?.id"
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    rounded
                    size="small"
                    :aria-label="$t('cassette.v2.deleteWorkpiece')"
                    v-tooltip.top="$t('cassette.v2.deleteWorkpiece')"
                    @click="deleteWorkpiece(row.id)"
                  />
                </div>

                <div v-if="row.relations.length" class="mt-2 flex flex-col gap-1 pl-4">
                  <div
                    v-for="relationRow in row.relations"
                    :key="`${row.id}-${relationRow.relation.id}-${relationRow.direction}`"
                    class="flex min-w-0 items-center gap-1"
                  >
                    <button
                      type="button"
                      class="flex min-w-0 flex-1 items-center gap-2 rounded-ui border px-2 py-1 text-left"
                      :class="relationRow.relation.id === selectedRelationId ? 'border-primary bg-subtle' : 'border-content-border'"
                      @click="selectWorkpieceRelation(relationRow.relation.id, $event)"
                    >
                      <span class="shrink-0 font-mono text-xs text-muted-color">{{ relationRow.arrow }}</span>
                      <span class="truncate text-sm">{{ relationRow.otherLabel }}</span>
                      <small class="truncate text-muted-color">{{ relationRow.faceLabel }}</small>
                      <Tag
                        v-if="relationRow.relation.driver"
                        :value="$t('cassette.v2.driver')"
                        severity="secondary"
                        size="small"
                      />
                      <Tag
                        v-if="relationRow.status !== 'ok'"
                        :value="$t(`cassette.v2.attachmentStatus.${relationRow.status}`)"
                        :severity="relationStatusSeverity(relationRow.status)"
                        size="small"
                      />
                    </button>
                    <Button
                      icon="pi pi-trash"
                      severity="danger"
                      text
                      rounded
                      size="small"
                      :aria-label="$t('cassette.v2.removeAttachment')"
                      v-tooltip.top="$t('cassette.v2.removeAttachment')"
                      @click="deleteWorkpieceRelation(relationRow.relation.id)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </ScrollPanel>
        </div>

        <div v-if="selectedWorkpieceRow" class="shrink-0 rounded-ui border border-content-border bg-subtle p-2" data-cassette-designer-inspector>
          <div class="flex min-w-0 items-center gap-2">
            <span class="h-2.5 w-2.5 shrink-0 rounded-full" :style="workpieceAccentStyle(selectedWorkpieceRow.id)" aria-hidden="true" />
            <strong class="min-w-0 flex-1 truncate">{{ selectedWorkpieceRow.label }}</strong>
            <Tag :value="selectedWorkpieceRow.type" severity="secondary" size="small" />
          </div>
          <div v-if="selectedSheetOutline.length" class="mt-2 border-t border-content-border pt-2">
            <small class="font-medium text-muted-color">{{ $t('cassette.v2.faceOutline') }}</small>
            <div class="mt-1 flex flex-col gap-1">
              <button
                v-for="node in selectedSheetOutline"
                :key="node.id"
                type="button"
                class="flex min-w-0 items-center gap-2 rounded-ui px-2 py-1 text-left text-sm"
                :class="node.id === selectedNodeId ? 'bg-content font-medium' : ''"
                :style="{ paddingInlineStart: `${0.5 + node.depth * 0.75}rem` }"
                @click="selectOutlineNode(node)"
              >
                <i :class="node.parentId ? 'pi pi-angle-right' : 'pi pi-stop'" class="text-xs text-muted-color" aria-hidden="true" />
                <span class="truncate">{{ node.label }}</span>
                <Tag v-if="node.role" :value="node.role" severity="secondary" size="small" />
              </button>
            </div>
          </div>
          <div v-if="selectedWorkpieceRow.isHardware" class="mt-2 grid grid-cols-2 gap-2">
            <Select
              :model-value="selectedWorkpieceRow.family"
              :options="hardwareFamilyOptions"
              option-label="label"
              option-value="value"
              size="small"
              class="w-full"
              :aria-label="$t('cassette.v2.hardwareFields.family')"
              @update:model-value="value => updateSelectedHardware({ family: value })"
            />
            <Select
              v-if="selectedWorkpieceRow.family === 'hanger_clip'"
              :model-value="selectedWorkpieceRow.productionMode || 'integralCut'"
              :options="hangerProductionModeOptions"
              option-label="label"
              option-value="value"
              size="small"
              class="w-full"
              :aria-label="$t('cassette.v2.hardwareFields.productionMode')"
              @update:model-value="value => updateSelectedHardware({ productionMode: value })"
            />
            <Select
              v-if="selectedWorkpieceRow.family === 'hanger_clip'"
              :model-value="selectedWorkpieceRow.profileTemplateId || ''"
              :options="profileTemplateOptions"
              option-label="label"
              option-value="value"
              size="small"
              class="col-span-2 w-full"
              :placeholder="$t('cassette.v2.profileEditor.loadTemplate')"
              :aria-label="$t('cassette.v2.profileEditor.loadTemplate')"
              @click="ensureProfileTemplatesLoaded"
              @focus="ensureProfileTemplatesLoaded"
              @show="ensureProfileTemplatesLoaded"
              @update:model-value="value => updateSelectedHardwareProfile(value)"
            />
          </div>
        </div>

        <div class="hidden shrink-0 overflow-hidden lg:block lg:h-56 xl:h-64">
          <CassetteFoldedPreview
            :preview="cassettePreviewSource?.foldedPreview"
            :selected-face-id="selectedNodeId"
            :selected-workpiece-id="selectedWorkpieceId"
            v-model:isolated-workpiece-id="foldedPreviewWorkpieceId"
            title-key="cassette.v2.cassetteFoldedPreview"
            @workpiece-select="selectWorkpieceForInspector"
          />
        </div>
      </aside>
      </template>
    </DesignerWorkspace>

    <StandardDialog
      v-model:visible="profileDialogVisible"
      :header="$t('cassette.v2.profileEditor.title')"
      size="lg"
    >
      <div class="flex min-h-0 flex-col gap-3">
        <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <InputText
            v-model="profileDraft.name"
            :placeholder="$t('cassette.v2.profileEditor.name')"
            class="w-full"
          />
          <Select
            v-model="profileDraft.kind"
            :options="profileKindOptions"
            option-label="label"
            option-value="value"
            append-to="self"
            class="w-full"
          />
          <Select
            v-model="profileDraft.process"
            :options="profileProcessOptions"
            option-label="label"
            option-value="value"
            append-to="self"
            class="w-full"
          />
        </div>
        <Select
          v-model="selectedProfileTemplateId"
          :options="profileTemplateOptions"
          option-label="label"
          option-value="value"
          entity-type="profileTemplate"
          :placeholder="$t('cassette.v2.profileEditor.loadTemplate')"
          append-to="self"
          class="w-full"
          @focus="ensureProfileTemplatesLoaded"
          @show="ensureProfileTemplatesLoaded"
          @update:model-value="loadProfileTemplateDraft"
        />
        <ProfileSketchEditor
          v-model="profileDraft.sketch"
          @profile="profileDraft.occsProfile = $event"
        />
      </div>

      <template #footer>
        <div class="flex w-full flex-wrap justify-between gap-2">
          <Button
            :label="$t('common.save')"
            icon="pi pi-save"
            size="small"
            :loading="profileSaving"
            :disabled="profileSaving"
            @click="saveProfileDraft"
          />
          <Button
            :label="$t('common.cancel')"
            severity="secondary"
            text
            size="small"
            @click="profileDialogVisible = false"
          />
        </div>
      </template>
    </StandardDialog>
  </DesignerSurface>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ScrollPanel from 'primevue/scrollpanel';
import Select from '~/components/shared/EntitySelect.vue';
import Tag from 'primevue/tag';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import Textarea from 'primevue/textarea';
import CassetteExpressionEditor from '~/components/CassetteExpressionEditor.vue';
import CassetteFoldedPreview from '~/components/CassetteFoldedPreview.vue';
import ProfileSketchEditor from '~/components/ProfileSketchEditor.vue';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import DesignerWorkspace from '~/components/shared/DesignerWorkspace.vue';
import DesignerSurface from '~/components/shared/DesignerSurface.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useEntity } from '~/composables/useEntity.js';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { buildCassetteV2FoldedPreview } from '~/utils/cassetteV2FoldedPreview.js';
import { entitySelectLabel, entitySelectValue } from '~/utils/selectOptions.js';
import {
  addCassetteV2GraphChild,
  addCassetteV2HardwareWorkpiece,
  addCassetteV2WorkpieceAttachment,
  addCassetteV2Workpiece,
  CASSETTE_V2_HANGER_PRODUCTION_MODES,
  CASSETTE_V2_HARDWARE_FAMILIES,
  collectCassetteV2ExpressionIdentifiers,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  deleteCassetteV2Workpiece,
  deleteCassetteV2WorkpieceRelation,
  getCassetteV2WorkpieceRelations,
  getCassetteV2Workpieces,
  OCCS_CASSETTE_FACE_ROLES,
  renderCassetteV2TreeToDrawing,
  resolveCassetteV2AngleExpression,
  updateCassetteV2GraphNode,
  updateCassetteV2Workpiece,
  updateCassetteV2WorkpieceRelation
} from '~/utils/cassetteV2Renderer.js';
import {
  OCCS_PROFILE_KINDS,
  OCCS_PROFILE_PROCESSES,
  closeOccsProfileSketchBoundary,
  createDefaultOccsProfileTemplateData,
  createEmptyOccsProfileSketch,
  isOccsProfileSketchSavable,
  normalizeOccsProfileSketch,
  occsProfileFromSketch
} from '../utils/occs/profiles.js';

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
const profileTemplateEntity = useEntity('profileTemplate');
const { standards } = storeToRefs(standardsStore);
const { pens } = storeToRefs(pensStore);
const props = defineProps({
  template: {
    type: Object,
    default: null
  },
  templateOptions: {
    type: Array,
    default: () => []
  },
  persistedTemplateIds: {
    type: Array,
    default: () => []
  },
  persist: {
    type: Boolean,
    default: true
  }
});
const emit = defineEmits(['load-template', 'save-template', 'dirty-change']);

const sideTabs = [
  { value: 'parameters', labelKey: 'cassette.v2.parameters', icon: 'pi pi-sliders-h' },
  { value: 'layers', labelKey: 'common.layers', icon: 'pi pi-list' },
  { value: 'occs', labelKey: 'cassette.v2.occsDraft', icon: 'pi pi-code' }
];
const cassetteTree = ref(createCassetteV2GraphTree());
const cassetteNameDraft = ref(t('cassette.newCassette'));
const selectedNodeId = ref(cassetteTree.value.rootId);
const selectedWorkpieceOverrideId = ref('');
const selectedRelationId = ref('');
const inspectorSelection = ref('face');
const editorSurfaceRef = ref(null);
const inlineEditor = ref(null);
const pendingAttachmentSourceId = ref('');
const foldedPreviewWorkpieceId = ref('');
const previewSource = ref(null);
const cassettePreviewSource = ref(null);
const previewError = ref('');
const activeSideTab = ref('parameters');
const drawingLayers = ref([]);
const visibleLayerNames = ref([]);
const hiddenLayerNames = ref([]);
const loadedTemplateId = ref('');
const savingTemplate = ref(false);
const persistedTemplateIdOverride = ref('');
const historyPast = ref([]);
const historyFuture = ref([]);
const lastHistorySnapshot = ref('');
const sessionDraftAvailable = ref(false);
const onboardingIndex = ref(0);
const onboardingDismissed = ref(false);
const inlineEditorDrag = ref(null);
const profileDialogVisible = ref(false);
const profileSaving = ref(false);
const selectedProfileTemplateId = ref('');
const editingProfileWorkpieceId = ref('');
const profileDraft = ref({
  name: '',
  ...createDefaultOccsProfileTemplateData({ sketch: createEmptyOccsProfileSketch() })
});
const profileDraftSketch = computed(() => normalizeOccsProfileSketch(
  profileDraft.value.sketch || createEmptyOccsProfileSketch(),
  profileDraft.value.parameters || {}
));
const profileDraftReady = computed(() => {
  const sketch = profileDraftSketch.value;
  return isOccsProfileSketchSavable(sketch, profileDraft.value.parameters || {});
});
const preparedProfileDraftSketch = computed(() => closeOccsProfileSketchBoundary(
  profileDraftSketch.value,
  profileDraft.value.parameters || {}
));

const templateOptions = computed(() => props.templateOptions || []);
const selectedTemplateId = computed(() => persistedTemplateIdOverride.value || props.template?._id || '');
const autosaveStorageKey = computed(() => `cutkit:cassette-designer-v2:draft:${selectedTemplateId.value || 'draft'}`);
const inlineEditorPositionKey = 'cutkit:cassette-designer-v2:inline-editor-position';
const onboardingStorageKey = 'cutkit:onboarding:cassette-designer-v2';
const cassetteMarkContext = computed(() => ({
  templateName: cassetteNameDraft.value || t('cassette.newCassette'),
  templateId: selectedTemplateId.value || 'draft'
}));
const persistedTemplateIdSet = computed(() => new Set([
  ...(props.persistedTemplateIds || []),
  persistedTemplateIdOverride.value
].map(id => id?.toString()).filter(Boolean)));
const selectedTemplateIsPersisted = computed(() => Boolean(
  selectedTemplateId.value &&
  persistedTemplateIdSet.value.has(selectedTemplateId.value.toString())
));
const documentDefinition = computed(() => props.template?.data?.definition || props.template?.definition || {});
const documentProfileLabel = computed(() => `OCCS ${documentDefinition.value?.documentType || 'template'}`);
const documentUnits = computed(() => documentDefinition.value?.units || 'mm');
const treeNodes = computed(() => cassetteTree.value.nodes || []);
const selectedNode = computed(() => treeNodes.value.find(node => node.id === selectedNodeId.value) || treeNodes.value[0] || null);
const workpieces = computed(() => getCassetteV2Workpieces(cassetteTree.value));
const selectedWorkpieceId = computed(() => inspectorSelection.value
  ? selectedWorkpieceOverrideId.value || selectedNode.value?.workpieceId || workpieces.value[0]?.id || ''
  : '');
const selectedWorkpiece = computed(() => selectedWorkpieceId.value
  ? workpieces.value.find(workpiece => workpiece.id === selectedWorkpieceId.value) || null
  : null);
const workpieceRelations = computed(() => getCassetteV2WorkpieceRelations(cassetteTree.value));
const previewMode = computed(() => (
  inspectorSelection.value === 'workpiece' || inspectorSelection.value === 'attachment'
    ? 'assembly'
    : 'workpiece'
));
const previewWorkpieceId = computed(() => previewMode.value === 'workpiece' ? selectedWorkpieceId.value : '');
const selectedWorkpieceRelations = computed(() => workpieceRelations.value
  .filter(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value)
  .sort((left, right) => left.id.localeCompare(right.id)));
const selectedWorkpieceRelation = computed(() => (
  workpieceRelations.value.find(relation => relation.id === selectedRelationId.value) ||
  selectedWorkpieceRelations.value.find(relation => relation.driver) ||
  selectedWorkpieceRelations.value[0] ||
  null
));
const workpieceById = computed(() => new Map(workpieces.value.map(workpiece => [workpiece.id, workpiece])));
const foldedPreviewDiagnostics = computed(() => buildCassetteV2FoldedPreview(cassettePreviewSource.value?.foldedPreview || {}));
const relationDiagnosticsById = computed(() => new Map(
  (foldedPreviewDiagnostics.value.attachments || []).map(attachment => [attachment.id, attachment])
));
const assemblySummary = computed(() => `${workpieces.value.length}/${workpieceRelations.value.length}`);
const workpieceLabel = (workpieceId) => {
  const workpiece = workpieceById.value.get(workpieceId);
  return workpiece?.name || workpieceId || '';
};
const workpieceRelationRowsById = computed(() => {
  const rows = new Map(workpieces.value.map(workpiece => [workpiece.id, []]));
  for (const relation of workpieceRelations.value) {
    const status = relationDiagnosticsById.value.get(relation.id)?.status || 'ok';
    if (relation.sourceWorkpieceId) {
      rows.get(relation.sourceWorkpieceId)?.push({
        relation,
        direction: 'out',
        arrow: '->',
        otherLabel: workpieceLabel(relation.targetWorkpieceId),
        faceLabel: `${relation.sourceFaceId} -> ${relation.targetFaceId}`,
        status
      });
    }
    if (relation.targetWorkpieceId) {
      rows.get(relation.targetWorkpieceId)?.push({
        relation,
        direction: 'in',
        arrow: '<-',
        otherLabel: workpieceLabel(relation.sourceWorkpieceId),
        faceLabel: `${relation.targetFaceId} <- ${relation.sourceFaceId}`,
        status
      });
    }
  }
  return rows;
});
const workpieceRows = computed(() => workpieces.value.map(workpiece => ({
  id: workpiece.id,
  label: workpiece.name || workpiece.id,
  type: workpiece.type || 'sheet',
  role: workpiece.role || '',
  family: workpiece.family || workpiece.hardware?.family || '',
  productionMode: workpiece.productionMode || workpiece.hardware?.productionMode || '',
  profileTemplateId: workpiece.profileTemplateId || workpiece.hardware?.profileTemplateId || '',
  parameters: workpiece.parameters || workpiece.hardware?.parameters || {},
  isHardware: Boolean(workpiece.family || workpiece.hardware?.family),
  isProfile: workpiece.type === 'profile' || Boolean(workpiece.profileSnapshot || workpiece.profile),
  parentCount: workpieceRelations.value.filter(relation => relation.sourceWorkpieceId === workpiece.id).length,
  relations: workpieceRelationRowsById.value.get(workpiece.id) || []
})));
const selectedWorkpieceRow = computed(() => workpieceRows.value.find(row => row.id === selectedWorkpieceId.value) || null);
const selectedSheetOutline = computed(() => {
  const workpieceId = selectedWorkpieceId.value;
  if (selectedWorkpiece.value?.type !== 'sheet' || !workpieceId) return [];
  const nodes = treeNodes.value.filter(node => node.workpieceId === workpieceId);
  const byParent = new Map();
  for (const node of nodes) {
    const key = node.parentId || '';
    byParent.set(key, [...(byParent.get(key) || []), node]);
  }
  const outline = [];
  const visit = (parentId = '', depth = 0) => {
    for (const node of (byParent.get(parentId) || []).sort((left, right) => left.id.localeCompare(right.id))) {
      outline.push({ id: node.id, parentId: node.parentId, depth, label: node.name || node.id, role: node.role || '' });
      visit(node.id, depth + 1);
    }
  };
  visit();
  return outline;
});
const relationStatusSeverity = (status) => {
  if (status === 'impossible') return 'danger';
  if (status === 'unresolved') return 'warn';
  return 'secondary';
};

function selectOutlineNode(node) {
  selectedNodeId.value = node.id;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = node.parentId ? 'fold' : 'face';
  closeInlineEditor();
}
const hueForWorkpiece = (workpieceId = '') => {
  let hash = 0;
  for (const char of String(workpieceId || 'workpiece')) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return (hash * 137 + 43) % 360;
};
const workpieceAccentStyle = (workpieceId) => ({
  backgroundColor: `hsl(${hueForWorkpiece(workpieceId)} 68% 52%)`
});
const targetFaceOptions = computed(() => treeNodes.value
  .filter(node => node.workpieceId === selectedWorkpieceRelation.value?.targetWorkpieceId)
  .map(node => ({
    label: node.id,
    value: node.id
  })));
const sourceFaceOptions = computed(() => treeNodes.value
  .filter(node => node.workpieceId === selectedWorkpieceRelation.value?.sourceWorkpieceId)
  .map(node => ({
    label: node.id,
    value: node.id
  })));
const snapOptions = computed(() => ['center', 'start', 'end', 'origin', 'top_left', 'top_right', 'bottom_left', 'bottom_right'].map(anchor => ({
  label: t(`cassette.v2.snapPoints.${anchor}`),
  value: anchor
})));
const sideOptions = computed(() => ['front', 'back'].map(side => ({
  label: t(`cassette.v2.sides.${side}`),
  value: side
})));
const jointTypeOptions = computed(() => ['mechanical', 'adhesive', 'weld', 'interlock', 'hook_on', 'sealed', 'gasketed', 'other'].map(type => ({
  label: t(`cassette.v2.jointTypes.${type}`),
  value: type
})));
const hardwareFamilyOptions = computed(() => CASSETTE_V2_HARDWARE_FAMILIES.map(family => ({
  label: t(`cassette.v2.hardwareFamilies.${family}`),
  value: family
})));
const hangerProductionModeOptions = computed(() => CASSETTE_V2_HANGER_PRODUCTION_MODES.map(mode => ({
  label: t(`cassette.v2.hangerProductionModes.${mode}`),
  value: mode
})));
const profileKindOptions = computed(() => OCCS_PROFILE_KINDS.map(kind => ({
  label: t(`cassette.v2.profileKinds.${kind}`),
  value: kind
})));
const profileProcessOptions = computed(() => OCCS_PROFILE_PROCESSES.map(process => ({
  label: t(`cassette.v2.profileProcesses.${process}`),
  value: process
})));
const profileTemplateItems = computed(() => (
  Array.isArray(profileTemplateEntity.items.value) ? profileTemplateEntity.items.value : []
));
const profileTemplateOptions = computed(() => profileTemplateItems.value.map(profile => ({
  label: entitySelectLabel(profile, t('cassette.v2.profileEditor.defaultName')),
  value: entitySelectValue(profile),
  entity: profile
})).filter(option => option.value));
const profileTemplateListFilters = () => ({
  ...(selectedTemplateId.value ? { cassetteTemplateId: selectedTemplateId.value } : {})
});
const editableProfileTemplateId = (profile = null) => (
  profile?.lineage?.userId || profile?.lineage?.organizationId ? profile._id : ''
);
const ensureProfileTemplatesLoaded = async () => {
  if (!profileTemplateItems.value.length) {
    await profileTemplateEntity.list(profileTemplateListFilters()).catch(() => []);
  }
};
const upsertProfileTemplateItem = (profile = null) => {
  if (!profile?._id) return;
  const nextItems = [...profileTemplateItems.value];
  const index = nextItems.findIndex(item => String(item?._id || '') === String(profile._id));
  if (index >= 0) {
    nextItems[index] = profile;
  } else {
    nextItems.unshift(profile);
  }
  profileTemplateEntity.items.value = nextItems;
};
const placementModeOptions = computed(() => ['point', 'edgeArray'].map(mode => ({
  label: t(`cassette.v2.placementModes.${mode}`),
  value: mode
})));
const arrayModeOptions = computed(() => ['count', 'spacing'].map(mode => ({
  label: t(`cassette.v2.arrayModes.${mode}`),
  value: mode
})));
const arrayValueLabel = (relation = {}) => (
  relation.arrayMode === 'spacing'
    ? t('cassette.v2.attachmentFields.arraySpacing')
    : t('cassette.v2.attachmentFields.arrayCount')
);
const arrayValue = (relation = {}) => (
  relation.arrayMode === 'spacing'
    ? relation.arraySpacing
    : relation.arrayCount
);
const arrayValuePatch = (relation = {}, value) => ({
  placementMode: 'edgeArray',
  [relation.arrayMode === 'spacing' ? 'arraySpacing' : 'arrayCount']: value
});
const edgeOptions = computed(() => [0, 1, 2, 3].map(index => ({
  label: `E${index}`,
  value: `E${index}`
})));
const anchorOptions = computed(() => [
  { label: t('cassette.v2.anchors.start'), value: 0 },
  { label: t('cassette.v2.anchors.end'), value: 1 }
]);
const globalParameters = computed(() => cassetteTree.value.parameters || {});
const globalParameterNames = computed(() => Object.keys(globalParameters.value)
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })));
const globalParameterEntries = computed(() => globalParameterNames.value
  .map(key => ({ key, value: globalParameters.value[key] })));
const selectedDesignerFaceId = computed(() => (
  inspectorSelection.value === 'face' || inspectorSelection.value === 'fold'
    ? selectedNodeId.value
    : null
));
const showDesignerWorkpieceContext = computed(() => (
  previewMode.value === 'assembly' && !selectedDesignerFaceId.value
));
const designerSelectableWorkpieceIds = computed(() => {
  if (inspectorSelection.value === 'attachment' && selectedWorkpieceRelation.value) {
    return [
      selectedWorkpieceRelation.value.sourceWorkpieceId,
      selectedWorkpieceRelation.value.targetWorkpieceId
    ].filter(Boolean);
  }
  return selectedWorkpieceId.value ? [selectedWorkpieceId.value] : [];
});
const drawingCanvasSource = computed(() => {
  if (!previewSource.value || inspectorSelection.value !== 'attachment') return previewSource.value;
  return { ...previewSource.value, designerEdges: [] };
});
const selectedExpressionParameters = computed(() => {
  const scope = { ...globalParameters.value };
  if (selectedNode.value?.parentId) {
    scope.parentEdgeIndex = selectedNode.value.parentEdgeIndex ?? 0;
    try {
      scope.foldAngle = resolveCassetteV2AngleExpression(selectedNode.value.foldAngle || '90', globalParameters.value);
    } catch {
      scope.foldAngle = '';
    }
  }
  return scope;
});
const selectedExpressionContextTokens = computed(() => {
  if (!selectedNode.value?.parentId) return [];
  return [
    {
      key: 'foldAngle',
      label: 'foldAngle',
      insert: 'foldAngle',
      iconText: '∠',
      tooltip: t('cassette.v2.expression.angleAlias'),
      ariaLabel: t('cassette.v2.expression.angleAlias')
    }
  ];
});
const inlineEditorParameters = computed(() => {
  if (inlineEditor.value?.type === 'foldAngle') return globalParameters.value;
  return selectedExpressionParameters.value;
});
const inlineEditorContextTokens = computed(() => (
  inlineEditor.value?.type === 'faceParameter' ? selectedExpressionContextTokens.value : []
));
const inlineEditorNode = computed(() => (
  inlineEditor.value?.nodeId
    ? treeNodes.value.find(node => node.id === inlineEditor.value.nodeId) || null
    : null
));
const inlineEditorRelation = computed(() => (
  inlineEditor.value?.relationId
    ? workpieceRelations.value.find(relation => relation.id === inlineEditor.value.relationId) || null
    : null
));
const inlineEditorAnchorKey = computed(() => {
  if (inlineEditor.value?.type !== 'faceParameter') return '';
  if (inlineEditor.value.key === 'baseStartOffset') return 'startAnchor';
  if (inlineEditor.value.key === 'baseEndOffset') return 'endAnchor';
  return '';
});
const inlineEditorAnchorValue = computed(() => inlineEditorNode.value?.parameters?.[inlineEditorAnchorKey.value] ?? 0);
const inlineEditorFaceRole = computed(() => defaultFaceRole(inlineEditorNode.value));
const faceRoleOptions = computed(() => OCCS_CASSETTE_FACE_ROLES.map(role => ({
  label: role,
  value: role
})));
const usedParameterNames = computed(() => {
  const used = new Set();
  const addIdentifiers = (value) => {
    try {
      collectCassetteV2ExpressionIdentifiers(value).forEach(identifier => used.add(identifier));
    } catch {
      // Incomplete edits are allowed; preview validation handles invalid expressions.
    }
  };

  Object.values(globalParameters.value).forEach(addIdentifiers);
  treeNodes.value.forEach((node) => {
    Object.values(node.parameters || {}).forEach(addIdentifiers);
    if (node.foldAngle) addIdentifiers(String(node.foldAngle).replace(/\s*deg\s*$/i, ''));
  });
  return used;
});
const occsJson = computed(() => JSON.stringify(createCassetteV2OccsDocument(cassetteTree.value, cassetteMarkContext.value), null, 2));
const drawingLayerNames = computed(() => drawingLayers.value.map(layer => layer.name).filter(Boolean));
const visibleLayerSummary = computed(() => `${visibleLayerNames.value.length}/${drawingLayerNames.value.length}`);
const allLayersVisible = computed(() => drawingLayerNames.value.length > 0 && drawingLayerNames.value.every(name => visibleLayerNames.value.includes(name)));
const sameEntityId = (left, right) => left?.toString?.() === right?.toString?.();
const standardCode = (standard) => standard?.data?.code || standard?.code || null;
const sourceLayerEntity = (layer) => ({
  _id: `cassette-v2-layer-${layer.name}`,
  identity: {
    uid: layer.name,
    name: layer.name,
    slug: layer.standardCode || ''
  },
  data: {}
});
const layerRows = computed(() => drawingLayers.value.map(layer => {
  const standard = standards.value.find(item => (
    sameEntityId(item._id, layer.standardId) ||
    (layer.standardCode && standardCode(item) === layer.standardCode)
  )) || null;
  const pen = pens.value.find(item => sameEntityId(item._id, layer.penId)) || null;

  return {
    key: layer.name,
    layer,
    sourceEntity: sourceLayerEntity(layer),
    standard,
    pen
  };
}));
const canUndo = computed(() => historyPast.value.length > 0);
const canRedo = computed(() => historyFuture.value.length > 0);
const onboardingSteps = computed(() => [
  {
    id: 'document',
    type: 'toolbar',
    titleKey: 'cassette.v2.onboarding.document.title',
    bodyKey: 'cassette.v2.onboarding.document.body'
  },
  {
    id: 'canvas',
    type: 'canvas',
    titleKey: 'cassette.v2.onboarding.canvas.title',
    bodyKey: 'cassette.v2.onboarding.canvas.body'
  },
  {
    id: 'parameters',
    type: 'popup',
    titleKey: 'cassette.v2.onboarding.parameters.title',
    bodyKey: 'cassette.v2.onboarding.parameters.body'
  },
  {
    id: 'topology',
    type: 'rail',
    titleKey: 'cassette.v2.onboarding.topology.title',
    bodyKey: 'cassette.v2.onboarding.topology.body'
  }
]);
const activeOnboardingStep = computed(() => onboardingSteps.value[onboardingIndex.value] || onboardingSteps.value[0]);
const showOnboardingRail = computed(() => !onboardingDismissed.value && Boolean(activeOnboardingStep.value));
const onboardingCalloutClass = computed(() => ({
  document: 'left-4 top-4 xl:left-4 xl:top-4',
  canvas: 'left-1/2 top-20 -translate-x-1/2',
  parameters: 'left-4 top-40 xl:left-4 xl:top-52',
  topology: 'right-4 top-24'
}[activeOnboardingStep.value?.id] || 'left-4 top-4'));
const onboardingChevronClass = computed(() => ({
  document: '-left-1.5 top-6 border-r-0 border-t-0',
  canvas: 'left-1/2 -top-1.5 -translate-x-1/2 border-b-0 border-r-0',
  parameters: '-left-1.5 top-6 border-r-0 border-t-0',
  topology: '-right-1.5 top-6 border-b-0 border-l-0'
}[activeOnboardingStep.value?.id] || '-left-1.5 top-6 border-r-0 border-t-0'));

const cloneDesignerTree = (tree = cassetteTree.value) => JSON.parse(JSON.stringify(tree || createCassetteV2GraphTree()));
const designerSnapshot = () => JSON.stringify({
  name: cassetteNameDraft.value || t('cassette.newCassette'),
  tree: cloneDesignerTree()
});

let suppressHistory = false;
let suppressAutosave = false;
let autosaveTimer = null;
const savedDesignerSnapshot = ref('');
const isModified = computed(() => Boolean(savedDesignerSnapshot.value) && designerSnapshot() !== savedDesignerSnapshot.value);

const markDesignerSaved = () => {
  savedDesignerSnapshot.value = designerSnapshot();
};

const resetDesignerHistory = () => {
  historyPast.value = [];
  historyFuture.value = [];
  lastHistorySnapshot.value = designerSnapshot();
};

const applyDesignerSnapshot = (snapshot) => {
  try {
    const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
    suppressHistory = true;
    cassetteNameDraft.value = parsed.name || t('cassette.newCassette');
    cassetteTree.value = parsed.tree || createCassetteV2GraphTree();
    selectedWorkpieceOverrideId.value = '';
    closeInlineEditor();
    lastHistorySnapshot.value = designerSnapshot();
  } catch {
    suppressHistory = false;
  }
};

const undoDesignerChange = () => {
  if (!canUndo.value) return;
  const current = designerSnapshot();
  const previous = historyPast.value[historyPast.value.length - 1];
  historyPast.value = historyPast.value.slice(0, -1);
  historyFuture.value = [current, ...historyFuture.value].slice(0, 50);
  applyDesignerSnapshot(previous);
};

const redoDesignerChange = () => {
  if (!canRedo.value) return;
  const current = designerSnapshot();
  const next = historyFuture.value[0];
  historyFuture.value = historyFuture.value.slice(1);
  historyPast.value = [...historyPast.value, current].slice(-50);
  applyDesignerSnapshot(next);
};

const isEditableKeyboardTarget = (target) => {
  const tagName = target?.tagName?.toLowerCase?.();
  return Boolean(target?.isContentEditable || ['input', 'textarea', 'select'].includes(tagName));
};

const clearDesignerSelection = () => {
  closeInlineEditor();
  selectedNodeId.value = '';
  selectedWorkpieceOverrideId.value = '';
  selectedRelationId.value = '';
  pendingAttachmentSourceId.value = '';
  inspectorSelection.value = '';
};

const handleDesignerEscape = (event) => {
  event.preventDefault();
  event.stopPropagation();
  clearDesignerSelection();
};

const handleDesignerKeydown = (event) => {
  if (event.key === 'Escape') {
    handleDesignerEscape(event);
    return;
  }
  if (isEditableKeyboardTarget(event.target)) return;
  const isUndo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey;
  const isRedo = (event.ctrlKey || event.metaKey) && (
    event.key.toLowerCase() === 'y' ||
    (event.key.toLowerCase() === 'z' && event.shiftKey)
  );
  if (!isUndo && !isRedo) return;
  event.preventDefault();
  if (isUndo) undoDesignerChange();
  else redoDesignerChange();
};

const readSessionDraft = () => {
  if (!process.client) return null;
  try {
    const raw = window.sessionStorage.getItem(autosaveStorageKey.value);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeSessionDraft = () => {
  if (!process.client) return;
  try {
    window.sessionStorage.setItem(autosaveStorageKey.value, JSON.stringify({
      updatedAt: Date.now(),
      name: cassetteNameDraft.value || t('cassette.newCassette'),
      tree: cloneDesignerTree()
    }));
  } catch {
    // Session autosave is best-effort; explicit Save remains the reliable path.
  }
};

const clearSessionDraft = () => {
  if (!process.client) return;
  window.sessionStorage.removeItem(autosaveStorageKey.value);
  sessionDraftAvailable.value = false;
};

const refreshSessionDraftState = () => {
  const draft = readSessionDraft();
  sessionDraftAvailable.value = Boolean(draft?.tree);
};

const recoverSessionDraft = () => {
  const draft = readSessionDraft();
  if (!draft?.tree) return;
  suppressHistory = true;
  suppressAutosave = true;
  cassetteNameDraft.value = draft.name || cassetteNameDraft.value;
  cassetteTree.value = draft.tree;
  selectedWorkpieceOverrideId.value = '';
  sessionDraftAvailable.value = false;
  resetDesignerHistory();
};

const discardSessionDraft = () => {
  clearSessionDraft();
};

const nextOnboardingStep = () => {
  onboardingIndex.value = Math.min(onboardingIndex.value + 1, onboardingSteps.value.length - 1);
};

const previousOnboardingStep = () => {
  onboardingIndex.value = Math.max(onboardingIndex.value - 1, 0);
};

const dismissOnboarding = () => {
  onboardingDismissed.value = true;
  if (!process.client) return;
  window.localStorage.setItem(onboardingStorageKey, JSON.stringify({ dismissed: true, dismissedAt: Date.now() }));
};

const applyTemplate = (template) => {
  suppressAutosave = true;
  cassetteNameDraft.value = templateName(template);
  cassetteTree.value = templateTree(template);
  selectedNodeId.value = cassetteTree.value.rootId;
  selectedWorkpieceOverrideId.value = '';
  selectedRelationId.value = '';
  inspectorSelection.value = 'face';
  foldedPreviewWorkpieceId.value = '';
  previewError.value = '';
  loadedTemplateId.value = template?._id || '';
  resetDesignerHistory();
  markDesignerSaved();
  refreshSessionDraftState();
};

const templateName = (template) => (
  template?.identity?.name ||
  template?.name ||
  t('cassette.newCassette')
);

const templateTree = (template) => {
  const graphTree = template?.data?.definition?.extensions?.cutkit?.graphTree ||
    template?.definition?.extensions?.cutkit?.graphTree ||
    template?.graphTree ||
    null;
  if (!graphTree) return createCassetteV2GraphTree();
  try {
    return JSON.parse(JSON.stringify(graphTree));
  } catch {
    return createCassetteV2GraphTree();
  }
};

const saveTemplate = async ({ saveAs = false } = {}) => {
  const tree = JSON.parse(JSON.stringify(cassetteTree.value));
  const definition = createCassetteV2OccsDocument(tree, cassetteMarkContext.value);
  const draftKeyBeforeSave = autosaveStorageKey.value;
  const payload = {
    id: saveAs ? '' : selectedTemplateId.value,
    saveAs,
    name: cassetteNameDraft.value || t('cassette.newCassette'),
    definition,
    occs: definition,
    tree,
    parameters: Object.keys(definition.parameters || {})
  };

  if (!props.persist) {
    emit('save-template', payload);
    clearSessionDraft();
    markDesignerSaved();
    return;
  }

  savingTemplate.value = true;
  try {
    const updating = !saveAs && selectedTemplateIsPersisted.value && payload.id;
    const body = {
      name: payload.name,
      type: 'PARAMETRIC',
      definition: payload.definition,
      parameters: payload.parameters,
      ...(!updating && props.template?.lineage?.libraryId
        ? { libraryId: props.template.lineage.libraryId }
        : {})
    };
    const response = await $fetch(
      updating ? `/api/cassettes/${encodeURIComponent(payload.id)}` : '/api/cassettes',
      { method: updating ? 'PUT' : 'POST', body }
    );
    const savedId = response?._id || response?.identity?.uid || payload.id;
    if (savedId) {
      suppressAutosave = true;
      persistedTemplateIdOverride.value = savedId;
    }
    const savedEntity = response || (savedId
      ? await $fetch(`/api/cassettes/${encodeURIComponent(savedId)}`).catch(() => null)
      : null);
    if (process.client) {
      window.sessionStorage.removeItem(draftKeyBeforeSave);
      window.sessionStorage.removeItem(autosaveStorageKey.value);
    }
    sessionDraftAvailable.value = false;
    markDesignerSaved();
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.messages.saveSuccess'), life: 3000 });
    emit('save-template', {
      ...payload,
      id: savedId || payload.id,
      savedEntity
    });
  } catch {
    toast.add({ severity: 'error', summary: t('common.error'), detail: t('cassette.errors.saveFailed'), life: 3000 });
  } finally {
    savingTemplate.value = false;
  }
};

let previewToken = 0;
let previewTimer = null;
const PREVIEW_RENDER_DELAY_MS = 120;
let layerStoresPromise = null;

const renderPreview = async (treeSnapshot, optionsSnapshot = {}) => {
  const token = ++previewToken;
  const emptyDrawing = {
    viewBox: '0 0 100 100',
    layers: [],
    designerEdges: [],
    designerFaces: [],
    designerFoldEdges: [],
    designerSections: { handles: [], segments: [] },
    foldedPreview: { faces: [], folds: [] }
  };
  try {
    const [drawing, cassetteDrawing] = await Promise.all([
      renderCassetteV2TreeToDrawing(treeSnapshot, optionsSnapshot),
      renderCassetteV2TreeToDrawing(treeSnapshot, {
        mode: 'assembly',
        cassetteMarkContext: optionsSnapshot.cassetteMarkContext || {}
      })
    ]);
    if (token === previewToken) {
      previewSource.value = drawing || emptyDrawing;
      cassettePreviewSource.value = cassetteDrawing || emptyDrawing;
      previewError.value = '';
    }
  } catch (error) {
    if (token === previewToken) previewError.value = error?.message || String(error);
    console.warn('Cassette v2 preview failed:', error);
  }
};

const loadLayerStores = async () => {
  layerStoresPromise ||= Promise.all([
    standardsStore.fetchStandards?.(),
    pensStore.fetchPens?.()
  ]);
  await layerStoresPromise;
};

const schedulePreviewRender = (delay = PREVIEW_RENDER_DELAY_MS) => {
  if (!process.client) return;
  if (previewTimer) window.clearTimeout(previewTimer);
  const treeSnapshot = JSON.parse(JSON.stringify(cassetteTree.value));
  const optionsSnapshot = previewMode.value === 'assembly'
    ? {
        mode: 'assembly',
        contextWorkpieceId: selectedWorkpieceId.value,
        selectedRelationId: selectedRelationId.value,
        cassetteMarkContext: cassetteMarkContext.value
      }
    : {
        mode: 'workpiece',
        workpieceId: previewWorkpieceId.value,
        cassetteMarkContext: cassetteMarkContext.value
      };
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    renderPreview(treeSnapshot, optionsSnapshot);
  }, delay);
};

watch([cassetteTree, previewMode, previewWorkpieceId, selectedWorkpieceId, selectedRelationId, cassetteNameDraft, selectedTemplateId], () => schedulePreviewRender(), { immediate: true });
watch([cassetteTree, cassetteNameDraft], () => {
  const snapshot = designerSnapshot();
  if (!lastHistorySnapshot.value) {
    lastHistorySnapshot.value = snapshot;
    return;
  }
  if (suppressHistory) {
    suppressHistory = false;
    lastHistorySnapshot.value = snapshot;
    return;
  }
  if (snapshot === lastHistorySnapshot.value) return;
  historyPast.value = [...historyPast.value, lastHistorySnapshot.value].slice(-50);
  historyFuture.value = [];
  lastHistorySnapshot.value = snapshot;
}, { deep: true });
watch([cassetteTree, cassetteNameDraft, autosaveStorageKey], () => {
  if (!process.client) return;
  if (suppressAutosave) {
    suppressAutosave = false;
    return;
  }
  if (autosaveTimer) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    autosaveTimer = null;
    writeSessionDraft();
  }, 900);
}, { deep: true });
watch(isModified, value => emit('dirty-change', value), { immediate: true });
watch(autosaveStorageKey, () => {
  refreshSessionDraftState();
});
watch(() => props.template?._id || '', (templateId) => {
  persistedTemplateIdOverride.value = '';
  if (templateId === loadedTemplateId.value) return;
  applyTemplate(props.template);
}, { immediate: true });

watch([selectedWorkpieceId, workpieceRelations], () => {
  const selectedIncoming = selectedWorkpieceRelations.value.find(relation => relation.driver) ||
    selectedWorkpieceRelations.value[0] ||
    null;
  const stillExists = workpieceRelations.value.some(relation => relation.id === selectedRelationId.value);
  if (selectedIncoming && (!selectedRelationId.value || !stillExists)) {
    selectedRelationId.value = selectedIncoming.id;
  } else if (!stillExists) {
    selectedRelationId.value = selectedIncoming?.id || '';
  }
}, { immediate: true });

onMounted(() => {
  if (!process.client) return;
  window.addEventListener('keydown', handleDesignerKeydown, true);
  try {
    const onboardingState = window.localStorage.getItem(onboardingStorageKey);
    onboardingDismissed.value = Boolean(onboardingState && JSON.parse(onboardingState)?.dismissed);
  } catch {
    onboardingDismissed.value = false;
  }
  refreshSessionDraftState();
  resetDesignerHistory();
});

onBeforeUnmount(() => {
  previewToken += 1;
  if (previewTimer && process.client) window.clearTimeout(previewTimer);
  if (autosaveTimer && process.client) window.clearTimeout(autosaveTimer);
  if (!process.client) return;
  window.removeEventListener('keydown', handleDesignerKeydown, true);
  window.document.removeEventListener('mousemove', handleInlineEditorDragMove);
  window.document.removeEventListener('mouseup', stopInlineEditorDrag);
});

const updateFaceParameter = (nodeId, key, value) => {
  cassetteTree.value = updateCassetteV2GraphNode(cassetteTree.value, nodeId, { [key]: value });
};

const sanitizeAngleInput = (value) => String(value ?? '').replace(/\s*deg\s*$/i, '').trim();

const updateFoldAngle = (nodeId, value) => {
  const nextValue = sanitizeAngleInput(value);
  cassetteTree.value = {
    ...cassetteTree.value,
    nodes: treeNodes.value.map(node => (
      node.id === nodeId
        ? { ...node, foldAngle: nextValue }
        : node
    ))
  };
};

const expressionParametersForGlobal = (key) => {
  const nextParameters = { ...globalParameters.value };
  delete nextParameters[key];
  return nextParameters;
};

const expressionParameterNamesForGlobal = (key) => globalParameterNames.value.filter(name => name !== key);

const updateGlobalParameter = (key, value) => {
  cassetteTree.value = {
    ...cassetteTree.value,
    parameters: {
      ...globalParameters.value,
      [key]: value
    }
  };
};

const nextGlobalParameterName = () => {
  const used = new Set(Object.keys(globalParameters.value));
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code += 1) {
    const key = String.fromCharCode(code);
    if (!used.has(key)) return key;
  }
  let index = 1;
  while (used.has(`P${index}`)) index += 1;
  return `P${index}`;
};

const addGlobalParameter = () => {
  updateGlobalParameter(nextGlobalParameterName(), '0');
};

const deleteGlobalParameter = (key) => {
  const nextParameters = { ...globalParameters.value };
  delete nextParameters[key];
  cassetteTree.value = {
    ...cassetteTree.value,
    parameters: nextParameters
  };
};

const syncVisibleLayersForDrawing = (layers = []) => {
  drawingLayers.value = layers;
  const hidden = new Set(hiddenLayerNames.value);
  visibleLayerNames.value = drawingLayerNames.value.filter(name => !hidden.has(name));
};

const updateHiddenLayers = (visibleNames) => {
  const visible = new Set(visibleNames);
  const hidden = new Set(hiddenLayerNames.value);
  drawingLayerNames.value.forEach((name) => {
    if (visible.has(name)) hidden.delete(name);
    else hidden.add(name);
  });
  hiddenLayerNames.value = [...hidden];
};

const updateVisibleLayerNames = (layers) => {
  const nextLayers = Array.isArray(layers) ? layers.filter(Boolean) : [];
  visibleLayerNames.value = nextLayers;
  updateHiddenLayers(nextLayers);
};

const showAllLayers = () => {
  const nextLayers = [...drawingLayerNames.value];
  visibleLayerNames.value = nextLayers;
  updateHiddenLayers(nextLayers);
};

const hideAllLayers = () => {
  visibleLayerNames.value = [];
  updateHiddenLayers([]);
};

const defaultFaceRole = (node) => node?.role || (node?.parentId ? 'return_flange' : 'main');

const updateFaceRole = (nodeId, role) => {
  if (!OCCS_CASSETTE_FACE_ROLES.includes(role)) return;
  cassetteTree.value = {
    ...cassetteTree.value,
    nodes: treeNodes.value.map(item => (
      item.id === nodeId ? { ...item, role } : item
    ))
  };
};

const editorPointFromScreen = ({ x = 0, y = 0, type = '' } = {}) => {
  const bounds = editorSurfaceRef.value?.getBoundingClientRect?.();
  if (!bounds) return { x: 12, y: 12 };
  const width = type === 'attachment' ? 400 : 272;
  const height = type === 'attachment'
    ? 360
    : type === 'faceActions' ? 160 : 116;
  return {
    x: Math.min(Math.max(x - bounds.left + 8, 8), Math.max(bounds.width - width - 8, 8)),
    y: Math.min(Math.max(y - bounds.top + 8, 8), Math.max(bounds.height - height - 8, 8))
  };
};

const storedInlineEditorPoint = () => {
  if (!process.client) return null;
  try {
    const point = JSON.parse(window.sessionStorage.getItem(inlineEditorPositionKey) || 'null');
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null;
    return point;
  } catch {
    return null;
  }
};

const persistInlineEditorPoint = (point) => {
  if (!process.client) return;
  window.sessionStorage.setItem(inlineEditorPositionKey, JSON.stringify({
    x: Math.max(8, Math.round(point.x)),
    y: Math.max(8, Math.round(point.y))
  }));
};

const closeInlineEditor = () => {
  inlineEditor.value = null;
};

const openInlineEditor = (editor) => {
  const storedPoint = storedInlineEditorPoint();
  inlineEditor.value = {
    ...editor,
    ...(storedPoint || editorPointFromScreen(editor))
  };
};

const handleInlineEditorDragMove = (event) => {
  if (!inlineEditorDrag.value || !inlineEditor.value) return;
  const bounds = editorSurfaceRef.value?.getBoundingClientRect?.();
  if (!bounds) return;
  const width = inlineEditorDrag.value.width || 272;
  const height = inlineEditorDrag.value.height || 116;
  const next = {
    x: Math.min(Math.max(event.clientX - bounds.left - inlineEditorDrag.value.dx, 8), Math.max(bounds.width - width - 8, 8)),
    y: Math.min(Math.max(event.clientY - bounds.top - inlineEditorDrag.value.dy, 8), Math.max(bounds.height - height - 8, 8))
  };
  inlineEditor.value = { ...inlineEditor.value, ...next };
  persistInlineEditorPoint(next);
};

const stopInlineEditorDrag = () => {
  inlineEditorDrag.value = null;
  if (!process.client) return;
  window.document.removeEventListener('mousemove', handleInlineEditorDragMove);
};

const startInlineEditorDrag = (event) => {
  if (!inlineEditor.value || !process.client) return;
  const target = event.currentTarget?.parentElement;
  const rect = target?.getBoundingClientRect?.();
  if (!rect) return;
  inlineEditorDrag.value = {
    dx: event.clientX - rect.left,
    dy: event.clientY - rect.top,
    width: rect.width,
    height: rect.height
  };
  window.document.addEventListener('mousemove', handleInlineEditorDragMove);
  window.document.addEventListener('mouseup', stopInlineEditorDrag, { once: true });
};

const updateInlineEditorValue = (value) => {
  if (!inlineEditor.value) return;
  if (inlineEditor.value.type === 'foldAngle') {
    const nextValue = sanitizeAngleInput(value);
    inlineEditor.value = { ...inlineEditor.value, value: nextValue };
    updateFoldAngle(inlineEditor.value.nodeId, nextValue);
    return;
  }

  inlineEditor.value = { ...inlineEditor.value, value };
  updateFaceParameter(inlineEditor.value.nodeId, inlineEditor.value.key, value);
};

const layerInputId = (layer) => `cassette-v2-layer-${String(layer.name).replace(/[^A-Za-z0-9_-]/g, '-')}`;

const handleDrawingReady = async (drawing) => {
  const layers = Array.isArray(drawing?.layers) ? drawing.layers : [];
  syncVisibleLayersForDrawing(layers);
  if (layers.some(layer => layer.standardCode || layer.standardId || layer.penId)) {
    await loadLayerStores();
  }
};

const resetTree = () => {
  suppressAutosave = true;
  cassetteTree.value = createCassetteV2GraphTree();
  selectedNodeId.value = cassetteTree.value.rootId;
  selectedWorkpieceOverrideId.value = '';
  selectedRelationId.value = '';
  inspectorSelection.value = 'face';
  activeSideTab.value = 'parameters';
  previewError.value = '';
  clearSessionDraft();
  resetDesignerHistory();
};

const requestResetTree = () => {
  if (!isModified.value) {
    resetTree();
    return;
  }
  confirm.require({
    message: t('cassette.v2.confirmReset'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: resetTree
  });
};

const selectWorkpiece = (workpieceId) => {
  const workpiece = workpieces.value.find(item => item.id === workpieceId);
  if (!workpiece) return;
  selectedWorkpieceOverrideId.value = workpiece.id;
  if (workpiece.rootId) selectedNodeId.value = workpiece.rootId;
};

const selectWorkpieceForInspector = (workpieceId) => {
  closeInlineEditor();
  selectWorkpiece(workpieceId);
  inspectorSelection.value = 'workpiece';
};

const selectWorkpieceRelation = (relationId, event = null) => {
  closeInlineEditor();
  const relation = workpieceRelations.value.find(item => item.id === relationId);
  selectedRelationId.value = relationId;
  if (relation?.sourceWorkpieceId) selectWorkpiece(relation.sourceWorkpieceId);
  inspectorSelection.value = 'attachment';
  const point = event
    ? { x: event.clientX, y: event.clientY }
    : { x: 120, y: 120 };
  openInlineEditor({
    type: 'attachment',
    relationId,
    ...point
  });
};

const updateSelectedWorkpieceRelation = (patch) => {
  if (!selectedWorkpieceRelation.value) return;
  cassetteTree.value = updateCassetteV2WorkpieceRelation(cassetteTree.value, selectedWorkpieceRelation.value.id, patch);
};

const updateInlineAttachmentRelation = (patch) => {
  const relationId = inlineEditorRelation.value?.id || selectedWorkpieceRelation.value?.id;
  if (!relationId) return;
  cassetteTree.value = updateCassetteV2WorkpieceRelation(cassetteTree.value, relationId, patch);
};

const deleteWorkpieceRelation = (relationId) => {
  if (!relationId) return;
  const result = deleteCassetteV2WorkpieceRelation(cassetteTree.value, relationId);
  if (!result.deletedRelationId) return;
  closeInlineEditor();
  cassetteTree.value = result.tree;
  selectedRelationId.value = result.selectedRelationId;
  if (result.selectedWorkpieceId) selectWorkpieceForInspector(result.selectedWorkpieceId);
  else inspectorSelection.value = 'workpiece';
};

const deleteInlineAttachmentRelation = () => {
  deleteWorkpieceRelation(inlineEditorRelation.value?.id || selectedWorkpieceRelation.value?.id);
};

const addWorkpieceFrom = (workpieceId) => {
  closeInlineEditor();
  const referenceNode = selectedNode.value?.workpieceId === workpieceId
    ? selectedNode.value
    : treeNodes.value.find(node => node.workpieceId === workpieceId && !node.parentId);
  const result = addCassetteV2Workpiece(cassetteTree.value, {
    referenceWorkpieceId: workpieceId,
    referenceNodeId: referenceNode?.id
  });
  cassetteTree.value = result.tree;
  selectedNodeId.value = result.nodeId;
  selectedWorkpieceOverrideId.value = '';
  selectedRelationId.value = getCassetteV2WorkpieceRelations(result.tree)
    .find(relation => relation.sourceWorkpieceId === result.workpieceId)?.id || '';
  inspectorSelection.value = 'workpiece';
};

const addHardwareToSelectedWorkpiece = () => {
  closeInlineEditor();
  const selectedIsHardware = Boolean(selectedWorkpiece.value?.family || selectedWorkpiece.value?.hardware?.family);
  const parentRelation = selectedIsHardware
    ? workpieceRelations.value.find(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value)
    : null;
  const referenceWorkpieceId = parentRelation?.targetWorkpieceId || selectedWorkpieceId.value || workpieces.value[0]?.id;
  const referenceNodeId = selectedNode.value?.workpieceId === referenceWorkpieceId
    ? selectedNode.value.id
    : treeNodes.value.find(node => node.workpieceId === referenceWorkpieceId && !node.parentId)?.id;
  const result = addCassetteV2HardwareWorkpiece(cassetteTree.value, {
    referenceWorkpieceId,
    referenceNodeId,
    family: 'hanger_clip',
    productionMode: 'integralCut'
  });
  cassetteTree.value = result.tree;
  selectedWorkpieceOverrideId.value = result.workpieceId;
  selectedRelationId.value = getCassetteV2WorkpieceRelations(result.tree)
    .find(relation => relation.sourceWorkpieceId === result.workpieceId)?.id || '';
  inspectorSelection.value = 'attachment';
};

const profileDraftPayload = () => {
  const sketch = preparedProfileDraftSketch.value;
  const data = {
    kind: profileDraft.value.kind,
    process: profileDraft.value.process,
    parameters: sketch.parameters || profileDraft.value.parameters || {},
    sketch,
    occsProfile: occsProfileFromSketch(sketch)
  };
  return {
    name: profileDraft.value.name || t('cassette.v2.profileEditor.defaultName'),
    cassetteTemplateId: selectedTemplateId.value || '',
    ...data
  };
};

const loadProfileTemplateDraft = (profileId) => {
  const profile = profileTemplateItems.value.find(item => String(item._id || '') === String(profileId || ''));
  if (!profile) return;
  profileDraft.value = {
    _id: editableProfileTemplateId(profile),
    name: profile.identity?.name || profile.name || '',
    kind: profile.data?.kind || 'hanger',
    process: profile.data?.process || 'extruded',
    parameters: profile.data?.parameters || {},
    sketch: profile.data?.sketch || createDefaultOccsProfileTemplateData().sketch,
    occsProfile: profile.data?.occsProfile || null
  };
};

const openProfileDialog = async (workpieceId = '') => {
  closeInlineEditor();
  editingProfileWorkpieceId.value = workpieceId;
  if (!profileTemplateItems.value.length) {
    await profileTemplateEntity.list(profileTemplateListFilters()).catch(() => []);
  }
  const workpiece = workpieces.value.find(item => item.id === workpieceId) || null;
  if (workpiece) {
    const profile = workpiece.profileSnapshot || workpiece.profile || createDefaultOccsProfileTemplateData();
    const sourceTemplate = profileTemplateItems.value.find(item => String(item._id || '') === String(workpiece.profileTemplateId || ''));
    selectedProfileTemplateId.value = workpiece.profileTemplateId || '';
    profileDraft.value = {
      _id: editableProfileTemplateId(sourceTemplate),
      name: workpiece.name || t('cassette.v2.profileEditor.defaultName'),
      kind: workpiece.role || profile.kind || 'hanger',
      process: workpiece.process || profile.process || 'extruded',
      parameters: workpiece.parameters || profile.parameters || {},
      sketch: profile.sketch || createDefaultOccsProfileTemplateData().sketch,
      occsProfile: profile.section ? { section: profile.section, sweep: profile.sweep, sketch: profile.sketch } : profile.occsProfile || null
    };
  } else {
    selectedProfileTemplateId.value = '';
    profileDraft.value = {
      name: t('cassette.v2.profileEditor.defaultName'),
      ...createDefaultOccsProfileTemplateData({ sketch: createEmptyOccsProfileSketch() })
    };
  }
  profileDialogVisible.value = true;
};

const saveProfileDraft = async () => {
  if (!profileDraftReady.value) {
    toast.add({ severity: 'warn', summary: t('common.warning'), detail: t('cassette.v2.profileEditor.invalidSketch'), life: 3000 });
    return null;
  }
  profileSaving.value = true;
  try {
    const payload = profileDraftPayload();
    const saved = profileDraft.value._id
      ? await profileTemplateEntity.update(payload, profileDraft.value._id)
      : await profileTemplateEntity.create(payload);
    selectedProfileTemplateId.value = saved?._id || selectedProfileTemplateId.value;
    profileDraft.value._id = saved?._id || profileDraft.value._id;
    upsertProfileTemplateItem(saved);
    await profileTemplateEntity.list(profileTemplateListFilters()).catch(() => []);
    upsertProfileTemplateItem(saved);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.v2.profileEditor.saved'), life: 2500 });
    return saved;
  } catch (error) {
    const detail = error?.data?.message || error?.message || t('cassette.v2.profileEditor.saveFailed');
    console.error('[CassetteDesignerV2] Failed to save profile template', error);
    toast.add({ severity: 'error', summary: t('common.error'), detail, life: 5000 });
    return null;
  } finally {
    profileSaving.value = false;
  }
};

const updateSelectedHardware = (patch) => {
  if (!selectedWorkpiece.value) return;
  cassetteTree.value = updateCassetteV2Workpiece(cassetteTree.value, selectedWorkpiece.value.id, patch);
};

const updateSelectedHardwareProfile = (profileId) => {
  const profile = profileTemplateItems.value.find(item => String(item._id || '') === String(profileId || ''));
  updateSelectedHardware({
    profileTemplateId: profile?._id || '',
    profileSnapshot: profile?.data || null
  });
};

const addAttachmentToWorkpiece = (workpieceId, targetWorkpieceId = '') => {
  closeInlineEditor();
  const targetWorkpiece = workpieces.value.find(workpiece => (
    workpiece.id === targetWorkpieceId &&
    workpiece.id !== workpieceId
  )) || workpieces.value.find(workpiece => workpiece.id !== workpieceId);
  if (!targetWorkpiece) return;
  const sourceFaceId = selectedNode.value?.workpieceId === workpieceId
    ? selectedNode.value.id
    : treeNodes.value.find(node => node.workpieceId === workpieceId && !node.parentId)?.id;
  const result = addCassetteV2WorkpieceAttachment(cassetteTree.value, workpieceId, {
    targetWorkpieceId: targetWorkpiece.id,
    targetFaceId: targetWorkpiece.rootId,
    sourceFaceId,
    driver: false
  });
  if (!result.relationId) return;
  cassetteTree.value = result.tree;
  selectedRelationId.value = result.relationId;
  selectWorkpiece(workpieceId);
  inspectorSelection.value = 'attachment';
  openInlineEditor({
    type: 'attachment',
    relationId: result.relationId,
    x: 120,
    y: 120
  });
};

const startAttachmentConnect = (workpieceId) => {
  pendingAttachmentSourceId.value = pendingAttachmentSourceId.value === workpieceId ? '' : workpieceId;
  selectWorkpieceForInspector(workpieceId);
};

const handleWorkpieceGraphNodeSelect = (workpieceId) => {
  if (pendingAttachmentSourceId.value && pendingAttachmentSourceId.value !== workpieceId) {
    addAttachmentToWorkpiece(pendingAttachmentSourceId.value, workpieceId);
    pendingAttachmentSourceId.value = '';
    return;
  }
  selectWorkpieceForInspector(workpieceId);
};

const deleteWorkpiece = (workpieceId) => {
  closeInlineEditor();
  const result = deleteCassetteV2Workpiece(cassetteTree.value, workpieceId);
  if (!result.deletedWorkpieceIds.length) return;
  cassetteTree.value = result.tree;
  if (result.deletedWorkpieceIds.includes(foldedPreviewWorkpieceId.value)) {
    foldedPreviewWorkpieceId.value = '';
  }
  if (result.deletedWorkpieceIds.includes(pendingAttachmentSourceId.value)) {
    pendingAttachmentSourceId.value = '';
  }
  if (result.deletedWorkpieceIds.includes(selectedWorkpieceOverrideId.value)) {
    selectedWorkpieceOverrideId.value = '';
  }
  selectedRelationId.value = '';
  selectWorkpieceForInspector(result.selectedWorkpieceId);
};

const addFaceAtEdge = (parentId, edgeIndex) => {
  if (!parentId && parentId !== '') return;
  const result = addCassetteV2GraphChild(cassetteTree.value, parentId, edgeIndex);
  cassetteTree.value = result.tree;
  selectedNodeId.value = result.nodeId;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = 'face';
};

const handleDesignerAction = ({ edge, edgeIndex }) => {
  if (inspectorSelection.value === 'attachment') return;
  if (!edge?.nodeId && edge?.nodeId !== '') return;
  addFaceAtEdge(edge.nodeId, edge.edgeIndex ?? edgeIndex);
};

const handleDesignerFaceSelect = ({ face }) => {
  if (!face?.nodeId && face?.nodeId !== '') return;
  if (inspectorSelection.value === 'attachment' && selectedWorkpieceRelation.value) {
    if (face.workpieceId === selectedWorkpieceRelation.value.sourceWorkpieceId) {
      updateSelectedWorkpieceRelation({ sourceFaceId: face.nodeId });
    } else if (face.workpieceId === selectedWorkpieceRelation.value.targetWorkpieceId) {
      updateSelectedWorkpieceRelation({ targetFaceId: face.nodeId });
    }
    return;
  }
  if (face.workpieceId && face.workpieceId !== selectedWorkpieceId.value) return;

  closeInlineEditor();
  selectedNodeId.value = face.nodeId;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = 'face';
};

const handleDesignerFoldSelect = ({ fold }) => {
  if (!fold?.foldNodeId && fold?.foldNodeId !== '') return;
  if (fold.workpieceId && fold.workpieceId !== selectedWorkpieceId.value) return;
  closeInlineEditor();
  selectedNodeId.value = fold.foldNodeId;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = 'fold';
};

const handleDesignerFaceCommand = ({ face, command, x, y }) => {
  if (!face?.nodeId) return;
  selectedNodeId.value = face.nodeId;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = 'face';
  closeInlineEditor();

  if (command !== 'menu') return;
  openInlineEditor({
    type: 'faceActions',
    nodeId: face.nodeId,
    x,
    y
  });
};

const handleDesignerPointEdit = ({ control, x, y }) => {
  if (!control?.nodeId || !control.key) return;
  const node = treeNodes.value.find(item => item.id === control.nodeId);
  selectedNodeId.value = control.nodeId;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = 'face';
  openInlineEditor({
    type: 'faceParameter',
    nodeId: control.nodeId,
    key: control.key,
    label: t(`cassette.v2.fields.${control.key}`),
    value: node?.parameters?.[control.key] ?? control.value,
    x,
    y
  });
};

const handleDesignerSectionEdit = ({ section, value }) => {
  const orientation = section?.orientation;
  if (!['vertical', 'horizontal'].includes(orientation)) return;
  const minValue = Number(section.minValue);
  const maxValue = Number(section.maxValue);
  const nextValue = Number(value);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || !Number.isFinite(nextValue) || maxValue === minValue) return;
  cassetteTree.value = {
    ...cassetteTree.value,
    sections: {
      ...(cassetteTree.value.sections || {}),
      [orientation]: {
        ...(cassetteTree.value.sections?.[orientation] || {}),
        ratio: Math.max(0, Math.min(1, (nextValue - minValue) / (maxValue - minValue)))
      }
    }
  };
};

const handleDesignerFoldAngleEdit = ({ fold, x, y }) => {
  if (!fold?.foldNodeId) return;
  const node = treeNodes.value.find(item => item.id === fold.foldNodeId);
  selectedNodeId.value = fold.foldNodeId;
  selectedWorkpieceOverrideId.value = '';
  inspectorSelection.value = 'fold';
  openInlineEditor({
    type: 'foldAngle',
    nodeId: fold.foldNodeId,
    label: t('cassette.v2.fields.foldAngle'),
    value: sanitizeAngleInput(node?.foldAngle || fold.angle || '90'),
    x,
    y
  });
};

const deleteFaceNode = (nodeId) => {
  const node = treeNodes.value.find(item => item.id === nodeId);
  if (!node?.parentId) return;
  const workpiece = workpieces.value.find(item => item.id === node.workpieceId);
  const selectedWorkpieceRootId = workpiece?.rootId || cassetteTree.value.rootId;
  const removeIds = new Set([node.id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of cassetteTree.value.nodes) {
      if (node.parentId && removeIds.has(node.parentId) && !removeIds.has(node.id)) {
        removeIds.add(node.id);
        changed = true;
      }
    }
  }
  cassetteTree.value = {
    ...cassetteTree.value,
    nodes: cassetteTree.value.nodes.filter(node => !removeIds.has(node.id))
  };
  selectedNodeId.value = selectedWorkpieceRootId;
  selectedWorkpieceOverrideId.value = workpiece?.id || '';
  inspectorSelection.value = 'face';
  closeInlineEditor();
};

</script>
