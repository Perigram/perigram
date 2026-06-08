<template>
  <div class="grid h-[calc(100vh-10rem)] min-h-0 min-w-[64rem] grid-cols-[20rem_minmax(0,1fr)] gap-4 overflow-hidden">
    <aside class="flex min-h-0 min-w-0 flex-col gap-4 overflow-auto">
      <div class="flex flex-col gap-2">
        <InputText
          v-model="cassetteNameDraft"
          :placeholder="$t('cassette.name')"
          class="w-full"
        />
        <div class="flex min-w-0 items-center gap-2">
          <Select
            :model-value="selectedTemplateId"
            :options="templateOptions"
            option-label="label"
            option-value="value"
            :placeholder="$t('cassette.v2.loadTemplate')"
            class="min-w-0 flex-1"
            @update:model-value="value => emit('load-template', value)"
          />
          <Button
            icon="pi pi-save"
            :label="$t('common.save')"
            size="small"
            :loading="savingTemplate"
            :disabled="savingTemplate"
            @click="saveTemplate"
          />
          <Button
            icon="pi pi-refresh"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="$t('common.reset')"
            v-tooltip.top="$t('common.reset')"
            @click="resetTree"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button
          v-for="tab in sideTabs"
          :key="tab.value"
          :icon="tab.icon"
          :label="$t(tab.labelKey)"
          :severity="activeSideTab === tab.value ? 'primary' : 'secondary'"
          size="small"
          @click="activeSideTab = tab.value"
        />
      </div>

      <div v-if="activeSideTab === 'parameters'" class="flex min-w-0 flex-col gap-5">
        <Message v-if="previewError" severity="warn" size="small" :closable="false">
          {{ $t('cassette.v2.previewHeld') }}
        </Message>

        <div class="flex flex-col gap-3">
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
          <div v-for="parameter in globalParameterEntries" :key="parameter.key" class="flex flex-col gap-1">
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

        <div v-if="selectedNode" class="flex min-w-0 flex-col gap-4">
          <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 flex-col">
              <strong class="truncate">{{ selectedNode.id }}</strong>
              <small class="font-mono">{{ selectedRelation }}</small>
            </div>
            <Button
              v-if="selectedNode.parentId"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              :aria-label="$t('cassette.v2.deleteFace')"
              v-tooltip.top="$t('cassette.v2.deleteFace')"
              @click="deleteSelectedFace"
            />
          </div>

          <div v-for="field in selectedFields" :key="field.key" class="flex flex-col gap-1">
            <label>{{ selectedFieldLabel(field) }}</label>
            <CassetteExpressionEditor
              :model-value="selectedParameters[field.key]"
              :parameters="selectedExpressionParameters"
              :parameter-names="globalParameterNames"
              :context-tokens="selectedExpressionContextTokens"
              @update:model-value="value => updateSelectedParameter(field.key, value)"
            />
          </div>

          <div v-if="selectedNode.parentId" class="flex flex-col gap-1">
            <label>{{ $t('cassette.v2.fields.foldAngle') }}</label>
            <CassetteExpressionEditor
              :model-value="selectedNode.foldAngle || '90deg'"
              :parameters="globalParameters"
              :parameter-names="globalParameterNames"
              allow-angle-suffix
              @update:model-value="updateSelectedFoldAngle"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.fields.startAnchor') }}</label>
              <Select
                :model-value="selectedParameters.startAnchor"
                :options="anchorOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedParameter('startAnchor', value)"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.fields.endAnchor') }}</label>
              <Select
                :model-value="selectedParameters.endAnchor"
                :options="anchorOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedParameter('endAnchor', value)"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="activeSideTab === 'topology'" class="flex min-w-0 flex-col gap-4">
        <div class="flex items-center justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <i class="pi pi-sitemap text-muted-color" aria-hidden="true" />
            <strong class="truncate">{{ $t('cassette.v2.topology') }}</strong>
            <Tag :value="workpieces.length" severity="secondary" size="small" />
          </div>
          <Button
            icon="pi pi-plus"
            severity="secondary"
            text
            rounded
            size="small"
            :aria-label="$t('cassette.v2.addWorkpiece')"
            v-tooltip.top="$t('cassette.v2.addWorkpiece')"
            @click="addWorkpieceFromSelected"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label>{{ $t('cassette.v2.selectedWorkpiece') }}</label>
          <Select
            :model-value="selectedWorkpieceId"
            :options="workpieceOptions"
            option-label="label"
            option-value="value"
            class="w-full"
            size="small"
            @update:model-value="selectWorkpieceForTopology"
          />
        </div>

        <div v-if="selectedWorkpiece" class="flex flex-col gap-1 rounded-ui border border-content-border p-3">
          <div class="flex items-center justify-between gap-2">
            <strong class="truncate">{{ selectedWorkpiece.name || selectedWorkpiece.id }}</strong>
            <div class="flex items-center gap-1">
              <Button
                icon="pi pi-plus"
                severity="secondary"
                text
                rounded
                size="small"
                :aria-label="$t('cassette.v2.addRelatedWorkpiece')"
                v-tooltip.top="$t('cassette.v2.addRelatedWorkpiece')"
                @click="addWorkpieceFrom(selectedWorkpiece.id)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :disabled="!selectedWorkpieceDeletable"
                :aria-label="$t('cassette.v2.deleteWorkpiece')"
                v-tooltip.top="$t('cassette.v2.deleteWorkpiece')"
                @click="deleteWorkpiece(selectedWorkpiece.id)"
              />
            </div>
          </div>
          <small class="font-mono text-muted-color">{{ selectedWorkpiece.id }} · {{ selectedWorkpiece.rootId }}</small>
        </div>

        <div v-if="selectedWorkpieceRelation" class="flex min-w-0 flex-col gap-3 rounded-ui border border-content-border p-3">
          <div class="flex min-w-0 flex-col">
            <strong>{{ $t('cassette.v2.attachment') }}</strong>
            <small class="font-mono text-muted-color">{{ selectedWorkpieceRelationLabel }}</small>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.targetWorkpiece') }}</label>
              <Select
                :model-value="selectedWorkpieceRelation.targetWorkpieceId"
                :options="targetWorkpieceOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedWorkpieceRelation({ targetWorkpieceId: value })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.targetFace') }}</label>
              <Select
                :model-value="selectedWorkpieceRelation.targetFaceId"
                :options="targetFaceOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedWorkpieceRelation({ targetFaceId: value })"
              />
            </div>
          </div>

          <div class="flex flex-col gap-1">
            <label>{{ $t('cassette.v2.attachmentFields.sourceFace') }}</label>
            <Select
              :model-value="selectedWorkpieceRelation.sourceFaceId"
              :options="sourceFaceOptions"
              option-label="label"
              option-value="value"
              class="w-full"
              size="small"
              @update:model-value="value => updateSelectedWorkpieceRelation({ sourceFaceId: value })"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.targetSnap') }}</label>
              <Select
                :model-value="selectedWorkpieceRelation.targetSnap"
                :options="snapOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedWorkpieceRelation({ targetSnap: value })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.sourceSnap') }}</label>
              <Select
                :model-value="selectedWorkpieceRelation.sourceSnap"
                :options="snapOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedWorkpieceRelation({ sourceSnap: value })"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.offsetX') }}</label>
              <CassetteExpressionEditor
                :model-value="selectedWorkpieceRelation.offsetX"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                @update:model-value="value => updateSelectedWorkpieceRelation({ offsetX: value })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.offsetY') }}</label>
              <CassetteExpressionEditor
                :model-value="selectedWorkpieceRelation.offsetY"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                @update:model-value="value => updateSelectedWorkpieceRelation({ offsetY: value })"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.rotation') }}</label>
              <CassetteExpressionEditor
                :model-value="selectedWorkpieceRelation.rotation"
                :parameters="globalParameters"
                :parameter-names="globalParameterNames"
                allow-angle-suffix
                @update:model-value="value => updateSelectedWorkpieceRelation({ rotation: value })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.side') }}</label>
              <Select
                :model-value="selectedWorkpieceRelation.targetSide"
                :options="sideOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedWorkpieceRelation({ targetSide: value })"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.jointType') }}</label>
              <Select
                :model-value="selectedWorkpieceRelation.type"
                :options="jointTypeOptions"
                option-label="label"
                option-value="value"
                class="w-full"
                size="small"
                @update:model-value="value => updateSelectedWorkpieceRelation({ type: value })"
              />
            </div>
            <div class="flex flex-col gap-1">
              <label>{{ $t('cassette.v2.attachmentFields.method') }}</label>
              <InputText
                :model-value="selectedWorkpieceRelation.method"
                size="small"
                class="w-full"
                @update:model-value="value => updateSelectedWorkpieceRelation({ method: value })"
              />
            </div>
          </div>
        </div>

        <Message v-else severity="info" size="small" :closable="false">
          {{ $t('cassette.v2.noAttachment') }}
        </Message>
      </div>

      <div v-else-if="activeSideTab === 'layers'" class="flex flex-col gap-3">
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

    <section class="relative min-h-0 min-w-0 overflow-hidden">
      <DrawingCanvas
        :source="previewSource"
        source-type="geometry-preview"
        mode="designer"
        :visible-layer-names="visibleLayerNames"
        :selected-designer-face-id="selectedNodeId"
        @ready="handleDrawingReady"
        @layer-toggle="updateVisibleLayerNames"
        @designer-action="handleDesignerAction"
        @designer-face-select="handleDesignerFaceSelect"
        @designer-fold-select="handleDesignerFoldSelect"
      />
      <div class="pointer-events-none absolute right-3 top-3 z-[100] h-56 w-72">
        <CassetteFoldedPreview
          :preview="cassettePreviewSource?.foldedPreview"
          :selected-face-id="selectedNodeId"
          :selected-workpiece-id="selectedWorkpieceId"
          v-model:isolated-workpiece-id="foldedPreviewWorkpieceId"
          title-key="cassette.v2.cassetteFoldedPreview"
          class="pointer-events-auto"
          @workpiece-select="selectWorkpieceForTopology"
        />
      </div>
      <div class="pointer-events-none absolute left-3 top-3 z-[90] max-h-[22rem] max-w-[34rem] overflow-auto">
        <div class="pointer-events-auto flex min-w-72 flex-col gap-2 rounded-ui border border-content-border bg-content p-2 [box-shadow:var(--ck-shadow-overlay)]">
          <div class="flex items-center justify-between gap-2">
            <small class="truncate text-muted-color">{{ $t('cassette.v2.workpieces') }}</small>
            <Button
              icon="pi pi-plus"
              severity="secondary"
              text
              rounded
              size="small"
              :aria-label="$t('cassette.v2.addWorkpiece')"
              v-tooltip.top="$t('cassette.v2.addWorkpiece')"
              @click="addWorkpieceFromSelected"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <div
              v-for="row in workpieceRows"
              :key="row.id"
              class="flex min-w-0 items-center gap-1 rounded-ui px-1 py-1"
              :class="row.id === selectedWorkpieceId ? 'bg-subtle' : ''"
              :style="{ paddingLeft: `${row.level * 14 + 4}px` }"
            >
              <Button
                v-if="row.relationId"
                icon="pi pi-angle-right"
                text
                rounded
                size="small"
                class="h-7 w-7 p-0"
                :severity="row.relationId === selectedRelationId ? 'primary' : 'secondary'"
                :aria-label="$t('cassette.v2.attachment')"
                v-tooltip.top="row.relationLabel"
                @click="selectWorkpieceRelation(row.relationId)"
              />
              <span v-else class="h-7 w-7" />
              <Button
                :label="row.label"
                :severity="row.id === selectedWorkpieceId ? 'primary' : 'secondary'"
                size="small"
                class="min-w-0 flex-1 justify-start"
                @click="selectWorkpieceForTopology(row.id)"
              />
              <Button
                icon="pi pi-plus"
                severity="secondary"
                text
                rounded
                size="small"
                class="h-7 w-7 p-0"
                :aria-label="$t('cassette.v2.addRelatedWorkpiece')"
                v-tooltip.top="$t('cassette.v2.addRelatedWorkpiece')"
                @click="addWorkpieceFrom(row.id)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                class="h-7 w-7 p-0"
                :disabled="!row.deletable"
                :aria-label="$t('cassette.v2.deleteWorkpiece')"
                v-tooltip.top="$t('cassette.v2.deleteWorkpiece')"
                @click="deleteWorkpiece(row.id)"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import ScrollPanel from 'primevue/scrollpanel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import CassetteExpressionEditor from '~/components/CassetteExpressionEditor.vue';
