<template>
  <StandardDialog
    v-model:visible="isOpen"
    :closable="!isUploading"
    size="xl"
    @hide="handleClose"
  >
    <template #header>
      {{ cassette ? $t('cassette.editTitle') : $t('cassette.uploadTitle') }}
    </template>

    <div class="flex flex-col gap-6 py-2">
      <div v-if="!isUploading" class="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
        <div class="flex flex-col gap-2 min-w-0">
          <label for="cassetteName" class="font-medium">{{ $t('cassette.name') }}</label>
          <InputText
            id="cassetteName"
            v-model="name"
            :placeholder="$t('cassette.nameExample')"
            class="w-full"
            autofocus
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-medium">{{ $t('cassette.selectFile') }}</label>
          <FileUpload
            mode="basic"
            accept=".dxf"
            :maxFileSize="10000000"
            :auto="false"
            :customUpload="true"
            :chooseLabel="selectedFile ? selectedFile.name : $t('common.upload')"
            @select="handleFileSelect"
            class="w-full"
          />
        </div>
      </div>

      <div v-if="isUploading" class="flex flex-col items-center justify-center py-12 gap-4">
        <ProgressSpinner class="w-12 h-12" />
        <p class="font-medium">{{ $t('common.uploading') }}</p>
      </div>

      <div v-if="showMappingSection && !isUploading" class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_26rem] gap-6 min-h-[28rem]">
        <Panel>
          <template #header>
            <div class="flex items-center justify-between gap-3 w-full">
              <span>{{ $t('cassette.preview') }}</span>
              <Tag :value="selectedFile?.name" size="small" />
            </div>
          </template>
          <div class="h-[26rem]">
            <DrawingCanvas
              v-if="dxfText"
              :source="dxfText"
              source-type="dxf-text"
              :layer-mapping="layerMappings"
              mode="card"
            />
            <div v-else class="h-full flex flex-col items-center justify-center gap-3 opacity-60">
              <div class="w-12 h-12 border rounded-full flex items-center justify-center">
                <i class="pi pi-image"></i>
              </div>
              <p class="font-medium">{{ $t('cassette.noPreview') }}</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <template #header>
            <div class="flex items-center justify-between gap-3 w-full">
              <span>{{ $t('cassette.layerMapping') }}</span>
              <Tag :value="detectedLayers.length" size="small" />
            </div>
          </template>
          <div class="flex flex-col gap-4">
            <Message v-if="!hasRequiredNestingLayer" severity="warn" size="small">
              {{ $t('cassette.nestingLayerRequired', { layer: requiredNestingLayer }) }}
            </Message>

            <div v-if="detectedLayers.length > 0" class="flex flex-col gap-2 max-h-[22rem] overflow-y-auto pr-2">
              <div
                v-for="layer in detectedLayers"
                :key="layer"
                class="grid grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] gap-3 items-center"
              >
                <span class="truncate" :title="layer">{{ layer }}</span>
                <Select
                  v-model="layerMappings[layer]"
                  :options="layerStandards"
                  optionLabel="label"
                  optionValue="value"
                  :placeholder="$t('cassette.selectLayerType')"
                  class="w-full"
                  size="small"
                />
              </div>
            </div>
            <Message v-else severity="info" size="small">
              {{ $t('cassette.detectingLayers') }}
            </Message>
          </div>
        </Panel>
      </div>

      <Message v-if="errorMessage" severity="error" class="mt-4">
        {{ errorMessage }}
      </Message>
    </div>

    <template #footer>
      <div class="flex justify-end gap-2">
        <Button
          :label="$t('common.cancel')"
          severity="secondary"
          text
          :disabled="isUploading"
          @click="handleClose"
        />
        <Button
          :label="showMappingSection ? $t('common.save') : $t('common.upload')"
          :icon="showMappingSection ? 'pi pi-check' : 'pi pi-upload'"
          :disabled="!canUpload || isUploading"
          @click="handleUpload"
        />
      </div>
    </template>
  </StandardDialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useCassettesStore } from '~/stores/cassettes';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { storeToRefs } from 'pinia';
import Select from 'primevue/select';
import ProgressSpinner from 'primevue/progressspinner';
import Message from 'primevue/message';
import InputText from 'primevue/inputtext';
import FileUpload from 'primevue/fileupload';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import DrawingCanvas from '~/components/shared/DrawingCanvas.vue';
import {
  OCCS_LAYER_CODE_CASSETTE_MARK,
  OCCS_LAYER_CUT_OUTER,
  OCCS_LAYER_DIMENSION_CASSETTE,
  OCCS_LAYER_FOLD_ROUTE
} from '~/utils/occs/layers.js';

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  cassetteId: {
    type: String,
    default: null
  },
  producerActionId: {
    type: String,
    default: ''
  },
  producerActionBody: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:modelValue', 'uploaded', 'saved']);
const { t, locale } = useI18n();

const isOpen = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
});

const name = ref('');
const selectedFile = ref(null);
const isUploading = ref(false);
const errorMessage = ref('');
const cassette = ref(null);
const detectedLayers = ref([]);
const layerMappings = ref({});
const dxfText = ref('');
const requiredNestingLayer = OCCS_LAYER_CUT_OUTER;

const cassettesStore = useCassettesStore();
const layerStandardsStore = useLayerStandardsStore();

const { standards } = storeToRefs(layerStandardsStore);

watch(isOpen, async (newValue) => {
  if (newValue && standards.value.length === 0) {
    try {
      await layerStandardsStore.fetchStandards();
    } catch (error) {
      console.error('Failed to fetch layer standards:', error);
    }
  }
});

