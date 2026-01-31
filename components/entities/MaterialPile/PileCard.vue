<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-database"></i>
        <span>{{ name }}</span>
        <EntityStatus :entity="pile" variant="inline" />
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="card-interactive">
        <template #title>
            <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-database"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="pile" variant="inline" />
            </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="card-interactive">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <div class="flex items-center gap-2">
                    <i class="pi pi-database"></i>
                    <span class="truncate">{{ name }}</span>
                </div>
                <EntityStatus :entity="pile" variant="inline" />
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <small>Receipt</small>
                    <span>{{ pile.identity?.reference || '---' }}</span>
                </div>
                <div class="flex justify-between items-center" v-if="pile.status?.timestamp">
                    <small>Updated</small>
                    <span>{{ new Date(pile.status.timestamp).toLocaleDateString() }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex justify-end gap-2" @click.stop>
                <Button 
                    v-if="authStore.can('materials', 'edit')"
                    icon="pi pi-pencil" text
                    @click="$emit('edit', pile)" 
                />
                <Button 
                    v-if="authStore.can('materials', 'read')"
                    icon="pi pi-search" text
                    @click="$emit('view', pile)" 
                />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * Material Pile View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Button from 'primevue/button';
import EntityStatus from '../shared/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  pile: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.pile);

const handleCardClick = () => {
    emit('view', props.pile);
};
</script>
