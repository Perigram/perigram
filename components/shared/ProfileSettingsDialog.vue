<template>
  <!-- Profile settings in a popup: avatar, language, and the
       notifications toggle. One app-level host (mounted by the app
       layout beside ConfirmDialog/Toast): every account-menu instance
       and record surface opens the same dialog through
       useProfileDialog. -->
  <StandardDialog
    v-model:visible="profileVisible"
    :header="t('nav.profile')"
    :show-default-footer="false"
  >
    <div class="flex flex-col gap-4">
      <!-- Identity: avatar and name lead, avatar actions trail top-right. -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 items-center gap-3">
          <Avatar
            :image="authStore.userData.avatarUrl || null"
            :label="!authStore.userData.avatarUrl && authStore.userData.name ? authStore.userData.name[0].toUpperCase() : null"
            shape="circle"
            size="xlarge"
            class="shrink-0 bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
          />
          <div class="flex min-w-0 flex-col gap-1">
            <span class="truncate text-label">{{ authStore.userData.name || t('common.user') }}</span>
            <small v-if="activeOrganizationName" class="text-muted text-supporting">{{ activeOrganizationName }}</small>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <input ref="avatarInput" type="file" accept="image/*" class="hidden" @change="uploadAvatar" />
          <Button
            icon="pi pi-camera"
            text
            rounded
            size="small"
            severity="secondary"
            :title="t('common.upload')"
            :aria-label="t('common.upload')"
            :loading="avatarBusy"
            @click="avatarInput?.click()"
          />
          <Button
            v-if="authStore.userData.avatarUrl"
            icon="pi pi-trash"
            text
            rounded
            size="small"
            severity="danger"
            :aria-label="t('common.delete')"
            :loading="avatarBusy"
            @click="removeAvatar"
          />
        </div>
      </div>
      <!-- Sections and rows are owned by PrimeVue: Panel carries section
           chrome, Menu the organization entries. -->
      <Panel :header="t('profile.preferences')">
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between gap-3">
            <span class="text-body">{{ t('profile.language') }}</span>
            <LanguageSwitcher />
          </div>
          <div class="flex items-center justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-0.5">
              <span class="text-body">{{ t('notifications.settingsLabel') }}</span>
              <small v-if="notifications.permission.value === 'denied'" class="text-muted">{{ t('notifications.blockedHelp') }}</small>
              <small v-else-if="notifications.enabled.value && !notifications.pushAvailable.value" class="text-muted">{{ t('notifications.pushUnavailableHelp') }}</small>
            </div>
            <ToggleSwitch
              :model-value="notifications.enabled.value"
              :disabled="notifications.busy.value || !notifications.canEnable.value"
              @update:model-value="toggleNotifications"
            />
          </div>
        </div>
      </Panel>
      <!-- Targeted invitations render above the memberships section so
           members of other organizations can reach them. -->
      <TargetedInvitations />
      <Panel :header="t('profile.myOrganizations')">
        <Menu :model="organizationMenuItems" class="w-full" :pt="flatMenu" />
      </Panel>
    </div>
  </StandardDialog>
  <!-- Organization creation is opened from the settings popup's
       organizations section: no standalone profile route exists. -->
  <StandardDialog
    v-model:visible="createOrgVisible"
    :header="t('auth.createOrg')"
    size="sm"
  >
    <form class="flex flex-col gap-4 pt-4" @submit.prevent="createOrganization">
      <div class="flex flex-col gap-1">
        <label for="create-org-name">{{ t('common.name') }} *</label>
        <InputText id="create-org-name" v-model="orgForm.name" required class="w-full" autofocus />
      </div>
      <div class="flex flex-col gap-1">
        <label for="create-org-email">{{ t('profile.email') }} *</label>
        <InputText id="create-org-email" v-model="orgForm.email" type="email" required class="w-full" />
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <Button type="button" :label="t('common.cancel')" text severity="secondary" @click="createOrgVisible = false" />
        <Button type="submit" :label="t('common.create')" :loading="creatingOrg" />
      </div>
    </form>
  </StandardDialog>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import InputText from 'primevue/inputtext';
import Panel from 'primevue/panel';
import Menu from 'primevue/menu';
import ToggleSwitch from 'primevue/toggleswitch';
import { useConfirm } from 'primevue/useconfirm';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import TargetedInvitations from '~/components/shared/TargetedInvitations.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useBrowserNotifications } from '~/composables/useBrowserNotifications';
import { useProfileDialog } from '~/composables/useModalState';

const { t } = useI18n();
const toast = useToast();
const confirm = useConfirm();
const authStore = useAuthStore();
const instances = useInstancesStore();
const profileVisible = useProfileDialog();
const avatarBusy = ref(false);
const avatarInput = ref(null);

