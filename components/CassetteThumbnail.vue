<template>
  <div ref="container" class="w-full h-full flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-[var(--p-content-border-color)]">
    <div v-if="loading" class="flex items-center justify-center">
      <i class="pi pi-spin pi-spinner text-[var(--p-text-muted-color)] opacity-50"></i>
    </div>
    <div v-else-if="renderingData" class="w-full h-full p-2 flex items-center justify-center">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        :viewBox="renderingData.viewBox" 
        class="w-full h-full max-w-full max-h-full transition-transform duration-500"
      >
        <!-- Standard DXF SVG -->
        <template v-if="renderingData.layers">
          <g v-for="layer in renderingData.layers" :key="layer.name" :stroke="layer.color" :stroke-width="layer.weight * 5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <g v-html="layer.paths.join('')"></g>
          </g>
        </template>
        
        <!-- Parametric SVG -->
        <template v-else>
          <!-- Extrusion Highlights -->
          <template v-for="(curve, idx) in renderingData.allCurves" :key="`c-${idx}`">
              <template v-if="curve.isExtrusion">
                  <path :d="curve.path" fill="currentColor" class="text-[var(--p-primary-color)] opacity-5" />
                  <path :d="curve.path" fill="none" stroke="currentColor" stroke-width="0.5" class="text-[var(--p-content-border-color)]" stroke-dasharray="4,4" />
              </template>
              <template v-else-if="curve.isBoundary">
                  <path 
                    :d="curve.path" 
                    fill="none" 
                    stroke="currentColor" 
                    stroke-width="3" 
                    class="text-[var(--p-primary-color)]" 
                    stroke-linejoin="round" 
                  />
              </template>
          </template>
        </template>
      </svg>
    </div>
    <div v-else class="text-xs text-[var(--p-text-muted-color)] opacity-20 italic">
      <i class="pi pi-image text-2xl"></i>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { generateSvgDataFromText } from '~/utils/dxfParser';
import { renderCassetteToSVG } from '~/utils/cassetteRenderer';

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
      cassette = await $fetch(`/api/cassettes/${cid}`);
    } catch (e) {
      console.warn('Failed to fetch cassette for thumbnail:', e);
    }
  }

  if (!cassette) {
    loading.value = false;
    return;
  }

  // If it's parametric, use the dynamic renderer
  if (cassette.type === 'PARAMETRIC' || cassette.data) {
    loading.value = true;
    try {
      // Use requestIdleCallback or a longer timeout to yield to UI thread
      if (window.requestIdleCallback) {
          await new Promise(resolve => window.requestIdleCallback(resolve, { timeout: 200 }));
      } else {
          await new Promise(resolve => setTimeout(resolve, 100));
      }

      const renderData = {
        params: {
          ...(cassette.data?.params || {}),
          ...(props.dimensions || {})
        },
        extrusions: cassette.data?.extrusions || []
      };
      
      const result = await renderCassetteToSVG(renderData);
      if (result) {
        renderingData.value = result;
      }
    } catch (error) {
      console.error('Failed to render parametric cassette:', error);
    } finally {
      loading.value = false;
    }
  } else {
    // Standard DXF cassette
    loading.value = true;
    try {
      const dxfText = await $fetch(`/api/cassettes/${cassette._id}/dxf`);
      renderingData.value = generateSvgDataFromText(dxfText, {}, { stroke: { color: 'currentColor', weight: 0.5 } });
    } catch (error) {
      console.warn('Failed to load DXF for thumbnail:', error);
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

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>