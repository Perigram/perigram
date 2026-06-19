<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import EntityPage from '~/components/shared/EntityPage.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import PhotoGeometryOverlay from './PhotoGeometryOverlay.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';
import { getPrimaryState } from '~/packages/core/src/index.js';

const props = defineProps({
  capture: { type: Object, required: true },
  confirming: { type: Boolean, default: false },
  recalculating: { type: Boolean, default: false },
  activatingRevisionId: { type: String, default: null }
});

const emit = defineEmits(['confirm', 'recalculate', 'activate-revision', 'save-manual-revision']);

const state = computed(() => getPrimaryState(props.capture.status, 'DRAFT'));
const mode = computed(() => props.capture.data?.mode || 'REMNANT');
const hasGeometry = computed(() => Boolean(props.capture.data?.geometry?.polygon?.outer?.length));
const warehouseId = computed(() => props.capture.lineage?.warehouseId || null);
const projectId = computed(() => props.capture.lineage?.projectId || null);
const diagnostics = computed(() => props.capture.data?.extraction?.diagnostics || []);
const output = computed(() => props.capture.data?.output || null);
const revisions = computed(() => props.capture.data?.revisions || []);
const activeRevisionId = computed(() => props.capture.data?.activeRevisionId || props.capture.data?.extraction?.revisionId || null);
const selectedPreset = ref(props.capture.data?.extraction?.preset || defaultPresetForMode(mode.value));
const presetOptions = computed(() => presetKeysForMode(mode.value).map(value => ({ label: `geometryCapture.presets.${value}`, value })));
const editableGeometry = ref(null);
const selectedVertices = ref([]);
const correctedDistance = ref(null);
const photoUrl = computed(() => {
  const attachment = props.capture.attachments?.primary || {};
  const fileId = attachment.fileId?.$oid || attachment.fileId;
  const bucketName = attachment.metadata?.bucketName || attachment.bucketName || 'capturePhotos';
  return fileId ? `/api/files/download/${fileId}?bucket=${encodeURIComponent(bucketName)}` : '';
});
const editableCalibration = computed(() => props.capture.data?.calibration || {});
const selectedVertexPair = computed(() => {
  if (selectedVertices.value.length !== 2) return null;
  const outer = editableGeometry.value?.polygon?.outer || [];
  const first = outer[selectedVertices.value[0].index];
  const second = outer[selectedVertices.value[1].index];
  return first && second ? [first, second] : null;
});
const measuredDistance = computed(() => {
  const pair = selectedVertexPair.value;
  if (!pair) return null;
  return Math.round(Math.hypot(pair[1][0] - pair[0][0], pair[1][1] - pair[0][1]) * 100) / 100;
});
const hasEditableChanges = computed(() => JSON.stringify(editableGeometry.value || null) !== JSON.stringify(props.capture.data?.geometry || null));

watch(() => props.capture._id, () => {
  selectedPreset.value = props.capture.data?.extraction?.preset || defaultPresetForMode(mode.value);
  resetEditor();
});

watch(mode, (value) => {
  selectedPreset.value = props.capture.data?.extraction?.preset || defaultPresetForMode(value);
});

watch(() => props.capture.data?.geometry, () => {
  resetEditor();
});

function presetKeysForMode(value) {
  return value === 'FACADE'
    ? ['facade_auto', 'facade_grounded_sam2', 'facade_sam2_auto', 'facade_edges', 'facade_threshold', 'facade_windows_high_contrast']
    : ['remnant_auto', 'remnant_sam2_auto', 'remnant_grounded_sam2', 'remnant_light_on_dark', 'remnant_dark_on_light', 'remnant_sheet_remainder'];
}

function defaultPresetForMode(value) {
  return value === 'FACADE' ? 'facade_auto' : 'remnant_auto';
}

function revisionSeverity(revision) {
  if (revision.id === activeRevisionId.value) return 'success';
  if (revision.status === 'FAILED') return 'danger';
  if (revision.status === 'READY') return 'info';
  return 'secondary';
}

function revisionPreviewEntity(revision) {
  return {
    ...props.capture,
    _id: `${props.capture._id}-${revision.id}`,
    data: {
      ...(props.capture.data || {}),
      geometry: revision.geometry
    },
    specs: revision.metrics || {}
  };
}

function compactRevisionId(revision) {
  return String(revision.id || '').replace(/^rev-/, '');
}

function revisionMeta(revision) {
  const parts = [];
  if (revision.preset) parts.push(`geometryCapture.presets.${revision.preset}`);
  if (revision.confidence) parts.push(`${Math.round(Number(revision.confidence) * 100)}%`);
  return parts;
}

function resetEditor() {
  editableGeometry.value = cloneGeometry(props.capture.data?.geometry);
  selectedVertices.value = [];
  correctedDistance.value = null;
}

function cloneGeometry(geometry) {
  return geometry ? JSON.parse(JSON.stringify(geometry)) : null;
}

