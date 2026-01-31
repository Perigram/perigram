<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-box"></i>
        <span>{{ serial }}</span>
        <EntityStatus :entity="instance" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="instance" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ reference || 'Physical Unit' }}</small>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ serial }}</span>
                <EntityStatus :entity="instance" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ reference || 'Physical Unit' }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-4">
                <div class="flex justify-center p-4">
                    <i class="pi pi-box text-4xl"></i>
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
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Instance View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  instance: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const { serial, reference } = useIdentity(props.instance);
</script>