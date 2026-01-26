<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Button from 'primevue/button';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  catalog: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.catalog);

const handleCardClick = () => {
    emit('view', props.catalog);
};
</script>

<template>
  <div :class="[`variant-${variant}`]">
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <i class="pi pi-book"></i>
        <span class="font-bold">{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #content>
            <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                    <i class="pi pi-book"></i>
                    <span class="font-bold">{{ name }}</span>
                </div>
                <small>{{ catalog.material }}</small>
            </div>
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #title>
          <div class="flex justify-between items-center">
            <span class="font-bold">{{ name }}</span>
            <span class="text-xs uppercase opacity-50">{{ catalog.material }}</span>
          </div>
        </template>
        <template #content>
            <div class="flex flex-col gap-3">
                <div class="flex justify-between">
                    <span>Colors available</span>
                    <span class="font-bold">{{ catalog.summary?.colorCount || 0 }}</span>
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-end gap-1" @click.stop>
                <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text rounded @click="$emit('edit', catalog)" />
                <Button v-if="authStore.can('catalogs', 'delete')" icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', catalog)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
