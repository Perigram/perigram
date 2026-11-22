<template>
  <main class="min-h-screen bg-page">
    <section class="relative min-h-[88vh] overflow-hidden border-b border-content-border">

      <header class="relative z-10 mx-auto flex max-w-[var(--ck-page-max-width)] items-center justify-between gap-4 px-4 py-5 md:px-8">
        <NuxtLink to="/" class="flex items-center no-underline" aria-label="Perigram">
          <img src="/logo-light.svg" alt="Perigram" class="h-7 w-auto dark:hidden" />
          <img src="/logo-dark.svg" alt="Perigram" class="hidden h-7 w-auto dark:block" />
        </NuxtLink>
        <Button :label="$t('auth.login')" text @click="navigateTo('/auth/login')" />
      </header>

      <div class="relative z-10 mx-auto flex min-h-[calc(88vh-5rem)] max-w-[var(--ck-page-max-width)] items-center px-4 pb-16 pt-8 md:px-8">
        <div class="max-w-3xl">
          <h1 class="mb-4 mt-5 max-w-2xl text-page-title">
            {{ $t('marketing.heroTitle') }}
          </h1>
          <p class="max-w-2xl text-muted text-body">
            {{ $t('marketing.heroSubtitle') }}
          </p>
          <Button class="mt-8" :label="$t('marketing.primaryCta')" icon="pi pi-arrow-right" @click="navigateTo('/auth/register')" />
        </div>
      </div>
    </section>

    <section class="mx-auto grid max-w-[var(--ck-page-max-width)] grid-cols-1 gap-4 px-4 py-8 md:grid-cols-3 md:px-8">
      <Panel v-for="item in valueProps" :key="item.title" class="h-full">
        <div class="flex flex-col gap-2">
          <i :class="item.icon" class="text-[var(--ck-accent-ink)]" aria-hidden="true"></i>
          <h2 class="m-0 text-section-heading">{{ item.title }}</h2>
          <p class="m-0 text-muted text-body">{{ item.description }}</p>
        </div>
      </Panel>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { resolveProcessEntryRoute } from '~/utils/process-navigation';
import Button from 'primevue/button';
import Panel from 'primevue/panel';

const authStore = useAuthStore();
const { t } = useI18n();

const valueProps = computed(() => [
  {
    icon: 'pi pi-pencil',
    title: t('marketing.valueDeclareTitle'),
    description: t('marketing.valueDeclare')
  },
  {
    icon: 'pi pi-th-large',
    title: t('marketing.valueCompileTitle'),
    description: t('marketing.valueCompile')
  },
  {
    icon: 'pi pi-database',
    title: t('marketing.valueRuntimeTitle'),
    description: t('marketing.valueRuntime')
  }
]);

async function redirectIfAuthenticated() {
  if (authStore.userIsSet) {
    // The home screen is the default screen: the entry ladder ends at the
    // stable home route, so a missing or broken active definition still lands
    // every account on the workspace's definition-independent surfaces.
    await navigateTo(resolveProcessEntryRoute({
      screens: authStore.screenManifest,
      navigation: authStore.navigationManifest
    }));
  }
}

if (process.server) {
  await authStore.setUser({ headers: useRequestHeaders(['cookie']) });
  await redirectIfAuthenticated();
}

onMounted(async () => {
  if (!authStore.userIsSet) {
    await authStore.setUser();
  }

  await redirectIfAuthenticated();
});
</script>
