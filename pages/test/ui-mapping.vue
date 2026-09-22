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
      />
      <Button
        :label="$t('uiMapping.stateMatrix')"
        icon="pi pi-eye"
        size="small"
        :severity="stateMatrix ? undefined : 'secondary'"
        :outlined="!stateMatrix"
        :aria-label="$t('uiMapping.stateMatrix')"
        @click="toggleStateMatrix"
      />
      <span v-if="stateMatrix" class="text-supporting text-muted">{{ $t('uiMapping.stateMatrixHint') }}</span>
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

    <section v-for="screen in screens" :id="`wsection-${screen.screenKey}`" :key="screen.screenKey" class="flex flex-col gap-3 scroll-mt-24">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-section-heading">{{ screen.label }}</span>
        <Tag :value="screen.template" severity="secondary" />
      </div>
      <GeneratedMappingScreen
        :screen="screen"
        :contract="world.contract"
        :bundle="world.bundle"
        :instances="world.instances"
        :source-states="sourceStatesFor(screen)"
        :spacing-scale="scale"
        :on-open="openInstance"
      />
    </section>

    <ScrollTop />
  </div>
</template>

<script setup>
import { computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import ScrollTop from 'primevue/scrolltop';
import Slider from 'primevue/slider';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import { generateUiMappingWorld, DEFAULT_RANDOM_SEED } from '~/test-data/ui-mapping-random.js';
import { SPACING_STEPS } from '#shared/ui-mapping/index.js';

definePageMeta({ layout: 'ui-lab-layout' });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { t } = useI18n();
const seed = computed(() => {
  const parsed = Number(route.query.seed);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RANDOM_SEED;
});
const world = computed(() => generateUiMappingWorld(seed.value));
const scale = computed(() => {
  const raw = Number(route.query.scale);
  return SPACING_STEPS.includes(raw) ? raw : 1;
});
const setScale = value => {
  router.push({ query: { ...route.query, scale: String(value) } });
};
// The real-world fixture source died with the legacy entity fixtures;
// the lab always renders the synthetic world now.
const screens = computed(() => Object.values(world.value.contract.screens));

// Data-state matrix: applies the world's seeded loading/denied/error
// source states so every RegionDataState presentation renders beside the
// naturally-ready screens (empty and no-record already ship as screens).
// On by default — the showcase exists to display the possibilities; the
// toggle opts back to the natural world.
const stateMatrix = computed(() => route.query.state !== 'off');
const sourceStatesFor = screen => (stateMatrix.value
  ? world.value.sourceStatesMatrix?.[screen.screenKey] || null
  : null);
const toggleStateMatrix = () => {
  const next = stateMatrix.value ? 'off' : undefined;
  router.push({ query: { ...route.query, state: next } });
};

// Instance navigation: the showcase routes identities in-page — the type's
// detail screen scrolls into view through the ?screen= query, so the
// onOpen contract (link-button identities) is demonstrable without a
// router-aware data layer. Types without a detail screen toast instead.
function openInstance(instance) {
  const key = `detail_${instance?.type}`;
  if (!world.value.contract.screens[key]) {
    toast.add({ severity: 'info', summary: t('uiMapping.openTargetMissing'), life: 2400 });
    return;
  }
  router.push({ query: { ...route.query, screen: key } });
}
watch(() => route.query.screen, async key => {
  if (!key || !import.meta.client) return;
  await nextTick();
  document.getElementById(`wsection-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}, { immediate: true });



const reroll = () => {
  router.push({ query: { ...route.query, seed: Math.floor(Math.random() * 999999) + 1 } });
};
</script>
