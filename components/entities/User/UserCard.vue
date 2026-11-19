<template>
  <div v-if="user" :class="[`variant-${variant}`]">
    <InstanceCard :instance="user" type-id="user" :variant="variant" :show-trace="false" :show-status="false">
      <template #before-identity v-if="variant !== 'inline'">
        <Avatar :image="avatarUrl" :label="!avatarUrl ? avatarLabel : null" shape="circle" :size="avatarSize" class="[&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover" />
      </template>
      <template #subtitle v-if="variant === 'compact'">
        <div class="flex flex-wrap gap-2">
          <Tag v-if="role" :value="role" severity="secondary" size="small" />
          <Tag v-if="organizationCount" :value="`${organizationCount} ${$t('profile.myOrganizations')}`" severity="info" size="small" />
        </div>
      </template>
      <template #compact-content v-if="variant === 'compact'">
        <FactRows :rows="userRows" variant="compact" />
      </template>
      <template #default v-if="variant === 'card'">
        <Divider />
        <FactRows :rows="userRows" />
      </template>
      <template #footer v-if="variant === 'card'">
        <Divider />
        <div class="flex justify-center gap-2" @click.stop>
          <Button v-if="authStore.can('users', 'edit')" icon="pi pi-pencil" text size="small" :aria-label="$t('common.edit')" @click="$emit('edit', user)" />
        </div>
      </template>
    </InstanceCard>
  </div>
</template>

<script setup>
import Divider from 'primevue/divider';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import { computed } from 'vue';
import InstanceCard from '~/components/shared/InstanceCard.vue';
import FactRows from '~/components/shared/FactRows.vue';
import { useAuthStore } from '~/stores/auth';
import { instanceFactRows } from '~/utils/fact-rows.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  user: { type: Object, required: true },
  variant: { type: String, default: 'card' }
});

const authStore = useAuthStore();
const { t, te, locale } = useI18n();

const avatarUrl = computed(() => props.user.data?.avatarUrl || null);
const avatarLabel = computed(() => (props.user.identity?.name || '?').charAt(0));
const role = computed(() => props.user.data?.role || '');
const organizationCount = computed(() => props.user.data?.memberships?.length || 0);
const avatarSize = 'xlarge';

const { typeById } = useFileTypeView();
// The email field never reaches display surfaces: it is login data, not a
// display fact (SPEC §Chat thread).
const userRows = computed(() => instanceFactRows({
  typeId: 'user',
  typeRecord: typeById('user'),
  entity: props.user,
  auth: {
    permissions: authStore.activePermissions,
    fieldPolicies: authStore.fieldPolicies,
    stateFieldPolicies: authStore.stateFieldPolicies
  },
  translator: { t, te, locale },
  skip: ['email']
}));
</script>
