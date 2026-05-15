<template>
  <div>
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="instance" variant="inline" icon="pi pi-box" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="instance" entity-type="cassette_instance" variant="compact" :show-trace="false" />
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="instance" entity-type="cassette_instance" variant="card" :show-trace="false">
        <Divider />
        <div class="flex flex-col gap-3">
            <DataBlock :entity="instance" :fields="INSTANCE_FIELDS" />
            <div v-if="designId" class="flex justify-between items-center gap-4">
                <small>{{ $t('cassette.design') }}</small>
                <TraceLink type="cassetteDesign" :id="designId" />
            </div>
        </div>
      </EntityCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Instance View Component - v24 Standardized
 */
import { computed } from 'vue';
import Divider from 'primevue/divider';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const designId = computed(() => props.instance.lineage?.cassetteDesignId || props.instance.lineage?.designId || null);

const INSTANCE_FIELDS = [
  { path: 'identity.reference', i18n: 'common.reference' },
  { path: 'lineage.queueId', i18n: 'entities.queue' }
];
</script>
