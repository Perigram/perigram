<script setup>
/**
 * User View Component - v24 Standardized
 */
import Avatar from 'primevue/avatar';
import Card from 'primevue/card';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { useAuthStore } from '~/stores/auth';

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

<template>
  <div :class="[`variant-${variant}`]">
    <!-- Inline -->
    <template v-if="variant === 'inline'">
      <div class="flex items-center gap-2">
        <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name.charAt(0) : null" shape="circle" size="small" />
        <span class="text-xs font-bold">{{ name }}</span>
      </div>
    </template>

    <!-- Compact -->
    <template v-else-if="variant === 'compact'">
      <div @click="handleCardClick" class="flex items-center gap-3 p-2 border rounded-xl pr-4 cursor-pointer">
        <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name.charAt(0) : null" shape="circle" />
        <div class="flex flex-col">
            <span class="text-sm font-bold leading-none">{{ name }}</span>
            <small class="text-[10px] opacity-50">{{ user.identity?.email }}</small>
        </div>
      </div>
    </template>

    <!-- Card -->
    <template v-else-if="variant === 'card'">
      <Card @click="handleCardClick" class="cursor-pointer">
        <template #content>
            <div class="flex flex-col items-center gap-4 py-4 text-center">
                <Avatar :image="user.identity?.avatarUrl" :label="!user.identity?.avatarUrl ? name.charAt(0) : null" shape="circle" class="w-20 h-20 text-2xl" />
                <div class="flex flex-col">
                    <span class="text-xl font-bold">{{ name }}</span>
                    <span class="text-sm opacity-50">{{ user.identity?.email }}</span>
                </div>
                <div class="flex gap-2 mt-2">
                    <Tag :value="user.status?.state || 'ACTIVE'" severity="success" />
                </div>
            </div>
        </template>
        <template #footer>
            <div class="flex justify-center gap-2" @click.stop>
                <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text rounded @click="$emit('edit', user)" />
                <Button v-if="authStore.can('users', 'delete')" icon="pi pi-trash" text rounded severity="danger" @click="$emit('delete', user)" />
            </div>
        </template>
      </Card>
    </template>
  </div>
</template>
