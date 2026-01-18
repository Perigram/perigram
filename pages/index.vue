<template>
  <div v-if="!userIsSet" class="flex items-center justify-center min-h-screen bg-[var(--p-surface-50)] p-4">
    <div class="w-full max-w-md p-8 bg-[var(--p-content-background)] border border-[var(--p-content-border-color)] rounded-2xl shadow-xl flex flex-col gap-8 animate-in zoom-in duration-500">
      <div class="flex flex-col items-center gap-2">
        <div class="w-16 h-16 bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)] rounded-2xl flex items-center justify-center shadow-lg mb-2">
          <span class="text-3xl font-black">CK</span>
        </div>
        <h1 class="text-3xl font-black text-[var(--p-text-color)] m-0 tracking-tight">{{ $t('auth.welcome') }}</h1>
        <p class="text-center text-[var(--p-text-muted-color)] font-medium leading-relaxed">{{ $t('auth.subtitle') }}</p>
      </div>

      <div class="flex flex-col gap-3">
        <Button 
          @click="loginWithGithub" 
          severity="contrast"
          class="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-3"
        >
          <img src="/github-logo.svg" alt="GitHub" class="w-5 h-5 invert" />
          <span>{{ $t('auth.signInWithGitHub') }}</span>
        </Button>
        
        <Button 
          @click="loginWithGoogle" 
          outlined
          severity="secondary"
          class="w-full h-12 rounded-xl font-bold flex items-center justify-center gap-3"
        >
          <img src="/google-logo.svg" alt="Google" class="w-5 h-5" />
          <span>{{ $t('auth.signInWithGoogle') }}</span>
        </Button>
      </div>

      <div class="pt-4 border-t border-[var(--p-content-border-color)] text-center">
        <p class="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--p-text-muted-color)] m-0">Secure Cloud Nesting Platform</p>
      </div>
    </div>
  </div>
  <div v-else>
    <div class="flex flex-col items-center justify-center min-h-screen bg-[var(--p-surface-50)] gap-4">
      <ProgressSpinner style="width: 40px; height: 40px" strokeWidth="4" />
      <p class="text-sm font-bold uppercase tracking-widest text-[var(--p-text-muted-color)] animate-pulse">{{ $t('auth.redirecting') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';

definePageMeta({
  // No middleware here. Let the page handle its own logic.
});

const { t } = useI18n();
const authStore = useAuthStore();
const { userIsSet } = storeToRefs(authStore);
const router = useRouter();

const loginWithGithub = async () => {
  const response = await $fetch('/api/auth/github/redirect');
  window.location.href = response.url;
};

const loginWithGoogle = async () => {
  const response = await $fetch('/api/auth/google/redirect');
  window.location.href = response.url;
};

onMounted(async () => {
  // Try to set user on client side if not already set
  if (!userIsSet.value) {
    await authStore.setUser();
  }

  // If already logged in, redirect immediately
  if (userIsSet.value) {
    router.push('/projects');
    return;
  }

  watch(userIsSet, (isSet) => {
    if (isSet) {
      router.push('/projects');
    }
  });
});
</script>
