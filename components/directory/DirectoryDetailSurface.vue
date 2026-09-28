<template>
  <div :class="['flex flex-col gap-6 p-4', bounded ? 'max-h-[70vh] overflow-y-auto' : 'h-full overflow-y-auto']" data-directory-surface>
    <div v-if="loading">
      <StateBlock loading />
    </div>
    <div v-else-if="!entry">
      <StateBlock :message="$t('common.notAvailable')" />
    </div>
    <template v-else>
      <!-- Identity header -->
      <div class="flex items-start gap-4">
        <Avatar
          :image="avatarUrl"
          :label="!avatarUrl ? (entry.identity?.name || '?').charAt(0).toUpperCase() : null"
          size="xlarge"
          shape="circle"
          class="shrink-0 [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-1 pt-1">
          <span class="truncate text-section-heading">{{ entry.identity?.name }}</span>
          <small v-if="entry.type === 'user' && entry.directory?.sharesOrganization" class="text-muted">
            {{ activeOrganizationName }}
          </small>
          <div class="mt-1 flex flex-wrap gap-2">
            <Tag v-if="entry.type === 'organization' && entry.data?.type" :value="entry.data.type" severity="secondary" />
            <small v-if="entry.type === 'user' && organizationMemberships.length" class="text-muted">
              {{ organizationMemberships.length }} {{ $t('profile.myOrganizations') }}
            </small>
          </div>
        </div>
      </div>

      <!-- User surface -->
      <template v-if="entry.type === 'user'">
        <Panel v-if="detailedFields.length" :header="$t('profile.title')">
          <DataBlock type-id="user" :entity="detailed" :fields="detailedFields" />
        </Panel>
        <Panel v-if="organizationMemberships.length" :header="$t('auth.organization')">
          <div class="flex flex-col gap-2 py-2">
            <button
              v-for="row in organizationMemberships"
              :key="row.membership.organizationId"
              type="button"
              class="flex w-full items-center gap-3 rounded-[var(--p-border-radius-md)] border-0 bg-transparent p-2 text-left cursor-pointer hover:bg-subtle"
              :data-directory-org="row.membership.organizationId"
              @click="openOrganization(row.membership.organizationId)"
            >
              <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle">
                <i class="pi pi-building" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1 truncate">{{ row.organization.identity?.name }}</span>
              <Tag v-if="row.active" :value="$t('common.active')" severity="success" />
            </button>
          </div>
        </Panel>
      </template>

      <!-- Organization surface -->
      <template v-else>
        <Panel v-if="detailedFields.length" :header="$t('organization.details')">
          <DataBlock type-id="organization" :entity="detailed" :fields="detailedFields" />
        </Panel>
        <Panel v-if="partnership" :header="$t('partnerships.title')">
          <div class="flex items-center gap-2 py-2">
            <Tag :value="$t(`partnerships.status.${partnership.status}`)" :severity="partnershipSeverity" />
            <small v-if="partnership.direction === 'incoming'" class="text-muted">{{ $t('partnerships.incoming') }}</small>
            <small v-else class="text-muted">{{ $t('partnerships.outgoing') }}</small>
          </div>
        </Panel>
      </template>

      <!-- Action row: the surface owns its actions — panes and dialogs have
           no page-level action chrome. -->
      <div class="mt-auto flex flex-wrap justify-end gap-2" @click.stop>
        <template v-if="entry.type === 'user'">
          <Button
            v-if="entry.directory?.isSelf"
            :label="$t('nav.profile')"
            icon="pi pi-user"
            severity="secondary"
            outlined
            size="small"
            @click="navigateTo('/profile')"
          />
          <!-- Direct threads are server-gated to shared-organization (or
               own) recipients, so the chat action stays within that
               reach. -->
          <Button
            v-if="canChat"
            icon="pi pi-comments"
            severity="secondary"
            outlined
            size="small"
            :aria-label="$t('support.openChat')"
            data-testid="directory-user-chat"
            @click="openChat"
          />
          <Button
            v-if="canInvite"
            :label="$t('auth.inviteMember')"
            icon="pi pi-user-plus"
            size="small"
            @click="inviteToActiveOrganization"
          />
        </template>
        <template v-else>
          <!-- The pane IS the organization view: management surfaces are
               reached through the home shell's organization entries, not
               route-away buttons from the pane. Switching context
               rehydrates the workspace in place. -->
          <Button
            v-if="entry.directory?.isMember && !isActiveOrganization"
            :label="$t('profile.switchOrganization')"
            icon="pi pi-arrow-right-arrow-left"
            severity="secondary"
            outlined
            size="small"
            :loading="switching"
            @click="switchToOrganization"
          />
          <template v-else-if="canManagePartnerships">
            <Button
              v-if="!partnership"
              :label="$t('partnerships.addPartner')"
              icon="pi pi-handshake"
              size="small"
              :loading="requesting"
              @click="requestPartnership"
            />
            <template v-else-if="partnership.status === 'pending'">
              <Button
                v-if="partnership.direction === 'incoming'"
                :label="$t('common.approve')"
                icon="pi pi-check"
                size="small"
                :loading="responding"
                @click="respondPartnership('accept')"
              />
              <Button
                :label="partnership.direction === 'incoming' ? $t('common.reject') : $t('common.cancel')"
                icon="pi pi-times"
                severity="danger"
                text
                size="small"
                :loading="responding"
                @click="respondPartnership(partnership.direction === 'incoming' ? 'decline' : 'cancel')"
              />
            </template>
            <Button
              v-else-if="partnership.status === 'active'"
              :label="$t('partnerships.terminate')"
              icon="pi pi-times"
              severity="danger"
              text
              size="small"
              :loading="responding"
              @click="respondPartnership('cancel')"
            />
          </template>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import Avatar from 'primevue/avatar';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import Tag from 'primevue/tag';
