<template>
  <div class="flex items-center gap-2">
    <button
      @click="toggleTheme"
      class="p-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 transition-all duration-300 shadow-sm"
      :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
    >
      <i v-if="isDark" class="pi pi-sun text-yellow-500 animate-pulse"></i>
      <i v-else class="pi pi-moon text-blue-600"></i>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(false);

const toggleTheme = () => {
  isDark.value = !isDark.value;
  applyTheme();
};

const applyTheme = () => {
  if (process.server) return;
  
  const html = document.documentElement;
  if (isDark.value) {
    html.classList.add('dark-mode');
    // Also add 'dark' class for standard tailwind and primevue
    html.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  } else {
    html.classList.remove('dark-mode');
    html.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }
};

onMounted(() => {
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  isDark.value = savedTheme === 'dark' || (!savedTheme && prefersDark);
  applyTheme();
});
</script>