const layerStandards = computed(() => {
  if (!standards.value || standards.value.length === 0) {
    return [{ label: t('common.doNotUse'), value: null, category: null }];
  }

  const options = standards.value.map((standard) => {
    const data = standard.data || standard;
    const code = data.code || standard.code;
    const translatedName = data.i18n?.[locale.value]?.nameTemplate ||
      data.i18n?.en?.nameTemplate ||
      data.i18n?.ru?.nameTemplate ||
      '';
    return {
      label: translatedName && translatedName !== code ? `${code} · ${translatedName}` : code,
      value: code,
      category: data.category
    };
  });

  options.push({ label: t('common.doNotUse'), value: null, category: null });

  return options;
});

const showMappingSection = computed(() => {
  return selectedFile.value !== null && detectedLayers.value.length > 0;
});

const hasRequiredNestingLayer = computed(() => {
  return Object.values(layerMappings.value).includes(requiredNestingLayer);
});

const canUpload = computed(() => {
  return selectedFile.value && name.value.trim() && hasRequiredNestingLayer.value;
});

watch(() => props.cassetteId, async (newId) => {
  if (newId) {
    try {
      cassette.value = await cassettesStore.fetchById(newId);
      const mapping = cassette.value.definition?.mapping || cassette.value.definition?.data?.mapping || cassette.value.data?.definition?.mapping;
      if (mapping) {
        layerMappings.value = { ...mapping };
      }
    } catch (error) {
      errorMessage.value = t('cassette.errors.loadFailed');
      console.error('Failed to load cassette:', error);
    }
  } else {
    cassette.value = null;
    layerMappings.value = {};
  }
}, { immediate: true });

const readFileText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (event) => resolve(event.target.result);
  reader.onerror = () => reject(new Error(t('cassette.errors.parseDxfFailed')));
  reader.readAsText(file);
});

const guessLayerStandard = (layer) => {
  const normalized = layer.toLowerCase();
  if (/(outer|boundary|contour|profile|контур|габарит|обрез|рез)/i.test(normalized)) return OCCS_LAYER_CUT_OUTER;
  if (/(fold|bend|гиб|фальц|сгиб)/i.test(normalized)) return OCCS_LAYER_FOLD_ROUTE;
  if (/(mark|code|text|label|маркир|код|текст)/i.test(normalized)) return OCCS_LAYER_CODE_CASSETTE_MARK;
  if (/(dim|dimension|размер)/i.test(normalized)) return OCCS_LAYER_DIMENSION_CASSETTE;
  return null;
};

const handleFileSelect = async (event) => {
  if (!event.files || event.files.length === 0) return;

  selectedFile.value = event.files[0];
  dxfText.value = '';
  if (!name.value) {
    name.value = selectedFile.value.name.replace(/\.dxf$/i, '');
  }

  isUploading.value = true;
  errorMessage.value = '';

  try {
    const { extractDxfLayers } = await import('~/utils/dxfParser');
    const [fileText, layers] = await Promise.all([
      readFileText(selectedFile.value),
      extractDxfLayers(selectedFile.value)
    ]);
    dxfText.value = fileText;
    detectedLayers.value = layers;

    detectedLayers.value.forEach((layer) => {
      if (!Object.prototype.hasOwnProperty.call(layerMappings.value, layer)) {
        layerMappings.value[layer] = guessLayerStandard(layer);
      }
    });
  } catch (error) {
    errorMessage.value = error.message || t('cassette.errors.parseDxfFailed');
    console.error('DXF parsing failed:', error);
    selectedFile.value = null;
    detectedLayers.value = [];
    dxfText.value = '';
  } finally {
    isUploading.value = false;
  }
};

const handleUpload = async () => {
  if (!selectedFile.value || !name.value.trim() || !hasRequiredNestingLayer.value) return;

  isUploading.value = true;
  errorMessage.value = '';

  try {
    const mappings = {};
    Object.entries(layerMappings.value).forEach(([layer, standardCode]) => {
      if (standardCode) {
        mappings[layer] = standardCode;
      }
    });

    const artifactForm = new FormData();
    artifactForm.append('file', selectedFile.value);
    artifactForm.append('type', 'DXF_SOURCE');
    artifactForm.append('metadata', JSON.stringify({ purpose: 'cassette-import' }));
    const artifact = await $fetch('/api/artifacts', {
      method: 'POST',
      body: artifactForm
    });
    const data = {
      artifactId: artifact._id,
      name: name.value,
      layerMapping: mappings
    };
    const uploadResult = props.producerActionId
      ? await $fetch(`/api/process-definitions/active/actions/${encodeURIComponent(props.producerActionId)}/execute`, {
          method: 'POST',
          body: {
            ...props.producerActionBody,
            data: {
              ...(props.producerActionBody?.data || {}),
              ...data
            }
          }
        })
      : await $fetch('/api/cassette-designs/import', { method: 'POST', body: data });
    const uploadedTemplate = uploadResult?.template || uploadResult;

    emit('uploaded', uploadedTemplate);
    emit('saved', uploadResult);
    isOpen.value = false;
    resetForm();
  } catch (error) {
    errorMessage.value = error.data?.message || t('cassette.errors.uploadFailed');
    console.error('Upload failed:', error);
  } finally {
    isUploading.value = false;
  }
};

const handleClose = () => {
  if (!isUploading.value) {
    resetForm();
    isOpen.value = false;
  }
};

const resetForm = () => {
  name.value = '';
  selectedFile.value = null;
  dxfText.value = '';
  isUploading.value = false;
  errorMessage.value = '';
  cassette.value = null;
  layerMappings.value = {};
  detectedLayers.value = [];
};

defineExpose({
  handleFileSelect
});
</script>
