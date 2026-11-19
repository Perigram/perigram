<template>
  <div :class="['flex flex-col gap-4 p-4', bounded ? '' : 'h-full overflow-y-auto']" data-directory-surface>
    <div v-if="loading">
      <StateBlock loading />
    </div>
    <div v-else-if="!entry">
      <StateBlock :message="$t('common.notAvailable')" />
    </div>
    <template v-else>
      <!-- Identity header (the generated overview carries its own) -->
      <div v-if="!overviewScreen" class="flex items-center gap-4">
        <span class="relative shrink-0">
          <Avatar
            :image="avatarUrl"
            :label="!avatarUrl ? (entry.identity?.name || '?').charAt(0).toUpperCase() : null"
            size="xlarge"
            shape="circle"
            class="[&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
          />
          <!-- Presence is the active-organization scope: org-mates only. -->
          <span
            v-if="entry.type === 'user' && userOnline"
            class="absolute right-0 bottom-0 h-3.5 w-3.5 rounded-ui bg-status-success"
            :aria-label="$t('support.online')"
          />
        </span>
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="truncate text-section-heading">{{ entry.identity?.name }}</span>
          <small v-if="entry.type === 'user' && entry.directory?.sharesOrganization" class="text-muted text-supporting">
            {{ activeOrganizationName }}
          </small>
        </div>
      </div>

      <!-- Sections are owned by PrimeVue: Panel carries the section
           chrome, Menu the organization entries. -->
      <template v-if="entry.type === 'user'">
        <Panel v-if="detailRows.length" :header="$t('common.details')">
          <FactRows :rows="detailRows" />
        </Panel>
        <Panel v-if="membershipOptions.length" :header="$t('profile.organizations')">
          <Menu :model="membershipMenuItems" class="w-full" :pt="flatMenu" />
        </Panel>
      </template>

      <!-- Organization surface -->
      <template v-else>
        <!-- The active organization's PANE renders its real page: the
             generated overview (identity header + management entries)
             from the hydrated manifest. The popup (bounded) keeps the
             directory profile — a page inside a popup would stack two
             surfaces. -->
        <GeneratedOrganizationOverview
          v-if="overviewScreen && !bounded"
          :screen="overviewScreen"
        />
        <template v-else>
          <Panel v-if="detailRows.length" :header="$t('common.details')">
            <FactRows :rows="detailRows" />
          </Panel>
          <Panel v-if="partnership" :header="$t('partnerships.title')">
            <div class="flex items-center gap-2">
              <Tag :value="$t(`partnerships.status.${partnership.status}`)" :severity="partnershipSeverity" />
              <small v-if="partnership.direction === 'incoming'" class="text-muted">{{ $t('partnerships.incoming') }}</small>
              <small v-else class="text-muted">{{ $t('partnerships.outgoing') }}</small>
            </div>
          </Panel>
        </template>
      </template>

      <!-- Action row: the surface owns its actions — panes and dialogs have
           no page-level action chrome. One severity system: the single
           primary action is the default button, the rest are text,
           destructive stays danger text. -->
      <div class="mt-auto flex flex-wrap justify-end gap-2" @click.stop>
        <template v-if="entry.type === 'user'">
          <Button
            v-if="entry.directory?.isSelf"
            :label="$t('nav.profile')"
            icon="pi pi-user"
            text
            severity="secondary"
            size="small"
            @click="openProfileSettings"
          />
          <!-- Direct threads are server-gated to shared-organization (or
               own) recipients, so the chat action stays within that
               reach. -->
          <Button
            v-if="canChat"
            :label="$t('support.sendMessage')"
            icon="pi pi-send"
            size="small"
            data-testid="directory-user-chat"
            :aria-label="$t('support.sendMessage')"
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
               rehydrates the workspace in place. The chat entry follows
               the detail-surface conversation contract — members open the
               org's own instance thread from the record. -->
          <Button
            v-if="entry.directory?.isMember"
            icon="pi pi-comments"
            text
            severity="secondary"
            size="small"
            :aria-label="$t('support.openChat')"
            data-testid="directory-org-chat"
            @click="openOrgChat"
          />
          <Button
            v-if="entry.directory?.isMember && !isActiveOrganization"
            :label="$t('profile.switchOrganization')"
            icon="pi pi-arrow-right-arrow-left"
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
import Panel from 'primevue/panel';
import Menu from 'primevue/menu';
import Button from 'primevue/button';
import Tag from 'primevue/tag';
import StateBlock from '~/components/shared/StateBlock.vue';
import FactRows from '~/components/shared/FactRows.vue';
import GeneratedOrganizationOverview from '~/components/generated/GeneratedOrganizationOverview.vue';
import { instanceFactRows } from '~/utils/fact-rows.js';
import { useFileTypeView } from '~/composables/useFileTypeView.js';
import { openInstanceChat } from '~/utils/instance-chat.js';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { openWorkspacePageFromChrome } from '~/utils/workspace-page-open.js';
import { useProfileDialog } from '~/composables/useModalState';
import { useConnections } from '~/composables/useConnections.js';
import { useAuthStore } from '~/stores/auth';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
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
const confirm = useConfirm();
const { t, te, locale } = useI18n();
const { onlineUserIds } = useConnections();

