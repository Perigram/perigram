<template>
  <Carousel :value="instances" :num-visible="3" :num-scroll="1" circular class="w-full [&_.p-carousel-item]:grow-0 [&_.p-carousel-item]:shrink-0 [&_.p-carousel-item]:basis-1/3">
    <template #item="slotProps">
      <Card v-if="slotProps.data" :class="[LAYOUT.clip, 'mx-2 w-full']">
        <template #header>
          <PreviewBox :type="type" :payload="slotProps.data.payload" :seed="slotProps.data.id" />
        </template>
        <template #subtitle>
          <span :class="LAYOUT.nameClamp">{{ identityOf(slotProps.data) }}</span>
        </template>
      </Card>
    </template>
  </Carousel>
</template>

<script setup>
import Carousel from 'primevue/carousel';
import Card from 'primevue/card';
import { LAYOUT, instanceIdentity } from '#shared/ui-mapping/index.js';
import PreviewBox from './PreviewBox.vue';

const props = defineProps({
  instances: { type: Array, default: () => [] },
  type: { type: Object, default: null },
  pool: { type: Object, default: () => ({}) },
  bundle: { type: Object, default: null }
});

const identityOf = instance => instanceIdentity(props.type, instance);
</script>
