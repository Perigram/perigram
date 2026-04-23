<template>
  <div>
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="template" variant="inline" icon="pi pi-clone" />
    </template>

    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="template" entity-type="cassette_template" variant="compact" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-start justify-between gap-3 min-w-0">
                <div class="flex items-center gap-2 min-w-0">
                    <i class="pi pi-clone"></i>
                    <IdentityBlock :entity="template" variant="compact" />
                </div>
                <div class="shrink-0">
                    <EntityStatus :entity="template" entity-type="cassette_template" variant="inline" />
                </div>
            </div>
        </template>
        <template #subtitle>
            <small>{{ template.definition?.type }}</small>
        </template>
      </EntityCard>
    </template>

    <template v-else-if="variant === 'card'">
      <EntityCard :entity="template" entity-type="cassette_template" variant="card" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex justify-between items-start gap-3 min-w-0">
                <IdentityBlock :entity="template" />
                <div class="shrink-0">
                    <EntityStatus :entity="template" entity-type="cassette_template" variant="inline" />
                </div>
            </div>
        </template>
        <template #subtitle>
            <small>{{ template.definition?.type }}</small>
        </template>
        <Divider />
        <CassetteThumbnail :cassette="template" />
        <div class="flex flex-wrap gap-2 mt-2">
            <Tag v-for="param in template.definition?.parameters" :key="param" :value="param" severity="secondary" size="small" />
        </div>
        <template #footer>
            <div class="flex gap-2">
                <Button :label="$t('cassetteInstance.create')" icon="pi pi-plus" text size="small" class="flex-1" @click="emit('create-instance', template)" />
                <Button icon="pi pi-download" text size="small" @click="emit('download', template)" />
            </div>
        </template>
      </EntityCard>
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
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import CassetteThumbnail from '~/components/CassetteThumbnail.vue';

const props = defineProps({
  template: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['create-instance', 'download']);
</script>
