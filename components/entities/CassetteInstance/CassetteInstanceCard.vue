<template>
  <div>
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="instance" variant="inline" icon="pi pi-box" />
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <IdentityBlock :entity="instance" variant="compact" />
                <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
            </div>
        </template>
      </StandardCard>
    </template>

    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <IdentityBlock :entity="instance" />
                <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
            </div>
        </template>
        <Divider />
        <div class="flex flex-col gap-2">
            <div v-if="instance.lineage?.designId" class="flex justify-between items-center">
                <small>{{ $t('cassette.design') }}</small>
                <TraceLink type="cassetteDesign" :id="instance.lineage.designId" />
            </div>
        </div>
      </StandardCard>
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
import StandardCard from '~/components/shared/StandardCard.vue';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});
</script>
