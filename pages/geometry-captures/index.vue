<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import FileUpload from 'primevue/fileupload';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import StandardPage from '~/components/shared/StandardPage.vue';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import GeometryCaptureCard from '~/components/entities/GeometryCapture/GeometryCaptureCard.vue';
import GeometryCaptureDetail from '~/components/entities/GeometryCapture/GeometryCaptureDetail.vue';
import { useEntity } from '~/composables/useEntity';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const toast = useToast();
const { t } = useI18n();
const route = useRoute();
const captureEntity = useEntity('geometryCapture');
const warehouseEntity = useEntity('warehouse');
const projectEntity = useEntity('project');

const captures = captureEntity.items;
const loading = captureEntity.loading;
const selectedId = ref(null);
const selectedCapture = computed(() => captures.value.find(item => item._id === selectedId.value) || captures.value[0] || null);
const uploading = ref(false);
const confirming = ref(false);
const recalculating = ref(false);
const activatingRevisionId = ref(null);
const selectedFile = ref(null);

const form = ref({
  name: '',
  mode: 'REMNANT',
  warehouseId: null,
  projectId: null,
  preset: 'remnant_auto',
  calibrationMode: 'knownDimension',
  knownWidth: null,
  knownHeight: null,
  sheetWidth: null,
  sheetHeight: null,
  floorCount: null,
  floorHeight: 3300,
  material: '',
  color: '',
  thickness: null
});

const modeOptions = computed(() => [
  { label: t('geometryCapture.modes.REMNANT'), value: 'REMNANT' },
  { label: t('geometryCapture.modes.FACADE'), value: 'FACADE' }
]);

const calibrationOptions = computed(() => [
  { label: t('geometryCapture.calibration.knownDimension'), value: 'knownDimension' },
  { label: t('geometryCapture.calibration.sheetRemainder'), value: 'sheetRemainder' },
  { label: t('geometryCapture.calibration.facadeFloors'), value: 'facadeFloors' }
]);

const presetOptions = computed(() => {
  const keys = form.value.mode === 'FACADE'
    ? ['facade_auto', 'facade_grounded_sam2', 'facade_sam2_auto', 'facade_edges', 'facade_threshold', 'facade_windows_high_contrast']
    : ['remnant_auto', 'remnant_sam2_auto', 'remnant_grounded_sam2', 'remnant_light_on_dark', 'remnant_dark_on_light', 'remnant_sheet_remainder'];
  return keys.map(value => ({ label: t(`geometryCapture.presets.${value}`), value }));
});

const contextOptions = computed(() => form.value.mode === 'REMNANT'
  ? warehouseEntity.items.value.map(item => ({ label: item.identity?.name || item._id, value: item._id }))
  : projectEntity.items.value.map(item => ({ label: item.identity?.name || item._id, value: item._id })));

const canSubmit = computed(() => {
  if (!selectedFile.value) return false;
  if (form.value.mode === 'REMNANT' && !form.value.warehouseId) return false;
  if (form.value.mode === 'FACADE' && !form.value.projectId) return false;
  return true;
});

onMounted(async () => {
  if (route.query.mode === 'FACADE' || route.query.mode === 'REMNANT') {
    form.value.mode = route.query.mode;
  }
  if (route.query.warehouseId) form.value.warehouseId = route.query.warehouseId;
  if (route.query.projectId) form.value.projectId = route.query.projectId;
  await Promise.all([
    loadCaptures(),
    warehouseEntity.list().catch(() => []),
    projectEntity.list().catch(() => [])
  ]);
});

watch(() => form.value.mode, (mode) => {
  form.value.calibrationMode = mode === 'FACADE' ? 'facadeFloors' : 'knownDimension';
  form.value.preset = mode === 'FACADE' ? 'facade_auto' : 'remnant_auto';
});

const loadCaptures = async () => {
  await captureEntity.list().catch(() => []);
};

