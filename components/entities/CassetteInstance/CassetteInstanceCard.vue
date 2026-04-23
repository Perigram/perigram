<template>
  <div>
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="instance" variant="inline" icon="pi pi-box" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="instance" entity-type="cassette_instance" variant="compact" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-start justify-between gap-3 min-w-0">
                <IdentityBlock :entity="instance" variant="compact" />
                <div class="shrink-0">
                    <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
                </div>
            </div>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="instance" entity-type="cassette_instance" variant="card" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-start gap-3 min-w-0">
                <IdentityBlock :entity="instance" />
                <div class="shrink-0">
                    <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
                </div>
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-2">
            <div v-if="instance.lineage?.designId" class="flex justify-between items-center">
                <small>{{ $t('cassette.design') }}</small>
                <TraceLink type="cassetteDesign" :id="instance.lineage.designId" />
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
import Divider from 'primevue/divider';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import TraceLink from '~/components/shared/links/TraceLink.vue';
import EntityCard from '~/components/shared/EntityCard.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
