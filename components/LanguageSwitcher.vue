<template>
    <div class="relative inline-block">
        <select 
            v-model="currentLocale" 
            @change="changeLocale"
            class="appearance-none bg-[var(--p-content-background)] text-[var(--p-text-color)] border border-[var(--p-content-border-color)] rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer hover:border-[var(--p-primary-color)] transition-all outline-none focus:ring-2 focus:ring-[var(--p-primary-color)] focus:ring-opacity-20"
        >
            <option v-for="loc in locales" :key="loc.code" :value="loc.code">
                {{ loc.name }}
            </option>
        </select>
        <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[var(--p-text-muted-color)]">
            <i class="pi pi-chevron-down text-[10px]"></i>
        </div>
    </div>
</template>

<script setup>
const { locale, locales, setLocale } = useI18n()
const currentLocale = ref(locale.value)

const changeLocale = () => {
    setLocale(currentLocale.value)
}

// Watch for external locale changes
watch(locale, (newLocale) => {
    currentLocale.value = newLocale
})
</script>

<style scoped>
</style>
