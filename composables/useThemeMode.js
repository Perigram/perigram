import { computed, onMounted, watch } from 'vue';

// Theme cookie + document class sync shared by the app shells. The
// cookie defaults to the OS preference on first visit; the document
// class follows every cookie write.
export function useThemeMode() {
  const themeCookie = useCookie('theme-mode');
  const isDarkMode = computed(() => themeCookie.value === 'dark');
  const themeIcon = computed(() => (isDarkMode.value ? 'pi pi-sun' : 'pi pi-moon'));

  function updateThemeClass(theme) {
    if (process.client) {
      document.documentElement.classList.toggle('dark-mode', theme === 'dark');
      document.documentElement.classList.toggle('light-mode', theme !== 'dark');
    }
  }

  watch(themeCookie, theme => updateThemeClass(theme));

  onMounted(() => {
    if (!themeCookie.value) {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      themeCookie.value = prefersDark ? 'dark' : 'light';
    }
    updateThemeClass(themeCookie.value);
  });

  function toggleTheme() {
    themeCookie.value = isDarkMode.value ? 'light' : 'dark';
  }

  return { themeCookie, isDarkMode, themeIcon, toggleTheme };
}