import CassetteFoldedPreview from '~/components/CassetteFoldedPreview.vue';
import LayerStandardCard from '~/components/entities/LayerStandard/LayerStandardCard.vue';
import PenTemplateCard from '~/components/entities/PenTemplate/PenTemplateCard.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import {
  addCassetteV2GraphChild,
  addCassetteV2Workpiece,
  buildCassetteV2WorkpieceTopology,
  collectCassetteV2ExpressionIdentifiers,
  createCassetteV2GraphTree,
  createCassetteV2OccsDocument,
  deleteCassetteV2Workpiece,
  getCassetteV2WorkpieceRelations,
  getCassetteV2Workpieces,
  renderCassetteV2TreeToDrawing,
  resolveCassetteV2AngleExpression,
  updateCassetteV2GraphNode,
  updateCassetteV2WorkpieceRelation
} from '~/utils/cassetteV2Renderer.js';

const { t } = useI18n();
const toast = useToast();
const standardsStore = useLayerStandardsStore();
const pensStore = usePenTemplatesStore();
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
const emit = defineEmits(['load-template', 'save-template']);

const FACE_FIELDS = [
  { key: 'defaultLength', labelKey: 'cassette.v2.fields.defaultLength', rootOnly: true },
  { key: 'height', labelKey: 'cassette.v2.fields.height' },
  { key: 'baseStartOffset', labelKey: 'cassette.v2.fields.baseStartOffset' },
  { key: 'baseEndOffset', labelKey: 'cassette.v2.fields.baseEndOffset' },
  { key: 'topStartOffset', labelKey: 'cassette.v2.fields.topStartOffset' },
  { key: 'topEndOffset', labelKey: 'cassette.v2.fields.topEndOffset' }
];
const sideTabs = [
  { value: 'parameters', labelKey: 'cassette.v2.parameters', icon: 'pi pi-sliders-h' },
  { value: 'topology', labelKey: 'cassette.v2.topology', icon: 'pi pi-sitemap' },
  { value: 'layers', labelKey: 'common.layers', icon: 'pi pi-list' },
  { value: 'occs', labelKey: 'cassette.v2.occsDraft', icon: 'pi pi-code' }
];
const cassetteTree = ref(createCassetteV2GraphTree());
const cassetteNameDraft = ref(t('cassette.newCassette'));
const selectedNodeId = ref(cassetteTree.value.rootId);
const selectedRelationId = ref('');
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

