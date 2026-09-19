<template>
  <div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
      <h1 class="text-page-title">{{ $t('uiMapping.title') }}</h1>
      <p class="text-body text-muted">
        {{ $t('uiMapping.intro') }}
      </p>
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
    </div>

    <GeneratedMappingScreen
      :screen="activeScreen"
      :contract="contract"
      :bundle="bundle"
      :instances="instances"
    />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue';
import AppSelect from '~/components/shared/EntitySelect.vue';
import GeneratedMappingScreen from '~/components/ui-mapping/GeneratedMappingScreen.vue';
import {
  createUiMappingClientBundle,
  createUiMappingCompiledContract,
  createUiMappingInstances
} from '~/test-data/ui-mapping-fixtures.js';

definePageMeta({ layout: 'ui-lab-layout' });

const bundle = createUiMappingClientBundle();
const contract = createUiMappingCompiledContract();
const instances = createUiMappingInstances();

const screenOptions = Object.values(contract.screens).map(screen => ({
  label: `${screen.label} (${screen.template})`,
  value: screen.screenKey
}));
const screenKey = ref(contract.screens.auto_operator_document_detail?.screenKey || screenOptions[0].value);
const activeScreen = computed(() => contract.screens[screenKey.value] || contract.screens[screenOptions[0].value]);
</script>
