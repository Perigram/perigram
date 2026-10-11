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
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import Button from 'primevue/button';
import Avatar from 'primevue/avatar';
import Popover from 'primevue/popover';

// PrimeVue centers button content; the menu rows read left-aligned. The
// cascade rule: internals restyle through pt, never !utility overrides.
const startJustified = { root: { style: 'justify-content: flex-start' } };
import { useAuthStore } from '~/stores/auth';
import { openInstanceInWorkspace } from '~/utils/instance-workspace-open.js';
import { useProfileDialog } from '~/composables/useModalState';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js';

const emit = defineEmits(['hide']);

const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const menu = ref(null);
// The settings popup itself is the single app-level host
// (ProfileSettingsDialog, mounted by the app layout): every account
// menu instance opens the same shared state.
const profileVisible = useProfileDialog();

const activeOrganizationId = computed(() => authStore.userData.organizationId?.toString() || null);

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
