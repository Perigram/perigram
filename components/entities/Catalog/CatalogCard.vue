<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Tag from 'primevue/tag';
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
      <div class="inline-flex items-center gap-2">
        <i class="pi pi-book"></i>
        <span>{{ name }}</span>
      </div>
    </template>

    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick">
        <template #title>
            <div class="flex items-center gap-2">
                <i class="pi pi-book"></i>
                <span class="truncate">{{ name }}</span>
            </div>
        </template>
        <template #subtitle>
            <Tag :value="catalog.material" severity="secondary" />
        </template>
      </Card>
    </template>

    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick">
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <Tag :value="catalog.material" severity="secondary" />
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex justify-between items-center">
                <small>{{ $t('catalog.colorsAvailable') }}</small>
                <span>{{ catalog.summary?.colorCount || 0 }}</span>
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text @click="$emit('edit', catalog)" />
                <Button v-if="authStore.can('catalogs', 'delete')" icon="pi pi-trash" text severity="danger" @click="$emit('delete', catalog)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>