<template>
    <div class="relative inline-block">
        <select 
            v-model="currentLocale" 
            @change="changeLocale"
            class="appearance-none bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0 border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 pr-8 text-sm font-bold cursor-pointer hover:border-primary transition-all outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-20 shadow-sm"
        >
            <option v-for="loc in locales" :key="loc.code" :value="loc.code">
                {{ loc.name }}
            </option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-surface-400">
            <i class="pi pi-chevron-down text-[10px]"></i>
        </div>
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';

// Using useI18n composable from @nuxtjs/i18n
const { locale, locales, setLocale } = useI18n();
const currentLocale = ref(locale.value);

const changeLocale = async () => {
    console.log('Changing locale to:', currentLocale.value);
    await setLocale(currentLocale.value);
};

// Sync with global locale changes
watch(locale, (newVal) => {
    console.log('Locale changed globally to:', newVal);
    currentLocale.value = newVal;
});

onMounted(() => {
    currentLocale.value = locale.value;
});
</script>
