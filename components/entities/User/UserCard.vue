<template>
  <div v-if="user" :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <Chip>
        <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name?.charAt(0) : null" shape="circle" size="small" />
        <span>{{ name }}</span>
      </Chip>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <StandardCard @click="handleCardClick" class="cursor-pointer">
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name?.charAt(0) : null" shape="circle" />
                <IdentityBlock :entity="user" variant="compact" />
                <EntityStatus :entity="user" entity-type="user" variant="inline" />
            </div>
        </template>
      </StandardCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <StandardCard @click="handleCardClick" class="cursor-pointer">
        <template #title>
            <div class="flex flex-col items-center gap-4 text-center">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name?.charAt(0) : null" shape="circle" size="xlarge" />
                <IdentityBlock :entity="user" variant="compact" />
            </div>
        </template>
        <Divider />
        <div class="flex justify-center">
            <EntityStatus :entity="user" entity-type="user" />
        </div>
        <template #footer>
            <Divider />
            <div class="flex justify-center gap-2" @click.stop>
                <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text size="small" @click="$emit('edit', user)" />
                <Button v-if="authStore.can('users', 'delete')" icon="pi pi-trash" text size="small" severity="danger" @click="$emit('delete', user)" />
            </div>
        </template>
      </StandardCard>
    </template>
  </div>
</template>

<script setup>
/**
 * User View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Avatar from 'primevue/avatar';
import Chip from 'primevue/chip';
import Button from 'primevue/button';
import StandardCard from '~/components/shared/StandardCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';
import { useIdentity } from '~/composables/useBlocks';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();
const { name } = useIdentity(props.user);

const handleCardClick = () => {
    emit('view', props.user);
};
</script>