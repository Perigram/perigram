<template>
  <div class="flex items-center gap-2">
    <button
      @click="toggleTheme"
      class="p-2 rounded-lg border border-[var(--p-content-border-color)] bg-[var(--p-content-background)] hover:bg-[var(--p-surface-100)] dark:hover:bg-[var(--p-surface-800)] transition-colors"
      :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
    >
      <i v-if="isDark" class="pi pi-sun text-yellow-500"></i>
      <i v-else class="pi pi-moon text-blue-600"></i>
    </button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(false);

const toggleTheme = () => {
  isDark.value = !isDark.value;
  
  if (isDark.value) {
    document.documentElement.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
  }
};

onMounted(() => {
  // Check localStorage or system preference
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  isDark.value = savedTheme === 'dark' || (!savedTheme && prefersDark);
  
  if (isDark.value) {
    document.documentElement.classList.add('dark-mode');
  }
});
</script>
