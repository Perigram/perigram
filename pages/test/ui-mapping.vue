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
      <span class="text-label">{{ $t('uiMapping.densityLabel') }}</span>
      <SelectButton
        :model-value="pressure"
        :options="densityOptions"
        option-label="label"
        option-value="value"
        size="small"
        @update:model-value="mode => setDensity(mode)"
      />
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
import SelectButton from 'primevue/selectbutton';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { generateUiMappingWorld, DEFAULT_RANDOM_SEED } from '~/test-data/ui-mapping-random.js';

definePageMeta({ layout: 'ui-lab-layout' });

const route = useRoute();
const router = useRouter();
const seed = computed(() => {
  const parsed = Number(route.query.seed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RANDOM_SEED;
});
const world = computed(() => generateUiMappingWorld(seed.value));
const pressure = computed(() => {
  const raw = route.query.pressure;
  return raw === 'relaxed' || raw === 'tight' ? raw : 'auto';
});
const densityBias = computed(() => (pressure.value === 'relaxed' ? 16 : pressure.value === 'tight' ? -12 : 0));
const densityOptions = [
  { label: 'Relaxed', value: 'relaxed' },
  { label: 'Auto', value: 'auto' },
  { label: 'Tight', value: 'tight' }
];
const setDensity = mode => {
  router.push({ query: { ...route.query, pressure: mode === 'auto' ? undefined : mode } });
};
const screens = computed(() => Object.values(world.value.contract.screens));

const reroll = () => {
  router.push({ query: { ...route.query, seed: Math.floor(Math.random() * 999999) + 1 } });
};
</script>
