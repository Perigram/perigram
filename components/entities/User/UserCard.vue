<template>
  <div v-if="user" :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <Chip>
        <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? user.identity?.name?.charAt(0) : null" shape="circle" size="small" />
        <span>{{ user.identity?.name }}</span>
      </Chip>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="user" entity-type="user" variant="compact" @click="handleCardClick" class="cursor-pointer" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex items-center gap-3 min-w-0">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? user.identity?.name?.charAt(0) : null" shape="circle" />
                <IdentityBlock :entity="user" variant="compact" />
                <div class="shrink-0">
                    <EntityStatus :entity="user" entity-type="user" variant="inline" />
                </div>
            </div>
        </template>
      </EntityCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="user" entity-type="user" variant="card" @click="handleCardClick" class="cursor-pointer" :show-trace="false" :show-status="false">
        <template #title>
            <div class="flex flex-col items-center gap-4 text-center">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? user.identity?.name?.charAt(0) : null" shape="circle" size="xlarge" />
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
      </EntityCard>
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
import EntityCard from '~/components/shared/EntityCard.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import EntityStatus from '~/components/shared/status/EntityStatus.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const handleCardClick = () => {
    emit('view', props.user);
};
</script>
