<template>
  <div>
    <EntityCard :entity="design" entity-type="cassette_design" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <i class="pi pi-cog"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Badge v-if="parameterCount" :value="parameterCount" severity="secondary" size="small" />
          <Tag v-if="dxfId" value="DXF" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="parameterEntries.length" class="mt-3 flex flex-wrap gap-2">
          <Tag
            v-for="item in parameterEntries.slice(0, 3)"
            :key="item.key"
            :value="`${item.key}: ${item.value}`"
            severity="secondary"
            size="small"
          />
        </div>
      </template>
      <Divider />
      <div class="grid grid-cols-1 gap-4">
        <CassetteThumbnail :cassette="design" />
        <DataBlock :entity="design" :fields="DESIGN_FIELDS" />
        <div v-if="templateId" class="flex items-center justify-between gap-4">
          <small class="text-muted-color">{{ $t('entities.cassetteTemplate') }}</small>
          <TraceLink type="cassetteTemplate" :id="templateId" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Design View Component - v24 Standardized
 * CassetteDesign has no status — uses EntityCard with status disabled.
 */
import { computed } from 'vue';
import Badge from 'primevue/badge';
import Tag from 'primevue/tag';
import Divider from 'primevue/divider';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';

const props = defineProps({
  design: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const DESIGN_FIELDS = [
  { path: 'data.parameters.A', i18n: 'cassette.rootDim', suffix: ' mm' },
  { path: 'data.parameters.C', i18n: 'cassette.faceDepth', suffix: ' mm' }
];

const parameterCount = computed(() => Object.keys(props.design.data?.parameters || {}).length);
const parameterEntries = computed(() => Object.entries(props.design.data?.parameters || {}).map(([key, value]) => ({ key, value })));
const dxfId = computed(() => props.design.data?.geometry?.dxfId || null);
const templateId = computed(() => props.design.lineage?.templateId || null);
</script>
