<template>
  <div v-if="user" :class="[`variant-${variant}`]">
    <EntityCard :entity="user" entity-type="user" :variant="variant" @click="handleCardClick" class="cursor-pointer" :show-trace="false" :show-status="false">
      <template #before-identity>
        <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" size="xlarge" />
      </template>
      <Divider />
      <DataBlock :entity="user" :fields="USER_FIELDS" />
      <template #footer>
        <Divider />
        <div class="flex justify-center gap-2" @click.stop>
          <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text size="small" @click="$emit('edit', user)" />
        </div>
      </template>
    </EntityCard>
  </div>
</template>

<script setup>
/**
 * User View Component - v24 Standardized
 */
import Divider from 'primevue/divider';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const avatarUrl = computed(() => props.user.data?.avatarUrl || null);
const avatarLabel = computed(() => (props.user.identity?.name || '?').charAt(0));

const USER_FIELDS = [
  { path: 'data.email', i18n: 'profile.email' },
  { path: 'identity.reference', i18n: 'common.reference' }
];

const handleCardClick = () => {
    emit('view', props.user);
};

</script>
