<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-page-title">{{ $t('uiMapping.title') }}</h1>
      <p class="text-body text-muted">{{ $t('uiMapping.intro') }}</p>
    </header>

    <div class="flex flex-wrap items-center gap-3">
      <span class="text-label">{{ $t('uiMapping.seedLabel') }}</span>
      <InputText :model-value="String(seed)" class="w-24" readonly />
      <Button :label="$t('uiMapping.randomize')" icon="pi pi-refresh" size="small" @click="reroll" />
      <Button
        :label="source === 'real' ? 'Real data' : 'Random'"
        :icon="source === 'real' ? 'pi pi-database' : 'pi pi-sparkles'"
        size="small"
        :severity="source === 'real' ? undefined : 'secondary'"
        @click="toggleSource"
      />
      <span class="text-label">{{ $t('uiMapping.scaleLabel') }}</span>
      <Slider
        :model-value="scale"
        :min="0.5"
        :max="2"
        :step="0.25"
        class="w-40"
        @update:model-value="value => setScale(value)"
      />
      <span class="text-technical w-10">{{ scale.toFixed(2) }}</span>
    </div>

    <section v-for="screen in screens" :key="screen.screenKey" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-section-heading">{{ screen.label }}</span>
        <Tag :value="screen.template" severity="secondary" />
      </div>
      <GeneratedMappingScreen
        :screen="screen"
        :contract="world.contract"
        :bundle="world.bundle"
        :instances="world.instances"
        :spacing-scale="scale"
      />
    </section>

    <ScrollTop />
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ScrollTop from 'primevue/scrolltop';
import Slider from 'primevue/slider';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { generateUiMappingWorld, DEFAULT_RANDOM_SEED } from '~/test-data/ui-mapping-random.js';
import { createRealUiMappingWorld } from '~/test-data/ui-mapping-real.js';
import { SPACING_STEPS } from '#shared/ui-mapping/index.js';

definePageMeta({ layout: 'ui-lab-layout' });

const route = useRoute();
const router = useRouter();
const seed = computed(() => {
  const parsed = Number(route.query.seed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RANDOM_SEED;
});
const source = computed(() => (route.query.source === 'real' ? 'real' : 'random'));
const world = computed(() => (source.value === 'real'
  ? createRealUiMappingWorld()
  : generateUiMappingWorld(seed.value)));
const scale = computed(() => {
  const raw = Number(route.query.scale);
  return SPACING_STEPS.includes(raw) ? raw : 1;
});
const setScale = value => {
  router.push({ query: { ...route.query, scale: String(value) } });
};
const screens = computed(() => Object.values(world.value.contract.screens));

const toggleSource = () => {
  router.push({ query: { ...route.query, source: source.value === 'real' ? undefined : 'real' } });
};

const reroll = () => {
  router.push({ query: { ...route.query, seed: Math.floor(Math.random() * 999999) + 1 } });
};
</script>
