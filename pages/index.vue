<template>
  <div v-if="checkingSession" class="flex min-h-screen items-center justify-center bg-[var(--ck-page-background)]">
    <ProgressSpinner />
  </div>

  <main v-else class="min-h-screen bg-[var(--ck-page-background)] text-[var(--p-text-color)]">
    <section class="relative min-h-[88vh] overflow-hidden border-b border-content-border">

      <header class="relative z-10 mx-auto flex max-w-[var(--ck-page-max-width)] items-center justify-between gap-4 px-4 py-5 md:px-8">
        <NuxtLink to="/" class="text-xl font-semibold text-primary no-underline">CutKit</NuxtLink>
        <div class="flex items-center gap-2">
          <Button :label="$t('auth.login')" text @click="navigateTo('/auth/login')" />
          <Button :label="$t('auth.signup')" icon="pi pi-arrow-right" @click="navigateTo('/auth/register')" />
        </div>
      </header>

      <div class="relative z-10 mx-auto flex min-h-[calc(88vh-5rem)] max-w-[var(--ck-page-max-width)] items-center px-4 pb-16 pt-8 md:px-8">
        <div class="max-w-3xl">
          <Tag :value="$t('marketing.heroEyebrow')" severity="secondary" />
          <h1 class="mb-4 mt-5 max-w-2xl text-4xl font-semibold leading-tight md:text-6xl">
            {{ $t('marketing.heroTitle') }}
          </h1>
          <p class="max-w-2xl text-lg text-muted-color md:text-xl">
            {{ $t('marketing.heroSubtitle') }}
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <Button :label="$t('marketing.primaryCta')" icon="pi pi-arrow-right" @click="navigateTo('/auth/register')" />
            <Button :label="$t('marketing.secondaryCta')" icon="pi pi-sign-in" severity="secondary" outlined @click="navigateTo('/auth/login')" />
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto grid max-w-[var(--ck-page-max-width)] grid-cols-1 gap-4 px-4 py-8 md:grid-cols-3 md:px-8">
      <Panel v-for="item in valueProps" :key="item.title" class="h-full">
        <div class="flex flex-col gap-2">
          <i :class="item.icon" class="text-xl text-primary" aria-hidden="true"></i>
          <h2 class="m-0 text-base font-semibold">{{ item.title }}</h2>
          <p class="m-0 text-sm text-muted-color">{{ item.description }}</p>
        </div>
      </Panel>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import Button from 'primevue/button';
import Panel from 'primevue/panel';
import ProgressSpinner from 'primevue/progressspinner';
import Tag from 'primevue/tag';

const authStore = useAuthStore();
const { t } = useI18n();
const checkingSession = ref(true);

const valueProps = computed(() => [
  {
    icon: 'pi pi-sitemap',
    title: t('marketing.valueTraceabilityTitle'),
    description: t('marketing.valueTraceability')
  },
  {
    icon: 'pi pi-box',
    title: t('marketing.valueCassetteTitle'),
    description: t('marketing.valueCassette')
  },
  {
    icon: 'pi pi-chart-line',
    title: t('marketing.valueProductionTitle'),
    description: t('marketing.valueProduction')
  }
]);

onMounted(async () => {
  if (!authStore.userIsSet) {
    await authStore.setUser();
  }

  if (authStore.userIsSet) {
    if (authStore.canManagePlatform) {
      await navigateTo('/admin');
    } else {
      await navigateTo('/projects');
    }
    return;
  }

  checkingSession.value = false;
});
</script>
