<template>
  <div>
    <!-- Inline View -->
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="template" variant="inline" icon="pi pi-clone" />
    </template>

    <!-- Compact View -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-clone"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="template" entity-type="cassette" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small>{{ template.definition?.type }}</small>
        </template>
      </StandardCard>
    </template>

    <!-- Card View -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <div class="flex justify-between items-center">
                <small>Cassette Template</small>
                <EntityStatus :entity="template" entity-type="cassette" variant="inline" />
            </div>
        </template>
        <template #title>
            <span class="truncate">{{ name }}</span>
        </template>
        <template #subtitle>
            <small>{{ template.definition?.type }}</small>
        </template>
        <Divider />
        <div class="flex flex-wrap gap-2">
            <Tag v-for="param in template.definition?.parameters" :key="param" :value="param" severity="secondary" size="small" />
        </div>
        <template #footer>
            <div class="flex gap-2">
                <Button label="Create Instance" icon="pi pi-plus" text size="small" class="flex-1" @click="$emit('create-instance', template)" />
                <Button icon="pi pi-download" text size="small" @click="downloadDxf" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * Cassette Template View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  template: { type: Object, required: true },
  variant: { type: String, default: 'card' } // inline, compact, card
});

const emit = defineEmits(['create-instance']);

const { name } = useIdentity(props.template);

const downloadDxf = () => {
    const url = `/api/cassettes/${props.template._id}/export`;
    window.open(url, '_blank');
};
</script>
