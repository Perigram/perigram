import { ref, computed } from 'vue'
import { useGlobalStore } from '~/stores/global'

const defaultTitle = 'CutKit'

export default defineNuxtPlugin((nuxtApp) => {
    const globalStore = useGlobalStore()
    let interval
    const isTabActive = ref(true)
    const nestTitle = ref('Nest ready')

    const updateVisibility = () => {
        isTabActive.value = document.visibilityState === 'visible'

        if (globalStore.needNotification && isTabActive.value) {
            globalStore.updateNotification(false)
        }

        clearInterval(interval)

        interval = setInterval(() => {
            if (nestTitle.value !== 'Nest ready') {
                nestTitle.value = 'Nest ready'
            } else {
                nestTitle.value = defaultTitle
            }
        }, 500)
    }

    updateVisibility()
    document.addEventListener('visibilitychange', () => updateVisibility())

    const title = computed(() => globalStore.needNotification && !isTabActive.value ? nestTitle.value : defaultTitle)

    useHead({
        title: title
    })

    nuxtApp.provide('isTabActive', isTabActive)
})
