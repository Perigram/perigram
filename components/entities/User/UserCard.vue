<template>
  <div v-if="user" :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="inline-flex items-center gap-2">
        <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name.charAt(0) : null" shape="circle" size="small" />
        <span>{{ name }}</span>
        <EntityStatus :entity="user" entity-type="user" variant="inline" />
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <Card @click="handleCardClick">
        <template #title>
            <div class="flex items-center gap-4">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name.charAt(0) : null" shape="circle" />
                <span class="truncate">{{ name }}</span>
                <EntityStatus :entity="user" entity-type="user" variant="inline" />
            </div>
        </template>
        <template #subtitle>
            <small class="truncate">{{ user.identity?.email }}</small>
        </template>
      </Card>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick">
        <template #title>
            <div class="flex flex-col items-center gap-4 text-center">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name.charAt(0) : null" shape="circle" size="xlarge" />
                <span>{{ name }}</span>
            </div>
        </template>
        <template #subtitle>
            <div class="text-center">
                <small>{{ user.identity?.email }}</small>
            </div>
        </template>
        <template #content>
            <Divider />
            <div class="flex justify-center">
                <EntityStatus :entity="user" entity-type="user" />
            </div>
        </template>
        <template #footer>
            <Divider />
            <div class="flex justify-center gap-2" @click.stop>
                <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text @click="$emit('edit', user)" />
                <Button v-if="authStore.can('users', 'delete')" icon="pi pi-trash" text severity="danger" @click="$emit('delete', user)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>

<script setup>
/**
 * User View Component - v24 Standardized
 */
import Card from 'primevue/card';
import Divider from 'primevue/divider';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
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