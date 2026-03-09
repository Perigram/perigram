<script setup>
/**
 * RequisitionCard - v24 Standardized
 */
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import TraceChain from '~/components/shared/links/TraceChain.vue';
import StandardCard from '~/components/shared/StandardCard.vue';
import { useSpecs } from '~/composables/useBlocks';

const props = defineProps({
  requisition: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.requisition);
};
</script>

<template>
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-shopping-cart"></i>
        <IdentityBlock :entity="requisition" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <div class="flex items-center justify-between gap-4">
            <IdentityBlock :entity="requisition" variant="compact" />
            <EntityStatus :entity="requisition" entity-type="requisition" variant="inline" />
        </div>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #header>
            <TraceChain :entity="requisition" />
        </template>
        <template #title>
            <div class="flex justify-between items-start gap-4">
                <IdentityBlock :entity="requisition" />
                <EntityStatus :entity="requisition" entity-type="requisition" variant="inline" />
            </div>
        </template>
        
        <Divider />
        <div class="flex flex-col gap-2">
            <div class="flex justify-between items-center">
                <small>Items</small>
                <span>{{ requisition.data?.items?.length || 0 }}</span>
            </div>
        </div>

        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('requisitions', 'edit')" icon="pi pi-pencil" text rounded @click="$emit('edit', requisition)" />
                <Button v-if="authStore.can('requisitions', 'delete')" icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', requisition)" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>