// Menu rows sit inside a Panel body — the Panel owns the padding.
const flatMenu = { root: { style: 'padding: 0' } };

const entry = ref(null);
const profileDialog = useProfileDialog();
const detailed = ref({});
const partnerships = ref([]);
const loading = ref(true);

const { typeById } = useFileTypeView();
// The grant-redacted detail DTO speaks the generated field vocabulary;
// the user email is login data, never a display fact (SPEC §Chat
// thread / no-technical-ids rule).
const detailRows = computed(() => (detailed.value?._id
  ? instanceFactRows({
      typeId: props.typeId,
      typeRecord: typeById(props.typeId),
      entity: detailed.value,
      auth: {
        permissions: authStore.activePermissions,
        fieldPolicies: authStore.fieldPolicies,
        stateFieldPolicies: authStore.stateFieldPolicies
      },
      translator: { t, te, locale },
      skip: props.typeId === 'user' ? ['email'] : []
    })
  : []));
const avatarUrl = computed(() => (props.typeId === 'user' ? entry.value?.data?.avatarUrl || null : null));
const userOnline = computed(() => props.typeId === 'user'
  && Boolean(entry.value?.directory?.sharesOrganization)
  && onlineUserIds.value.has(String(entry.value?._id || '')));
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
const membershipOptions = computed(() => organizationMemberships.value.map(({ membership, organization }) => ({
  orgId: String(membership.organizationId),
  name: organization.identity?.name || organization.name || organization.identity?.uid || ''
})));
const membershipMenuItems = computed(() => membershipOptions.value.map(org => ({
  label: org.name,
  icon: org.orgId === activeOrganizationId.value ? 'pi pi-check text-status-success' : 'pi pi-building',
  command: () => openOrganization(org.orgId)
})));
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
// The active organization's real page: the generated overview screen the
// manifest carries (system-screens entries included). Non-active orgs
// (member or stranger) render the directory facts instead.
const overviewScreen = computed(() => {
  if (props.typeId !== 'organization' || !isActiveOrganization.value) return null;
  return authStore.screenManifest.find(screen => (
    screen.kind === 'system' && screen.template === 'organizationOverview'
  )) || null;
});
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

function openOrgChat() {
  openInstanceChat({
    type: 'organization',
    id: entry.value?._id,
    name: entry.value?.identity?.name || ''
  });
}

function openProfileSettings() {
  profileDialog.value = true;
}

function inviteToActiveOrganization() {
  openWorkspacePageFromChrome({
    pageId: 'organizationTeam',
    route: '/organization/users',
    params: { invite: entry.value?._id }
  });
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

function respondPartnership(action) {
  if (action !== 'cancel') {
    runPartnershipResponse(action);
    return;
  }
  confirm.require({
    message: t('partnerships.cancelConfirm'),
    header: t('common.confirmation'),
    icon: 'pi pi-exclamation-triangle',
    accept: () => runPartnershipResponse(action)
  });
}

async function runPartnershipResponse(action) {
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
