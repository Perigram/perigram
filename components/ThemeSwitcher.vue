<template>
  <div class="flex items-center gap-2">
    <Button
      @click="toggleTheme"
      :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
      text
      rounded
      :title="isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Button from 'primevue/button';

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