const notifications = useBrowserNotifications();
// The hint under the toggle must reflect the server's push configuration,
// not just local consent — refresh it every time the settings popup opens.
watch(profileVisible, (visible) => {
  if (visible) notifications.refreshPushConfig();
});
const toggleNotifications = async (value) => {
  if (value) {
    const granted = await notifications.enable();
    if (!granted) {
      toast.add({ severity: 'warn', summary: t('common.error'), detail: t('notifications.blockedHelp'), life: 4000 });
    }
  } else {
    await notifications.disable();
  }
};

const createOrgVisible = ref(false);
const creatingOrg = ref(false);
const orgForm = reactive({ name: '', email: '' });

const activeOrganizationId = computed(() => authStore.userData.organizationId?.toString() || null);
// Menu rows sit inside a Panel body — the Panel owns the padding.
const flatMenu = { root: { style: 'padding: 0' } };
const activeOrganizationName = computed(() => authStore.organizationData?.identity?.name || '');
const organizationMenuItems = computed(() => [
  ...authStore.userOrganizations.map(org => {
    const organizationId = org._id?.toString() || org.id?.toString();
    const label = org.identity?.name || org.name || org.identity?.uid || t('common.unnamed');
    const active = organizationId === activeOrganizationId.value;
    return {
      label,
      icon: active ? 'pi pi-check text-status-success' : 'pi pi-building',
      items: [
        { label: t('profile.openOrganization'), icon: 'pi pi-external-link', command: () => openOrganizationPane(organizationId) },
        ...(active ? [] : [{ label: t('profile.switchOrganization'), icon: 'pi pi-arrow-right-arrow-left', command: () => switchOrganization(organizationId) }]),
        { label: t('profile.leaveOrganization'), icon: 'pi pi-sign-out', command: () => confirmLeaveOrganization(organizationId, label) }
      ]
    };
  }),
  { separator: true },
  { label: t('auth.createOrg'), icon: 'pi pi-plus', command: openCreateOrg }
]);

function openOrganizationPane(orgId) {
  if (!orgId) return;
  profileVisible.value = false;
  openInstanceInWorkspace({ typeId: 'organization', instanceId: orgId });
}

async function switchOrganization(organizationId) {
  try {
    await authStore.switchOrganization(organizationId);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('profile.organizationSwitched'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  }
}

function confirmLeaveOrganization(organizationId, name) {
  confirm.require({
    message: t('profile.leaveOrganizationConfirm', { name }),
    header: t('common.confirm'),
    icon: 'pi pi-exclamation-triangle',
    acceptProps: { label: t('profile.leaveOrganization'), severity: 'danger' },
    rejectProps: { label: t('common.cancel'), severity: 'secondary', outlined: true },
    accept: () => leaveOrganization(organizationId)
  });
}

async function leaveOrganization(organizationId) {
  try {
    await authStore.leaveOrganization(organizationId);
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('profile.organizationLeft'), life: 3000 });
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error?.data?.message || error.message, life: 3000 });
  }
}

function openCreateOrg() {
  orgForm.email = authStore.userData.email || '';
  createOrgVisible.value = true;
}

const createOrganization = async () => {
  creatingOrg.value = true;
  try {
    await instances.createInstance('organization', { ...orgForm });
    toast.add({ severity: 'success', summary: t('common.success'), detail: t('auth.organizationCreated'), life: 3000 });
    createOrgVisible.value = false;
    orgForm.name = '';
    // Refresh auth state so the new organization joins the switch group.
    await authStore.setUser();
  } catch (error) {
    toast.add({ severity: 'error', summary: t('common.error'), detail: error.message || t('auth.organizationCreateFailed'), life: 3000 });
  } finally {
    creatingOrg.value = false;
  }
};

async function uploadAvatar(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  event.target.value = '';
  avatarBusy.value = true;
  try {
    const form = new FormData();
    form.append('file', file);
    await $fetch(`/api/users/${authStore.userData.userId || authStore.userData.id}/avatar`, { method: 'PUT', body: form });
    await authStore.setUser();
  } catch (error) {
    console.error('Failed to upload avatar:', error);
  } finally {
    avatarBusy.value = false;
  }
}

async function removeAvatar() {
  avatarBusy.value = true;
  try {
    await $fetch(`/api/users/${authStore.userData.userId || authStore.userData.id}/avatar`, { method: 'DELETE' });
    await authStore.setUser();
  } catch (error) {
    console.error('Failed to remove avatar:', error);
  } finally {
    avatarBusy.value = false;
  }
}
</script>
