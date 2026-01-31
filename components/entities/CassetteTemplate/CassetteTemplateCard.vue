<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-clone"></i>
        <span>{{ name }}</span>
      </div>
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <Card class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-clone"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="template" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ template.definition?.type }}</small>
        </template>
      </Card>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <Card class="card-interactive">
        <template #header>
            <div class="flex justify-between items-center p-2">
                <small>Cassette Template</small>
                <EntityStatus :entity="template" variant="inline" />
            </div>
        </template>
        <template #title>
            <span class="truncate">{{ name }}</span>
        </template>
        <template #subtitle>
            <small>{{ template.definition?.type }}</small>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-wrap gap-2">
                <Tag v-for="param in template.definition?.parameters" :key="param" :value="param" severity="secondary" />
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex gap-2">
                <Button label="Create Instance" icon="pi pi-plus" text class="flex-1" />
                <Button icon="pi pi-download" text @click="downloadDxf" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Template View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  template: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

const { name } = useIdentity(props.template);

const downloadDxf = () => {
    const url = `/api/cassettes/${props.template._id}/export`;
    window.open(url, '_blank');
};
</script>
