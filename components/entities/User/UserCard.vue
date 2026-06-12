<template>
  <div v-if="user" :class="[`variant-${variant}`]" class="cursor-pointer" @click="handleCardClick">
    <EntityCard :entity="user" entity-type="user" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" size="xlarge" />
      </template>
      <template #subtitle>
        <div class="flex flex-wrap gap-2">
          <Tag v-if="role" :value="role" severity="secondary" size="small" />
          <Tag v-if="organizationCount" :value="`${organizationCount} ${$t('profile.myOrganizations')}`" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="email" class="mt-3 text-sm text-muted-color">{{ email }}</div>
      </template>
      <Divider />
      <DataBlock entity-type="user" :entity="user" :fields="USER_FIELDS" />
      <template #footer>
        <Divider />
        <div class="flex justify-center gap-2" @click.stop>
          <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text size="small" :aria-label="$t('common.edit')" @click="$emit('edit', user)" />
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
import Tag from 'primevue/tag';
import { computed } from 'vue';
import EntityCard from '~/components/shared/EntityCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const avatarUrl = computed(() => props.user.data?.avatarUrl || null);
const avatarLabel = computed(() => (props.user.identity?.name || '?').charAt(0));
const email = computed(() => props.user.data?.email || props.user.identity?.reference || '');
const role = computed(() => props.user.data?.role || '');
const organizationCount = computed(() => props.user.data?.memberships?.length || 0);

const USER_FIELDS = [
  { path: 'data.email', i18n: 'profile.email' },
  { path: 'identity.reference', i18n: 'common.reference' }
];

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.user);
};

</script>