import StateBlock from '~/components/shared/StateBlock.vue';
import DataBlock from '~/components/shared/blocks/DataBlock.vue';
import { resolveInstanceDisplayFields } from '~/utils/instance-display-contract.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useI18n } from 'vue-i18n';

// The directory detail surface renders user/organization detail INSIDE the
// home workspace: as an entity-bound workspace-page pane tab (desktop) or
// the bounded mobile dialog. It never routes away — related entities open
// through the same workspace seam.
const props = defineProps({
  typeId: { type: String, required: true },
  instanceId: { type: String, required: true },
  bounded: { type: Boolean, default: false }
});

const authStore = useAuthStore();
const toast = useToast();
const { t } = useI18n();

const entry = ref(null);
const detailed = ref({});
const partnerships = ref([]);
const loading = ref(true);

const { typeById } = useFileTypeView();
const detailedFields = computed(() => (detailed.value?._id
  ? resolveInstanceDisplayFields({ typeId: props.typeId, surface: 'card', typeRecord: typeById(props.typeId) })
  : []));
const avatarUrl = computed(() => (props.typeId === 'user' ? entry.value?.data?.avatarUrl || null : null));
const activeOrganizationId = computed(() =>
  authStore.organizationData?._id
  || authStore.userData?.organizationId
  || null);
const activeOrganizationName = computed(() => authStore.organizationData?.identity?.name || '');
const organizationMemberships = computed(() => {
  if (props.typeId !== 'user') return [];
  // Membership rows render only organizations the viewer can themselves
  // resolve: org names are not readable cross-tenant.
  const known = authStore.userOrganizations || [];
  return (detailed.value?.data?.memberships || [])
    .map(membership => {
      const organization = known.find(item => String(item._id || item.id) === String(membership.organizationId));
      return organization ? { membership, organization } : null;
    })
    .filter(Boolean);
});
const partnership = computed(() => {
  if (props.typeId !== 'organization') return null;
  return partnerships.value.find(item =>
    String(item.partnerOrganization?._id) === String(entry.value?._id)
  ) || null;
});
const partnershipSeverity = computed(() => ({
  pending: 'warn',
  active: 'success',
  declined: 'danger',
  terminated: 'secondary'
}[partnership.value?.status] || 'secondary'));
const isActiveOrganization = computed(() =>
  props.typeId === 'organization'
  && Boolean(activeOrganizationId.value)
  && String(entry.value?._id) === String(activeOrganizationId.value));
const canInvite = computed(() => Boolean(
  props.typeId === 'user'
  && entry.value
  && !entry.value.directory?.isSelf
  && !entry.value.directory?.sharesOrganization
  && activeOrganizationId.value
  && authStore.can('users', 'admin')
));
const canChat = computed(() => Boolean(
  props.typeId === 'user'
  && entry.value
  && !entry.value.directory?.isSelf
));
const canManagePartnerships = computed(() => Boolean(
  props.typeId === 'organization'
  && activeOrganizationId.value
  && !isActiveOrganization.value
  && authStore.can('organizations', 'admin')
));
const requesting = ref(false);
const responding = ref(false);
const switching = ref(false);

watch(() => [props.typeId, props.instanceId], load, { immediate: false });

onMounted(load);

async function load() {
  loading.value = true;
  entry.value = null;
  detailed.value = {};
  partnerships.value = [];
  try {
    const detailPath = props.typeId === 'user' ? '/api/users' : '/api/organizations';
    const [entryResponse, detailedResponse] = await Promise.all([
      $fetch(`/api/directory/${props.typeId}/${props.instanceId}`),
      $fetch(`${detailPath}/${props.instanceId}`).catch(() => ({}))
    ]);
    entry.value = entryResponse;
    detailed.value = detailedResponse || {};
    if (props.typeId === 'organization' && activeOrganizationId.value) {
      partnerships.value = await $fetch('/api/partnerships').catch(() => []);
    }
  } catch (error) {
    if (error?.statusCode !== 404) {
      toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
    }
  } finally {
    loading.value = false;
  }
}

function openOrganization(organizationId) {
  openInstanceInWorkspace({ typeId: 'organization', instanceId: String(organizationId) });
}

function openChat() {
  openInstanceChat({
    type: 'user',
    id: entry.value?._id,
    name: entry.value?.identity?.name || ''
  });
}

function inviteToActiveOrganization() {
  navigateTo({ path: '/organization/users', query: { invite: entry.value?._id } });
}

async function requestPartnership() {
  requesting.value = true;
  try {
    await $fetch('/api/partnerships', {
      method: 'POST',
      body: { partnerOrganizationId: entry.value?._id }
    });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('partnerships.requestSent'), life: 3000 });
    partnerships.value = await $fetch('/api/partnerships').catch(() => []);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    requesting.value = false;
  }
}

async function respondPartnership(action) {
  if (action === 'cancel' && !window.confirm(t('partnerships.cancelConfirm'))) return;
  responding.value = true;
  try {
    if (action === 'accept' || action === 'decline') {
      await $fetch(`/api/partnerships/${partnership.value._id}/${action}`, { method: 'POST' });
    } else {
      await $fetch(`/api/partnerships/${partnership.value._id}`, { method: 'DELETE' });
    }
    partnerships.value = await $fetch('/api/partnerships').catch(() => []);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    responding.value = false;
  }
}

async function switchToOrganization() {
  switching.value = true;
  try {
    await authStore.switchOrganization(entry.value?._id);
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  } finally {
    switching.value = false;
  }
}
</script>
