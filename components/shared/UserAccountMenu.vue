<template>
  <Popover ref="menu">
    <div class="flex min-w-56 flex-col gap-3">
      <!-- Caller-injected actions (for example the mobile bar's Add screen
           entry) render as the leading section and receive the popover's own
           hide so they can close it before opening another surface. -->
      <slot name="items" :hide="hide" />
      <section v-for="group in menuItems" :key="group.label" class="flex flex-col gap-1">
        <small class="px-2 text-muted">{{ group.label }}</small>
        <Button
          v-for="item in group.items"
          :key="item.label"
          :label="item.label"
          :icon="item.icon"
          :data-account-org="item.orgId"
          text
          severity="secondary"
          size="small"
          :pt="startJustified"
          @click="runItem(item)"
        />
      </section>
    </div>
  </Popover>
  <!-- Profile settings in a popup: avatar, language, and the
       notifications toggle — the popover itself stays a plain menu. -->
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
  <!-- The customizable trigger: the documented `#trigger` scoped slot
       (receives toggle/hide). The round avatar button is the fallback. -->
  <slot name="trigger" :toggle="toggle" :hide="hide">
    <Button
      data-testid="user-menu-trigger"
      type="button"
      @click="toggle"
      class="p-0.5 rounded-full overflow-hidden"
      text
    >
      <Avatar
        :image="authStore.userData.avatarUrl || null"
        :label="!authStore.userData.avatarUrl && authStore.userData.name ? authStore.userData.name[0].toUpperCase() : null"
        shape="circle"
        size="normal"
        class="bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
      />
    </Button>
  </slot>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import InputText from 'primevue/inputtext';
import Popover from 'primevue/popover';
import Panel from 'primevue/panel';
import Menu from 'primevue/menu';

// PrimeVue centers button content; the menu rows read left-aligned. The
// cascade rule: internals restyle through pt, never !utility overrides.
const startJustified = { root: { style: 'justify-content: flex-start' } };
import ToggleSwitch from 'primevue/toggleswitch';
import StandardDialog from '~/components/shared/StandardDialog.vue';
import LanguageSwitcher from '~/components/LanguageSwitcher.vue';
import TargetedInvitations from '~/components/shared/TargetedInvitations.vue';
import { useAuthStore } from '~/stores/auth';
import { useInstancesStore } from '~/stores/instances';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useBrowserNotifications } from '~/composables/useBrowserNotifications';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js';

const emit = defineEmits(['hide']);

const router = useRouter();
const { t } = useI18n();
const toast = useToast();
const authStore = useAuthStore();
const instances = useInstancesStore();
const menu = ref(null);
const profileVisible = ref(false);
const avatarBusy = ref(false);

// Settings state: browser notifications ride the profile popup (the
// settings surface — nothing routes away); organization creation opens
// from the organizations group.
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
const avatarInput = ref(null);

const activeOrganizationId = computed(() => authStore.userData.organizationId?.toString() || null);
// Menu rows sit inside a Panel body — the Panel owns the padding.
const flatMenu = { root: { style: 'padding: 0' } };
const activeOrganizationName = computed(() => authStore.organizationData?.identity?.name || '');
const organizationOptions = computed(() => authStore.userOrganizations.map(org => ({
  orgId: org._id?.toString() || org.id?.toString(),
  label: org.identity?.name || org.name || org.identity?.uid || ''
})));

const organizationMenuItems = computed(() => [
  ...organizationOptions.value.map(org => ({
    label: org.label || t('common.unnamed'),
    icon: org.orgId === activeOrganizationId.value ? 'pi pi-check text-status-success' : 'pi pi-building',
    command: () => openOrganizationPane(org.orgId)
  })),
  { separator: true },
  { label: t('auth.createOrg'), icon: 'pi pi-plus', command: openCreateOrg }
]);

function openOrganizationPane(orgId) {
  if (!orgId) return;
  profileVisible.value = false;
  openInstanceInWorkspace({ typeId: 'organization', instanceId: orgId });
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

const themeCookie = useCookie('theme-mode');
const isDarkMode = computed(() => themeCookie.value === 'dark');
const themeIcon = computed(() => (isDarkMode.value ? 'pi pi-sun' : 'pi pi-moon'));

const menuItems = computed(() => {
  const items = [];

  // The organizations group always renders for members: every entry opens
  // the organization's in-home pane (the directory surface — the
  // layouts README account-control contract). Organization creation lives
  // in the settings popup; an orgless account renders no group at all
  // (its entry surface is the settings organizations section or the
  // overview's orgless shell).
  if (authStore.userOrganizations.length) {
    items.push({
      label: t('profile.myOrganizations'),
      items: authStore.userOrganizations.map(org => ({
        label: org.identity?.name || org.name || org.identity?.uid || org._id?.toString(),
        icon: (org._id?.toString() || org.id?.toString()) === authStore.userData.organizationId?.toString() ? 'pi pi-check text-status-success' : 'pi pi-building',
        orgId: org._id?.toString() || org.id?.toString(),
        command: () => {
          const organizationId = org._id?.toString() || org.id?.toString();
          if (!organizationId) return;
          openInstanceInWorkspace({ typeId: 'organization', instanceId: organizationId });
        }
      }))
    });
  }

  items.push({
    label: authStore.userData.name || t('common.user'),
    items: [
      {
        label: t('nav.profile'),
        icon: 'pi pi-user',
        command: () => { profileVisible.value = true; }
      },
      {
        label: t('common.toggleTheme'),
        icon: themeIcon.value,
        command: toggleTheme
      },
      {
        label: t('nav.logout'),
        icon: 'pi pi-sign-out',
        command: async () => {
          await authStore.logout();
          router.push('/auth/login');
        }
      }
    ]
  });

  return items;
});


function toggle(event) {
  menu.value?.toggle(event);
}

function hide() {
  menu.value?.hide();
}

function toggleTheme() {
  themeCookie.value = isDarkMode.value ? 'light' : 'dark';
}

async function runItem(item) {
  hide();
  emit('hide', item);
  await item?.command?.();
}

function handleTransientClose() {
  hide();
}

onMounted(() => {
  window.addEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, handleTransientClose);
});

onUnmounted(() => {
  window.removeEventListener(MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT, handleTransientClose);
});
</script>