function toggleVertexSelection(vertex) {
  const exists = selectedVertices.value.find(item => item.ring === vertex.ring && item.index === vertex.index);
  if (exists) {
    selectedVertices.value = selectedVertices.value.filter(item => !(item.ring === vertex.ring && item.index === vertex.index));
    return;
  }
  selectedVertices.value = [...selectedVertices.value.slice(-1), vertex];
  correctedDistance.value = null;
}

function deleteSelectedVertex() {
  const selected = selectedVertices.value[0];
  if (!selected || selected.ring !== 'outer') return;
  const geometry = cloneGeometry(editableGeometry.value);
  const outer = geometry?.polygon?.outer || [];
  const open = outer.slice(0, outer.length > 1 ? -1 : outer.length);
  if (open.length <= 3) return;
  open.splice(selected.index, 1);
  geometry.polygon.outer = closeRing(open);
  editableGeometry.value = geometry;
  selectedVertices.value = [];
}

function applyDistanceCorrection() {
  const pair = selectedVertexPair.value;
  const current = measuredDistance.value;
  const target = Number(correctedDistance.value);
  if (!pair || !current || !target || target <= 0) return;
  const factor = target / current;
  const anchor = pair[0];
  editableGeometry.value = scaleGeometry(editableGeometry.value, anchor, factor);
  selectedVertices.value = [];
  correctedDistance.value = null;
}

function saveManualRevision() {
  emit('save-manual-revision', {
    capture: props.capture,
    geometry: editableGeometry.value,
    calibration: editableCalibration.value
  });
}

function scaleGeometry(geometry, anchor, factor) {
  const next = cloneGeometry(geometry);
  next.polygon.outer = closeRing(scaleRing(next.polygon.outer, anchor, factor));
  next.polygon.inner = (next.polygon.inner || []).map(ring => closeRing(scaleRing(ring, anchor, factor)));
  return next;
}

function scaleRing(ring = [], anchor, factor) {
  return ring
    .slice(0, ring.length > 1 ? -1 : ring.length)
    .map(point => [
      Math.round((anchor[0] + (point[0] - anchor[0]) * factor) * 1000) / 1000,
      Math.round((anchor[1] + (point[1] - anchor[1]) * factor) * 1000) / 1000
    ]);
}

function closeRing(ring = []) {
  if (!ring.length) return [];
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, [...first]];
}

resetEditor();

const FIELDS = [
  { path: 'data.mode', i18n: 'geometryCapture.mode' },
  { path: 'data.extraction.preset', i18n: 'geometryCapture.detectorPreset' },
  { path: 'data.extraction.confidence', i18n: 'geometryCapture.confidence' },
  { path: 'specs.area', i18n: 'results.area', suffix: ' m²' },
  { path: 'specs.width', i18n: 'geometryCapture.width', suffix: ' mm' },
  { path: 'specs.height', i18n: 'geometryCapture.height', suffix: ' mm' }
];
</script>

