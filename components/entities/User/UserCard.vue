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
      <!-- The popup's directory face: the avatar-forward identity block
           replaces the generic instance chrome (type label, icon row,
           trace); the expanded body carries only the fact rows. The
           identity line carries the proper message action — the email
           never renders (login data, not display data). -->
      <template #popup-identity>
        <div class="flex items-start gap-4">
          <Avatar
            :image="avatarUrl"
            :label="!avatarUrl ? avatarLabel : null"
            shape="circle"
            size="xlarge"
            class="shrink-0 [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
          />
          <div class="flex min-w-0 flex-1 flex-col items-start gap-1 pt-1">
            <span class="max-w-full truncate text-section-heading">{{ user.identity?.name }}</span>
            <Button
              :label="$t('support.sendMessage')"
              icon="pi pi-send"
              text
              size="small"
              class="-ml-2"
              :aria-label="$t('support.sendMessage')"
              @click="openDirectChat"
            />
            <div v-if="role || organizationCount" class="mt-1 flex flex-wrap gap-2">
              <Tag v-if="role" :value="role" severity="secondary" size="small" />
              <Tag v-if="organizationCount" :value="`${organizationCount} ${$t('profile.myOrganizations')}`" severity="info" size="small" />
            </div>
          </div>
        </div>
      </template>
      <template #expanded>
        <DataBlock type-id="user" :entity="user" :fields="USER_FIELDS" variant="compact" />
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
import { openInstanceChat } from '~/utils/instance-chat.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const emit = defineEmits(['view', 'edit', 'delete']);
const authStore = useAuthStore();

const avatarUrl = computed(() => props.user.data?.avatarUrl || null);
const avatarLabel = computed(() => (props.user.identity?.name || '?').charAt(0));
const role = computed(() => props.user.data?.role || '');
const organizationCount = computed(() => props.user.data?.memberships?.length || 0);
const avatarSize = computed(() => props.variant === 'inline' ? 'normal' : 'xlarge');

const { typeById } = useFileTypeView();
// The email field never reaches display surfaces: it is login data, not a
// display fact (SPEC §Chat thread).
const USER_FIELDS = computed(() => resolveInstanceDisplayFields({ typeId: 'user', surface: 'card', typeRecord: typeById('user') })
    .filter(field => !field.path.endsWith('.email')));

const openDirectChat = () => {
    openInstanceChat({ type: 'user', id: props.user._id, name: props.user.identity?.name || '' });
};

const handleCardClick = (event) => {
    if (isInteractiveEventTarget(event)) return;
    emit('view', props.user);
};

</script>
