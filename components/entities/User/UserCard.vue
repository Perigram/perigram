<template>
  <div v-if="user" :class="[`variant-${variant}`]" class="cursor-pointer" @click="handleCardClick">
    <InstanceCard :instance="user" type-id="user" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity>
        <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" :size="avatarSize" class="[&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover" />
      </template>
      <template #subtitle v-if="variant !== 'card'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="role" :value="role" severity="secondary" size="small" />
          <Tag v-if="organizationCount" :value="`${organizationCount} ${$t('profile.myOrganizations')}`" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content>
        <div v-if="email" class="mt-3 text-muted text-body">{{ email }}</div>
      </template>
      <Divider />
      <DataBlock type-id="user" :entity="user" :fields="USER_FIELDS" />
      <template #footer>
        <Divider />
        <div class="flex justify-center gap-2" @click.stop>
          <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text size="small" :aria-label="$t('common.edit')" @click="$emit('edit', user)" />
        </div>
      </template>
    </InstanceCard>
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
import InstanceCard from '~/components/shared/InstanceCard.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { useAuthStore } from '~/stores/auth';
import { isInteractiveEventTarget } from '~/utils/interactive-target.js';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

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
const avatarSize = computed(() => props.variant === 'inline' ? 'normal' : 'xlarge');

const { typeById } = useFileTypeView();
const USER_FIELDS = computed(() => resolveInstanceDisplayFields({ typeId: 'user', surface: 'card', typeRecord: typeById('user') }));

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.user);
};

</script>
