<template>
  <div v-if="!isLoggedIn" class="flex items-center justify-center min-h-screen bg-gray-100">
    <div class="w-full max-w-sm p-6 bg-white rounded-lg shadow-md">
      <h1 class="text-2xl font-bold text-center text-gray-800 mb-6">{{ $t('auth.welcome') }}</h1>
      <p class="text-center text-gray-600 mb-6">{{ $t('auth.subtitle') }}</p>
      <div class="space-y-4">
        <button @click="loginWithGithub" class="flex items-center justify-center w-full px-4 py-2 text-white bg-gray-800 rounded-md hover:bg-gray-900">
          <img src="/github-logo.svg" alt="GitHub" class="w-6 h-6 mr-2" />
          <span>{{ $t('auth.signInWithGitHub') }}</span>
        </button>
        <button @click="loginWithGoogle" class="flex items-center justify-center w-full px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50">
          <img src="/google-logo.svg" alt="Google" class="w-6 h-6 mr-2" />
          <span>{{ $t('auth.signInWithGoogle') }}</span>
        </button>
      </div>
    </div>
  </div>
  <div v-else>
    <!-- Optional: show a loading/redirecting message -->
    <div class="flex items-center justify-center min-h-screen">
      <p>{{ $t('auth.redirecting') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { authStore } from '~/composables/auth';

definePageMeta({
  // No middleware here. Let the page handle its own logic.
  // The middleware was causing issues.
});

const { t } = useI18n();
const { getters } = authStore;
const router = useRouter();

const isLoggedIn = ref(getters.userIsSet.value);

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
  if (!isLoggedIn.value) {
    await authStore.actions.setUser();
    isLoggedIn.value = getters.userIsSet.value;
  }

  // If already logged in, redirect immediately
  if (isLoggedIn.value) {
    router.push('/projects');
    return;
  }

  watch(getters.userIsSet, (isSet) => {
    isLoggedIn.value = isSet;
    if (isSet) {
      router.push('/projects');
    }
  });
});
</script>
