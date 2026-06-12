<script setup>
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import Tag from 'primevue/tag';
import EntityPage from '~/components/shared/EntityPage.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import StatusHistory from '~/components/shared/status/StatusHistory.vue';
import EntityInlineRef from '~/components/shared/EntityInlineRef.vue';

const props = defineProps({
  capture: { type: Object, required: true },
  confirming: { type: Boolean, default: false },
  recalculating: { type: Boolean, default: false },
  activatingRevisionId: { type: String, default: null }
});

const emit = defineEmits(['confirm', 'recalculate', 'activate-revision']);

const state = computed(() => props.capture.status?.state || 'DRAFT');
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

watch(() => props.capture._id, () => {
  selectedPreset.value = props.capture.data?.extraction?.preset || defaultPresetForMode(mode.value);
});

watch(mode, (value) => {
  selectedPreset.value = props.capture.data?.extraction?.preset || defaultPresetForMode(value);
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
          <GeometryPreview v-if="hasGeometry" :entity="capture" />
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
