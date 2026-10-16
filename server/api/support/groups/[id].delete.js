import * as supportService from '~/server/features/support/service.js'
import * as agentBotsService from '~/server/features/agent-bots/service.js'

export default defineEventHandler(async (event) => {
    const auth = event.context?.auth
    if (!auth?.userId) {
        setResponseStatus(event, 401)
        return
    }
    const groupId = getRouterParam(event, 'id')
    const deleted = await supportService.deleteGroup(auth, groupId || '')
    // The AI's subscription rows die with the room (agent-bots README).
    await agentBotsService.onGroupDeleted(groupId || '')
    return deleted
})
