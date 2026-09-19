<template>
  <Carousel :value="instances" :num-visible="3" :num-scroll="1" :responsive-options="responsive" circular class="w-full">
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

const responsive = [
  { breakpoint: '1280px', numVisible: 3, numScroll: 1 },
  { breakpoint: '768px', numVisible: 2, numScroll: 1 },
  { breakpoint: '560px', numVisible: 1, numScroll: 1 }
];
const identityOf = instance => instanceIdentity(props.type, instance);
</script>
