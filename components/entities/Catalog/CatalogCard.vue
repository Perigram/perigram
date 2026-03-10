<script setup>
/**
 * Catalog View Component - v24 Standardized
 */
import Tag from 'primevue/tag';
import Button from 'primevue/button';
import Divider from 'primevue/divider';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
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
  <div class="h-full cursor-pointer" @click="handleCardClick">
    <template v-if="variant === 'inline'">
      <IdentityBlock :entity="catalog" variant="inline" icon="pi pi-book" />
    </template>

    <template v-else-if="variant === 'compact'">
      <StandardCard>
        <template #title>
            <div class="flex items-center gap-2">
                <i class="pi pi-book"></i>
                <span class="truncate">{{ name }}</span>
            </div>
        </template>
        <template #subtitle>
            <Tag :value="catalog.material" severity="secondary" size="small" />
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard>
        <template #title>
            <div class="flex justify-between items-center gap-4">
                <span class="truncate">{{ name }}</span>
                <Tag :value="catalog.material" severity="secondary" size="small" />
            </div>
        </template>
        <Divider />
        <div class="flex justify-between items-center">
            <small>{{ $t('catalog.colorsAvailable') }}</small>
            <span>{{ catalog.summary?.colorCount || 0 }}</span>
        </div>
        <template #footer>
            <div class="flex justify-end gap-2" @click.stop>
                <Button v-if="authStore.can('catalogs', 'edit')" icon="pi pi-pencil" text rounded size="small" aria-label="Edit" @click="$emit('edit', catalog)" />
                <Button v-if="authStore.can('catalogs', 'delete')" icon="pi pi-trash" text rounded size="small" severity="danger" aria-label="Delete" @click="$emit('delete', catalog)" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>