<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-page-title">{{ $t('uiMapping.title') }}</h1>
      <p class="text-body text-muted">{{ $t('uiMapping.intro') }}</p>
    </header>

    <div class="flex flex-wrap items-center gap-3">
      <span class="text-label">{{ $t('uiMapping.pickScreen') }}</span>
      <AppSelect
        v-model="screenKey"
        :options="screenOptions"
        option-label="label"
        option-value="value"
        class="w-72"
      />
      <span class="text-label">{{ $t('uiMapping.seedLabel') }}</span>
      <InputText :model-value="String(seed)" class="w-24" readonly />
      <Button :label="$t('uiMapping.randomize')" icon="pi pi-refresh" size="small" @click="reroll" />
    </div>

    <GeneratedMappingScreen
      :screen="activeScreen"
      :contract="world.contract"
      :bundle="world.bundle"
      :instances="world.instances"
    />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import AppSelect from '~/components/shared/EntitySelect.vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
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

const screenOptions = Object.values(world.value.contract.screens).map(screen => ({
  label: `${screen.label} (${screen.template})`,
  value: screen.screenKey
}));
const detailScreens = Object.values(world.value.contract.screens)
  .filter(screen => screen.template === 'instanceDetail');
const fallbackScreen = detailScreens[0] || Object.values(world.value.contract.screens)[0];
const screenKey = ref(fallbackScreen.screenKey);
watch(seed, () => {
  const next = world.value.contract.screens[screenKey.value] ? screenKey.value : fallbackScreen.screenKey;
  screenKey.value = next;
});
const activeScreen = computed(() => world.value.contract.screens[screenKey.value]
  || Object.values(world.value.contract.screens)[0]);

const reroll = () => {
  router.push({ query: { ...route.query, seed: Math.floor(Math.random() * 999999) + 1 } });
};
</script>
