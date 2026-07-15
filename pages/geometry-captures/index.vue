<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Panel from 'primevue/panel';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import Tag from 'primevue/tag';
import StandardPage from '~/components/shared/StandardPage.vue';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import GeometryPreview from '~/components/shared/GeometryPreview.vue';
import GeometryCaptureDetail from '~/components/entities/GeometryCapture/GeometryCaptureDetail.vue';
import PhotoGeometryOverlay from '~/components/entities/GeometryCapture/PhotoGeometryOverlay.vue';
import { useEntity } from '~/composables/useEntity';
import { getPrimaryState } from '~/packages/core/src/index.js';

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
const materialEntity = useEntity('material');

const captures = captureEntity.items;
const loading = captureEntity.loading;
const selectedId = ref(null);
const selectedCapture = computed(() => captures.value.find(item => item._id === selectedId.value) || captures.value[0] || null);
const uploading = ref(false);
const confirming = ref(false);
const recalculating = ref(false);
const activatingRevisionId = ref(null);
const selectedFile = ref(null);
const selectedFileUrl = ref('');
const createPrompt = ref({});
const cameraInput = ref(null);
const galleryInput = ref(null);
const showCreateMaterialDialog = ref(false);
const materialCreating = ref(false);

const form = ref({
  mode: 'REMNANT',
  warehouseId: null,
  projectId: null,
  preset: 'remnant_auto',
  knownWidth: null,
  knownHeight: null,
  floorCount: null,
  floorHeight: 3300,
  materialId: null
});

const materialForm = ref({
  name: '',
  code: '',
  description: ''
});

const modeOptions = computed(() => [
  { label: t('geometryCapture.modes.REMNANT'), value: 'REMNANT' },
  { label: t('geometryCapture.modes.FACADE'), value: 'FACADE' }
]);

const currentContextId = computed(() => form.value.mode === 'REMNANT'
  ? form.value.warehouseId
  : form.value.projectId);

const materialOptions = computed(() => materialEntity.items.value.map(material => ({
  label: [
    material.identity?.name,
    material.data?.code || material.identity?.serial
  ].filter(Boolean).join(' · '),
  value: material._id,
  material
})));

const selectedMaterial = computed(() => materialOptions.value.find(option => option.value === form.value.materialId)?.material || null);
const hasCreatePrompt = computed(() => (createPrompt.value.outer || []).length >= 3);

const canSubmit = computed(() => {
  if (!selectedFile.value) return false;
  if (!currentContextId.value) return false;
  if (form.value.mode === 'REMNANT') {
    return Boolean(form.value.materialId && (form.value.knownWidth || form.value.knownHeight));
  }
  if (form.value.mode === 'FACADE') {
    return Boolean(form.value.floorCount && form.value.floorHeight);
  }
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
    projectEntity.list().catch(() => []),
    materialEntity.list().catch(() => [])
  ]);
  applyDefaultContext();
});

onBeforeUnmount(() => {
  revokeSelectedFileUrl();
});

watch(() => form.value.mode, (mode) => {
  form.value.preset = mode === 'FACADE' ? 'facade_auto' : 'remnant_auto';
  applyDefaultContext();
});

watch(selectedFile, (file) => {
  revokeSelectedFileUrl();
  createPrompt.value = {};
  selectedFileUrl.value = file && typeof URL !== 'undefined' ? URL.createObjectURL(file) : '';
});

const loadCaptures = async () => {
  await captureEntity.list().catch(() => []);
};

const handleNativeFileSelect = (event) => {
  selectedFile.value = event.target.files?.[0] || null;
  event.target.value = '';
};

const revokeSelectedFileUrl = () => {
  if (selectedFileUrl.value && typeof URL !== 'undefined') {
    URL.revokeObjectURL(selectedFileUrl.value);
  }
  selectedFileUrl.value = '';
};

const openCamera = () => {
  cameraInput.value?.click();
};

const openGallery = () => {
  galleryInput.value?.click();
};

const applyDefaultContext = () => {
  if (form.value.mode === 'REMNANT' && !form.value.warehouseId) {
    form.value.warehouseId = warehouseEntity.items.value[0]?._id || null;
  }
  if (form.value.mode === 'FACADE' && !form.value.projectId) {
    form.value.projectId = projectEntity.items.value[0]?._id || null;
  }
};

const calibrationForMode = () => {
  if (form.value.mode === 'FACADE') {
    return {
      mode: 'facadeFloors',
      floorCount: form.value.floorCount,
      floorHeight: form.value.floorHeight
    };
  }
  const material = selectedMaterial.value;
  return {
    mode: 'knownDimension',
    knownWidth: form.value.knownWidth,
    knownHeight: form.value.knownHeight,
    materialId: material?._id || form.value.materialId,
    materialCode: material?.data?.code || material?.identity?.serial || null,
    materialName: material?.identity?.name || null,
    material: material?.identity?.name || material?.data?.code || null
  };
};

