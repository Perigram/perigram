<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-shopping-cart"></i>
        <span>{{ name }}</span>
        <EntityStatus :entity="requisition" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-shopping-cart"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="requisition" variant="inline" />
            </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-shopping-cart"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="requisition" variant="inline" />
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex justify-between items-center">
                <small>Items</small>
                <span>{{ requisition.summary?.itemCount || 0 }}</span>
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex justify-end gap-2" @click.stop>
                <Button 
                    v-if="state === 'DRAFT' && authStore.can('requisitions', 'edit')"
                    icon="pi pi-pencil" text
                    @click="$emit('edit', requisition)" 
                />
                <Button 
                    v-if="state === 'DRAFT' && authStore.can('requisitions', 'delete')"
                    icon="pi pi-trash" text severity="danger"
                    @click="$emit('delete', requisition)" 
                />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Requisition View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity, useStatus } from '~/composables/useBlocks';

const props = defineProps({
  requisition: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.requisition);
const { state } = useStatus(props.requisition);

const handleCardClick = () => {
    emit('view', props.requisition);
};
</script>