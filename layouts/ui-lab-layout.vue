<template>
    <div class="flex flex-col min-h-screen bg-page">
        <header class="sticky top-0 z-50 border-b [border-color:var(--ck-chrome-border)] bg-chrome text-[var(--ck-chrome-foreground)] backdrop-blur">
            <nav class="max-w-[var(--ck-page-max-width)] mx-auto px-4 h-14 flex items-center justify-between gap-2">
                <!-- Left: Logo -->
                <div class="flex items-center h-full min-w-0 flex-1">
                    <NuxtLink
                        to="/test/ui-lab"
                        class="flex items-center gap-2 no-underline text-primary whitespace-nowrap hover:opacity-80 transition-opacity mr-2 shrink-0 text-section-heading"
                    >
                        <span>{{ $t('uiLab.shellTitle') }}</span>
                    </NuxtLink>
                    <div class="px-2 py-0.5 rounded-ui border [border-color:var(--ck-chrome-border)] bg-[var(--ck-chrome-subtle)] text-[var(--ck-chrome-muted)] text-label">
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
                        <div class="flex items-center gap-2 px-2 py-1 rounded-ui hover:bg-[var(--ck-chrome-subtle)] cursor-pointer">
                            <Avatar 
                                label="T"
                                shape="circle" 
                                size="normal" 
                                class="bg-primary text-primary-contrast"
                            />
                            <span class="hidden sm:block text-label">{{ $t('uiLab.testUser') }}</span>
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
    import { computed } from 'vue'
    import Button from 'primevue/button'
    import Avatar from 'primevue/avatar'
    import { useThemeMode } from '~/composables/useThemeMode.js'

    const { themeIcon, toggleTheme } = useThemeMode()
</script>
