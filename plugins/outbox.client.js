import { useOutboxStore } from '~/stores/outbox'

export default defineNuxtPlugin(() => {
    const outbox = useOutboxStore()
    outbox.init()
})
