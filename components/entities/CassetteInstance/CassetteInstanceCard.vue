<template>
  <div>
    <EntityCard :entity="instance" entity-type="cassette_instance" :variant="variant" :show-trace="false">
      <template #before-identity>
        <i class="pi pi-qrcode"></i>
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="reference" :value="reference" severity="secondary" size="small" />
          <Tag v-if="serial" :value="serial" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="designId || queueId" class="mt-3 flex flex-wrap gap-2 text-sm">
          <TraceLink v-if="designId" type="cassetteDesign" :id="designId" />
          <TraceLink v-if="queueId" type="queue" :id="queueId" />
        </div>
      </template>
      <Divider />
      <div class="flex flex-col gap-3">
        <DataBlock :entity="instance" :fields="INSTANCE_FIELDS" />
        <div v-if="designId" class="flex justify-between items-center gap-4">
          <small>{{ $t('cassette.design') }}</small>
          <TraceLink type="cassetteDesign" :id="designId" />
        </div>
        <div v-if="queueId" class="flex justify-between items-center gap-4">
          <small>{{ $t('entities.queue') }}</small>
          <TraceLink type="queue" :id="queueId" />
        </div>
      </div>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * Cassette Instance View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const designId = computed(() => props.instance.lineage?.cassetteDesignId || props.instance.lineage?.designId || null);
const queueId = computed(() => props.instance.lineage?.queueId || null);
const reference = computed(() => props.instance.identity?.reference || '');
const serial = computed(() => props.instance.identity?.serial || '');

const INSTANCE_FIELDS = [
  { path: 'identity.reference', i18n: 'common.reference' }
];
</script>
