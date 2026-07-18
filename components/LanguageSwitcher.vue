<template>
    <div class="relative inline-block">
        <Select 
            v-model="currentLocale" 
            :options="localeOptions"
            optionLabel="name"
            optionValue="code"
            @change="changeLocale"
            size="small"
        />
    </div>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue';
import Select from '~/components/shared/EntitySelect.vue';
import { selectOptionText } from '~/utils/selectOptions';

// Using useI18n composable from @nuxtjs/i18n
const { locale, locales, setLocale } = useI18n();
const currentLocale = ref(locale.value);
const localeOptions = computed(() => locales.value.map((entry) => {
    const code = selectOptionText(entry?.code, entry);
    return {
        code,
        name: selectOptionText(entry?.name, code.toUpperCase())
    };
}));

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
