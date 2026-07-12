<template>
    <div class="flex flex-col min-h-screen bg-[var(--ck-page-background)]">
        <header class="sticky top-0 z-50 border-b border-content-border bg-[var(--ck-chrome-background)] backdrop-blur">
            <nav class="max-w-[var(--ck-page-max-width)] mx-auto px-4 h-14 flex items-center justify-between gap-2">
                <!-- Left: Logo -->
                <div class="flex items-center h-full min-w-0 flex-1">
                    <NuxtLink
                        to="/test/ui-lab"
                        class="flex items-center gap-2 no-underline text-[var(--p-primary-color)] text-xl font-bold whitespace-nowrap hover:opacity-80 transition-opacity mr-2 shrink-0"
                    >
                        <span>{{ $t('uiLab.shellTitle') }}</span>
                    </NuxtLink>
                    <div class="px-2 py-0.5 rounded-ui bg-[var(--ck-subtle-background)] text-[10px] font-bold uppercase text-muted-color border border-content-border">
                        {{ $t('uiLab.testMode') }}
                    </div>
                </div>

                <!-- Right: Theme & User -->
                <div class="flex items-center gap-2 shrink-0">
                    <Button
                        :icon="themeIcon"
                        @click="toggleTheme"
                        text
                        rounded
                        size="small"
                    />
                    
                    <div class="relative flex items-center">
                        <div class="flex items-center gap-2 px-2 py-1 rounded-ui hover:bg-[var(--ck-subtle-background)] cursor-pointer">
                            <Avatar 
                                label="T"
                                shape="circle" 
                                size="normal" 
                                class="bg-[var(--p-primary-color)] text-[var(--p-primary-contrast-color)]"
                            />
                            <span class="text-sm font-bold hidden sm:block">{{ $t('uiLab.testUser') }}</span>
                        </div>
                    </div>
                </div>
            </nav>
        </header>

        <main class="flex-1 max-w-[var(--ck-page-max-width)] w-full mx-auto p-4 md:p-6 lg:p-8">
            <slot />
        </main>
    </div>
</template>

<script setup>
    import { ref, computed, watch, onMounted } from 'vue'
    import Button from 'primevue/button'
    import Avatar from 'primevue/avatar'

    // --- Theme Switcher ---
    const themeCookie = useCookie('theme-mode')
    const isDarkMode = computed(() => themeCookie.value === 'dark')
    const themeIcon = computed(() => (isDarkMode.value ? 'pi pi-sun' : 'pi pi-moon'))

    const toggleTheme = () => {
        themeCookie.value = isDarkMode.value ? 'light' : 'dark'
    }

    const updateThemeClass = (theme) => {
        if (process.client) {
            if (theme === 'dark') {
                document.documentElement.classList.add('dark-mode')
                document.documentElement.classList.remove('light-mode')
            } else {
                document.documentElement.classList.remove('dark-mode')
                document.documentElement.classList.add('light-mode')
            }
        }
    }

    watch(themeCookie, (newTheme) => {
        updateThemeClass(newTheme)
    })

    onMounted(() => {
        if (!themeCookie.value) {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            themeCookie.value = prefersDark ? 'dark' : 'light'
        }
        updateThemeClass(themeCookie.value)
    })
</script>

<style scoped>
</style>
