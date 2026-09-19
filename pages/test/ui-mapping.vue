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
  </div>
</template>

<script setup>
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
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
const screens = computed(() => Object.values(world.value.contract.screens));

const reroll = () => {
  router.push({ query: { ...route.query, seed: Math.floor(Math.random() * 999999) + 1 } });
};
</script>
