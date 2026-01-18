<template>
  <div class="w-full h-full flex items-center justify-center overflow-hidden bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-[var(--p-content-border-color)]">
    <div v-if="loading" class="flex items-center justify-center">
      <i class="pi pi-spin pi-spinner text-[var(--p-text-muted-color)] opacity-50"></i>
    </div>
    <div v-else-if="svgData" class="w-full h-full p-2 flex items-center justify-center">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        :viewBox="svgData.viewBox" 
        class="w-full h-full max-w-full max-h-full transition-transform duration-500"
      >
        <g v-for="layer in svgData.layers" :key="layer.name" :stroke="layer.color" :stroke-width="layer.weight * 5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <g v-html="layer.paths.join('')"></g>
        </g>
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

const props = defineProps({
  cassetteId: {
    type: String,
    required: true
  }
});

const svgData = ref(null);
const loading = ref(false);

const cache = new Map();

const fetchThumbnail = async () => {
  if (!props.cassetteId) return;
  if (cache.has(props.cassetteId)) {
    svgData.value = cache.get(props.cassetteId);
    return;
  }

  loading.value = true;
  try {
    const dxfText = await $fetch(`/api/cassettes/${props.cassetteId}/dxf`);
    const data = generateSvgDataFromText(dxfText, {}, { stroke: { color: 'currentColor', weight: 0.5 } });
    svgData.value = data;
    cache.set(props.cassetteId, data);
  } catch (error) {
    console.warn('Failed to load cassette thumbnail:', error);
  } finally {
    loading.value = false;
  }
};

onMounted(fetchThumbnail);
watch(() => props.cassetteId, fetchThumbnail);
</script>
