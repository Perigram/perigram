<template>
  <div :class="[`variant-${variant}`]">
    <EntityCard :entity="tool" entity-type="tool_profile" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-wrench"></i>
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="diameter" :value="`D${diameter}`" severity="secondary" size="small" />
          <Tag v-if="kerf" :value="`${$t('toolProfile.kerf')}: ${kerf} mm`" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="angle" class="mt-3 text-sm text-muted-color">{{ $t('toolProfile.angle') }}: {{ angle }}°</div>
      </template>
      <Divider />
      <DataBlock entity-type="toolProfile" :entity="tool" :fields="FIELDS" />
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Tool Profile View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveEntityDisplayFields } from '~/utils/entity-display-contract.js';

const FIELDS = resolveEntityDisplayFields({ entityType: 'toolProfile', surface: 'card' });

const props = defineProps({
  tool: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const diameter = computed(() => props.tool.data?.diameter || null);
const kerf = computed(() => props.tool.data?.kerf || null);
const angle = computed(() => props.tool.data?.angle || null);
</script>