const createMaterial = async () => {
  materialCreating.value = true;
  try {
    const material = await materialEntity.create(materialForm.value);
    await materialEntity.list().catch(() => []);
    form.value.materialId = material._id;
    materialForm.value = { name: '', code: '', description: '' };
    showCreateMaterialDialog.value = false;
    toast.add({ severity: 'success', summary: t('common.created'), detail: t('geometryCapture.materialCreated'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.data?.message || error.message, life: 4000 });
  } finally {
    materialCreating.value = false;
  }
};

const statusSeverity = (capture) => {
  const state = getPrimaryState(capture.status);
  if (state === 'READY') return 'success';
  if (state === 'FAILED') return 'danger';
  if (state === 'PROCESSING') return 'info';
  if (state === 'COMPLETE') return 'secondary';
  return 'secondary';
};

const captureTitle = (capture) => capture.identity?.name || capture.identity?.reference || capture._id;

const captureMeta = (capture) => {
  const parts = [];
  const confidence = Number(capture.data?.extraction?.confidence || 0);
  if (capture.specs?.width && capture.specs?.height) {
    parts.push(`${Math.round(capture.specs.width)} x ${Math.round(capture.specs.height)} mm`);
  }
  if (confidence) parts.push(`${Math.round(confidence * 100)}%`);
  return parts.join(' · ') || t(`geometryCapture.modes.${capture.data?.mode || 'REMNANT'}`);
};

const createCapture = async () => {
  if (!canSubmit.value) return;
  uploading.value = true;
  try {
    const payload = new FormData();
    payload.append('file', selectedFile.value);
    payload.append('type', 'CAPTURE_PHOTO');
    payload.append('lineage', JSON.stringify({
      ...(form.value.mode === 'REMNANT' ? { warehouseId: form.value.warehouseId } : {}),
      ...(form.value.mode === 'FACADE' ? { projectId: form.value.projectId } : {})
    }));
    const artifact = await $fetch('/api/artifacts', {
      method: 'POST',
      body: payload
    });

    const capture = await captureEntity.create({
      mode: form.value.mode,
      warehouseId: form.value.mode === 'REMNANT' ? form.value.warehouseId : undefined,
      projectId: form.value.mode === 'FACADE' ? form.value.projectId : undefined,
      artifactId: artifact._id,
      preset: form.value.preset,
      calibration: calibrationForMode(),
      prompt: hasCreatePrompt.value ? createPrompt.value : undefined
    });

    await loadCaptures();
    selectedId.value = capture._id;
    selectedFile.value = null;
    createPrompt.value = {};
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
        calibration: capture.data?.calibration || {},
        prompt: capture.data?.prompt || {}
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

const saveManualRevision = async ({ capture, geometry, calibration }) => {
  if (!capture?._id || !geometry?.polygon?.outer?.length) return;
  recalculating.value = true;
  try {
    const updated = await $fetch(`/api/geometry-captures/${capture._id}/revisions/manual`, {
      method: 'POST',
      body: {
        geometry,
        calibration: calibration || capture.data?.calibration || {},
        reason: 'ui_geometry_review'
      }
    });
    await loadCaptures();
    selectedId.value = updated._id;
    toast.add({ severity: 'success', summary: t('geometryCapture.revisionSaved'), detail: t('geometryCapture.revisionActivatedDetail'), life: 3000 });
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
    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div class="flex flex-col gap-6">
        <Panel :header="$t('geometryCapture.newCapture')">
          <div class="flex flex-col gap-4">
            <SelectButton v-model="form.mode" :options="modeOptions" option-label="label" option-value="value" />

            <div v-if="form.mode === 'FACADE'" class="grid grid-cols-2 gap-3">
              <InputNumber v-model="form.floorCount" :placeholder="$t('geometryCapture.floorCount')" />
              <InputNumber v-model="form.floorHeight" :placeholder="$t('geometryCapture.floorHeight')" suffix=" mm" />
            </div>
            <div v-else class="flex flex-col gap-3">
              <div class="grid grid-cols-2 gap-3">
                <InputNumber v-model="form.knownWidth" :placeholder="$t('geometryCapture.knownWidth')" suffix=" mm" />
                <InputNumber v-model="form.knownHeight" :placeholder="$t('geometryCapture.knownHeight')" suffix=" mm" />
              </div>
              <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <Select
                  v-model="form.materialId"
                  :options="materialOptions"
                  option-label="label"
                  option-value="value"
                  :placeholder="$t('geometryCapture.selectMaterial')"
                  filter
                />
                <Button icon="pi pi-plus" severity="secondary" :aria-label="$t('geometryCapture.createMaterial')" @click="showCreateMaterialDialog = true" />
              </div>
            </div>

            <input
              ref="cameraInput"
              class="hidden"
              type="file"
              accept="image/*"
              capture="environment"
              @change="handleNativeFileSelect"
            />
            <input
              ref="galleryInput"
              class="hidden"
              type="file"
              accept="image/*"
              @change="handleNativeFileSelect"
            />

            <div class="grid grid-cols-2 gap-3">
              <Button :label="$t('geometryCapture.takePhoto')" icon="pi pi-camera" @click="openCamera" />
              <Button :label="$t('geometryCapture.choosePhoto')" icon="pi pi-image" severity="secondary" @click="openGallery" />
            </div>

            <small v-if="selectedFile" class="truncate text-muted-color">{{ selectedFile.name }}</small>
            <small v-else-if="!currentContextId" class="text-muted-color">{{ $t('geometryCapture.noContext') }}</small>

            <div v-if="selectedFileUrl" class="flex flex-col gap-2">
              <PhotoGeometryOverlay
                :image-url="selectedFileUrl"
                :prompt="createPrompt"
                prompt-editable
                @update:prompt="createPrompt = $event"
              />
              <div class="flex items-center justify-between gap-3">
                <small class="text-muted-color">
                  {{ hasCreatePrompt ? $t('geometryCapture.promptReady') : $t('geometryCapture.drawAssist') }}
                </small>
                <Button
                  v-if="hasCreatePrompt"
                  :label="$t('geometryCapture.clearAssist')"
                  icon="pi pi-times"
                  text
                  size="small"
                  severity="secondary"
                  @click="createPrompt = {}"
                />
              </div>
            </div>

            <Button
              :label="$t('geometryCapture.queueExtraction')"
              icon="pi pi-send"
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
          <div v-if="captures.length" class="flex flex-col gap-2">
            <div
              v-for="capture in captures"
              :key="capture._id"
              role="button"
              tabindex="0"
              class="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3 rounded-ui border border-content-border bg-subtle p-2 text-left transition hover:border-primary"
              :class="capture._id === selectedCapture?._id ? 'border-primary' : ''"
              @click="selectedId = capture._id"
              @keydown.enter="selectedId = capture._id"
            >
              <div class="min-h-16 overflow-hidden rounded-ui border border-content-border bg-subtle">
                <GeometryPreview v-if="capture.data?.geometry?.polygon?.outer?.length" :entity="capture" />
                <div v-else class="flex min-h-16 items-center justify-center text-muted-color">
                  <i class="pi pi-spin pi-cog"></i>
                </div>
              </div>
              <div class="flex min-w-0 flex-col gap-1">
                <div class="flex items-center gap-2">
                  <Tag :value="$t(`geometryCapture.modes.${capture.data?.mode || 'REMNANT'}`)" severity="secondary" size="small" />
                  <Tag :value="getPrimaryState(capture.status, 'DRAFT')" :severity="statusSeverity(capture)" size="small" />
                </div>
                <strong class="truncate text-sm">{{ captureTitle(capture) }}</strong>
                <small class="truncate text-muted-color">{{ captureMeta(capture) }}</small>
              </div>
            </div>
          </div>
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
        @save-manual-revision="saveManualRevision"
      />
      <StateBlock v-else :message="$t('geometryCapture.selectCapture')" icon="pi pi-vector-square" />
    </div>

    <StandardDialog v-model:visible="showCreateMaterialDialog" :header="$t('geometryCapture.createMaterial')" size="sm">
      <div class="flex flex-col gap-4 py-4">
        <div class="flex flex-col gap-1">
          <label>{{ $t('common.name') }}</label>
          <InputText v-model="materialForm.name" :placeholder="$t('common.name')" />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('common.code') }}</label>
          <InputText v-model="materialForm.code" :placeholder="$t('common.code')" />
        </div>
        <div class="flex flex-col gap-1">
          <label>{{ $t('common.description') }}</label>
          <InputText v-model="materialForm.description" :placeholder="$t('common.description')" />
        </div>
      </div>
      <template #footer>
        <Button :label="$t('common.cancel')" text severity="secondary" @click="showCreateMaterialDialog = false" />
        <Button
          :label="$t('common.create')"
          :loading="materialCreating"
          :disabled="!materialForm.name || !materialForm.code"
          @click="createMaterial"
        />
      </template>
    </StandardDialog>
  </StandardPage>
</template>