<template>
  <EntityPage :entity="capture" entity-type="geometry_capture">
    <template #actions>
      <Button
        v-if="state === 'READY'"
        :label="mode === 'REMNANT' ? $t('geometryCapture.createRemnant') : $t('geometryCapture.confirmDraft')"
        icon="pi pi-check"
        :loading="confirming"
        @click="emit('confirm', capture)"
      />
    </template>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="flex flex-col gap-6">
        <Panel :header="$t('geometryCapture.detectedGeometry')">
          <div v-if="hasGeometry" class="flex flex-col gap-4">
            <PhotoGeometryOverlay
              v-if="photoUrl"
              :image-url="photoUrl"
              :geometry="editableGeometry"
              :calibration="editableCalibration"
              :selected-vertices="selectedVertices"
              geometry-editable
              @vertex-click="toggleVertexSelection"
            />
            <GeometryPreview v-else :entity="capture" />

            <div class="flex flex-col gap-3">
              <div class="flex flex-wrap items-center gap-2">
                <Button
                  :label="$t('geometryCapture.deleteVertex')"
                  icon="pi pi-trash"
                  size="small"
                  severity="secondary"
                  :disabled="selectedVertices.length !== 1"
                  @click="deleteSelectedVertex"
                />
                <Button
                  :label="$t('common.reset')"
                  icon="pi pi-refresh"
                  size="small"
                  severity="secondary"
                  text
                  :disabled="!hasEditableChanges"
                  @click="resetEditor"
                />
                <Button
                  :label="$t('geometryCapture.saveRevision')"
                  icon="pi pi-save"
                  size="small"
                  :disabled="!hasEditableChanges"
                  @click="saveManualRevision"
                />
              </div>

              <div class="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_auto]">
                <div class="flex min-w-0 flex-col gap-1">
                  <small class="text-muted-color">{{ $t('geometryCapture.dimensionSelection') }}</small>
                  <strong v-if="measuredDistance" class="truncate text-sm">{{ measuredDistance }} mm</strong>
                  <small v-else class="text-muted-color">{{ $t('geometryCapture.selectTwoVertices') }}</small>
                </div>
                <InputNumber
                  v-model="correctedDistance"
                  :placeholder="$t('geometryCapture.correctDistance')"
                  suffix=" mm"
                  :disabled="!measuredDistance"
                />
                <Button
                  :label="$t('geometryCapture.applyScale')"
                  icon="pi pi-arrows-h"
                  size="small"
                  severity="secondary"
                  :disabled="!measuredDistance || !correctedDistance"
                  @click="applyDistanceCorrection"
                />
              </div>
            </div>
          </div>
          <div v-else class="flex min-h-64 items-center justify-center rounded-ui border border-dashed border-content-border bg-subtle text-muted-color">
            <i class="pi pi-spin pi-cog"></i>
          </div>
        </Panel>

        <Panel :header="$t('geometryCapture.revisions')">
          <div v-if="revisions.length" class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="revision in revisions"
              :key="revision.id"
              class="flex min-w-0 flex-col gap-3 rounded-ui border border-content-border bg-subtle p-3"
              :class="revision.id === activeRevisionId ? 'border-primary' : ''"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <Tag :value="revision.status" :severity="revisionSeverity(revision)" size="small" />
                  <small class="truncate text-muted-color">{{ compactRevisionId(revision) }}</small>
                </div>
                <Button
                  v-if="revision.status === 'READY' && revision.id !== activeRevisionId"
                  icon="pi pi-check"
                  text
                  rounded
                  size="small"
                  :aria-label="$t('geometryCapture.activateRevision')"
                  :loading="activatingRevisionId === revision.id"
                  @click="emit('activate-revision', { capture, revision })"
                />
              </div>

              <div class="min-h-32 overflow-hidden rounded-ui border border-content-border bg-subtle">
                <GeometryPreview v-if="revision.geometry?.polygon?.outer?.length" :entity="revisionPreviewEntity(revision)" />
                <div v-else class="flex min-h-32 items-center justify-center text-muted-color">
                  <i class="pi pi-spin pi-cog"></i>
                </div>
              </div>

              <div class="flex min-w-0 flex-col gap-1">
                <small
                  v-for="item in revisionMeta(revision)"
                  :key="item"
                  class="truncate text-muted-color"
                >
                  {{ item.startsWith('geometryCapture.') ? $t(item) : item }}
                </small>
                <small v-if="revision.error" class="truncate text-muted-color">{{ revision.error }}</small>
              </div>
            </div>
          </div>
          <small v-else class="text-muted-color">{{ $t('geometryCapture.noRevisions') }}</small>
        </Panel>
      </div>

      <div class="flex flex-col gap-6">
        <Panel :header="$t('geometryCapture.extraction')">
          <div class="flex flex-col gap-4">
            <Tag :value="$t(`geometryCapture.modes.${mode}`)" severity="secondary" />
            <div class="flex flex-col gap-3">
              <Select
                v-model="selectedPreset"
                :options="presetOptions"
                option-value="value"
                :placeholder="$t('geometryCapture.detectorPreset')"
              >
                <template #value="{ value }">
                  {{ value ? $t(`geometryCapture.presets.${value}`) : $t('geometryCapture.detectorPreset') }}
                </template>
                <template #option="{ option }">
                  {{ $t(option.label) }}
                </template>
              </Select>
              <Button
                :label="$t('geometryCapture.recalculate')"
                icon="pi pi-refresh"
                size="small"
                :loading="recalculating"
                @click="emit('recalculate', { capture, preset: selectedPreset })"
              />
            </div>
            <DataBlock entity-type="geometryCapture" :entity="capture" :fields="FIELDS" />
          </div>
        </Panel>

        <Panel :header="$t('common.traceability')">
          <div class="flex flex-col gap-3">
            <div v-if="warehouseId" class="flex items-center justify-between gap-4">
              <small class="text-muted-color">{{ $t('entities.warehouse') }}</small>
              <EntityInlineRef type="warehouse" :id="warehouseId" />
            </div>
            <div v-if="projectId" class="flex items-center justify-between gap-4">
              <small class="text-muted-color">{{ $t('entities.project') }}</small>
              <EntityInlineRef type="project" :id="projectId" />
            </div>
            <div v-if="output?.entityId" class="flex items-center justify-between gap-4">
              <small class="text-muted-color">{{ $t('geometryCapture.createdEntity') }}</small>
              <EntityInlineRef :type="output.entityType" :id="output.entityId" />
            </div>
          </div>
        </Panel>

        <Panel v-if="diagnostics.length" :header="$t('geometryCapture.diagnostics')">
          <div class="flex flex-col gap-2">
            <small
              v-for="item in diagnostics"
              :key="item"
              class="break-words rounded-ui border border-content-border bg-subtle px-2 py-1 text-muted-color"
            >
              {{ item }}
            </small>
          </div>
        </Panel>

        <Panel :header="$t('common.history')">
          <StatusHistory :entity="capture" entity-type="geometry_capture" compact />
        </Panel>
      </div>
    </div>
  </EntityPage>
</template>
