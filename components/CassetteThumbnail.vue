<template>
  <div ref="container">
    <div v-if="loading">
      <i class="pi pi-spin pi-spinner"></i>
    </div>
    <div v-else-if="renderingData">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        :viewBox="renderingData.viewBox" 
      >
        <!-- Standard DXF SVG -->
        <template v-if="renderingData.layers">
          <g v-for="layer in renderingData.layers" :key="layer.name" :stroke="layer.color" :stroke-width="layer.weight * 5" fill="none">
            <g v-html="layer.paths.join('')"></g>
          </g>
        </template>
        
        <!-- Parametric SVG -->
        <template v-else>
          <!-- Extrusion Highlights -->
          <template v-for="(curve, idx) in renderingData.allCurves" :key="`c-${idx}`">
              <template v-if="curve.isExtrusion">
                  <path :d="curve.path" fill="currentColor" />
              </template>
              <template v-else-if="curve.isBoundary">
                  <path 
                    :d="curve.path" 
                    fill="none" 
                    stroke="currentColor" 
                    stroke-width="2" 
                  />
              </template>
          </template>
        </template>
      </svg>
    </div>
    <div v-else>
      <i class="pi pi-image"></i>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { generateSvgDataFromText, buildLayerPenMap } from '~/utils/dxfParser';
import { renderCassetteToSVG } from '~/utils/cassetteRenderer';
import { useLayerStandardsStore } from '~/stores/layerStandards';
import { usePenTemplatesStore } from '~/stores/penTemplates';
import { storeToRefs } from 'pinia';

const layerStandardsStore = useLayerStandardsStore();
const penTemplatesStore = usePenTemplatesStore();
const { standards } = storeToRefs(layerStandardsStore);
const { pens, systemPens } = storeToRefs(penTemplatesStore);

const props = defineProps({
  cassetteId: {
    type: String,
    required: false
  },
  cassette: {
    type: Object,
    default: null
  },
  dimensions: {
    type: Object,
    default: null
  }
});

const renderingData = ref(null);
const loading = ref(false);

const cassetteType = (cassette) => cassette?.type || cassette?.data?.type || cassette?.definition?.type || '';
const cassetteDefinition = (cassette) => cassette?.definition?.data || cassette?.definition || cassette?.data?.definition || {};
const cassetteMapping = (cassette) => cassetteDefinition(cassette)?.mapping || {};
const cassetteGraph = (cassette) => {
  const definition = cassetteDefinition(cassette);
  return {
    params: definition?.params || {},
    extrusions: Array.isArray(definition?.extrusions) ? definition.extrusions : []
  };
};

// Cache keys to prevent redundant renders
let lastRenderKey = '';

const container = ref(null);
const isVisible = ref(false);

const updateThumbnail = async () => {
  if (!isVisible.value) return;
  
  let cassette = props.cassette;
  const cid = props.cassetteId?.toString();
  
  // Create a unique key for this specific configuration
  const currentKey = `${cid}_${JSON.stringify(props.dimensions)}`;
  if (currentKey === lastRenderKey && renderingData.value) return;
  lastRenderKey = currentKey;
  
  if (!cassette && cid) {
    loading.value = true;
    try {
      // First try designs (most common for baked/uploaded)
      cassette = await $fetch(`/api/cassette-designs/${cid}`).catch(() => null);
      if (!cassette) {
          // Then try templates
          cassette = await $fetch(`/api/cassettes/${cid}`).catch(() => null);
      }
    } catch (e) {
      console.warn('Failed to fetch item for thumbnail:', e);
    }
  }

  if (!cassette) {
    loading.value = false;
    return;
  }

  // 1. Handle Designs (Baked/Static Geometry)
  if (cassette.geometry?.dxfId) {
    loading.value = true;
    try {
      const dxfText = await $fetch(`/api/files/download/${cassette.geometry.dxfId}?bucket=cassettes`);
      const data = await generateSvgDataFromText(dxfText, {}, { stroke: { color: 'currentColor', weight: 0.5 } });
      if (data) renderingData.value = data;
    } catch (error) {
      console.warn('Failed to load design DXF for thumbnail:', error);
    } finally {
      loading.value = false;
    }
    return;
  }

  // 2. Handle Parametric Templates
  const type = cassetteType(cassette);
  const graph = cassetteGraph(cassette);

  if (type === 'PARAMETRIC' || graph.extrusions.length > 0 || Object.keys(graph.params).length > 0) {
    loading.value = true;
    try {
      if (window.requestIdleCallback) {
          await new Promise(resolve => window.requestIdleCallback(resolve, { timeout: 200 }));
      } else {
          await new Promise(resolve => setTimeout(resolve, 100));
      }

      const renderData = {
        params: {
          ...graph.params,
          ...(props.dimensions || {})
        },
        extrusions: graph.extrusions
      };
      
      const result = await renderCassetteToSVG(renderData);
      if (result) renderingData.value = result;
    } catch (error) {
      console.error('Failed to render parametric cassette:', error);
    } finally {
      loading.value = false;
    }
    return;
  }

  // 3. Handle Standard Templates (Fallback: find associated design)
  if (type === 'STANDARD') {
    loading.value = true;
    try {
      const design = await $fetch(`/api/cassette-designs/by-template/${cassette._id}`);
      if (design?.geometry?.dxfId) {
        const dxfText = await $fetch(`/api/files/download/${design.geometry.dxfId}?bucket=cassettes`);
        const defaultPen = systemPens.value[0] || { stroke: { color: 'currentColor', weight: 0.5 } };
        const layerToPenMap = buildLayerPenMap(cassetteMapping(cassette), standards.value, pens.value);
        const data = await generateSvgDataFromText(dxfText, layerToPenMap, defaultPen);
        if (data) renderingData.value = data;
      }
    } catch (error) {
      console.warn('Failed to load standard template design for thumbnail:', error);
    } finally {
      loading.value = false;
    }
  }
};

onMounted(() => {
    if (!container.value) return;
    
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            isVisible.value = true;
            updateThumbnail();
            observer.disconnect();
        }
    }, { threshold: 0.1 });
    
    observer.observe(container.value);
});

watch(() => [props.cassetteId, props.cassette, props.dimensions], () => {
    if (isVisible.value) updateThumbnail();
}, { deep: true });
</script>
