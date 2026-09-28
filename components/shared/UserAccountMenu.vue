<template>
  <Popover ref="menu">
    <div class="flex min-w-56 flex-col gap-3">
      <!-- Caller-injected actions (for example the mobile bar's Add screen
           entry) render as the leading section and receive the popover's own
           hide so they can close it before opening another surface. -->
      <slot name="items" :hide="hide" />
      <section v-for="group in menuItems" :key="group.label" class="flex flex-col gap-1">
        <small class="px-2 text-muted">{{ group.label }}</small>
        <!-- The account group leads with the inline profile surface:
             avatar, name, active organization — nothing routes away. -->
        <div v-if="group.account" class="flex items-center gap-2 px-2 py-1">
          <Avatar
            :image="authStore.userData.avatarUrl || null"
            :label="!authStore.userData.avatarUrl && authStore.userData.name ? authStore.userData.name[0].toUpperCase() : null"
            shape="circle"
            size="large"
            class="bg-primary text-primary-contrast [&_.p-avatar-image]:h-full [&_.p-avatar-image]:w-full [&_.p-avatar-image]:object-cover"
          />
          <div class="flex min-w-0 flex-1 flex-col">
            <span class="truncate text-label">{{ authStore.userData.name || $t('common.user') }}</span>
            <span v-if="activeOrganizationName" class="truncate text-supporting text-muted">{{ activeOrganizationName }}</span>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <label class="p-button p-component p-button-text p-button-secondary p-button-rounded p-button-sm cursor-pointer overflow-hidden" :title="$t('common.upload')" :aria-label="$t('common.upload')">
              <input type="file" accept="image/*" class="hidden" @change="uploadAvatar" />
              <i class="pi pi-camera" aria-hidden="true" />
            </label>
            <Button
              v-if="authStore.userData.avatarUrl"
              icon="pi pi-trash"
              text
              rounded
              size="small"
              severity="danger"
              :aria-label="$t('common.delete')"
              :loading="avatarBusy"
              @click="removeAvatar"
            />
          </div>
        </div>
        <Button
          v-for="item in group.items"
          :key="item.label"
          :label="item.label"
          :icon="item.icon"
          text
          severity="secondary"
          size="small"
          class="w-full !justify-start"
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
      class="p-0.5 rounded-full overflow-hidden border-2 border-transparent transition-colors"
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
import { useAuthStore } from '~/stores/auth';
import { MOBILE_TRANSIENT_SURFACES_CLOSE_EVENT } from '~/utils/mobile-transient-surfaces.js';

const emit = defineEmits(['hide']);

const router = useRouter();
const { t } = useI18n();
const authStore = useAuthStore();
const menu = ref(null);

const themeCookie = useCookie('theme-mode');
const isDarkMode = computed(() => themeCookie.value === 'dark');
const themeIcon = computed(() => (isDarkMode.value ? 'pi pi-sun' : 'pi pi-moon'));

const menuItems = computed(() => {
  const items = [];

  if (authStore.userOrganizations.length) {
    items.push({
      label: t('profile.myOrganizations'),
      items: authStore.userOrganizations.map(org => ({
        label: org.identity?.name || org.name || org.identity?.uid || org._id?.toString(),
        icon: (org._id?.toString() || org.id?.toString()) === authStore.userData.organizationId?.toString() ? 'pi pi-check text-status-success' : 'pi pi-building',
        // Switching stays in place: the workspace rehydrates its process
        // data; nothing routes away.
        command: async () => {
          const organizationId = org._id?.toString() || org.id?.toString();
          if (organizationId && organizationId !== authStore.userData.organizationId?.toString()) {
            await authStore.switchOrganization(organizationId);
          }
        }
      }))
    });
  }

  items.push({
    label: authStore.userData.name || t('common.user'),
    // The inline account surface (avatar/name/org) leads this group.
    account: true,
    items: [
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

const activeOrganizationName = computed(() => {
  const activeId = authStore.userData?.organizationId?.toString();
  if (!activeId) return '';
  const active = (authStore.userOrganizations || []).find(organization =>
    (organization._id?.toString() || organization.id?.toString()) === activeId);
  return active?.identity?.name || active?.name || '';
});

const avatarBusy = ref(false);

async function uploadAvatar(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  event.target.value = '';
  avatarBusy.value = true;
  try {
    const form = new FormData();
    form.append('avatar', file);
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