const templateOptions = computed(() => props.templateOptions || []);
const selectedTemplateId = computed(() => persistedTemplateIdOverride.value || props.template?._id || '');
const persistedTemplateIdSet = computed(() => new Set([
  ...(props.persistedTemplateIds || []),
  persistedTemplateIdOverride.value
].map(id => id?.toString()).filter(Boolean)));
const selectedTemplateIsPersisted = computed(() => Boolean(
  selectedTemplateId.value &&
  persistedTemplateIdSet.value.has(selectedTemplateId.value.toString())
));
const treeNodes = computed(() => cassetteTree.value.nodes || []);
const selectedNode = computed(() => treeNodes.value.find(node => node.id === selectedNodeId.value) || treeNodes.value[0] || null);
const workpieces = computed(() => getCassetteV2Workpieces(cassetteTree.value));
const selectedWorkpieceId = computed(() => selectedNode.value?.workpieceId || workpieces.value[0]?.id || '');
const selectedWorkpiece = computed(() => workpieces.value.find(workpiece => workpiece.id === selectedWorkpieceId.value) || workpieces.value[0] || null);
const selectedWorkpieceDeletable = computed(() => Boolean(selectedWorkpiece.value && selectedWorkpiece.value.id !== workpieces.value[0]?.id));
const workpieceOptions = computed(() => workpieces.value.map(workpiece => ({
  label: workpiece.name || workpiece.id,
  value: workpiece.id
})));
const workpieceRelations = computed(() => getCassetteV2WorkpieceRelations(cassetteTree.value));
const workpieceTopology = computed(() => buildCassetteV2WorkpieceTopology(cassetteTree.value));
const workpieceRows = computed(() => {
  const relationBySource = new Map(workpieceRelations.value.map(relation => [relation.sourceWorkpieceId, relation]));
  const nodeById = new Map(workpieceTopology.value.nodes.map(node => [node.id, node]));
  return workpieces.value
    .map((workpiece, index) => {
      const node = nodeById.get(workpiece.id);
      const relation = relationBySource.get(workpiece.id);
      return {
        id: workpiece.id,
        label: workpiece.name || workpiece.id,
        level: node?.level || 0,
        order: node?.y || index,
        relationId: relation?.id || '',
        relationLabel: relation
          ? `${relation.targetWorkpieceId}.${relation.targetFaceId}.${relation.targetSnap}`
          : '',
        deletable: index > 0
      };
    })
    .sort((left, right) => left.order - right.order || left.level - right.level);
});
const selectedWorkpieceRelation = computed(() => (
  workpieceRelations.value.find(relation => relation.id === selectedRelationId.value) ||
  workpieceRelations.value.find(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value) ||
  null
));
const targetWorkpieceOptions = computed(() => workpieces.value
  .filter(workpiece => workpiece.id !== selectedWorkpieceRelation.value?.sourceWorkpieceId)
  .map(workpiece => ({
    label: workpiece.name || workpiece.id,
    value: workpiece.id
  })));
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
const snapOptions = computed(() => ['center', 'origin', 'top_left', 'top_right', 'bottom_left', 'bottom_right'].map(anchor => ({
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
const globalParameters = computed(() => cassetteTree.value.parameters || {});
const globalParameterNames = computed(() => Object.keys(globalParameters.value)
  .sort((left, right) => left.localeCompare(right, undefined, { numeric: true })));
const globalParameterEntries = computed(() => globalParameterNames.value
  .map(key => ({ key, value: globalParameters.value[key] })));
const selectedParameters = computed(() => selectedNode.value?.parameters || {});
const selectedFields = computed(() => FACE_FIELDS.filter(field => !field.rootOnly || !selectedNode.value?.parentId));
const selectedExpressionParameters = computed(() => {
  const scope = { ...globalParameters.value };
  if (selectedNode.value?.parentId) {
    scope.parentEdgeIndex = selectedNode.value.parentEdgeIndex ?? 0;
    try {
      scope.foldAngle = resolveCassetteV2AngleExpression(selectedNode.value.foldAngle || '90deg', globalParameters.value);
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
const selectedAnchorLabel = (key) => {
  const value = Number(selectedParameters.value?.[key]);
  return value === 1 ? t('cassette.v2.anchors.end') : t('cassette.v2.anchors.start');
};
const selectedFieldLabel = (field) => {
  if (field.key === 'baseStartOffset') {
    return t('cassette.v2.offsetLabels.baseStart', { anchor: selectedAnchorLabel('startAnchor') });
  }
  if (field.key === 'baseEndOffset') {
    return t('cassette.v2.offsetLabels.baseEnd', { anchor: selectedAnchorLabel('endAnchor') });
  }
  if (field.key === 'topStartOffset') return t('cassette.v2.offsetLabels.topStart');
  if (field.key === 'topEndOffset') return t('cassette.v2.offsetLabels.topEnd');
  return t(field.labelKey);
};
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
const anchorOptions = computed(() => [
  { label: t('cassette.v2.anchors.start'), value: 0 },
  { label: t('cassette.v2.anchors.end'), value: 1 }
]);
const occsJson = computed(() => JSON.stringify(createCassetteV2OccsDocument(cassetteTree.value), null, 2));
const selectedRelation = computed(() => {
  if (!selectedNode.value) return '';
  if (!selectedNode.value.parentId) return `${t('cassette.v2.rootFace')} · ${selectedWorkpieceId.value}`;
  return `${selectedNode.value.parentId}.E${selectedNode.value.parentEdgeIndex} -> ${selectedNode.value.id}.${selectedNode.value.attachEdge || 'E0'}`;
});
const selectedWorkpieceRelationLabel = computed(() => {
  if (!selectedWorkpieceRelation.value) return '';
  return `${selectedWorkpieceRelation.value.targetWorkpieceId}.${selectedWorkpieceRelation.value.targetFaceId}.${selectedWorkpieceRelation.value.targetSnap} -> ${selectedWorkpieceRelation.value.sourceWorkpieceId}.${selectedWorkpieceRelation.value.sourceFaceId}.${selectedWorkpieceRelation.value.sourceSnap}`;
});
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

const applyTemplate = (template) => {
  cassetteNameDraft.value = templateName(template);
  cassetteTree.value = templateTree(template);
  selectedNodeId.value = cassetteTree.value.rootId;
  selectedRelationId.value = '';
  foldedPreviewWorkpieceId.value = '';
  previewError.value = '';
  loadedTemplateId.value = template?._id || '';
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

const saveTemplate = async () => {
  const tree = JSON.parse(JSON.stringify(cassetteTree.value));
  const definition = createCassetteV2OccsDocument(tree);
  const payload = {
    id: selectedTemplateId.value,
    name: cassetteNameDraft.value || t('cassette.newCassette'),
    definition,
    occs: definition,
    tree,
    parameters: Object.keys(definition.parameters || {})
  };

  if (!props.persist) {
    emit('save-template', payload);
    return;
  }

  savingTemplate.value = true;
  try {
    const body = {
      entities: selectedTemplateIsPersisted.value && payload.id ? { cassette: payload.id } : {},
      parameters: {
        name: payload.name,
        type: 'PARAMETRIC',
        definition: payload.definition,
        parameters: payload.parameters
      }
    };
    const response = await $fetch('/api/commands/saveCassetteTemplate/run', { method: 'POST', body });
    const savedId = response?.result?.data?.cassetteId ||
      response?.result?.entities?.find(entity => entity.type === 'cassette')?.id ||
      payload.id;
    if (savedId) persistedTemplateIdOverride.value = savedId;
    const savedEntity = savedId ? await $fetch(`/api/cassettes/${encodeURIComponent(savedId)}`).catch(() => null) : null;
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('cassette.messages.saveSuccess'), life: 3000 });
    emit('save-template', {
      ...payload,
      id: savedId || payload.id,
      savedEntity,
      commandResult: response?.result || null
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
    foldedPreview: { faces: [], folds: [] }
  };
  try {
    const [drawing, cassetteDrawing] = await Promise.all([
      renderCassetteV2TreeToDrawing(treeSnapshot, optionsSnapshot),
      renderCassetteV2TreeToDrawing(treeSnapshot, { mode: 'assembly' })
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
  const optionsSnapshot = {
    mode: 'workpiece',
    workpieceId: selectedWorkpieceId.value
  };
  previewTimer = window.setTimeout(() => {
    previewTimer = null;
    renderPreview(treeSnapshot, optionsSnapshot);
  }, delay);
};

watch([cassetteTree, selectedNodeId], () => schedulePreviewRender(), { immediate: true });
watch(() => props.template?._id || '', (templateId) => {
  persistedTemplateIdOverride.value = '';
  if (templateId === loadedTemplateId.value) return;
  applyTemplate(props.template);
}, { immediate: true });

watch([selectedWorkpieceId, workpieceRelations], () => {
  const selectedIncoming = workpieceRelations.value.find(relation => relation.sourceWorkpieceId === selectedWorkpieceId.value);
  const stillExists = workpieceRelations.value.some(relation => relation.id === selectedRelationId.value);
  if (selectedIncoming && (!selectedRelationId.value || !stillExists)) {
    selectedRelationId.value = selectedIncoming.id;
  } else if (!stillExists) {
    selectedRelationId.value = selectedIncoming?.id || '';
  }
}, { immediate: true });

onBeforeUnmount(() => {
  previewToken += 1;
  if (previewTimer && process.client) window.clearTimeout(previewTimer);
});

const updateSelectedParameter = (key, value) => {
  if (!selectedNode.value) return;
  cassetteTree.value = updateCassetteV2GraphNode(cassetteTree.value, selectedNode.value.id, { [key]: value });
};

const updateSelectedFoldAngle = (value) => {
  if (!selectedNode.value?.parentId) return;
  cassetteTree.value = {
    ...cassetteTree.value,
    nodes: treeNodes.value.map(node => (
      node.id === selectedNode.value.id
        ? { ...node, foldAngle: value }
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

const layerInputId = (layer) => `cassette-v2-layer-${String(layer.name).replace(/[^A-Za-z0-9_-]/g, '-')}`;

const handleDrawingReady = async (drawing) => {
  const layers = Array.isArray(drawing?.layers) ? drawing.layers : [];
  syncVisibleLayersForDrawing(layers);
  if (layers.some(layer => layer.standardCode || layer.standardId || layer.penId)) {
    await loadLayerStores();
  }
};

const resetTree = () => {
  cassetteTree.value = createCassetteV2GraphTree();
  selectedNodeId.value = cassetteTree.value.rootId;
  previewError.value = '';
};

const selectWorkpiece = (workpieceId) => {
  const workpiece = workpieces.value.find(item => item.id === workpieceId);
  if (!workpiece?.rootId) return;
  selectedNodeId.value = workpiece.rootId;
  activeSideTab.value = 'parameters';
};

const selectWorkpieceForTopology = (workpieceId) => {
  selectWorkpiece(workpieceId);
  activeSideTab.value = 'topology';
};

const selectWorkpieceRelation = (relationId) => {
  const relation = workpieceRelations.value.find(item => item.id === relationId);
  selectedRelationId.value = relationId;
  if (relation?.sourceWorkpieceId) selectWorkpieceForTopology(relation.sourceWorkpieceId);
  activeSideTab.value = 'topology';
};

const updateSelectedWorkpieceRelation = (patch) => {
  if (!selectedWorkpieceRelation.value) return;
  cassetteTree.value = updateCassetteV2WorkpieceRelation(cassetteTree.value, selectedWorkpieceRelation.value.id, patch);
};

const addWorkpieceFrom = (workpieceId) => {
  const referenceNode = selectedNode.value?.workpieceId === workpieceId
    ? selectedNode.value
    : treeNodes.value.find(node => node.workpieceId === workpieceId && !node.parentId);
  const result = addCassetteV2Workpiece(cassetteTree.value, {
    referenceWorkpieceId: workpieceId,
    referenceNodeId: referenceNode?.id
  });
  cassetteTree.value = result.tree;
  selectedNodeId.value = result.nodeId;
  selectedRelationId.value = getCassetteV2WorkpieceRelations(result.tree)
    .find(relation => relation.sourceWorkpieceId === result.workpieceId)?.id || '';
  activeSideTab.value = 'topology';
};

const addWorkpieceFromSelected = () => {
  addWorkpieceFrom(selectedWorkpieceId.value);
};

const deleteWorkpiece = (workpieceId) => {
  const result = deleteCassetteV2Workpiece(cassetteTree.value, workpieceId);
  if (!result.deletedWorkpieceIds.length) return;
  cassetteTree.value = result.tree;
  if (result.deletedWorkpieceIds.includes(foldedPreviewWorkpieceId.value)) {
    foldedPreviewWorkpieceId.value = '';
  }
  selectedRelationId.value = '';
  selectWorkpieceForTopology(result.selectedWorkpieceId);
};

const addFaceAtEdge = (parentId, edgeIndex) => {
  if (!parentId && parentId !== '') return;
  const result = addCassetteV2GraphChild(cassetteTree.value, parentId, edgeIndex);
  cassetteTree.value = result.tree;
  selectedNodeId.value = result.nodeId;
};

const handleDesignerAction = ({ edge, edgeIndex }) => {
  if (!edge?.nodeId && edge?.nodeId !== '') return;
  addFaceAtEdge(edge.nodeId, edge.edgeIndex ?? edgeIndex);
};

const handleDesignerFaceSelect = ({ face }) => {
  if (!face?.nodeId && face?.nodeId !== '') return;
  selectedNodeId.value = face.nodeId;
  activeSideTab.value = 'parameters';
};

const handleDesignerFoldSelect = ({ fold }) => {
  if (!fold?.foldNodeId && fold?.foldNodeId !== '') return;
  selectedNodeId.value = fold.foldNodeId;
  activeSideTab.value = 'parameters';
};

const deleteSelectedFace = () => {
  if (!selectedNode.value?.parentId) return;
  const rootId = cassetteTree.value.rootId;
  const removeIds = new Set([selectedNode.value.id]);
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
  selectedNodeId.value = rootId;
};
</script>
