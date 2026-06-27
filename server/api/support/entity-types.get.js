import * as supportService from '~/server/features/support/service.js'

export default defineEventHandler((event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(401)
        return
    }

    return supportService.listEntityOptionTypes()
})
