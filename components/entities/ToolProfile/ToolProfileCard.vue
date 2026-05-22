<template>
  <div :class="[`variant-${variant}`]">
    <EntityCard :entity="tool" entity-type="tool_profile" :variant="variant" class="card-interactive" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-wrench"></i>
      </template>
      <template #subtitle>
        <Tag v-if="diameter" :value="`D${diameter}`" severity="secondary" size="small" />
      </template>
      <Divider />
      <DataBlock :entity="tool" :fields="FIELDS" />
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

const FIELDS = [
    { path: 'data.diameter', i18n: 'toolProfile.diameter', suffix: ' mm' },
    { path: 'data.angle',    i18n: 'toolProfile.angle',    suffix: '°' },
    { path: 'data.kerf',     i18n: 'toolProfile.kerf',     suffix: ' mm' }
];

const props = defineProps({
  tool: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const diameter = computed(() => props.tool.data?.diameter || null);
</script>
