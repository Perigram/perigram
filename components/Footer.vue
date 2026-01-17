<template>
    <footer class="bg-zinc-950 text-white py-8 px-4 mt-auto border-t border-white/5"> 
        <div class="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-6">
            <ul class="flex flex-wrap items-center gap-x-10 gap-y-4 list-none m-0 p-0">
                <li>
                    <NuxtLink 
                        to="/terms-and-conditions"
                        class="text-sm font-semibold text-white/60 hover:text-white no-underline transition-colors"
                    >
                        {{ $t('footer.termsAndConditions') }}
                    </NuxtLink>
                </li>
                <li>
                    <NuxtLink 
                        to="/blog" 
                        class="text-sm font-semibold text-white/60 hover:text-white no-underline transition-colors"
                    >
                        {{ $t('footer.blog') }}
                    </NuxtLink>
                </li>
            </ul>
            <p class="text-sm font-semibold text-white/40 m-0">
                {{ new Date().getFullYear() }} © {{ $t('footer.companyName') }}. {{ $t('footer.allRightsReserved') }}
            </p>
        </div>
    </footer>
</template>

<style scoped>
</style>