const handleFileSelect = (event) => {
  selectedFile.value = event.files?.[0] || null;
};

const createCapture = async () => {
  if (!canSubmit.value) return;
  uploading.value = true;
  try {
    const payload = new FormData();
    payload.append('file', selectedFile.value);
    const uploaded = await $fetch('/api/files/upload?bucket=capturePhotos', {
      method: 'POST',
      body: payload
    });

    const capture = await captureEntity.create({
      name: form.value.name || undefined,
      mode: form.value.mode,
      warehouseId: form.value.mode === 'REMNANT' ? form.value.warehouseId : undefined,
      projectId: form.value.mode === 'FACADE' ? form.value.projectId : undefined,
      fileId: uploaded.id,
      fileName: uploaded.filename,
      bucketName: 'capturePhotos',
      preset: form.value.preset,
      calibration: {
        mode: form.value.calibrationMode,
        knownWidth: form.value.knownWidth,
        knownHeight: form.value.knownHeight,
        sheetWidth: form.value.sheetWidth,
        sheetHeight: form.value.sheetHeight,
        floorCount: form.value.floorCount,
        floorHeight: form.value.floorHeight,
        material: form.value.material,
        color: form.value.color,
        thickness: form.value.thickness
      }
    });

    await loadCaptures();
    selectedId.value = capture._id;
    selectedFile.value = null;
    toast.add({ severity: 'success', summary: t('common.created'), detail: t('geometryCapture.extractionQueued'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.data?.message || error.message, life: 4000 });
  } finally {
    uploading.value = false;
  }
};

const recalculateCapture = async ({ capture, preset }) => {
  if (!capture?._id) return;
  recalculating.value = true;
  try {
    const updated = await $fetch(`/api/geometry-captures/${capture._id}/recalculate`, {
      method: 'POST',
      body: {
        preset,
        calibration: capture.data?.calibration || {}
      }
    });
    await loadCaptures();
    selectedId.value = updated._id;
    toast.add({ severity: 'success', summary: t('geometryCapture.recalculateQueued'), detail: t('geometryCapture.extractionQueued'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.data?.message || error.message, life: 4000 });
  } finally {
    recalculating.value = false;
  }
};

const activateRevision = async ({ capture, revision }) => {
  if (!capture?._id || !revision?.id) return;
  activatingRevisionId.value = revision.id;
  try {
    const updated = await $fetch(`/api/geometry-captures/${capture._id}/revisions/${revision.id}/activate`, { method: 'POST' });
    await loadCaptures();
    selectedId.value = updated._id;
    toast.add({ severity: 'success', summary: t('geometryCapture.revisionActivated'), detail: t('geometryCapture.revisionActivatedDetail'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.data?.message || error.message, life: 4000 });
  } finally {
    activatingRevisionId.value = null;
  }
};

const confirmCapture = async (capture) => {
  confirming.value = true;
  try {
    const updated = await $fetch(`/api/geometry-captures/${capture._id}/confirm`, { method: 'POST' });
    await loadCaptures();
    selectedId.value = updated._id;
    toast.add({ severity: 'success', summary: t('geometryCapture.confirmed'), detail: t('geometryCapture.confirmedDetail'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.data?.message || error.message, life: 4000 });
  } finally {
    confirming.value = false;
  }
};
</script>

<template>
  <StandardPage :title="$t('geometryCapture.title')" :subtitle="$t('geometryCapture.subtitle')">
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <div class="flex flex-col gap-6">
        <Panel :header="$t('geometryCapture.newCapture')">
          <div class="flex flex-col gap-4">
            <InputText v-model="form.name" :placeholder="$t('geometryCapture.namePlaceholder')" />
            <SelectButton v-model="form.mode" :options="modeOptions" option-label="label" option-value="value" />
            <Select
              v-if="form.mode === 'REMNANT'"
              v-model="form.warehouseId"
              :options="contextOptions"
              option-label="label"
              option-value="value"
              :placeholder="$t('geometryCapture.selectWarehouse')"
            />
            <Select
              v-else
              v-model="form.projectId"
              :options="contextOptions"
              option-label="label"
              option-value="value"
              :placeholder="$t('geometryCapture.selectProject')"
            />

            <SelectButton v-model="form.calibrationMode" :options="calibrationOptions" option-label="label" option-value="value" />
            <Select
              v-model="form.preset"
              :options="presetOptions"
              option-label="label"
              option-value="value"
              :placeholder="$t('geometryCapture.detectorPreset')"
            />

            <div v-if="form.calibrationMode === 'knownDimension'" class="grid grid-cols-2 gap-3">
              <InputNumber v-model="form.knownWidth" :placeholder="$t('geometryCapture.knownWidth')" suffix=" mm" />
              <InputNumber v-model="form.knownHeight" :placeholder="$t('geometryCapture.knownHeight')" suffix=" mm" />
            </div>
            <div v-else-if="form.calibrationMode === 'sheetRemainder'" class="grid grid-cols-2 gap-3">
              <InputNumber v-model="form.sheetWidth" :placeholder="$t('geometryCapture.sheetWidth')" suffix=" mm" />
              <InputNumber v-model="form.sheetHeight" :placeholder="$t('geometryCapture.sheetHeight')" suffix=" mm" />
            </div>
            <div v-else class="grid grid-cols-2 gap-3">
              <InputNumber v-model="form.floorCount" :placeholder="$t('geometryCapture.floorCount')" />
              <InputNumber v-model="form.floorHeight" :placeholder="$t('geometryCapture.floorHeight')" suffix=" mm" />
            </div>

            <div v-if="form.mode === 'REMNANT'" class="grid grid-cols-1 gap-3 md:grid-cols-3">
              <InputText v-model="form.material" :placeholder="$t('geometryCapture.material')" />
              <InputText v-model="form.color" :placeholder="$t('geometryCapture.color')" />
              <InputNumber v-model="form.thickness" :placeholder="$t('geometryCapture.thickness')" suffix=" mm" />
            </div>

            <FileUpload
              mode="basic"
              accept="image/*"
              :auto="false"
              :custom-upload="true"
              :choose-label="selectedFile ? selectedFile.name : $t('geometryCapture.choosePhoto')"
              @select="handleFileSelect"
            />

            <Message severity="info" size="small">
              {{ $t('geometryCapture.reviewNotice') }}
            </Message>

            <Button
              :label="$t('geometryCapture.queueExtraction')"
              icon="pi pi-camera"
              :disabled="!canSubmit"
              :loading="uploading"
              @click="createCapture"
            />
          </div>
        </Panel>

        <Panel :header="$t('geometryCapture.captures')">
          <div class="flex justify-end pb-3">
            <Button icon="pi pi-refresh" text rounded size="small" :aria-label="$t('common.update')" @click="loadCaptures" />
          </div>
          <ResponsiveGrid v-if="captures.length" variant="dense">
            <GeometryCaptureCard
              v-for="capture in captures"
              :key="capture._id"
              :capture="capture"
              variant="compact"
              @click="selectedId = capture._id"
            />
          </ResponsiveGrid>
          <StateBlock v-else-if="!loading" :message="$t('geometryCapture.noCaptures')" icon="pi pi-camera" />
        </Panel>
      </div>

      <GeometryCaptureDetail
        v-if="selectedCapture"
        :capture="selectedCapture"
        :confirming="confirming"
        :recalculating="recalculating"
        :activating-revision-id="activatingRevisionId"
        @confirm="confirmCapture"
        @recalculate="recalculateCapture"
        @activate-revision="activateRevision"
      />
      <StateBlock v-else :message="$t('geometryCapture.selectCapture')" icon="pi pi-vector-square" />
    </div>
  </StandardPage>
</template>
