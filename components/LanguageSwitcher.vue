<template>
    <div class="relative inline-block">
        <Select 
            v-model="currentLocale" 
            :options="locales"
            optionLabel="name"
            optionValue="code"
            @change="changeLocale"
            size="small"
        />
    </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import Select from 'primevue/select';

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
