<template>
  <StandardPage :title="entry?.identity?.name || $t('profile.title')">
    <template #actions>
      <Button
        v-if="entry?.directory?.isSelf"
        :label="$t('nav.profile')"
        icon="pi pi-user"
        severity="secondary"
        outlined
        @click="router.push('/profile')"
      />
      <Button
        v-if="entry && !entry.directory?.isSelf"
        icon="pi pi-comments"
        severity="secondary"
        outlined
        :aria-label="$t('support.openChat')"
        @click="openChat"
      />
      <Button
        v-if="canInvite"
        :label="$t('auth.inviteMember')"
        icon="pi pi-user-plus"
        @click="inviteToActiveOrganization"
      />
    </template>

    <div v-if="loading">
      <StateBlock loading />
    </div>
    <div v-else-if="!entry">
      <StateBlock :message="$t('common.notAvailable')" />
    </div>
    <div v-else class="grid grid-cols-1 gap-6 py-4 md:grid-cols-12">
      <div class="md:col-span-4">
        <Panel class="h-full">
          <div class="flex flex-col items-center text-center gap-4 py-4">
            <Avatar
              :image="entry.data?.avatarUrl || null"
              :label="!entry.data?.avatarUrl ? (entry.identity?.name || '?').charAt(0).toUpperCase() : null"
              size="xlarge"
              shape="circle"
              class="[&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
            />
            <div class="flex flex-col gap-1">
              <p class="m-0">{{ entry.identity?.name }}</p>
              <small v-if="entry.directory?.sharesOrganization" class="text-muted">{{ activeOrganizationName }}</small>
            </div>
          </div>
        </Panel>
      </div>
      <div class="flex flex-col gap-6 md:col-span-8">
        <Panel v-if="detailedFields.length" :header="$t('profile.title')">
          <DataBlock type-id="user" :entity="detailed" :fields="detailedFields" />
        </Panel>
        <Panel v-if="memberships.length" :header="$t('auth.organization')">
          <div class="flex flex-col gap-2 py-2">
            <NuxtLink
              v-for="row in memberships"
              :key="row.membership.organizationId"
              :to="`/organizations/${row.membership.organizationId}`"
              class="no-underline"
            >
              <OrganizationCard :organization="row.organization" variant="inline" />
            </NuxtLink>
          </div>
        </Panel>
      </div>
    </div>
  </StandardPage>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Avatar from 'primevue/avatar';
import StandardPage from '~/components/shared/StandardPage.vue';
import StateBlock from '~/components/shared/StateBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import OrganizationCard from '~/components/entities/Organization/OrganizationCard.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';

definePageMeta({
  layout: 'app',
  middleware: 'auth'
});

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

const entry = ref(null);
const detailed = ref({});
const loading = ref(true);

const { typeById } = useFileTypeView();
const detailedFields = computed(() => (detailed.value?._id
  ? resolveInstanceDisplayFields({ typeId: 'user', surface: 'card', typeRecord: typeById('user') })
  : []));
const memberships = computed(() => {
  // Membership rows render only organizations the viewer can themselves
  // resolve: org names are not readable cross-tenant, and directory pages
  // must not render unidentified id chips.
  const known = authStore.userOrganizations || [];
  return (detailed.value?.data?.memberships || [])
    .map(membership => {
      const organization = known.find(item => String(item._id || item.id) === String(membership.organizationId));
      return organization ? { membership, organization } : null;
    })
    .filter(Boolean);
});
const activeOrganizationId = computed(() =>
  authStore.organizationData?._id
  || authStore.userData?.organizationId
  || null);
const activeOrganizationName = computed(() => authStore.organizationData?.identity?.name || '');
const canInvite = computed(() => Boolean(
  entry.value
  && !entry.value.directory?.isSelf
  && !entry.value.directory?.sharesOrganization
  && activeOrganizationId.value
  && authStore.can('users', 'admin')
));

onMounted(async () => {
  const id = route.params.id;
  try {
    const [entryResponse, detailedResponse] = await Promise.all([
      $fetch(`/api/directory/user/${id}`),
      $fetch(`/api/users/${id}`).catch(() => ({}))
    ]);
    entry.value = entryResponse;
    detailed.value = detailedResponse || {};
  } catch (error) {
    if (error?.statusCode === 404) {
      showToastError(t('common.notAvailable'));
    } else {
      showToastError(error?.data?.message || error.message);
    }
  } finally {
    loading.value = false;
  }
});

function openChat() {
  openInstanceChat({
    type: 'user',
    id: entry.value?._id,
    name: entry.value?.identity?.name || ''
  });
}

function inviteToActiveOrganization() {
  router.push({ path: '/organization/users', query: { invite: entry.value?._id } });
}

function showToastError(detail) {
  toast.add({ severity: 'error', summary: t('common.error'), detail, life: 3000 });
}
</script>
