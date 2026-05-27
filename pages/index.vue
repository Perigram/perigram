<template>
  <div class="flex items-center justify-center min-h-screen">
    <ProgressSpinner />
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
    if (authStore.hasPermission('organizations', 'admin')) {
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

<style >
html {
  font-size: 14px;
}
</style>
