<template>
  <div>
    <InstanceCard :entity="color" type-id="color" :variant="variant" :show-trace="false" :show-status="false">
      <template #header>
        <div class="h-32 w-full" :style="swatchStyle"></div>
      </template>
      <template #before-identity>
        <div class="w-6 h-6 rounded-full border shrink-0" :style="swatchStyle"></div>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <small>{{ color.data?.code || color.identity?.serial || hexCode || '—' }}</small>
      </template>
      <template #compact-content>
        <div v-if="catalogId" class="mt-3 text-body">
          <InstanceInlineRef type="catalog" :id="catalogId" />
        </div>
      </template>
      <Divider />
      <div class="flex justify-between items-center gap-4">
        <small class="text-muted">{{ $t('catalog.colorCode') }}</small>
        <span class="text-label">{{ color.data?.code || color.identity?.serial || hexCode || '—' }}</span>
      </div>
      <div class="flex justify-between items-center gap-4 mt-2">
        <small class="text-muted">{{ $t('assets.color') }}</small>
        <span class="text-technical">{{ hexCode || '—' }}</span>
      </div>
      <div v-if="catalogId" class="flex justify-between items-center gap-4 mt-2">
        <small class="text-muted">{{ $t('entities.catalog') }}</small>
        <InstanceInlineRef type="catalog" :id="catalogId" />
      </div>
    </InstanceCard>
  </div>
</template>

<script setup>
/**
 * Color View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import InstanceInlineRef from '~/components/shared/InstanceInlineRef.vue';

const props = defineProps({
  color: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const hexCode = computed(() => props.color.data?.visuals?.hexCode || null);
const catalogId = computed(() => props.color.lineage?.catalogId || null);
const swatchStyle = computed(() => (hexCode.value ? { backgroundColor: hexCode.value } : undefined));
</script>
