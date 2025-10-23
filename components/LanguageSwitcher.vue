<template>
    <div class="language-switcher">
        <select 
            v-model="currentLocale" 
            @change="changeLocale"
            class="language-switcher__select"
        >
            <option value="ru">Русский</option>
            <option value="en">English</option>
        </select>
    </div>
</template>

<script setup>
const { locale, setLocale } = useI18n()
const currentLocale = ref(locale.value)

const changeLocale = () => {
    setLocale(currentLocale.value)
}

// Watch for external locale changes
watch(locale, (newLocale) => {
    currentLocale.value = newLocale
})
</script>

<style lang="scss" scoped>
.language-switcher {
    $self: &;
    
    &__select {
        background-color: var(--fill-secondary);
        color: var(--label-primary);
        border: 1px solid var(--separator-primary);
        border-radius: 6px;
        padding: 8px 12px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        outline: none;
        
        &:hover {
            background-color: var(--fill-tertiary);
            border-color: var(--accent-primary);
        }
        
        &:focus {
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
    }
}

@media (max-width: 768px) {
    .language-switcher {
        &__select {
            padding: 6px 10px;
            font-size: 13px;
        }
    }
}
</style>
