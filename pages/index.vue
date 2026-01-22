<template>
  <div class="flex items-center justify-center min-h-screen bg-[var(--p-surface-ground)]">
    <ProgressSpinner style="width: 50px; height: 50px" strokeWidth="4" />
  </div>
</template>

<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '~/stores/auth';
import { storeToRefs } from 'pinia';
import ProgressSpinner from 'primevue/progressspinner';

const router = useRouter();
const authStore = useAuthStore();
const { userIsSet } = storeToRefs(authStore);

onMounted(async () => {
  if (!userIsSet.value) {
    await authStore.setUser();
  }

  if (userIsSet.value) {
    if (authStore.isSuperAdmin) {
      router.push('/admin/organizations');
    } else if (authStore.isManufacturer) {
      router.push('/warehouses');
    } else {
      router.push('/projects');
    }
  } else {
    router.push('/auth/login');
  }
});
</script>
