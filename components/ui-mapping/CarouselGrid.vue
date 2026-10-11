<template>
  <Carousel :value="instances" :num-visible="3" :num-scroll="1" circular class="w-full [&_.p-carousel-item]:grow [&_.p-carousel-item]:shrink-0 [&_.p-carousel-item]:basis-1/3">
    <template #item="slotProps">
      <div class="h-full px-2 pb-2">
        <Card v-if="slotProps.data" :class="[LAYOUT.clip, 'h-full w-full']">
          <template #header>
            <PreviewBox :type="type" :instance="slotProps.data" :payload="slotProps.data.payload" :preview-source="slotProps.data.previewSource" :seed="slotProps.data.id" />
          </template>
          <template #subtitle>
            <span :class="LAYOUT.nameClamp">{{ identityOf(slotProps.data) }}</span>
          </template>
        </Card>
      </div>
    </template>
  </Carousel>
</template>

<script setup>
import Carousel from 'primevue/carousel';
import Card from 'primevue/card';
import { useI18n } from 'vue-i18n';
import { LAYOUT, titleFor } from '#shared/ui-mapping/index.js';
import PreviewBox from './PreviewBox.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const { t } = useI18n();
const identityOf = instance => titleFor(instance, props.type, { unnamedLabel: t('common.unnamed') });
</script>
