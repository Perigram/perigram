<template>
  <ResponsiveGrid variant="wide">
    <Panel v-for="item in systemScreens" :key="item.screenKey || item.route">
      <div class="flex h-full flex-col gap-4">
        <div class="flex items-center gap-3">
          <i :class="item.icon || 'pi pi-building'" class="text-xl text-primary" aria-hidden="true"></i>
          <div class="min-w-0">
            <h2 class="m-0 text-base">{{ systemLabel(item.labelKey, item.screenKey) }}</h2>
            <small v-if="item.descriptionKey" class="text-muted-color">{{ systemLabel(item.descriptionKey) }}</small>
          </div>
        </div>
        <div class="mt-auto">
          <Button icon="pi pi-arrow-right" :aria-label="systemLabel(item.labelKey, item.screenKey)" size="small" @click="router.push(item.route)" />
        </div>
      </div>
    </Panel>
  </ResponsiveGrid>
</template>

<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import { useI18n } from 'vue-i18n';
import ResponsiveGrid from '~/components/shared/ResponsiveGrid.vue';

const props = defineProps({
  screen: { type: Object, required: true }
});

const router = useRouter();
const { t, te } = useI18n();

const systemScreens = computed(() => (props.screen.systemScreens || []).filter(item => item.route));

function systemLabel(key = '', fallback = '') {
  return key && te(key) ? t(key) : fallback || key;
}
</script>
