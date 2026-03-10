<template>
  <div>
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-box"></i>
        <IdentityBlock :entity="instance" variant="compact" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ reference || 'Physical Unit' }}</small>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="instance" entity-type="cassette_instance" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ reference || 'Physical Unit' }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-4">
                <div class="flex justify-center">
                    <i class="pi pi-box"></i>
                </div>
                <div class="flex flex-col gap-2">
                    <div class="flex justify-between items-center">
                        <small>Reference</small>
                        <span>{{ reference || 'N/A' }}</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <small>Design ID</small>
                        <small>{{ instance.lineage?.designId }}</small>
                    </div>
                </div>
            </div>
        </template>
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
import StandardCard from '~/components/shared/StandardCard.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial, reference } = useIdentity(props.instance);
</script>
