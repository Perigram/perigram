<template>
  <div v-if="user" :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <Chip>
        <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" size="small" />
        <IdentityBlock :entity="user" variant="compact" />
      </Chip>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <EntityCard :entity="user" entity-type="user" variant="compact" @click="handleCardClick" class="cursor-pointer" :show-trace="false">
        <template #before-identity>
            <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" />
        </template>
      </EntityCard>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <EntityCard :entity="user" entity-type="user" variant="card" @click="handleCardClick" class="cursor-pointer" :show-trace="false">
        <template #before-identity>
            <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" size="xlarge" />
        </template>
        <Divider />
        <DataBlock :entity="user" :fields="USER_FIELDS" />
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
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import IdentityBlock from '~/components/shared/blocks/IdentityBlock.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const avatarUrl = computed(() => props.user.identity?.avatarUrl || props.user.avatarUrl || null);
const avatarLabel = computed(() => (props.user.name || props.user.identity?.name || '?').charAt(0));

const USER_FIELDS = [
  { path: 'data.email', i18n: 'profile.email' },
  { path: 'data.role', i18n: 'billing.role' }
];

const handleCardClick = () => {
    emit('view', props.user);
};
</script>
